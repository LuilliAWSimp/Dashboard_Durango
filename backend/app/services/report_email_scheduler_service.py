from __future__ import annotations

import json
import logging
import sqlite3
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.services.email_service import (
    EmailDeliveryError,
    EmailNotConfiguredError,
    ensure_smtp_configured,
    send_email_with_bytes_attachments,
)
from app.services.water_daily_report_service import (
    ReportDataUnavailableError,
    build_daily_water_report_excel,
    build_daily_water_report_pdf,
)
from app.services.water_scheduled_report_service import build_scheduled_water_report
from app.services.durango_capabilities import LOCAL_TIMEZONE, PLANT_NAME

settings = get_settings()
logger = logging.getLogger(__name__)
LOCAL_ZONE = ZoneInfo(LOCAL_TIMEZONE)


class ReportScheduleError(RuntimeError):
    pass


@dataclass(frozen=True)
class ScheduledPeriod:
    start: datetime
    end: datetime
    due_at: datetime
    mode: str

    @property
    def key(self) -> str:
        return f"{self.mode}:{self.start.isoformat(timespec='minutes')}:{self.end.isoformat(timespec='minutes')}"


def _database_path() -> Path:
    configured = Path(settings.report_schedule_database_path)
    if configured.is_absolute():
        return configured
    backend_root = Path(__file__).resolve().parents[2]
    return backend_root / configured


def _connect() -> sqlite3.Connection:
    path = _database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    return conn


def initialize_report_email_scheduler_storage() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS report_email_schedules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                period_mode TEXT NOT NULL,
                formats_json TEXT NOT NULL,
                recipients_json TEXT NOT NULL,
                cc_json TEXT NOT NULL DEFAULT '[]',
                timezone TEXT NOT NULL,
                send_delay_minutes INTEGER NOT NULL DEFAULT 10,
                send_time_local TEXT,
                send_time_local_2 TEXT,
                subject TEXT,
                message TEXT,
                created_by_user_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS report_email_runs (
                id TEXT PRIMARY KEY,
                schedule_id TEXT NOT NULL,
                period_start TEXT NOT NULL,
                period_end TEXT NOT NULL,
                period_mode TEXT NOT NULL,
                due_at TEXT NOT NULL,
                status TEXT NOT NULL,
                attempt INTEGER NOT NULL DEFAULT 0,
                started_at TEXT,
                finished_at TEXT,
                error_message TEXT,
                message_id TEXT,
                attachments_json TEXT NOT NULL DEFAULT '[]',
                FOREIGN KEY(schedule_id) REFERENCES report_email_schedules(id) ON DELETE CASCADE,
                UNIQUE(schedule_id, period_start, period_end)
            );

            CREATE INDEX IF NOT EXISTS idx_report_email_schedules_enabled
                ON report_email_schedules(enabled);
            CREATE INDEX IF NOT EXISTS idx_report_email_runs_schedule
                ON report_email_runs(schedule_id, started_at DESC);
            """
        )

        columns = {str(row['name']) for row in conn.execute('PRAGMA table_info(report_email_schedules)').fetchall()}
        if 'send_time_local' not in columns:
            conn.execute('ALTER TABLE report_email_schedules ADD COLUMN send_time_local TEXT')
        if 'send_time_local_2' not in columns:
            conn.execute('ALTER TABLE report_email_schedules ADD COLUMN send_time_local_2 TEXT')

        rows = conn.execute(
            """
            SELECT id, period_mode, send_delay_minutes, send_time_local, send_time_local_2
            FROM report_email_schedules
            """
        ).fetchall()
        for row in rows:
            first, second = _resolved_delivery_times(dict(row))
            conn.execute(
                """
                UPDATE report_email_schedules
                SET send_time_local = ?, send_time_local_2 = ?
                WHERE id = ?
                """,
                (first, second, row['id']),
            )



def _clock_text(value: Any) -> str | None:
    text = str(value or '').strip()
    if not text:
        return None
    try:
        parsed = datetime.strptime(text, '%H:%M')
    except ValueError as exc:
        raise ReportScheduleError('El horario debe usar formato HH:MM de 00:00 a 23:59.') from exc
    return parsed.strftime('%H:%M')


def _clock_value(value: str) -> time:
    return datetime.strptime(value, '%H:%M').time()


def _time_after_close(close_at: datetime, clock_text: str) -> datetime:
    due_at = datetime.combine(close_at.date(), _clock_value(clock_text))
    if due_at < close_at:
        due_at += timedelta(days=1)
    return due_at


def _legacy_delivery_times(period_mode: str, delay_minutes: int) -> tuple[str, str | None]:
    delay = timedelta(minutes=max(int(delay_minutes), 0))
    if period_mode == 'fixed_12h_blocks':
        first = (datetime.combine(datetime.today().date(), time(hour=12)) + delay).strftime('%H:%M')
        second = (datetime.combine(datetime.today().date(), time.min) + delay).strftime('%H:%M')
        return first, second
    first = (datetime.combine(datetime.today().date(), time.min) + delay).strftime('%H:%M')
    return first, None


def _resolved_delivery_times(schedule: dict[str, Any]) -> tuple[str, str | None]:
    mode = str(schedule.get('period_mode') or 'previous_calendar_day_24h')
    delay = int(schedule.get('send_delay_minutes') or settings.report_email_send_delay_minutes)
    legacy_first, legacy_second = _legacy_delivery_times(mode, delay)
    first = _clock_text(schedule.get('send_time_local')) or legacy_first
    if mode == 'fixed_12h_blocks':
        second = _clock_text(schedule.get('send_time_local_2')) or legacy_second or '00:10'
        return first, second
    return first, None


def _periods_for_day(schedule: dict[str, Any], day) -> list[ScheduledPeriod]:
    mode = str(schedule.get('period_mode'))
    first_time, second_time = _resolved_delivery_times(schedule)
    start = datetime.combine(day, time.min)
    if mode == 'previous_calendar_day_24h':
        end = start + timedelta(days=1)
        due_at = datetime.combine(end.date(), _clock_value(first_time))
        return [ScheduledPeriod(start=start, end=end, due_at=due_at, mode=mode)]
    if mode == 'fixed_12h_blocks':
        end_a = start + timedelta(hours=12)
        end_b = start + timedelta(days=1)
        due_a = _time_after_close(end_a, first_time)
        due_b = _time_after_close(end_b, second_time or '00:10')
        return [
            ScheduledPeriod(start=start, end=end_a, due_at=due_a, mode=mode),
            ScheduledPeriod(start=end_a, end=end_b, due_at=due_b, mode=mode),
        ]
    raise ReportScheduleError('Modo de periodo no soportado.')

def _json_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
            if isinstance(decoded, list):
                return [str(item) for item in decoded if str(item).strip()]
        except json.JSONDecodeError:
            return []
    if isinstance(value, (tuple, list)):
        return [str(item) for item in value if str(item).strip()]
    return []


def _serialize_schedule(row: sqlite3.Row | dict[str, Any], now: datetime | None = None) -> dict[str, Any]:
    item = dict(row)
    item['enabled'] = bool(item.get('enabled'))
    item['formats'] = _json_list(item.pop('formats_json', []))
    item['recipients'] = _json_list(item.pop('recipients_json', []))
    item['cc'] = _json_list(item.pop('cc_json', []))
    reference = now or datetime.now(LOCAL_ZONE).replace(tzinfo=None)
    item['next_run_at'] = _next_run_at(item, reference).isoformat(timespec='minutes') if item['enabled'] else None
    item['last_run'] = _last_run(item['id'])
    return item


def _last_run(schedule_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT id, period_start, period_end, status, attempt, started_at, finished_at,
                   error_message, message_id, attachments_json
            FROM report_email_runs
            WHERE schedule_id = ?
            ORDER BY COALESCE(finished_at, started_at) DESC
            LIMIT 1
            """,
            (schedule_id,),
        ).fetchone()
    if not row:
        return None
    result = dict(row)
    result['attachments'] = _json_list(result.pop('attachments_json', []))
    return result


def list_report_email_schedules() -> list[dict[str, Any]]:
    initialize_report_email_scheduler_storage()
    with _connect() as conn:
        rows = conn.execute(
            'SELECT * FROM report_email_schedules ORDER BY enabled DESC, created_at ASC'
        ).fetchall()
    return [_serialize_schedule(row) for row in rows]


def get_report_email_schedule(schedule_id: str) -> dict[str, Any]:
    initialize_report_email_scheduler_storage()
    with _connect() as conn:
        row = conn.execute('SELECT * FROM report_email_schedules WHERE id = ?', (schedule_id,)).fetchone()
    if not row:
        raise ReportScheduleError('Programación no encontrada.')
    return _serialize_schedule(row)


def create_report_email_schedule(payload: dict[str, Any], created_by: str = 'pending-auth') -> dict[str, Any]:
    initialize_report_email_scheduler_storage()
    now = datetime.now(LOCAL_ZONE).replace(tzinfo=None).isoformat(timespec='seconds')
    schedule_id = str(uuid.uuid4())
    delay = int(payload.get('send_delay_minutes') or settings.report_email_send_delay_minutes)
    period_mode = str(payload.get('period_mode') or 'previous_calendar_day_24h')
    first_time, second_time = _resolved_delivery_times({
        'period_mode': period_mode,
        'send_delay_minutes': delay,
        'send_time_local': payload.get('send_time_local'),
        'send_time_local_2': payload.get('send_time_local_2'),
    })
    formats = sorted({str(item).lower() for item in payload.get('formats') or [] if str(item).lower() in {'pdf', 'excel'}})
    recipients = sorted({str(item).strip() for item in payload.get('recipients') or [] if str(item).strip()})
    cc = sorted({str(item).strip() for item in payload.get('cc') or [] if str(item).strip()})
    if not formats:
        raise ReportScheduleError('Selecciona al menos un formato.')
    if not recipients:
        raise ReportScheduleError('Captura al menos un destinatario.')
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO report_email_schedules (
                id, name, enabled, period_mode, formats_json, recipients_json, cc_json,
                timezone, send_delay_minutes, send_time_local, send_time_local_2,
                subject, message, created_by_user_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                schedule_id,
                str(payload.get('name') or 'Reporte programado').strip(),
                1 if payload.get('enabled', True) else 0,
                period_mode,
                json.dumps(formats, ensure_ascii=False),
                json.dumps(recipients, ensure_ascii=False),
                json.dumps(cc, ensure_ascii=False),
                LOCAL_TIMEZONE,
                delay,
                first_time,
                second_time,
                payload.get('subject'),
                payload.get('message'),
                created_by,
                now,
                now,
            ),
        )
    return get_report_email_schedule(schedule_id)


def update_report_email_schedule(schedule_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    current = get_report_email_schedule(schedule_id)
    updates: dict[str, Any] = {}
    mapping = {
        'name': 'name',
        'period_mode': 'period_mode',
        'enabled': 'enabled',
        'send_delay_minutes': 'send_delay_minutes',
        'subject': 'subject',
        'message': 'message',
    }
    for key, column in mapping.items():
        if key in payload and payload[key] is not None:
            value = payload[key]
            if key == 'enabled':
                value = 1 if bool(value) else 0
            updates[column] = value

    desired_mode = str(payload.get('period_mode') or current.get('period_mode') or 'previous_calendar_day_24h')
    desired_delay = int(payload.get('send_delay_minutes') or current.get('send_delay_minutes') or settings.report_email_send_delay_minutes)
    mode_changed = 'period_mode' in payload and desired_mode != str(current.get('period_mode'))
    first_input = payload.get('send_time_local') if 'send_time_local' in payload else (None if mode_changed else current.get('send_time_local'))
    second_input = payload.get('send_time_local_2') if 'send_time_local_2' in payload else (None if mode_changed else current.get('send_time_local_2'))
    first_time, second_time = _resolved_delivery_times({
        'period_mode': desired_mode,
        'send_delay_minutes': desired_delay,
        'send_time_local': first_input,
        'send_time_local_2': second_input,
    })
    updates['send_time_local'] = first_time
    updates['send_time_local_2'] = second_time

    if payload.get('formats') is not None:
        formats = sorted({str(item).lower() for item in payload['formats'] if str(item).lower() in {'pdf', 'excel'}})
        if not formats:
            raise ReportScheduleError('Selecciona al menos un formato.')
        updates['formats_json'] = json.dumps(formats, ensure_ascii=False)
    if payload.get('recipients') is not None:
        recipients = sorted({str(item).strip() for item in payload['recipients'] if str(item).strip()})
        if not recipients:
            raise ReportScheduleError('Captura al menos un destinatario.')
        updates['recipients_json'] = json.dumps(recipients, ensure_ascii=False)
    if payload.get('cc') is not None:
        updates['cc_json'] = json.dumps(sorted({str(item).strip() for item in payload['cc'] if str(item).strip()}), ensure_ascii=False)
    updates['updated_at'] = datetime.now(LOCAL_ZONE).replace(tzinfo=None).isoformat(timespec='seconds')
    assignments = ', '.join(f'{column} = ?' for column in updates)
    params = [*updates.values(), schedule_id]
    with _connect() as conn:
        conn.execute(f'UPDATE report_email_schedules SET {assignments} WHERE id = ?', params)
    return get_report_email_schedule(schedule_id)


def delete_report_email_schedule(schedule_id: str) -> None:
    get_report_email_schedule(schedule_id)
    with _connect() as conn:
        conn.execute('DELETE FROM report_email_schedules WHERE id = ?', (schedule_id,))


def list_report_email_runs(schedule_id: str, limit: int = 20) -> list[dict[str, Any]]:
    get_report_email_schedule(schedule_id)
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, period_start, period_end, period_mode, due_at, status, attempt,
                   started_at, finished_at, error_message, message_id, attachments_json
            FROM report_email_runs
            WHERE schedule_id = ?
            ORDER BY COALESCE(finished_at, started_at) DESC
            LIMIT ?
            """,
            (schedule_id, max(1, min(int(limit), 100))),
        ).fetchall()
    output = []
    for row in rows:
        item = dict(row)
        item['attachments'] = _json_list(item.pop('attachments_json', []))
        output.append(item)
    return output


def _candidate_periods(schedule: dict[str, Any], now: datetime) -> list[ScheduledPeriod]:
    today = now.date()
    candidates: list[ScheduledPeriod] = []
    for day_offset in (-2, -1, 0):
        candidates.extend(_periods_for_day(schedule, today + timedelta(days=day_offset)))
    return sorted(candidates, key=lambda item: item.due_at)


def _latest_closed_period(schedule: dict[str, Any], now: datetime) -> ScheduledPeriod:
    """Latest physically closed period for the explicit "Enviar ahora" action.

    Manual testing intentionally ignores the configured delivery clock; the clock
    only governs automatic execution.
    """
    mode = str(schedule.get('period_mode'))
    midnight = datetime.combine(now.date(), time.min)
    if mode == 'previous_calendar_day_24h':
        end = midnight
        start = end - timedelta(days=1)
        configured = _periods_for_day(schedule, start.date())[0]
        return ScheduledPeriod(start=start, end=end, due_at=configured.due_at, mode=mode)
    if mode == 'fixed_12h_blocks':
        if now.hour >= 12:
            start = midnight
            end = midnight + timedelta(hours=12)
            configured = _periods_for_day(schedule, start.date())[0]
        else:
            end = midnight
            start = end - timedelta(hours=12)
            configured = _periods_for_day(schedule, start.date())[1]
        return ScheduledPeriod(start=start, end=end, due_at=configured.due_at, mode=mode)
    raise ReportScheduleError('Modo de periodo no soportado.')


def _next_run_at(schedule: dict[str, Any], now: datetime) -> datetime:
    today = now.date()
    candidates: list[ScheduledPeriod] = []
    for day_offset in (-1, 0, 1):
        candidates.extend(_periods_for_day(schedule, today + timedelta(days=day_offset)))
    future = sorted((item.due_at for item in candidates if item.due_at > now))
    if future:
        return future[0]
    return min(item.due_at for item in _periods_for_day(schedule, today + timedelta(days=2)))


def _default_subject(schedule: dict[str, Any], period: ScheduledPeriod) -> str:
    if period.mode == 'previous_calendar_day_24h':
        return f"ARCA | {PLANT_NAME} | Reporte diario | {period.start.strftime('%d/%m/%Y')}"
    return (
        f"ARCA | {PLANT_NAME} | Reporte 12 h | "
        f"{period.start.strftime('%d/%m/%Y %H:%M')}–{period.end.strftime('%H:%M')}"
    )


def _default_message(period: ScheduledPeriod, attachments: list[str]) -> str:
    period_text = (
        period.start.strftime('%d/%m/%Y 00:00–24:00')
        if period.mode == 'previous_calendar_day_24h'
        else f"{period.start.strftime('%d/%m/%Y %H:%M')}–{period.end.strftime('%H:%M')}"
    )
    return (
        'Reporte automático de Control Hídrico.\n\n'
        f'{PLANT_NAME}\n'
        f'Periodo: {period_text}\n'
        f"Adjuntos: {', '.join(attachments)}\n\n"
        'Los datos conservan las etiquetas de calidad y cobertura del dashboard.'
    )


def _claim_run(schedule_id: str, period: ScheduledPeriod, now: datetime, *, manual: bool = False) -> dict[str, Any] | None:
    max_attempts = int(settings.report_email_max_attempts)
    retry_after = timedelta(minutes=int(settings.report_email_retry_minutes))
    now_text = now.isoformat(timespec='seconds')
    with _connect() as conn:
        existing = conn.execute(
            """
            SELECT * FROM report_email_runs
            WHERE schedule_id = ? AND period_start = ? AND period_end = ?
            """,
            (schedule_id, period.start.isoformat(timespec='minutes'), period.end.isoformat(timespec='minutes')),
        ).fetchone()
        if existing:
            item = dict(existing)
            if item.get('status') == 'sent':
                return None
            attempts = int(item.get('attempt') or 0)
            if attempts >= max_attempts:
                return None
            last_started = datetime.fromisoformat(item['started_at']) if item.get('started_at') else None
            if not manual and last_started and now - last_started < retry_after:
                return None
            conn.execute(
                """
                UPDATE report_email_runs
                SET status = 'running', attempt = ?, started_at = ?, finished_at = NULL,
                    error_message = NULL
                WHERE id = ?
                """,
                (attempts + 1, now_text, item['id']),
            )
            item['attempt'] = attempts + 1
            item['status'] = 'running'
            item['started_at'] = now_text
            return item

        run_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO report_email_runs (
                id, schedule_id, period_start, period_end, period_mode, due_at,
                status, attempt, started_at, attachments_json
            ) VALUES (?, ?, ?, ?, ?, ?, 'running', 1, ?, '[]')
            """,
            (
                run_id,
                schedule_id,
                period.start.isoformat(timespec='minutes'),
                period.end.isoformat(timespec='minutes'),
                period.mode,
                period.due_at.isoformat(timespec='minutes'),
                now_text,
            ),
        )
        return {'id': run_id, 'attempt': 1, 'status': 'running', 'started_at': now_text}


def _finish_run(run_id: str, *, status: str, message_id: str | None = None, attachments: list[str] | None = None, error: str | None = None) -> None:
    finished = datetime.now(LOCAL_ZONE).replace(tzinfo=None).isoformat(timespec='seconds')
    with _connect() as conn:
        conn.execute(
            """
            UPDATE report_email_runs
            SET status = ?, finished_at = ?, message_id = ?, attachments_json = ?, error_message = ?
            WHERE id = ?
            """,
            (status, finished, message_id, json.dumps(attachments or [], ensure_ascii=False), error, run_id),
        )


def execute_report_email_schedule(schedule: dict[str, Any], period: ScheduledPeriod, *, manual: bool = False) -> dict[str, Any]:
    now = datetime.now(LOCAL_ZONE).replace(tzinfo=None)
    claimed = _claim_run(schedule['id'], period, now, manual=manual)
    if claimed is None:
        return {'status': 'skipped', 'message': 'El periodo ya fue enviado o no está listo para reintento.'}

    run_id = str(claimed['id'])
    try:
        ensure_smtp_configured()
        report = build_scheduled_water_report(period.mode, period.start, period.end)
        formats = _json_list(schedule.get('formats')) if isinstance(schedule.get('formats'), str) else list(schedule.get('formats') or [])
        attachments: list[dict[str, Any]] = []
        attachment_names: list[str] = []
        if 'pdf' in formats:
            content, filename = build_daily_water_report_pdf(report)
            attachments.append({'bytes': content, 'filename': filename, 'maintype': 'application', 'subtype': 'pdf'})
            attachment_names.append(filename)
        if 'excel' in formats:
            content, filename = build_daily_water_report_excel(report)
            attachments.append({'bytes': content, 'filename': filename, 'maintype': 'application', 'subtype': 'vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
            attachment_names.append(filename)
        if not attachments:
            raise ReportScheduleError('La programación no tiene formatos válidos.')
        subject = str(schedule.get('subject') or '').strip() or _default_subject(schedule, period)
        message = str(schedule.get('message') or '').strip() or _default_message(period, attachment_names)
        result = send_email_with_bytes_attachments(
            to=schedule.get('recipients') or [],
            cc=schedule.get('cc') or None,
            subject=subject,
            message=message,
            attachments=attachments,
        )
        _finish_run(run_id, status='sent', message_id=result.message_id, attachments=attachment_names)
        return {
            'status': 'sent',
            'message': result.message,
            'message_id': result.message_id,
            'period_start': period.start.isoformat(timespec='minutes'),
            'period_end': period.end.isoformat(timespec='minutes'),
            'attachments': attachment_names,
        }
    except (EmailNotConfiguredError, EmailDeliveryError, ReportDataUnavailableError, ReportScheduleError, ValueError) as exc:
        _finish_run(run_id, status='failed', error=str(exc))
        raise ReportScheduleError(str(exc)) from exc
    except Exception as exc:
        logger.exception('Unexpected scheduled report email failure schedule_id=%s', schedule.get('id'))
        _finish_run(run_id, status='failed', error='Error interno al generar o enviar el reporte programado.')
        raise ReportScheduleError('Error interno al generar o enviar el reporte programado.') from exc


def run_report_email_schedule_now(schedule_id: str) -> dict[str, Any]:
    schedule = get_report_email_schedule(schedule_id)
    period = _latest_closed_period(schedule, datetime.now(LOCAL_ZONE).replace(tzinfo=None))
    return execute_report_email_schedule(schedule, period, manual=True)


def process_due_report_email_schedules(now: datetime | None = None) -> list[dict[str, Any]]:
    reference = now or datetime.now(LOCAL_ZONE).replace(tzinfo=None)
    grace = timedelta(hours=int(settings.report_email_catchup_hours))
    results: list[dict[str, Any]] = []
    for schedule in list_report_email_schedules():
        if not schedule.get('enabled'):
            continue
        created_at = None
        try:
            created_at = datetime.fromisoformat(str(schedule.get('created_at') or ''))
        except ValueError:
            created_at = None
        for period in _candidate_periods(schedule, reference):
            if period.due_at > reference or reference - period.due_at > grace:
                continue
            # Una programación nueva no debe recuperar periodos cerrados antes de haber sido creada.
            if created_at is not None and period.due_at < created_at:
                continue
            try:
                result = execute_report_email_schedule(schedule, period, manual=False)
                if result.get('status') != 'skipped':
                    results.append({'schedule_id': schedule['id'], **result})
            except ReportScheduleError as exc:
                logger.warning('Scheduled report email failed schedule_id=%s error=%s', schedule['id'], str(exc))
    return results


class _SchedulerRunner:
    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        initialize_report_email_scheduler_storage()
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name='report-email-scheduler', daemon=True)
        self._thread.start()
        logger.info('Report email scheduler started poll_seconds=%s', settings.report_email_scheduler_poll_seconds)

    def stop(self) -> None:
        self._stop.set()
        thread = self._thread
        if thread and thread.is_alive():
            thread.join(timeout=2.0)
        self._thread = None

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                process_due_report_email_schedules()
            except Exception:
                logger.exception('Report email scheduler loop failed')
            self._stop.wait(max(int(settings.report_email_scheduler_poll_seconds), 10))


_RUNNER = _SchedulerRunner()


def start_report_email_scheduler() -> None:
    if settings.report_email_scheduler_enabled:
        _RUNNER.start()


def stop_report_email_scheduler() -> None:
    _RUNNER.stop()
