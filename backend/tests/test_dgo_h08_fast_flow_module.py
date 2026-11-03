"""DGO-H08: set-based flow-only, no missing-volume invention, unchanged full path."""
from datetime import datetime
from unittest.mock import patch

from app.services import water_history_service as history
from app.services.water_history_job_service import ModuleHistoryJobManager


class FakeSession:
    def __init__(self):
        self.statements = []
    def __enter__(self):
        return self
    def __exit__(self, *_):
        return False
    def execute(self, statement, params=None):
        self.statements.append((str(statement), params))
        if 'OBJECT_ID' in str(statement):
            return type('Result', (), {'scalar': lambda self: 1})()
        return type('Result', (), {'fetchall': lambda self: []})()


def test_sql_flow_uses_indexable_dates_and_real_grouping(monkeypatch):
    session = FakeSession()
    monkeypatch.setattr(history, 'SessionLocal', lambda: session)
    with patch.object(history, '_localized_rows', side_effect=lambda rows, *args, **kwargs: rows):
        history._query_flow_buckets([1001, 1051], datetime(2026, 10, 9), datetime(2026, 10, 12), 'hourly')
    statement = next(sql for sql, p in session.statements if 'WITH filtered AS' in sql)
    assert 'reading.ts_local >= :start_dt' in statement
    assert 'reading.ts_local IS NULL' in statement
    assert 'reading.ts_minute >= :start_dt' in statement
    assert 'UNION ALL' in statement
    assert 'GROUP BY sensor_id, bucket_start' in statement
    assert 'AVG(flow_value)' in statement
    assert 'OUTER APPLY' not in statement
    assert 'DAtE' not in statement  # physical date conversion remains in bind params


def test_fast_flow_skips_physical_validation_and_keeps_volume_null():
    history._CACHE.clear()
    day = datetime(2026, 10, 12, 18)
    bucket = datetime(2026, 10, 10, 12)
    aggregated = [dict(sensor_id=1001, bucket_start=bucket,
                       samples=60, active_samples=60, flow_avg=20.0, flow_active_avg=20.0,
                       flow_min=18.0, flow_max=21.0)]
    with patch.object(history, 'local_now_naive', return_value=day), \
         patch.object(history, '_query_flow_buckets', return_value=aggregated) as fast, \
         patch.object(history, '_query_15m_multi_chunked', side_effect=AssertionError('full SQL should not run')), \
         patch.object(history, '_query_physical_validation_rows_chunked', side_effect=AssertionError('physical rows should not run')), \
         patch.object(history, 'analyze_totalizer_series', side_effect=AssertionError('totalizer validation should not run')), \
         patch.object(history, 'query_bos_well_rows', return_value=[]):
        response = history.get_water_history_module(module='well', start_date='2026-10-10', end_date='2026-10-10', aggregation='hourly', flow_only=True)
    assert fast.call_count == 1
    assert response['flow_only'] is True
    points = response['series'][0]['points']
    present = next(point for point in points if point['samples'] == 60)
    assert present['flow_avg_lps'] == 20.0
    assert present['volume_m3'] is None
    assert present['totalizer_open_m3'] is None
    assert present['totalizer_close_m3'] is None
    assert present['samples_received'] == 60
    history._CACHE.clear()


def test_full_mode_still_queries_validation_and_stays_outside_fast_cache():
    history._CACHE.clear()
    with patch.object(history, '_query_flow_buckets', side_effect=AssertionError('flow-only path should not run')), \
         patch.object(history, '_query_15m_multi_chunked', return_value=[]) as full, \
         patch.object(history, '_query_physical_validation_rows_chunked', return_value=[]) as physical, \
         patch.object(history, 'query_bos_well_rows', return_value=[]):
        payload = history.get_water_history_module(module='well', start_date='2026-10-10', end_date='2026-10-10', aggregation='hourly')
    assert payload['flow_only'] is False
    assert full.called and physical.called
    history._CACHE.clear()


def test_job_identity_separates_flow_and_complete_without_leakage():
    manager = ModuleHistoryJobManager(lambda **opts: dict(opts))
    try:
        args = dict(owner_id=7, module='well', start_date='2026-10-10', end_date='2026-10-10', aggregation='hourly')
        flow = manager.submit(**args, flow_only=True)
        full = manager.submit(**args, flow_only=False)
        assert flow['id'] != full['id']
        assert manager.submit(**args, flow_only=True)['id'] == flow['id']
        assert manager.get(owner_id=8, job_id=flow['id']) is None
    finally:
        manager.shutdown()
