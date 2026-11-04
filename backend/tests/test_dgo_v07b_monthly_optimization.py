"""DGO-V07B: report acceleration without dropping periods, measurements or comparatives."""
from __future__ import annotations

import time
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from app.services import water_period_service as period
from app.services.report_export_job_service import ExportJobManager


class SQLRecorder:
    def __init__(self, rows):
        self.rows = rows
        self.sql = []
        self.params = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, statement, params):
        self.sql.append(str(statement))
        self.params.append(dict(params))
        start, end = params.get('start_dt'), params.get('end_dt')
        rows = self.rows
        if start is not None and end is not None:
            rows = [row for row in rows if start <= row['operational_ts'] < end]
        return SimpleNamespace(fetchall=lambda: [SimpleNamespace(_mapping=row) for row in rows])


def test_month_reader_seeks_two_disjoint_clock_sources_with_original_top_limit(monkeypatch):
    reader = SQLRecorder([{
        'sensor_id': 1001, 'operational_ts': datetime(2026, 10, 10, 14),
        'instant_value': 3.0, 'total_value': 999.0, 'quality': 1, 'source': 'test',
    }])
    monkeypatch.setattr(period, 'SessionLocal', lambda: reader)
    monkeypatch.setattr(period, '_object_exists', lambda *_: True)
    monkeypatch.setattr(period, 'local_to_source_naive', lambda value, *_: value)
    monkeypatch.setattr(period, 'source_to_local_naive', lambda value, *_: value)
    monkeypatch.setattr(period, 'normalize_flow_lps', lambda sid, val, *_: val)

    rows = period.query_readings_window([1001], datetime(2026, 10, 1), datetime(2026, 11, 1))
    assert len(rows) == 1 and rows[0]['total_value'] == 999.0
    query = reader.sql[0].lower()
    assert 'union all' in query and 'ts_local is null' in query
    assert 'ts_local >= :start_dt' in query and 'ts_minute >= :start_dt' in query
    assert 'coalesce(' not in query
    assert 'top (:max_rows)' in query
    assert reader.params[0]['max_rows'] == period.MAX_ROWS


def test_previous_closes_do_not_sort_entire_historical_table(monkeypatch):
    rows = [
        {'sensor_id': 1001, 'operational_ts': datetime(2026, 9, 30, 22),
         'total_value': 2100.0, 'instant_value': 5.0},
        {'sensor_id': 1051, 'operational_ts': None, 'total_value': None, 'instant_value': None},
    ]
    recorder = SQLRecorder(rows)
    monkeypatch.setattr(period, 'SessionLocal', lambda: recorder)
    monkeypatch.setattr(period, '_object_exists', lambda *_: True)
    monkeypatch.setattr(period, 'local_to_source_naive', lambda value, *_: value)
    monkeypatch.setattr(period, 'source_to_local_naive', lambda value, *_: value)
    monkeypatch.setattr(period, 'normalize_flow_lps', lambda sid, val, *_: val)
    closes = period.query_previous_closes([1001, 1051], datetime(2026, 10, 1))
    assert closes == {1001: (datetime(2026, 9, 30, 22), 2100.0, 5.0)}
    query = recorder.sql[0].lower()
    assert query.count('outer apply') == 2
    assert query.count('top (1)') == 2
    assert 'row_number()' not in query
    assert 'ts_local is null' in query
    assert 'reading.sensor_id = sensors.sensor_id' in query
    assert recorder.params[0]['before_dt'] == datetime(2026, 10, 1)


def _wait(manager, user_id, job):
    for _ in range(150):
        state = manager.get(user_id, job['id'])
        if state and state['status'] in ('ready', 'failed'):
            return state
        time.sleep(0.01)
    raise AssertionError('Report job was not completed by fake backend')


def test_month_dataset_shared_between_pdf_and_excel_without_changing_builders(monkeypatch, tmp_path):
    from app.services import water_daily_report_service as reports

    params = {'start_date': '2020-10-01', 'end_date': '2020-10-31'}
    calls = []
    pdf_calls = []
    excel_calls = []

    def fake_report(*args, **kwargs):
        calls.append((args, kwargs))
        return {'start_date': params['start_date'], 'end_date': params['end_date'],
                'comparatives': {'rows': [{'label': 'Pozos', 'previous_m3': 1.0}]}}

    def fake_pdf(payload):
        pdf_calls.append(payload)
        return b'PDF-historical', 'durango.pdf'

    def fake_excel(payload):
        excel_calls.append(payload)
        return b'XLSX-historical', 'durango.xlsx'

    monkeypatch.setattr(reports, 'get_daily_water_report', fake_report)
    monkeypatch.setattr(reports, 'build_daily_water_report_pdf', fake_pdf)
    monkeypatch.setattr(reports, 'build_daily_water_report_excel', fake_excel)
    manager = ExportJobManager(directory=tmp_path)
    try:
        p = manager.submit(17, 'daily_pdf', params)
        assert _wait(manager, 17, p)['status'] == 'ready'
        e = manager.submit(17, 'daily_excel', params)
        assert _wait(manager, 17, e)['status'] == 'ready'
        assert len(calls) == 1, 'PDF and Excel should reuse exactly the same completed historical dataset'
        assert len(pdf_calls) == len(excel_calls) == 1
        assert pdf_calls[0] == excel_calls[0]
        assert pdf_calls[0]['comparatives']['rows'][0]['previous_m3'] == 1.0
        assert manager.result(17, p['id'])[0].read_bytes() == b'PDF-historical'
        assert manager.result(17, e['id'])[0].read_bytes() == b'XLSX-historical'
    finally:
        manager.shutdown()


def test_dataset_cache_does_not_share_current_period(monkeypatch, tmp_path):
    from app.services import water_daily_report_service as reports
    from app.services.durango_capabilities import LOCAL_TIMEZONE
    from datetime import date
    from zoneinfo import ZoneInfo

    today = datetime.now(ZoneInfo(LOCAL_TIMEZONE)).date().isoformat()
    seen = []
    def calculate(*args, **kwargs):
        seen.append(1)
        return {'start_date': today, 'end_date': today}

    monkeypatch.setattr(reports, 'get_daily_water_report', calculate)
    monkeypatch.setattr(reports, 'build_daily_water_report_pdf', lambda _: (b'PDF', 'one.pdf'))
    monkeypatch.setattr(reports, 'build_daily_water_report_excel', lambda _: (b'XLSX', 'one.xlsx'))
    manager = ExportJobManager(directory=tmp_path)
    try:
        assert _wait(manager, 44, manager.submit(44, 'daily_pdf', {'date': today}))['status'] == 'ready'
        assert _wait(manager, 44, manager.submit(44, 'daily_excel', {'date': today}))['status'] == 'ready'
        assert len(seen) == 2, 'Today cannot use closed-period cache; readings are changing'
    finally:
        manager.shutdown()
