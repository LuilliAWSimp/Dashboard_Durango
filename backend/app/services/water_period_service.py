from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, time, timedelta
import logging
from time import monotonic
from typing import Any, Iterable
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from app.database import SessionLocal
from app.services.durango_capabilities import (
    DURANGO_SCADA_CUTOVER_LOCAL,
    LOCAL_TIMEZONE,
    SENSOR_ITEMS,
    WELLS,
    clamp_to_validated_segment,
    current_flow_threshold_for_sensor,
    identity_key,
    normalize_flow_lps,
)
from app.services.durango_lavadoras_service import get_lavadora_period_items
from app.services.durango_jarabes_service import get_jarabes_period_items
from app.services.durango_well_history_fallback import query_bos_well_rows
from app.services.operation_semantics import expected_minute_samples, interval_operation_metrics, period_activity_label
from app.services.plant_time import effective_local_end, local_now_naive, local_to_source_naive, source_to_local_naive
from app.services.totalizer_quality import TotalizerAnalysis, analyze_totalizer_series

logger = logging.getLogger(__name__)
LOCAL_ZONE = ZoneInfo(LOCAL_TIMEZONE)
MAX_ROWS = 200_000
PERIOD_TTL_CURRENT_SECONDS = 60
PERIOD_TTL_HISTORICAL_SECONDS = 10 * 60
_PERIOD_CACHE: dict[str, dict[str, Any]] = {}


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
    params.update({'start_dt': local_to_source_naive(start_dt, LOCAL_TIMEZONE), 'end_dt': local_to_source_naive(end_dt, LOCAL_TIMEZONE), 'max_rows': MAX_ROWS})
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
                row['operational_ts'] = source_to_local_naive(row.get('operational_ts'), LOCAL_TIMEZONE)
                row['instant_value'] = normalize_flow_lps(row.get('sensor_id'), row.get('instant_value'))
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
    params['before_dt'] = local_to_source_naive(before_dt, LOCAL_TIMEZONE)
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
            int(row._mapping['sensor_id']): (source_to_local_naive(row._mapping.get('operational_ts'), LOCAL_TIMEZONE), _num(row._mapping.get('total_value')))
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
        require_flow_validation=bool(contract.get('require_flow_validation')),
    )


def build_period_item(
    contract: dict[str, Any],
    rows: list[dict[str, Any]],
    previous_close: tuple[datetime | None, float | None] | None,
    end_day: date,
    *,
    window_start: datetime | None = None,
    window_end: datetime | None = None,
) -> dict[str, Any]:
    sensor_id = int(contract['sensor_id'])
    ordered = sorted(rows, key=lambda row: _dt(row.get('operational_ts')) or datetime.min)
    flow_values = [_num(row.get('instant_value')) for row in ordered]
    flow_values = [value for value in flow_values if value is not None]
    active_threshold = current_flow_threshold_for_sensor(sensor_id)
    active_flow_values = [value for value in flow_values if value > active_threshold]
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
    valid_minutes = {
        (_dt(row.get('operational_ts')) or datetime.min).replace(second=0, microsecond=0)
        for row in ordered
        if _dt(row.get('operational_ts')) is not None
        and (_num(row.get('instant_value')) is not None or _num(row.get('total_value')) is not None)
    }
    active_minutes_set = {
        (_dt(row.get('operational_ts')) or datetime.min).replace(second=0, microsecond=0)
        for row in ordered
        if _dt(row.get('operational_ts')) is not None
        and (_num(row.get('instant_value')) or 0.0) > active_threshold
    }
    derived_start = min(valid_minutes) if valid_minutes else None
    derived_end = (max(valid_minutes) + timedelta(minutes=1)) if valid_minutes else None
    coverage_start = window_start or derived_start
    coverage_end = window_end or derived_end
    expected = expected_minute_samples(coverage_start, coverage_end) if coverage_start and coverage_end else 0
    operation = interval_operation_metrics(
        samples_received=len(valid_minutes),
        samples_expected=expected,
        active_samples=len(active_minutes_set),
        validated_volume_m3=period_volume,
        has_discontinuities=analysis.has_discontinuities,
    ).payload()
    activity = period_activity_label(
        samples_received=operation['samples_received'],
        active_samples=operation['active_samples'],
        validated_volume_m3=period_volume,
    )
    data_status = str(operation['data_status'])
    volume_data_status = (
        'invalid_totalizer' if analysis.has_discontinuities
        else 'validated' if bool(analysis.reliable and totalizer_values)
        else 'no_totalizer' if not totalizer_values
        else analysis.status
    )
    latest_flow = flow_values[-1] if flow_values else None
    if not ordered or latest_flow is None:
        current_state = 'Sin registros'
        current_state_status = 'no_data'
    elif latest_flow > active_threshold:
        current_state = 'Activo'
        current_state_status = 'operational'
    else:
        current_state = 'Apagado con datos'
        current_state_status = 'zero_consumption'

    # The accumulated value comes from the same validated increments used by
    # period views, shifts and reports. It must never be recalculated as current
    # totalizer minus previous close because that would reintroduce discarded jumps.
    today_accumulated = analysis.validated_volume_m3
    today_reliable = bool(analysis.reliable and totalizer_values)

    return {
        'sensor_id': sensor_id,
        'operational_key': contract.get('operational_key') or str(sensor_id),
        'id': f"{contract.get('group')}-{sensor_id}",
        'name': contract.get('display_name') or contract.get('name'),
        'nombre': contract.get('display_name') or contract.get('name'),
        'module': contract.get('group'),
        'flow_unit': contract.get('flow_unit') or 'L/s',
        'unit_status': contract.get('unit_status') or 'current_configuration',
        'current_flow': flow_values[-1] if flow_values else None,
        'flow_lps': flow_values[-1] if flow_values else None,
        'flow_avg': round(sum(flow_values) / len(flow_values), 6) if flow_values else None,
        'flow_active_avg': round(sum(active_flow_values) / len(active_flow_values), 6) if active_flow_values else None,
        'flow_min': min(flow_values) if flow_values else None,
        'flow_max': max(flow_values) if flow_values else None,
        'samples': len(valid_minutes),
        'samples_received': operation['samples_received'],
        'samples_expected': operation['samples_expected'],
        'coverage_percent': operation['coverage_percent'],
        'coverage_status': operation['coverage_status'],
        'data_reliable': operation['data_reliable'],
        'active_samples': operation['active_samples'],
        'active_minutes': operation['active_minutes'],
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
        'volume_data_status': volume_data_status,
        'validation': operation['validation'],
        'validation_status': operation['validation_status'],
        'period_activity': activity,
        'period_data_status': data_status,
        'current_state': current_state,
        'current_state_status': current_state_status,
        'current_reading_available': bool(latest_time is not None),
        'communication': communication,
        'estado_comunicacion': communication,
        'communication_status': communication_status,
        'last_update': latest_time.isoformat(timespec='seconds') if latest_time else None,
        'ultima_lectura': latest_time.isoformat(timespec='seconds') if latest_time else None,
        'discarded_totalizer_event_details': list(analysis.discarded_events),
        'period_source': period_source,
    }


def _is_recent_communication(item: dict[str, Any]) -> bool:
    status = str(item.get('communication_status') or '').lower()
    label = str(item.get('communication') or item.get('estado_comunicacion') or '').lower()
    if status in {'no_data', 'stale_data', 'offline', 'communication', 'warning'}:
        return False
    return any(token in label for token in ('actualizado', 'normal')) or status == 'operational'


def summarize_period_items(group_items: list[dict[str, Any]]) -> dict[str, Any]:
    calculable = [item for item in group_items if item.get('validated_volume_m3') is not None]
    total = round(sum(float(item.get('validated_volume_m3') or 0.0) for item in calculable), 6) if calculable else None
    active_count = sum(
        1 for item in group_items
        if str(item.get('activity') or item.get('period_activity') or '').lower().startswith('con actividad')
        or str(item.get('data_status') or item.get('period_data_status') or '') in {'operational', 'partial_activity'}
        or float(item.get('validated_volume_m3') or 0.0) > 0.0
    )
    inactive_count = sum(
        1 for item in group_items
        if str(item.get('activity') or item.get('period_activity') or '').lower().startswith('sin actividad')
        or str(item.get('data_status') or item.get('period_data_status') or '') == 'zero_consumption'
    )
    review_count = sum(
        1 for item in group_items
        if bool(item.get('has_discontinuities'))
        or str(item.get('data_status') or item.get('period_data_status') or '') == 'invalid_totalizer'
    )
    no_history_count = sum(
        1 for item in group_items
        if str(item.get('data_status') or item.get('period_data_status') or '') in {'no_history', 'no_data'}
    )
    current_flow_count = 0
    for item in group_items:
        flow = _num(item.get('current_flow') if item.get('current_flow') is not None else item.get('flow_lps'))
        if flow is None or not _is_recent_communication(item):
            continue
        threshold = current_flow_threshold_for_sensor(item.get('operational_key') or item.get('sensor_id'))
        if flow > threshold:
            current_flow_count += 1
    partial_count = sum(1 for item in calculable if bool(item.get('has_discontinuities')))
    received_samples = sum(int(item.get('samples_received') or item.get('samples') or 0) for item in group_items)
    expected_samples = sum(int(item.get('samples_expected') or 0) for item in group_items)
    sample_coverage_percent = min((received_samples / expected_samples) * 100.0, 100.0) if expected_samples else 0.0
    return {
        'total_m3': total,
        'validated_volume_m3': total,
        'has_partial_volume': partial_count > 0,
        'partial_count': partial_count,
        'partial_validation_count': partial_count,
        'active_count': active_count,
        'inactive_count': inactive_count,
        'current_flow_count': current_flow_count,
        'review_count': review_count,
        'no_history_count': no_history_count,
        'coverage_available': len(calculable),
        'coverage_total': len(group_items),
        'coverage_status': (
            'No disponible' if not calculable
            else 'Validación parcial' if partial_count
            else 'Completa' if len(calculable) == len(group_items)
            else 'Cobertura parcial'
        ),
        'samples_received': received_samples,
        'samples_expected': expected_samples,
        'sample_coverage_percent': round(sample_coverage_percent, 2),
    }


def _period_cache_ttl(start_day: date, end_day: date, now_day: date) -> int:
    return PERIOD_TTL_CURRENT_SECONDS if start_day <= now_day <= end_day else PERIOD_TTL_HISTORICAL_SECONDS


def get_period_data(start_date: Any = None, end_date: Any = None, *, force_refresh: bool = False) -> dict[str, Any]:
    start_day, end_day = date_range(start_date, end_date)
    requested_start_dt = datetime.combine(start_day, time.min)
    requested_end_dt = datetime.combine(end_day + timedelta(days=1), time.min)
    now_local = local_now_naive()
    effective_end_dt = effective_local_end(requested_end_dt, now=now_local)
    cache_key = f"durango:period:{start_day.isoformat()}:{end_day.isoformat()}:{effective_end_dt.isoformat(timespec='minutes')}"
    cached = _PERIOD_CACHE.get(cache_key)
    if not force_refresh and cached and monotonic() < float(cached.get('expires_at') or 0):
        return deepcopy(cached['value'])
    query_start_dt, validated_end_dt, legacy_only, crosses_cutover = clamp_to_validated_segment(
        requested_start_dt,
        effective_end_dt,
    )
    query_end_dt = max(query_start_dt, validated_end_dt)
    sensor_ids = [int(item['sensor_id']) for item in SENSOR_ITEMS]
    period_query_status = 'operational'
    if legacy_only:
        payload = {
            'plant': 'Planta Durango',
            'start_date': start_day.isoformat(),
            'end_date': end_day.isoformat(),
            'requested_end_at': requested_end_dt.isoformat(timespec='seconds'),
            'effective_end_at': effective_end_dt.isoformat(timespec='seconds'),
            'validated_segment_start': None,
            'scada_cutover_local': DURANGO_SCADA_CUTOVER_LOCAL.isoformat(timespec='seconds'),
            'crosses_scada_cutover': False,
            'legacy_notice': 'Configuración anterior pendiente de validación',
            'has_future_intervals': effective_end_dt < requested_end_dt,
            'generated_at': now_local.isoformat(timespec='seconds'),
            'items': [], 'wells': [], 'lines': [], 'flows': [],
            'summary': {
                'wells': summarize_period_items([]),
                'lines': summarize_period_items([]),
                'flows': summarize_period_items([]),
            },
            'source_status': 'legacy_configuration_pending',
        }
        ttl = _period_cache_ttl(start_day, end_day, now_local.date())
        _PERIOD_CACHE[cache_key] = {'expires_at': monotonic() + ttl, 'value': deepcopy(payload)}
        return payload
    try:
        rows = query_readings_window(sensor_ids, query_start_dt, query_end_dt) if query_end_dt > query_start_dt else []
    except WaterPeriodError as exc:
        if start_day != end_day:
            raise
        rows = []
        period_query_status = exc.status
    previous = (
        query_previous_closes(sensor_ids, query_start_dt)
        if period_query_status == 'operational' and requested_start_dt >= DURANGO_SCADA_CUTOVER_LOCAL
        else {}
    )
    grouped: dict[int, list[dict[str, Any]]] = {sensor_id: [] for sensor_id in sensor_ids}
    for row in rows:
        sensor_id = int(row.get('sensor_id') or 0)
        if sensor_id in grouped:
            row = dict(row)
            row.setdefault('period_source', 'readings_minute')
            grouped[sensor_id].append(row)

    if start_day == end_day and query_end_dt > query_start_dt:
        for contract in WELLS:
            sensor_id = int(contract['sensor_id'])
            if grouped.get(sensor_id):
                continue
            fallback_rows = query_bos_well_rows(sensor_id, query_start_dt, query_end_dt)
            if fallback_rows:
                grouped[sensor_id] = fallback_rows
    items = [
        build_period_item(
            contract,
            grouped[int(contract['sensor_id'])],
            previous.get(int(contract['sensor_id'])),
            end_day,
            window_start=query_start_dt,
            window_end=query_end_dt,
        )
        for contract in SENSOR_ITEMS
    ]
    try:
        items.extend(get_lavadora_period_items(
            query_start_dt,
            query_end_dt,
            end_day,
            window_start=query_start_dt,
            window_end=query_end_dt,
        ))
        items.extend(get_jarabes_period_items(
            query_start_dt,
            query_end_dt,
            end_day,
            window_start=query_start_dt,
            window_end=query_end_dt,
        ))
    except SQLAlchemyError as exc:
        raise WaterPeriodError('No fue posible consultar el histórico de flujos operativos.', status='sql_error') from exc

    groups: dict[str, list[dict[str, Any]]] = {'well': [], 'line': [], 'flow': []}
    for item in items:
        groups.setdefault(str(item.get('module')), []).append(item)


    payload = {
        'plant': 'Planta Durango',
        'start_date': start_day.isoformat(),
        'end_date': end_day.isoformat(),
        'requested_end_at': requested_end_dt.isoformat(timespec='seconds'),
        'effective_end_at': effective_end_dt.isoformat(timespec='seconds'),
        'validated_segment_start': query_start_dt.isoformat(timespec='seconds'),
        'scada_cutover_local': DURANGO_SCADA_CUTOVER_LOCAL.isoformat(timespec='seconds'),
        'crosses_scada_cutover': crosses_cutover,
        'legacy_notice': 'El volumen corresponde únicamente al segmento validado posterior al cambio de SCADA.' if crosses_cutover else None,
        'has_future_intervals': effective_end_dt < requested_end_dt,
        'generated_at': now_local.isoformat(timespec='seconds'),
        'items': items,
        'wells': groups['well'],
        'lines': groups['line'],
        'flows': groups['flow'],
        'summary': {
            'wells': summarize_period_items(groups['well']),
            'lines': summarize_period_items(groups['line']),
            'flows': summarize_period_items(groups['flow']),
        },
        'source_status': 'operational' if period_query_status == 'operational' else 'partial_bos_fallback',
    }
    ttl = _period_cache_ttl(start_day, end_day, now_local.date())
    _PERIOD_CACHE[cache_key] = {'expires_at': monotonic() + ttl, 'value': deepcopy(payload)}
    return payload
