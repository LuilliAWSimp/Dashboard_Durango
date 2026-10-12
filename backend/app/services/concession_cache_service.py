"""Consolidacion local y reanudable de extracciones operativas de Durango.

Las lecturas originales permanecen en BOS. SQLite conserva solo los resultados
operativos verificados y su trazabilidad; NO certifica consumo concesionado.
La API de lectura jamas consulta SQL Server.
"""
from __future__ import annotations

import logging
import sqlite3
import threading
import uuid
from datetime import date, datetime, timedelta, timezone
from calendar import monthrange

from app.config import get_settings
from app.services.concession_service import _connect, _PLANT, _WELLS, initialize_concessions
from app.services.concession_history_service import _as_number, summarize_months
from app.services.durango_capabilities import DURANGO_SCADA_CUTOVER_LOCAL
from app.services.plant_time import local_now_naive
from app.services.water_history_service import get_water_history_module

logger = logging.getLogger(__name__)
_INIT_LOCK = threading.RLock()
_RUN_LOCK = threading.Lock()
_CUTOVER = DURANGO_SCADA_CUTOVER_LOCAL.date()


def _utc() -> datetime:
    return datetime.now(timezone.utc)


def _iso(now: datetime | None = None) -> str:
    return (now or _utc()).isoformat(timespec='seconds')


def _now_day() -> date:
    return local_now_naive().date()


def initialize_consumption_storage() -> None:
    initialize_concessions()
    with _INIT_LOCK, _connect() as conn:
        conn.executescript('''
          CREATE TABLE IF NOT EXISTS concession_daily_consumption (
            plant_key TEXT NOT NULL, well_key TEXT NOT NULL, day TEXT NOT NULL,
            volume_m3 REAL NULL, volume_reliable INTEGER NOT NULL DEFAULT 0,
            samples_received INTEGER NOT NULL DEFAULT 0, samples_expected INTEGER NOT NULL DEFAULT 0,
            processed_at TEXT NOT NULL,
            PRIMARY KEY (plant_key, well_key, day)
          );
          CREATE TABLE IF NOT EXISTS concession_monthly_consumption (
            plant_key TEXT NOT NULL, well_key TEXT NOT NULL, year INTEGER NOT NULL,
            month INTEGER NOT NULL, volume_m3 REAL NULL, days_with_volume INTEGER NOT NULL,
            days_without_data INTEGER NOT NULL, days_excluded INTEGER NOT NULL,
            coverage_percent REAL NULL, status TEXT NOT NULL, calculated_at TEXT NOT NULL,
            PRIMARY KEY (plant_key, well_key, year, month)
          );
          CREATE TABLE IF NOT EXISTS concession_sync_state (
            id INTEGER PRIMARY KEY CHECK(id = 1), next_backfill_day TEXT NOT NULL,
            force_next_day TEXT NULL, force_end_day TEXT NULL,
            last_success_at TEXT NULL, last_error TEXT NULL, last_period_date TEXT NULL,
            retry_after TEXT NULL, lease_owner TEXT NULL, lease_until TEXT NULL,
            status TEXT NOT NULL DEFAULT 'pending', updated_at TEXT NOT NULL
          );
        ''')
        conn.execute('''INSERT OR IGNORE INTO concession_sync_state
          (id,next_backfill_day,updated_at) VALUES (1,?,?)''', (_CUTOVER.isoformat(), _iso()))
        conn.commit()


def _sync_summary(conn: sqlite3.Connection, today: date) -> dict:
    state = conn.execute('SELECT * FROM concession_sync_state WHERE id=1').fetchone()
    processed = conn.execute('''SELECT COUNT(*) AS n FROM concession_daily_consumption
      WHERE plant_key=? AND well_key=? AND day BETWEEN ? AND ?''',
      (_PLANT, 'pozo_1', _CUTOVER.isoformat(), today.isoformat())).fetchone()['n']
    total_days = max(0, (today - _CUTOVER).days + 1)
    lease_until = state['lease_until']
    running = bool(lease_until and lease_until > _iso())
    return {
        'state': 'updating' if running else 'error' if state['last_error'] else 'backfilling' if processed < total_days else 'up_to_date',
        'processed_days': processed, 'expected_days': total_days,
        'progress_percent': round(100 * processed / total_days, 1) if total_days else 100.0,
        'last_success_at': state['last_success_at'],
        'last_period_date': state['last_period_date'],
        'last_error': state['last_error'],
        'running': running,
        'initial_load_complete': processed >= total_days,
        'refresh_minutes': max(5, int(get_settings().concession_sync_refresh_minutes)),
        'manual_rebuild_pending': bool(state['force_next_day']),
    }


def cached_monthly_history(year: int) -> dict:
    """API path: bounded SQLite reads, no SQL Server calls and no retries in proxy."""
    initialize_consumption_storage()
    today = _now_day()
    if year < _CUTOVER.year or year > today.year:
        raise ValueError(f'El año debe estar entre {_CUTOVER.year} y {today.year}.')
    start, end = max(date(year, 1, 1), _CUTOVER), min(date(year, 12, 31), today)
    with _connect() as conn:
        monthly = conn.execute('''SELECT * FROM concession_monthly_consumption
          WHERE plant_key=? AND year=?''', (_PLANT, year)).fetchall()
        sync = _sync_summary(conn, today)
    indexed = {(record['well_key'], record['month']): dict(record) for record in monthly}
    # El contrato permanece identico al de C03, para que las graficas conserven semantica.
    response = summarize_months({'series': []}, year=year, start=start, end=end)
    response['source'] = 'concessions_sqlite_monthly_cache'
    response['sync'] = sync
    for well in response['wells']:
        months_with_data = 0
        total = 0.0
        for month in well['months']:
            stored = indexed.get((well['well_key'], month['month']))
            if not stored:
                continue
            for name in ('volume_m3', 'days_with_volume', 'days_without_data',
                         'days_excluded', 'coverage_percent', 'status'):
                month[name] = stored[name]
            if month['volume_m3'] is not None:
                months_with_data += 1
                total += month['volume_m3']
        well['months_with_data'] = months_with_data
        well['operational_total_m3'] = round(total, 3) if months_with_data else None
        well['has_partial_coverage'] = start > date(year, 1, 1) or any(month['status'] == 'partial' for month in well['months'])
    return response


def _read_day(day: date) -> dict:
    """Small window, never request a whole year from the industrial source."""
    return get_water_history_module(module='well', start_date=day.isoformat(),
                                    end_date=day.isoformat(), aggregation='daily')


def _write_day(day: date, history: dict) -> None:
    index = {int(item['sensor_id']): item for item in history.get('series', [])
             if item.get('sensor_id') is not None}
    now = _iso()
    with _connect() as conn:
        conn.execute('BEGIN IMMEDIATE')
        for key, (_, sensor_id, _, _) in _WELLS.items():
            points = index.get(sensor_id, {}).get('points') or []
            point = next((p for p in points if str(p.get('bucket_start', ''))[:10] == day.isoformat()), {})
            samples = max(0, int(point.get('samples_received') or point.get('samples') or 0))
            expected = max(0, int(point.get('samples_expected') or 0))
            parsed = _as_number(point.get('volume_m3'))
            reliable = samples > 0 and bool(point.get('volume_reliable')) and parsed is not None
            conn.execute('''INSERT INTO concession_daily_consumption
                (plant_key,well_key,day,volume_m3,volume_reliable,samples_received,samples_expected,processed_at)
                VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(plant_key,well_key,day) DO UPDATE SET
                volume_m3=excluded.volume_m3,volume_reliable=excluded.volume_reliable,
                samples_received=excluded.samples_received,samples_expected=excluded.samples_expected,
                processed_at=excluded.processed_at''',
                (_PLANT, key, day.isoformat(), parsed if reliable else None,
                 int(reliable), samples, expected, now))
        _rollup_year(conn, day.year, _now_day(), now)
        conn.execute('''UPDATE concession_sync_state SET last_success_at=?,last_period_date=?,
          last_error=NULL,retry_after=NULL,updated_at=? WHERE id=1''',
          (now, day.isoformat(), now))
        conn.commit()


def _rollup_year(conn: sqlite3.Connection, year: int, today: date, timestamp: str) -> None:
    start, end = max(date(year, 1, 1), _CUTOVER), min(date(year, 12, 31), today)
    records = conn.execute('''SELECT * FROM concession_daily_consumption
      WHERE plant_key=? AND day BETWEEN ? AND ? ORDER BY day''',
      (_PLANT, start.isoformat(), end.isoformat())).fetchall()
    by_key = {key: [] for key in _WELLS}
    for item in records:
        # Invalid days need samples to count as excluded; no-lecture days are missing.
        by_key[item['well_key']].append({
            'bucket_start': item['day'], 'volume_m3': item['volume_m3'],
            'volume_reliable': bool(item['volume_reliable']),
            'samples_received': item['samples_received'],
            'samples_expected': item['samples_expected'],
        })
    response = summarize_months({'series': [
        {'sensor_id': _WELLS[key][1], 'points': points}
        for key, points in by_key.items()]}, year=year, start=start, end=end)
    for well in response['wells']:
        for month in well['months']:
            conn.execute('''INSERT INTO concession_monthly_consumption
              (plant_key,well_key,year,month,volume_m3,days_with_volume,
               days_without_data,days_excluded,coverage_percent,status,calculated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(plant_key,well_key,year,month)
              DO UPDATE SET volume_m3=excluded.volume_m3,
                days_with_volume=excluded.days_with_volume,
                days_without_data=excluded.days_without_data,
                days_excluded=excluded.days_excluded,
                coverage_percent=excluded.coverage_percent,status=excluded.status,
                calculated_at=excluded.calculated_at''',
              (_PLANT, well['well_key'], year, month['month'], month['volume_m3'],
               month['days_with_volume'], month['days_without_data'],
               month['days_excluded'], month['coverage_percent'], month['status'], timestamp))


def request_rebuild(start_day: date, end_day: date) -> dict:
    today = _now_day()
    if start_day < _CUTOVER or end_day > today or end_day < start_day or (end_day - start_day).days > 30:
        raise ValueError(f'Selecciona de 1 a 31 días entre {_CUTOVER} y {today}.')
    initialize_consumption_storage()
    with _connect() as conn:
        conn.execute('BEGIN IMMEDIATE')
        previous = conn.execute('SELECT force_next_day FROM concession_sync_state WHERE id=1').fetchone()
        if previous['force_next_day']:
            raise ValueError('Ya existe una reconstrucción manual pendiente.')
        conn.execute('''UPDATE concession_sync_state SET force_next_day=?,force_end_day=?,
          retry_after=NULL,last_error=NULL,updated_at=? WHERE id=1''',
          (start_day.isoformat(), end_day.isoformat(), _iso()))
        conn.commit()
    return {'queued': True, 'start_date': start_day.isoformat(), 'end_date': end_day.isoformat()}


def _next_day(conn: sqlite3.Connection, today: date) -> tuple[date, str] | None:
    state = conn.execute('SELECT * FROM concession_sync_state WHERE id=1').fetchone()
    if state['retry_after'] and state['retry_after'] > _iso():
        return None
    if state['force_next_day']:
        return date.fromisoformat(state['force_next_day']), 'manual'
    upcoming = date.fromisoformat(state['next_backfill_day'])
    if upcoming <= today:
        return upcoming, 'backfill'
    # La sincronización incremental reevalúa el día actual y el anterior:
    # permite recibir lecturas atrasadas sin rehacer todo el historial.
    last_two = [day for day in [today - timedelta(days=1), today] if day >= _CUTOVER]
    if not last_two:
        return None
    dates = [day.isoformat() for day in last_two]
    recent = conn.execute('''SELECT day,processed_at FROM concession_daily_consumption
      WHERE plant_key=? AND well_key=? AND day IN (?,?)''',
      (_PLANT, 'pozo_1', dates[0], dates[-1])).fetchall()
    processed = {row['day']: row['processed_at'] for row in recent}
    threshold = _utc() - timedelta(minutes=max(5, int(get_settings().concession_sync_refresh_minutes)))
    candidates = [day for day in last_two if not processed.get(day.isoformat()) or
                  datetime.fromisoformat(processed[day.isoformat()]) < threshold]
    return (candidates[0], 'refresh') if candidates else None


def process_one_day() -> bool:
    """Single bounded BOS query with durable cursor and SQLite lease across workers."""
    if not _RUN_LOCK.acquire(blocking=False):
        return False
    owner = uuid.uuid4().hex
    try:
        initialize_consumption_storage()
        today = _now_day()
        with _connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            lock = conn.execute('SELECT lease_until FROM concession_sync_state WHERE id=1').fetchone()
            if lock['lease_until'] and lock['lease_until'] > _iso():
                return False
            work = _next_day(conn, today)
            if not work:
                return False
            day, kind = work
            conn.execute('''UPDATE concession_sync_state SET lease_owner=?,lease_until=?,
              status='updating',updated_at=? WHERE id=1''',
              (owner, _iso(_utc() + timedelta(minutes=20)), _iso()))
            conn.commit()
        try:
            _write_day(day, _read_day(day))
            with _connect() as conn:
                conn.execute('BEGIN IMMEDIATE')
                if kind == 'backfill':
                    conn.execute('''UPDATE concession_sync_state SET next_backfill_day=? WHERE id=1''',
                                 ((day + timedelta(days=1)).isoformat(),))
                elif kind == 'manual':
                    state = conn.execute('SELECT force_end_day FROM concession_sync_state WHERE id=1').fetchone()
                    if day >= date.fromisoformat(state['force_end_day']):
                        conn.execute('UPDATE concession_sync_state SET force_next_day=NULL,force_end_day=NULL WHERE id=1')
                    else:
                        conn.execute('UPDATE concession_sync_state SET force_next_day=? WHERE id=1',
                                     ((day + timedelta(days=1)).isoformat(),))
                conn.commit()
            return True
        except Exception as exc:
            logger.exception('Error actualizando concesiones para %s', day)
            with _connect() as conn:
                conn.execute('''UPDATE concession_sync_state SET last_error=?,
                  retry_after=?,updated_at=? WHERE id=1''',
                  ('No se pudo consultar BOS; el servidor reintentara la lectura.',
                   _iso(_utc() + timedelta(minutes=2)), _iso()))
                conn.commit()
            return False
        finally:
            with _connect() as conn:
                conn.execute('''UPDATE concession_sync_state SET lease_owner=NULL,lease_until=NULL,
                  status='pending' WHERE id=1 AND lease_owner=?''', (owner,))
                conn.commit()
    finally:
        _RUN_LOCK.release()


class _Runner:
    def __init__(self):
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None

    def start(self):
        if self.thread and self.thread.is_alive():
            return
        initialize_consumption_storage()
        self.stop_event.clear()
        self.thread = threading.Thread(target=self._loop, daemon=True, name='concessions-sqlite-sync')
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2)
        self.thread = None

    def _loop(self):
        # Un corto retraso evita disputar recursos de SQL Server con el arranque.
        if self.stop_event.wait(5):
            return
        while not self.stop_event.is_set():
            try:
                worked = process_one_day()
            except Exception:
                logger.exception('Fallo inesperado del sincronizador de concesiones')
                worked = False
            self.stop_event.wait(3 if worked else 15)


_RUNNER = _Runner()


def start_consumption_sync():
    if get_settings().concession_sync_enabled and get_settings().db_mode.lower() == 'sqlserver':
        _RUNNER.start()


def stop_consumption_sync():
    _RUNNER.stop()
