"""DGO-C06: copia consistente fuera de Git, sin modificar historicos existentes."""
import sqlite3
from datetime import date

import pytest

from app.services import concession_cache_service as cache
from app.services import concession_service as catalog
from app.services import concession_backup_service as backup


@pytest.fixture
def sample_db(tmp_path, monkeypatch):
    db = tmp_path / 'backend' / 'data' / 'concessions.sqlite3'
    monkeypatch.setattr(catalog, '_path', lambda: db)
    monkeypatch.setattr(backup, '_path', lambda: db)
    monkeypatch.setattr(cache, '_now_day', lambda: date(2026, 8, 4))
    cache.initialize_consumption_storage()
    with catalog._connect() as conn:
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('''INSERT INTO concession_daily_consumption
            (plant_key,well_key,day,volume_m3,volume_reliable,samples_received,
             samples_expected,processed_at) VALUES (?,?,?,?,?,?,?,?)''',
             ('durango','pozo_1','2026-08-04',17.5,1,900,1440,'2026-10-12'))
        conn.commit()
    return db


def test_backup_contains_existing_data_and_never_overwrites_live_database(sample_db, tmp_path):
    dest = tmp_path / 'snapshots'
    made = backup.create_daily_backup(day='2026-10-12', dest_dir=dest)
    assert made and made.exists()
    assert not list(dest.glob('*.tmp'))
    with sqlite3.connect(str(made)) as conn:
        value = conn.execute("SELECT volume_m3 FROM concession_daily_consumption WHERE well_key='pozo_1'").fetchone()[0]
        assert value == 17.5
        assert conn.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
    assert sample_db.is_file()
    assert backup.create_daily_backup(day='2026-10-12', dest_dir=dest) is None
    with sqlite3.connect(str(sample_db)) as conn:
        value = conn.execute("SELECT volume_m3 FROM concession_daily_consumption WHERE well_key='pozo_1'").fetchone()[0]
        assert value == 17.5


def test_daily_backup_retains_last_seven(sample_db, tmp_path):
    dest = tmp_path / 'daily'
    for d in range(1,10):
        backup.create_daily_backup(day=f'2026-10-{d:02d}', dest_dir=dest)
    names = sorted(p.name for p in dest.glob('concessions_*.sqlite3'))
    assert len(names) == 7
    assert names[0] == 'concessions_2026-10-03.sqlite3'
    assert names[-1] == 'concessions_2026-10-09.sqlite3'
    assert sample_db.exists()


def test_backup_never_creates_empty_database(tmp_path, monkeypatch):
    missing = tmp_path / 'missing.sqlite3'
    monkeypatch.setattr(backup, '_path', lambda: missing)
    assert backup.create_daily_backup(day='2026-10-12', dest_dir=tmp_path / 'backups') is None
    assert not missing.exists()
