from __future__ import annotations

from datetime import date, datetime, time, timedelta
import logging
from typing import Any, Iterable
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from app.database import SessionLocal
from app.services.durango_capabilities import ALL_ITEMS, LOCAL_TIMEZONE, WELLS, sensor_contract
from app.services.durango_well_history_fallback import query_bos_well_rows
from app.services.plant_time import effective_local_end, local_now_naive, local_to_source_naive, source_to_local_naive
from app.services.totalizer_quality import TotalizerAnalysis, analyze_totalizer_series

logger = logging.getLogger(__name__)
LOCAL_ZONE = ZoneInfo(LOCAL_TIMEZONE)
MAX_ROWS = 200_000


class WaterPeriodError(RuntimeError):
    def __init__(self, message: str, *, status: str = 'sql_error'):
        super().__init__(message)
        self.status = status


def _as_date(value: Any) -> date | None:
    if value in (None, ''):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except (TypeError, ValueError):
        return None


def date_range(start_date: Any = None, end_date: Any = None) -> tuple[date, date]:
    start = _as_date(start_date) or datetime.now(LOCAL_ZONE).date()
    end = _as_date(end_date) or start
    return (end, start) if start > end else (start, end)


def _num(value: Any) -> float | None:
    if value in (None, ''):
        return None
    try:
        parsed = float(str(value).replace(',', '').strip())
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def _dt(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if value in (None, ''):
        return None
    raw = str(value).replace('Z', '').strip()
    for candidate in (raw, raw[:19]):
        try:
            return datetime.fromisoformat(candidate).replace(tzinfo=None)
        except ValueError:
            continue
    return None


def _timeout_status(exc: Exception) -> str:
    msg = str(exc).lower()
    return 'timeout' if any(token in msg for token in ('timeout', 'hyt00', 'hyt01', 'query timeout')) else 'sql_error'


def _object_exists(session, name: str) -> bool:
    try:
        return bool(session.execute(text("SELECT CASE WHEN OBJECT_ID(:name, 'U') IS NULL THEN 0 ELSE 1 END"), {'name': name}).scalar())
    except SQLAlchemyError:
        return False


def _sensor_params(sensor_ids: Iterable[int]) -> tuple[str, dict[str, Any]]:
    params: dict[str, Any] = {}
    placeholders: list[str] = []
    for index, sensor_id in enumerate(sensor_ids):
        key = f'sensor_{index}'
        placeholders.append(f':{key}')
        params[key] = int(sensor_id)
    return ', '.join(placeholders) or '-1', params


def query_readings_window(sensor_ids: list[int], start_dt: datetime, end_dt: datetime) -> list[dict[str, Any]]:
    placeholders, params = _sensor_params(sensor_ids)
    params.update({'start_dt': local_to_source_naive(start_dt), 'end_dt': local_to_source_naive(end_dt), 'max_rows': MAX_ROWS})
    sql = text(f"""
        SELECT TOP (:max_rows)
            reading.sensor_id,
            COALESCE(reading.ts_local, reading.ts_minute) AS operational_ts,
            TRY_CONVERT(float, reading.instant_value) AS instant_value,
            TRY_CONVERT(float, reading.total_value) AS total_value,
            reading.quality,
            reading.source
        FROM iot.readings_minute AS reading
        WHERE reading.sensor_id IN ({placeholders})
          AND COALESCE(reading.ts_local, reading.ts_minute) >= :start_dt
          AND COALESCE(reading.ts_local, reading.ts_minute) < :end_dt
        ORDER BY reading.sensor_id, COALESCE(reading.ts_local, reading.ts_minute)
    """)
    try:
        with SessionLocal() as session:
            if not _object_exists(session, 'iot.readings_minute'):
                raise WaterPeriodError('La fuente histórica no está disponible.', status='no_history_source')
            rows = [dict(row._mapping) for row in session.execute(sql, params).fetchall()]
            for row in rows:
                row['operational_ts'] = source_to_local_naive(row.get('operational_ts'))
            return rows
    except WaterPeriodError:
        raise
    except OperationalError as exc:
        status = _timeout_status(exc)
        logger.exception('period query failed status=%s start=%s end=%s sensors=%s', status, start_dt, end_dt, sensor_ids)
        raise WaterPeriodError('La consulta del periodo tardó demasiado.' if status == 'timeout' else 'No fue posible consultar la información del periodo.', status=status) from exc
    except SQLAlchemyError as exc:
        logger.exception('period query SQL error start=%s end=%s sensors=%s', start_dt, end_dt, sensor_ids)
        raise WaterPeriodError('No fue posible consultar la información del periodo.', status='sql_error') from exc


def query_previous_closes(sensor_ids: list[int], before_dt: datetime) -> dict[int, tuple[datetime | None, float | None]]:
    placeholders, params = _sensor_params(sensor_ids)
    params['before_dt'] = local_to_source_naive(before_dt)
    sql = text(f"""
        WITH ranked AS (
            SELECT
                reading.sensor_id,
                COALESCE(reading.ts_local, reading.ts_minute) AS operational_ts,
                TRY_CONVERT(float, reading.total_value) AS total_value,
                ROW_NUMBER() OVER (
                    PARTITION BY reading.sensor_id
                    ORDER BY COALESCE(reading.ts_local, reading.ts_minute) DESC
                ) AS row_number
            FROM iot.readings_minute AS reading
            WHERE reading.sensor_id IN ({placeholders})
              AND COALESCE(reading.ts_local, reading.ts_minute) < :before_dt
              AND TRY_CONVERT(float, reading.total_value) IS NOT NULL
              AND TRY_CONVERT(float, reading.total_value) > 0
        )
        SELECT sensor_id, operational_ts, total_value
        FROM ranked
        WHERE row_number = 1
    """)
    try:
        with SessionLocal() as session:
            if not _object_exists(session, 'iot.readings_minute'):
                return {}
            rows = session.execute(sql, params).fetchall()
        return {
            int(row._mapping['sensor_id']): (source_to_local_naive(row._mapping.get('operational_ts')), _num(row._mapping.get('total_value')))
            for row in rows
        }
    except SQLAlchemyError:
        logger.exception('previous close query failed before=%s sensors=%s', before_dt, sensor_ids)
        return {}


def _communication(last_reading: datetime | None, end_day: date) -> tuple[str, str]:
    if last_reading is None:
        return 'Sin lectura', 'no_data'
    today = local_now_naive().date()
    if end_day < today:
        return 'Actualizado', 'operational'
    age = max((local_now_naive() - last_reading).total_seconds() / 60, 0)
    if age <= 5:
        return 'Actualizado', 'operational'
    if age <= 30:
        return 'Lectura atrasada', 'stale_data'
    return 'Revisar comunicación', 'stale_data'


def _analysis_rows(rows: list[dict[str, Any]], contract: dict[str, Any]) -> TotalizerAnalysis:
    sensor_id = int(contract['sensor_id'])
    return analyze_totalizer_series(
        [
            {
                'timestamp': row.get('operational_ts'),
                'total_value': row.get('total_value'),
                'instant_value': row.get('instant_value'),
            }
            for row in rows
        ],
        sensor_id=sensor_id,
        flow_unit=str(contract.get('flow_unit') or 'L/s'),
        require_flow_validation=str(contract.get('group')) == 'well',
    )


def build_period_item(contract: dict[str, Any], rows: list[dict[str, Any]], previous_close: tuple[datetime | None, float | None] | None, end_day: date) -> dict[str, Any]:
    sensor_id = int(contract['sensor_id'])
    ordered = sorted(rows, key=lambda row: _dt(row.get('operational_ts')) or datetime.min)
    flow_values = [_num(row.get('instant_value')) for row in ordered]
    flow_values = [value for value in flow_values if value is not None]
    analysis = _analysis_rows(ordered, contract)
    latest = ordered[-1] if ordered else None
    latest_time = _dt(latest.get('operational_ts')) if latest else None
    communication, communication_status = _communication(latest_time, end_day)
    previous_stamp, previous_value = previous_close or (None, None)

    totalizer_values = [_num(row.get('total_value')) for row in ordered]
    totalizer_values = [value for value in totalizer_values if value is not None and value > 0]
    current_totalizer = totalizer_values[-1] if totalizer_values else None
    period_volume = analysis.validated_volume_m3
    period_source = str((ordered[-1].get('period_source') or ordered[-1].get('source') or 'readings_minute')) if ordered else 'no_history'
    if not ordered:
        activity = 'Sin histórico para el periodo'
        data_status = 'no_history'
    elif not totalizer_values:
        activity = 'Sin totalizador disponible'
        data_status = 'no_totalizer'
    elif analysis.has_discontinuities:
        activity = 'Dato en revisión'
        data_status = 'invalid_totalizer'
    elif not analysis.reliable:
        activity = 'Dato en revisión'
        data_status = 'invalid_totalizer'
    elif (period_volume or 0) > 0:
        activity = 'Con actividad en el periodo'
        data_status = 'operational'
    else:
        activity = 'Sin actividad en el periodo'
        data_status = 'zero_consumption'

    # The accumulated value comes from the same validated increments used by
    # period views, shifts and reports. It must never be recalculated as current
    # totalizer minus previous close because that would reintroduce discarded jumps.
    today_accumulated = analysis.validated_volume_m3
    today_reliable = bool(analysis.reliable and totalizer_values)

    return {
        'sensor_id': sensor_id,
        'id': f"{contract.get('group')}-{sensor_id}",
        'name': contract.get('display_name') or contract.get('name'),
        'nombre': contract.get('display_name') or contract.get('name'),
        'module': contract.get('group'),
        'flow_unit': contract.get('flow_unit') or 'L/s',
        'unit_status': contract.get('unit_status') or 'current_configuration',
        'current_flow': flow_values[-1] if flow_values else None,
        'flow_lps': flow_values[-1] if flow_values else None,
        'flow_avg': round(sum(flow_values) / len(flow_values), 6) if flow_values else None,
        'flow_min': min(flow_values) if flow_values else None,
        'flow_max': max(flow_values) if flow_values else None,
        'samples': len(ordered),
        'previous_close_m3': previous_value,
        'previous_close_at': previous_stamp.isoformat(timespec='seconds') if previous_stamp else None,
        'current_totalizer_m3': current_totalizer,
        'totalizador_m3': current_totalizer,
        'period_open_m3': analysis.opening_m3,
        'period_close_m3': analysis.closing_m3,
        'period_m3': period_volume,
        'period_delta_m3': period_volume,
        'period_m3_reliable': bool(analysis.reliable and totalizer_values),
        'validated_volume_m3': analysis.validated_volume_m3,
        'discarded_volume_m3': analysis.discarded_volume_m3,
        'discarded_totalizer_events': analysis.discarded_totalizer_events,
        'has_discontinuities': analysis.has_discontinuities,
        'volume_reliable': analysis.volume_reliable,
        'volume_display_label': 'Volumen validado parcial' if analysis.has_discontinuities else 'Volumen del periodo',
        'today_accumulated_m3': today_accumulated,
        'today_accumulated_reliable': today_reliable,
        'activity': activity,
        'activity_status': activity,
        'data_status': data_status,
        'period_activity': activity,
        'period_data_status': data_status,
        'current_reading_available': bool(latest_time is not None),
        'communication': communication,
        'estado_comunicacion': communication,
        'communication_status': communication_status,
        'last_update': latest_time.isoformat(timespec='seconds') if latest_time else None,
        'ultima_lectura': latest_time.isoformat(timespec='seconds') if latest_time else None,
        'discarded_totalizer_event_details': list(analysis.discarded_events),
        'period_source': period_source,
    }


def get_period_data(start_date: Any = None, end_date: Any = None) -> dict[str, Any]:
    start_day, end_day = date_range(start_date, end_date)
    requested_start_dt = datetime.combine(start_day, time.min)
    requested_end_dt = datetime.combine(end_day + timedelta(days=1), time.min)
    now_local = local_now_naive()
    effective_end_dt = effective_local_end(requested_end_dt, now=now_local)
    query_end_dt = max(requested_start_dt, effective_end_dt)
    sensor_ids = [int(item['sensor_id']) for item in ALL_ITEMS]
    period_query_status = 'operational'
    try:
        rows = query_readings_window(sensor_ids, requested_start_dt, query_end_dt) if query_end_dt > requested_start_dt else []
    except WaterPeriodError as exc:
        if start_day != end_day:
            raise
        rows = []
        period_query_status = exc.status
    previous = query_previous_closes(sensor_ids, requested_start_dt) if period_query_status == 'operational' else {}
    grouped: dict[int, list[dict[str, Any]]] = {sensor_id: [] for sensor_id in sensor_ids}
    for row in rows:
        sensor_id = int(row.get('sensor_id') or 0)
        if sensor_id in grouped:
            row = dict(row)
            row.setdefault('period_source', 'readings_minute')
            grouped[sensor_id].append(row)

    if start_day == end_day and query_end_dt > requested_start_dt:
        for contract in WELLS:
            sensor_id = int(contract['sensor_id'])
            if grouped.get(sensor_id):
                continue
            fallback_rows = query_bos_well_rows(sensor_id, requested_start_dt, query_end_dt)
            if fallback_rows:
                grouped[sensor_id] = fallback_rows
    items = [
        build_period_item(contract, grouped[int(contract['sensor_id'])], previous.get(int(contract['sensor_id'])), end_day)
        for contract in ALL_ITEMS
    ]

    groups: dict[str, list[dict[str, Any]]] = {'well': [], 'line': [], 'flow': []}
    for item in items:
        groups.setdefault(str(item.get('module')), []).append(item)

    def summary(group_items: list[dict[str, Any]]) -> dict[str, Any]:
        reliable = [item for item in group_items if item.get('period_m3_reliable') and item.get('period_m3') is not None]
        without_history = sum(1 for item in group_items if item.get('data_status') in {'no_history', 'no_data'})
        return {
            'total_m3': round(sum(float(item['period_m3']) for item in reliable), 6) if reliable else None,
            'active_count': sum(1 for item in reliable if float(item.get('period_m3') or 0) > 0),
            'inactive_count': sum(1 for item in reliable if float(item.get('period_m3') or 0) == 0),
            'review_count': sum(1 for item in group_items if item.get('data_status') in {'invalid_totalizer', 'no_totalizer'}),
            'no_history_count': without_history,
            'coverage_available': len(reliable),
            'coverage_total': len(group_items),
            'coverage_status': 'Sin histórico del periodo' if not reliable and without_history else 'Cobertura parcial' if len(reliable) < len(group_items) else 'Completa',
        }

    return {
        'plant': 'Planta Durango',
        'start_date': start_day.isoformat(),
        'end_date': end_day.isoformat(),
        'requested_end_at': requested_end_dt.isoformat(timespec='seconds'),
        'effective_end_at': effective_end_dt.isoformat(timespec='seconds'),
        'has_future_intervals': effective_end_dt < requested_end_dt,
        'generated_at': now_local.isoformat(timespec='seconds'),
        'items': items,
        'wells': groups['well'],
        'lines': groups['line'],
        'flows': groups['flow'],
        'summary': {
            'wells': summary(groups['well']),
            'lines': summary(groups['line']),
            'flows': summary(groups['flow']),
        },
        'source_status': 'operational' if period_query_status == 'operational' else 'partial_bos_fallback',
    }

