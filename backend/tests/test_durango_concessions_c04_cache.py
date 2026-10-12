"""C04: nunca consultar BOS desde GET; sincronizacion durable y no recontar invalidos."""
from datetime import date, datetime

import pytest

from app.services import concession_service as catalog
from app.services import concession_cache_service as cache


@pytest.fixture
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(catalog, '_path', lambda: tmp_path / 'concessions.sqlite3')
    monkeypatch.setattr(cache, '_now_day', lambda: date(2026, 8, 7))
    cache.initialize_consumption_storage()
    return tmp_path


def point(day, volume, samples=1200, reliable=True):
    return {'bucket_start': day, 'volume_m3': volume, 'volume_reliable': reliable,
            'samples_received': samples, 'samples_expected': 1440}


def history(*items):
    return {'series': [{'sensor_id': 1001, 'points': list(items)},
                       {'sensor_id': 1051, 'points': [point(items[0]['bucket_start'], 10)]}]} if items else {'series': []}


def test_get_is_local_and_empty_does_not_mean_zero(isolated, monkeypatch):
    def forbidden(**kwargs):
        raise AssertionError('GET must not query SQL Server')
    monkeypatch.setattr(cache, 'get_water_history_module', forbidden)
    response = cache.cached_monthly_history(2026)
    assert response['source'] == 'concessions_sqlite_monthly_cache'
    assert response['sync']['processed_days'] == 0
    assert response['sync']['expected_days'] == 4
    assert response['wells'][0]['months'][7]['volume_m3'] is None
    assert response['wells'][0]['operational_total_m3'] is None


def test_daily_rollup_preserves_missing_excluded_zero_and_resume(isolated, monkeypatch):
    def mocked(**kwargs):
        day = kwargs['start_date']
        if day == '2026-08-04': return history(point(day, 20))
        if day == '2026-08-05': return history(point(day, 0))
        if day == '2026-08-06': return history(point(day, 400, reliable=False))
        return history()
    monkeypatch.setattr(cache, 'get_water_history_module', mocked)
    assert all(cache.process_one_day() for _ in range(4))
    response = cache.cached_monthly_history(2026)
    well = response['wells'][0]
    august = well['months'][7]
    assert august['volume_m3'] == 20.0
    assert august['days_with_volume'] == 2  # Cero medido es un día válido
    assert august['days_excluded'] == 1
    assert august['days_without_data'] == 1
    assert august['status'] == 'partial'
    assert response['sync']['processed_days'] == 4
    assert response['sync']['initial_load_complete'] is True
    assert cache.cached_monthly_history(2026)['wells'][1]['operational_total_m3'] == 30.0
    with catalog._connect() as conn:
        next_day = conn.execute('select next_backfill_day from concession_sync_state').fetchone()[0]
        assert next_day == '2026-08-08'
    # Reconstruir no duplica 20 m3; modifica datos por UPSERT.
    cache._write_day(date(2026, 8, 4), history(point('2026-08-04', 25)))
    assert cache.cached_monthly_history(2026)['wells'][0]['operational_total_m3'] == 25.0


def test_failed_source_never_advances_and_recovers(isolated, monkeypatch):
    def unavailable(**kwargs):
        raise RuntimeError('BOS is offline')
    monkeypatch.setattr(cache, 'get_water_history_module', unavailable)
    assert cache.process_one_day() is False
    assert cache.cached_monthly_history(2026)['sync']['last_error'] is not None
    with catalog._connect() as conn:
        assert conn.execute('SELECT next_backfill_day FROM concession_sync_state').fetchone()[0] == '2026-08-04'
        conn.execute('UPDATE concession_sync_state SET retry_after=NULL')
        conn.commit()
    monkeypatch.setattr(cache, 'get_water_history_module', lambda **kw: history(point(kw['start_date'], 5)))
    assert cache.process_one_day() is True
    assert cache.cached_monthly_history(2026)['sync']['last_error'] is None
    assert cache.cached_monthly_history(2026)['wells'][0]['operational_total_m3'] == 5


def test_manual_rebuild_queue_validates_periods(isolated, monkeypatch):
    assert cache.request_rebuild(date(2026, 8, 4), date(2026, 8, 5))['queued']
    with pytest.raises(ValueError):
        cache.request_rebuild(date(2026, 8, 6), date(2026, 8, 7))
    with pytest.raises(ValueError):
        cache.request_rebuild(date(2026, 7, 1), date(2026, 7, 5))
    monkeypatch.setattr(cache, 'get_water_history_module', lambda **kw: history(point(kw['start_date'], 2)))
    assert cache.process_one_day()
    assert cache.cached_monthly_history(2026)['sync']['manual_rebuild_pending']
    assert cache.process_one_day()
    assert not cache.cached_monthly_history(2026)['sync']['manual_rebuild_pending']


def test_lease_blocks_second_worker(isolated, monkeypatch):
    with catalog._connect() as conn:
        conn.execute("UPDATE concession_sync_state SET lease_owner='other', lease_until='2999-01-01T00:00:00+00:00'")
        conn.commit()
    monkeypatch.setattr(cache, 'get_water_history_module', lambda **kw: (_ for _ in ()).throw(AssertionError('must not query')))
    assert cache.process_one_day() is False
