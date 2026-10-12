"""C05: la consulta web usa SQLite; el cursor y los datos sobreviven reinicios."""
from datetime import date, timedelta

import pytest

from app.services import concession_service as catalog
from app.services import concession_cache_service as cache


@pytest.fixture
def storage(tmp_path, monkeypatch):
    monkeypatch.setattr(catalog, '_path', lambda: tmp_path / 'concessions.sqlite3')
    monkeypatch.setattr(cache, '_now_day', lambda: date(2026, 8, 7))
    cache.initialize_consumption_storage()
    return tmp_path


def history(day, volume, *, reliable=True, samples=1200, first=1000, last=1030):
    return {'series': [{'sensor_id': sensor, 'points': [{
        'bucket_start': day, 'volume_m3': volume,
        'volume_reliable': reliable,
        'samples_received': samples, 'samples_expected': 1440,
        'totalizer_open_m3': first, 'totalizer_close_m3': last,
        'discarded_totalizer_events': 2,
        'has_discontinuities': False,
    }]} for sensor in (1001, 1051)]}


def test_refresh_and_reopen_uses_saved_sqlite_only(storage, monkeypatch):
    monkeypatch.setattr(cache, 'get_water_history_module',
                        lambda **kw: history(kw['start_date'], 18))
    for _ in range(4):
        assert cache.process_one_day()
    before = cache.cached_monthly_history(2026)
    assert before['sync']['processed_days'] == 4
    with catalog._connect() as conn:
        saved = conn.execute('SELECT COUNT(*) FROM concession_daily_consumption').fetchone()[0]
        cursor = conn.execute('SELECT next_backfill_day FROM concession_sync_state').fetchone()[0]
    assert saved == 8 and cursor == '2026-08-08'

    def never_query_bos(**kwargs):
        raise AssertionError('La apertura del dashboard nunca debe consultar BOS')
    monkeypatch.setattr(cache, 'get_water_history_module', never_query_bos)
    cache.initialize_consumption_storage()  # simula otro proceso/backend arrancando
    after = cache.cached_monthly_history(2026)
    assert after['wells'][0]['operational_total_m3'] == before['wells'][0]['operational_total_m3']
    assert after['sync']['processed_days'] == 4
    assert after['sync']['persisted_locally'] is True
    assert after['sync']['source_queries_on_page_load'] is False
    with catalog._connect() as conn:
        assert conn.execute('SELECT next_backfill_day FROM concession_sync_state').fetchone()[0] == cursor


def test_daily_diagnostics_distinguish_processed_reliable_discarded_missing(storage):
    cache._write_day(date(2026,8,4), history('2026-08-04', 10))
    cache._write_day(date(2026,8,5), history('2026-08-05', 0))
    cache._write_day(date(2026,8,6), history('2026-08-06', 100, reliable=False))
    cache._write_day(date(2026,8,7), {'series': []})
    response = cache.cached_monthly_history(2026)
    coverage = response['wells'][0]['coverage']
    assert coverage['expected_days'] == 4
    assert coverage['processed_days'] == 4
    assert coverage['days_with_volume'] == 2   # 0 medido también es válido
    assert coverage['days_excluded'] == 1
    assert coverage['days_without_data'] == 1
    assert coverage['days_pending'] == 0
    assert coverage['first_valid_day'] == '2026-08-04'
    assert coverage['last_valid_day'] == '2026-08-05'
    assert coverage['first_totalizer_m3'] == 1000
    assert coverage['last_totalizer_m3'] == 1030
    assert coverage['sample_coverage_percent'] is None  # no todas las fechas tienen expectativa de muestras
    assert coverage['discarded_totalizer_events'] == 6
    assert response['wells'][0]['operational_total_m3'] == 10


def test_legacy_sqlite_daily_rows_are_preserved_during_migration(storage):
    with catalog._connect() as conn:
        conn.execute('DROP TABLE concession_daily_consumption')
        conn.execute('''CREATE TABLE concession_daily_consumption (
            plant_key TEXT NOT NULL, well_key TEXT NOT NULL, day TEXT NOT NULL,
            volume_m3 REAL NULL, volume_reliable INTEGER NOT NULL DEFAULT 0,
            samples_received INTEGER NOT NULL DEFAULT 0, samples_expected INTEGER NOT NULL DEFAULT 0,
            processed_at TEXT NOT NULL, PRIMARY KEY (plant_key, well_key, day))''')
        conn.execute('''INSERT INTO concession_daily_consumption VALUES
            ('durango','pozo_1','2026-08-04',14,1,1200,1440,'2026-08-04T00:00:00+00:00')''')
        conn.commit()
    cache.initialize_consumption_storage()
    with catalog._connect() as conn:
        row = conn.execute("SELECT * FROM concession_daily_consumption WHERE well_key='pozo_1'").fetchone()
        assert row['volume_m3'] == 14
        assert row['totalizer_open_m3'] is None
    coverage = cache.cached_monthly_history(2026)['wells'][0]['coverage']
    assert coverage['processed_days'] == 1
    assert coverage['historical_snapshots_incomplete']


def test_recent_days_refreshes_fairly_without_full_backfill(storage, monkeypatch):
    with catalog._connect() as conn:
        # Simula 70 dias previos procesados y ambos dias recientes almacenados.
        conn.execute("UPDATE concession_sync_state SET next_backfill_day='2026-08-08'")
        for day, timestamp in [('2026-08-06','2026-08-01T10:00:00+00:00'),
                               ('2026-08-07','2026-07-31T10:00:00+00:00')]:
            conn.execute('''INSERT INTO concession_daily_consumption
              (plant_key,well_key,day,volume_m3,volume_reliable,samples_received,samples_expected,processed_at)
              VALUES (?,?,?,?,?,?,?,?)''', ('durango','pozo_1',day,10,1,1200,1440,timestamp))
        conn.commit()
    with catalog._connect() as conn:
        upcoming = cache._next_day(conn, date(2026,8,7))
    assert upcoming == (date(2026,8,7), 'refresh')  # hoy estaba más desactualizado


def test_new_day_after_completed_history_never_restarts_at_cutover(storage, monkeypatch):
    with catalog._connect() as conn:
        conn.execute("UPDATE concession_sync_state SET next_backfill_day='2026-08-08'")
        conn.commit()
    monkeypatch.setattr(cache, '_now_day', lambda: date(2026,8,8))
    with catalog._connect() as conn:
        assert cache._next_day(conn, date(2026,8,8)) == (date(2026,8,8),'backfill')
