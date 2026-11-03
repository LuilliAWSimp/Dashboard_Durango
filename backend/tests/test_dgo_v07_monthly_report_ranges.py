"""DGO-V07: mes completo, sin truncamiento silencioso ni cambios en formatos."""
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

from app.services import durango_jarabes_service as jarabes
from app.services import durango_lavadoras_service as lavadoras
from app.services import water_period_service as periods
from app.services.report_export_job_service import validate_options
from app.services.water_bounded_range import IncompleteRangeError, read_complete_window
from app.services.water_daily_report_service import _history_aggregation


def _fake_result(data):
    return SimpleNamespace(fetchall=lambda: [SimpleNamespace(_mapping=item) for item in data])


class FakeSession:
    def __init__(self, rows, kind):
        self.rows = rows
        self.kind = kind
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, _sql, params):
        self.calls.append(dict(params))
        start = params.get('start_dt', params.get('start_utc'))
        end = params.get('end_dt', params.get('end_utc'))
        if self.kind == 'period':
            filtered = [row for row in self.rows if start <= row['operational_ts'] < end]
            filtered.sort(key=lambda row: (row['sensor_id'], row['operational_ts']))
            filtered = filtered[:params['max_rows']]
        else:
            filtered = [row for row in self.rows if start <= row['source_timestamp'] < end]
            filtered = sorted(filtered, key=lambda row: row['source_timestamp'])
            # El SQL de la planta limita a MAX_LAVADORAS_ROWS o MAX_JARABES_ROWS.
            limit = lavadoras.MAX_LAVADORAS_ROWS if self.kind == 'washers' else jarabes.MAX_JARABES_ROWS
            filtered = filtered[:limit]
        return _fake_result(filtered)


def test_monthly_31_days_accepted_as_range_and_daily_history():
    for kind in ('daily_pdf', 'daily_excel'):
        clean = validate_options(kind, {'start_date': '2026-10-01', 'end_date': '2026-10-31'})
        assert clean['start_date'] == '2026-10-01'
        assert clean['end_date'] == '2026-10-31'
    assert _history_aggregation(datetime(2026, 10, 1).date(), datetime(2026, 10, 31).date()) == 'daily'


def test_bounded_reader_recovers_every_row_when_sql_top_is_reached():
    start = datetime(2026, 10, 1)
    end = datetime(2026, 11, 1)
    stamps = [start + timedelta(hours=8 * i) for i in range(31 * 3)]
    calls = []

    def fetch(left, right):
        calls.append((left, right))
        return [{'stamp': value} for value in stamps if left <= value < right][:7]

    result = read_complete_window(start, end, fetch, max_rows=7)
    assert [entry['stamp'] for entry in result] == stamps
    assert len(calls) > 5
    assert all(left < right for left, right in calls)


def test_bounded_reader_fails_explicitly_if_even_minimum_window_is_truncated():
    start = datetime(2026, 10, 1)
    with pytest.raises(IncompleteRangeError):
        read_complete_window(start, start + timedelta(seconds=1), lambda *_: [{'a': 1}, {'a': 2}], max_rows=2)


def test_period_sql_recovers_entire_month_with_multiple_sensors(monkeypatch):
    monkeypatch.setattr(periods, 'MAX_ROWS', 3)
    monkeypatch.setattr(periods, '_object_exists', lambda *_: True)
    start = datetime(2026, 10, 1)
    rows = [
        {'sensor_id': sid, 'operational_ts': start + timedelta(days=day, hours=1),
         'instant_value': 1.0, 'total_value': float(day), 'quality': None, 'source': 'test'}
        for day in range(31) for sid in (1001, 1051)
    ]
    fake = FakeSession(rows, 'period')
    monkeypatch.setattr(periods, 'SessionLocal', lambda: fake)
    monkeypatch.setattr(periods, 'local_to_source_naive', lambda dt, tz: dt)
    monkeypatch.setattr(periods, 'source_to_local_naive', lambda dt, tz: dt)
    monkeypatch.setattr(periods, 'normalize_flow_lps', lambda sid, value, dt: value)
    got = periods.query_readings_window([1001, 1051], start, start + timedelta(days=31))
    assert len(got) == 62
    assert sum(row['sensor_id'] == 1001 for row in got) == 31
    assert sum(row['sensor_id'] == 1051 for row in got) == 31
    assert fake.calls and all(call['max_rows'] == 3 for call in fake.calls)


def test_washers_recover_every_source_row_for_31_days(monkeypatch):
    monkeypatch.setattr(lavadoras, 'MAX_LAVADORAS_ROWS', 3)
    start = datetime(2026, 10, 1)
    rows = [{'source_timestamp': start + timedelta(days=day, hours=12)} for day in range(31)]
    fake = FakeSession(rows, 'washers')
    monkeypatch.setattr(lavadoras, 'local_to_source_naive', lambda dt, tz: dt)
    got = lavadoras._query_rows(start, start + timedelta(days=31), session=fake)
    assert len(got) == 31
    assert got[0]['source_timestamp'] == rows[0]['source_timestamp']
    assert got[-1]['source_timestamp'] == rows[-1]['source_timestamp']


def test_jarabes_recover_every_source_row_for_31_days(monkeypatch):
    monkeypatch.setattr(jarabes, 'MAX_JARABES_ROWS', 3)
    start = datetime(2026, 10, 1)
    rows = [{'source_timestamp': start + timedelta(days=day, hours=12)} for day in range(31)]
    fake = FakeSession(rows, 'jarabes')
    segment = jarabes.JARABES_SOURCE_SEGMENTS[1]
    got = jarabes._query_segment_rows(segment, start, start + timedelta(days=31), session=fake)
    assert len(got) == 31
    assert got[0]['source_timestamp'] == rows[0]['source_timestamp']
    assert got[-1]['source_timestamp'] == rows[-1]['source_timestamp']
