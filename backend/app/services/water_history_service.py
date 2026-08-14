from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
import logging
from time import monotonic
from typing import Any, Literal
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from app.database import SessionLocal
from app.services.durango_capabilities import (
    DURANGO_SCADA_CUTOVER_LOCAL,
    LOCAL_TIMEZONE,
    POZO_1_FLOW_CALIBRATION_CUTOFF_LOCAL,
    POZO_1_FLOW_SENSOR_ID,
    POZO_1_LEGACY_FLOW_NORMALIZATION_FACTOR,
    SENSORS_BY_MODULE,
    clamp_to_validated_segment,
    flow_unit_for_sensor,
    identity_key,
    item_contract,
    normalize_flow_lps,
    sensor_contract,
    source_timezone_for_identity,
)
from app.services.durango_lavadoras_service import query_lavadora_rows
from app.services.durango_jarabes_service import query_jarabes_rows
from app.services.durango_well_history_fallback import query_bos_well_rows
from app.services.operation_semantics import expected_minute_samples, interval_operation_metrics
from app.services.plant_time import effective_local_end, local_now_naive, local_to_source_naive, source_to_local_naive
from app.services.totalizer_quality import analyze_totalizer_series
from app.services.water_bos_service import get_bos_water_dashboard_payload

logger = logging.getLogger(__name__)
LOCAL_ZONE = ZoneInfo(LOCAL_TIMEZONE)
Aggregation = Literal['quarter_hour', 'hourly', 'daily']
Module = Literal['well', 'line', 'flow']
_CACHE: dict[str, dict[str, Any]] = {}
CACHE_TTL_CURRENT_SECONDS = 60
CACHE_TTL_HISTORICAL_SECONDS = 10 * 60
MAX_PHYSICAL_VALIDATION_DAYS = 31
MAX_PHYSICAL_VALIDATION_ROWS = 100_000


class WaterHistoryError(RuntimeError):
    def __init__(self, message: str, *, status: str = 'sql_error'):
        super().__init__(message)
        self.status = status


def _parse_date(value: str) -> date:
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except (TypeError, ValueError) as exc:
        raise ValueError('Fecha inválida.') from exc


def _validate(module: str, sensor_id: Any, start_date: str, end_date: str, aggregation: str) -> tuple[Module, Aggregation, date, date]:
    if module not in SENSORS_BY_MODULE:
        raise ValueError('Módulo histórico no permitido.')
    requested_identity = identity_key(sensor_id)
    allowed_identities = {identity_key(value) for value in SENSORS_BY_MODULE[module]}
    if requested_identity not in allowed_identities:
        raise ValueError('El elemento solicitado no pertenece al contrato de Durango.')
    if aggregation not in {'quarter_hour', 'hourly', 'daily'}:
        raise ValueError('Agrupación histórica no permitida.')
    start = _parse_date(start_date)
    end = _parse_date(end_date)
    if start > end:
        start, end = end, start
    days = (end - start).days + 1
    if aggregation == 'quarter_hour' and days > 7:
        raise ValueError('La agrupación de 15 minutos permite un máximo de 7 días.')
    if aggregation == 'hourly' and days > 31:
        raise ValueError('La agrupación por hora permite un máximo de 31 días.')
    if aggregation == 'daily' and days > 366:
        raise ValueError('La agrupación diaria permite un máximo de 366 días.')
    return module, aggregation, start, end


def _step(aggregation: Aggregation) -> timedelta:
    if aggregation == 'quarter_hour':
        return timedelta(minutes=15)
    if aggregation == 'hourly':
        return timedelta(hours=1)
    return timedelta(days=1)


def _floor(value: datetime, aggregation: Aggregation) -> datetime:
    if aggregation == 'quarter_hour':
        return value.replace(minute=(value.minute // 15) * 15, second=0, microsecond=0)
    if aggregation == 'hourly':
        return value.replace(minute=0, second=0, microsecond=0)
    return value.replace(hour=0, minute=0, second=0, microsecond=0)


def _num(value: Any) -> float | None:
    if value in (None, ''):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def _dt(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if value in (None, ''):
        return None
    raw = str(value).replace('Z', '')
    try:
        return datetime.fromisoformat(raw).replace(tzinfo=None)
    except ValueError:
        try:
            return datetime.fromisoformat(raw[:19]).replace(tzinfo=None)
        except ValueError:
            return None


def _localized_rows(
    rows: list[dict[str, Any]],
    *timestamp_keys: str,
    identity_hint: Any = None,
    source_timezone: str | None = None,
    normalize_flows: bool = True,
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        identity = item.get('sensor_id') or item.get('operational_key') or identity_hint
        row_timezone = source_timezone or source_timezone_for_identity(identity)
        for key in timestamp_keys:
            if item.get(key) is not None:
                item[key] = source_to_local_naive(item[key], row_timezone)
        timestamp = item.get('reading_ts') or item.get('operational_ts') or item.get('bucket_start')
        if normalize_flows:
            for key in ('instant_value', 'flow_value', 'flow_avg', 'flow_active_avg', 'flow_min', 'flow_max'):
                if key in item:
                    item[key] = normalize_flow_lps(identity, item.get(key), timestamp)
        normalized.append(item)
    return normalized


def _query_15m(sensor_id: int, start_dt: datetime, end_dt: datetime) -> list[dict[str, Any]]:
    sql = text("""
        WITH source_rows AS (
            SELECT
                COALESCE(reading.ts_local, reading.ts_minute) AS reading_ts,
                CASE
                    WHEN reading.sensor_id = :pozo_1_sensor_id
                         AND COALESCE(reading.ts_local, reading.ts_minute) < :pozo_1_flow_cutoff
                    THEN TRY_CONVERT(float, reading.instant_value) * :pozo_1_legacy_factor
                    ELSE TRY_CONVERT(float, reading.instant_value)
                END AS flow_value,
                TRY_CONVERT(float, reading.total_value) AS total_value
            FROM iot.readings_minute AS reading
            WHERE reading.sensor_id = :sensor_id
              AND COALESCE(reading.ts_local, reading.ts_minute) >= :start_dt
              AND COALESCE(reading.ts_local, reading.ts_minute) < :end_dt
        ), bucketed AS (
            SELECT
                reading_ts,
                flow_value,
                total_value,
                DATEADD(minute, (DATEDIFF(minute, CONVERT(datetime2, '20000101'), reading_ts) / 15) * 15, CONVERT(datetime2, '20000101')) AS bucket_start
            FROM source_rows
        ), aggregates AS (
            SELECT
                bucket_start,
                SUM(CASE WHEN flow_value IS NOT NULL OR total_value IS NOT NULL THEN 1 ELSE 0 END) AS samples,
                SUM(CASE WHEN flow_value > 0 THEN 1 ELSE 0 END) AS active_samples,
                AVG(flow_value) AS flow_avg,
                AVG(CASE WHEN flow_value > 0 THEN flow_value END) AS flow_active_avg,
                MIN(flow_value) AS flow_min,
                MAX(flow_value) AS flow_max
            FROM bucketed
            GROUP BY bucket_start
        )
        SELECT
            aggregate.bucket_start,
            aggregate.samples,
            aggregate.active_samples,
            aggregate.flow_avg,
            aggregate.flow_active_avg,
            aggregate.flow_min,
            aggregate.flow_max,
            opening.total_value AS total_open,
            closing.total_value AS total_close
        FROM aggregates AS aggregate
        OUTER APPLY (
            SELECT TOP (1) candidate.total_value
            FROM bucketed AS candidate
            WHERE candidate.bucket_start = aggregate.bucket_start AND candidate.total_value IS NOT NULL
            ORDER BY CASE WHEN candidate.total_value > 0 THEN 0 ELSE 1 END, candidate.reading_ts ASC
        ) AS opening
        OUTER APPLY (
            SELECT TOP (1) candidate.total_value
            FROM bucketed AS candidate
            WHERE candidate.bucket_start = aggregate.bucket_start AND candidate.total_value IS NOT NULL
            ORDER BY CASE WHEN candidate.total_value > 0 THEN 0 ELSE 1 END, candidate.reading_ts DESC
        ) AS closing
        ORDER BY aggregate.bucket_start
    """)
    try:
        with SessionLocal() as session:
            exists = session.execute(text("SELECT CASE WHEN OBJECT_ID('iot.readings_minute','U') IS NULL THEN 0 ELSE 1 END")).scalar()
            if not exists:
                raise WaterHistoryError('La fuente histórica no está disponible.', status='no_history_source')
            rows = [dict(row._mapping) for row in session.execute(sql, {
                'sensor_id': sensor_id,
                'start_dt': local_to_source_naive(start_dt, source_timezone_for_identity(sensor_id)),
                'end_dt': local_to_source_naive(end_dt, source_timezone_for_identity(sensor_id)),
                'pozo_1_sensor_id': POZO_1_FLOW_SENSOR_ID,
                'pozo_1_flow_cutoff': POZO_1_FLOW_CALIBRATION_CUTOFF_LOCAL,
                'pozo_1_legacy_factor': POZO_1_LEGACY_FLOW_NORMALIZATION_FACTOR,
            }).fetchall()]
            return _localized_rows(rows, 'bucket_start', identity_hint=sensor_id, normalize_flows=False)
    except WaterHistoryError:
        raise
    except OperationalError as exc:
        msg = str(exc).lower()
        status = 'timeout' if any(token in msg for token in ('timeout', 'hyt00', 'hyt01')) else 'sql_error'
        logger.exception('history query failed sensor=%s status=%s', sensor_id, status)
        raise WaterHistoryError('La consulta histórica tardó demasiado.' if status == 'timeout' else 'No fue posible consultar el histórico de planta.', status=status) from exc
    except SQLAlchemyError as exc:
        logger.exception('history SQL error sensor=%s', sensor_id)
        raise WaterHistoryError('No fue posible consultar el histórico de planta.', status='sql_error') from exc



def _query_physical_validation_rows(sensor_ids: list[int], start_dt: datetime, end_dt: datetime) -> list[dict[str, Any]]:
    """Return bounded minute readings used only for physical well validation.

    The historical chart still obtains its flow statistics from the aggregated
    SQL query. Minute rows are requested only for confirmed wells and ranges of
    up to 31 days so the totalizer analyzer can inspect every update without
    reintroducing unbounded table downloads.
    """
    if not sensor_ids or end_dt <= start_dt or end_dt - start_dt > timedelta(days=MAX_PHYSICAL_VALIDATION_DAYS):
        return []
    params: dict[str, Any] = {
        'start_dt': local_to_source_naive(start_dt, LOCAL_TIMEZONE),
        'end_dt': local_to_source_naive(end_dt, LOCAL_TIMEZONE),
        'max_rows': MAX_PHYSICAL_VALIDATION_ROWS,
    }
    placeholders: list[str] = []
    for index, sensor_id in enumerate(sensor_ids):
        key = f'validation_sensor_{index}'
        placeholders.append(f':{key}')
        params[key] = int(sensor_id)
    sql = text(f"""
        SELECT TOP (:max_rows)
            reading.sensor_id,
            COALESCE(reading.ts_local, reading.ts_minute) AS operational_ts,
            TRY_CONVERT(float, reading.instant_value) AS instant_value,
            TRY_CONVERT(float, reading.total_value) AS total_value
        FROM iot.readings_minute AS reading
        WHERE reading.sensor_id IN ({', '.join(placeholders)})
          AND COALESCE(reading.ts_local, reading.ts_minute) >= :start_dt
          AND COALESCE(reading.ts_local, reading.ts_minute) < :end_dt
        ORDER BY reading.sensor_id, COALESCE(reading.ts_local, reading.ts_minute)
    """)
    try:
        with SessionLocal() as session:
            exists = session.execute(text("SELECT CASE WHEN OBJECT_ID('iot.readings_minute','U') IS NULL THEN 0 ELSE 1 END")).scalar()
            if not exists:
                return []
            rows = [dict(row._mapping) for row in session.execute(sql, params).fetchall()]
            return _localized_rows(rows, 'operational_ts', source_timezone=LOCAL_TIMEZONE)
    except SQLAlchemyError:
        logger.exception('physical totalizer validation query failed sensors=%s start=%s end=%s', sensor_ids, start_dt, end_dt)
        return []


def _validation_rows_by_bucket(rows: list[dict[str, Any]], aggregation: Aggregation) -> dict[datetime, list[dict[str, Any]]]:
    grouped: dict[datetime, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        stamp = _dt(row.get('operational_ts') or row.get('reading_ts') or row.get('timestamp'))
        if stamp is not None:
            grouped[_floor(stamp, aggregation)].append({
                'timestamp': stamp,
                'total_value': row.get('total_value'),
                'instant_value': row.get('instant_value') if row.get('instant_value') is not None else row.get('flow_value'),
            })
    for bucket_rows in grouped.values():
        bucket_rows.sort(key=lambda item: _dt(item.get('timestamp')) or datetime.min)
    return grouped

def _aggregate(
    sensor_id: Any,
    rows: list[dict[str, Any]],
    aggregation: Aggregation,
    validation_rows: list[dict[str, Any]] | None = None,
) -> dict[datetime, dict[str, Any]]:
    grouped: dict[datetime, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        stamp = _dt(row.get('bucket_start'))
        if stamp is not None:
            grouped[_floor(stamp, aggregation)].append(row)
    result: dict[datetime, dict[str, Any]] = {}
    validation_by_bucket = _validation_rows_by_bucket(validation_rows or [], aggregation)
    contract = sensor_contract(sensor_id)
    flow_unit = flow_unit_for_sensor(sensor_id)
    require_flow_validation = bool(contract.get('require_flow_validation'))
    for bucket, bucket_rows in grouped.items():
        bucket_rows = sorted(bucket_rows, key=lambda row: _dt(row.get('bucket_start')) or datetime.min)
        samples = sum(int(row.get('samples') or 0) for row in bucket_rows)
        active_samples = sum(int(row.get('active_samples') or 0) for row in bucket_rows)
        weighted = [(_num(row.get('flow_avg')), int(row.get('samples') or 0)) for row in bucket_rows]
        weighted = [(value, count) for value, count in weighted if value is not None and count > 0]
        flow_avg = sum(value * count for value, count in weighted) / sum(count for _, count in weighted) if weighted else None
        active_weighted = [(_num(row.get('flow_active_avg')), int(row.get('active_samples') or 0)) for row in bucket_rows]
        active_weighted = [(value, count) for value, count in active_weighted if value is not None and count > 0]
        flow_active_avg = (
            sum(value * count for value, count in active_weighted) / sum(count for _, count in active_weighted)
            if active_weighted else None
        )
        mins = [_num(row.get('flow_min')) for row in bucket_rows]
        maxs = [_num(row.get('flow_max')) for row in bucket_rows]
        mins = [value for value in mins if value is not None]
        maxs = [value for value in maxs if value is not None]
        total_points = list(validation_by_bucket.get(bucket) or [])
        if not total_points:
            # For ranges longer than the bounded physical-validation window, or
            # when the minute source is unavailable, preserve the existing
            # aggregated contract. The synthetic checkpoints still validate the
            # bucket against elapsed time and average flow without a fixed jump
            # threshold.
            for row in bucket_rows:
                stamp = _dt(row.get('bucket_start')) or bucket
                row_flow = _num(row.get('flow_avg'))
                total_points.extend([
                    {'timestamp': stamp, 'total_value': row.get('total_open'), 'instant_value': row_flow},
                    {'timestamp': stamp + timedelta(minutes=5), 'total_value': row.get('total_open'), 'instant_value': row_flow},
                    {'timestamp': stamp + timedelta(minutes=10), 'total_value': row.get('total_open'), 'instant_value': row_flow},
                    {'timestamp': stamp + timedelta(minutes=15), 'total_value': row.get('total_close'), 'instant_value': row_flow},
                ])
        analysis = analyze_totalizer_series(
            total_points,
            sensor_id=int(sensor_id) if str(sensor_id).isdigit() else None,
            flow_unit=flow_unit,
            require_flow_validation=require_flow_validation,
        )
        result[bucket] = {
            'samples': samples,
            'active_samples': active_samples,
            'flow_avg': flow_avg,
            'flow_active_avg': flow_active_avg,
            'flow_min': min(mins) if mins else None,
            'flow_max': max(maxs) if maxs else None,
            'total_open': analysis.opening_m3,
            'total_close': analysis.closing_m3,
            'volume': analysis.validated_volume_m3,
            'reliable': analysis.reliable,
            'status': analysis.status,
            'validated_volume_m3': analysis.validated_volume_m3,
            'discarded_volume_m3': analysis.discarded_volume_m3,
            'discarded_totalizer_events': analysis.discarded_totalizer_events,
            'discarded_totalizer_event_details': list(analysis.discarded_events),
            'has_discontinuities': analysis.has_discontinuities,
        }
    return result


def _empty(
    sensor_id: Any,
    aggregation: Aggregation,
    start: datetime,
    end: datetime,
    *,
    status: str = 'no_data',
    expected_samples: int | None = None,
) -> dict[str, Any]:
    expected = expected_minute_samples(start, end) if expected_samples is None else max(int(expected_samples), 0)
    metrics = interval_operation_metrics(
        samples_received=0,
        samples_expected=expected,
        active_samples=0,
        validated_volume_m3=None,
    ).payload()
    return {
        'sensor_id': sensor_id,
        'bucket_start': start.isoformat(timespec='seconds'),
        'bucket_end': end.isoformat(timespec='seconds'),
        'aggregation': aggregation,
        'samples': 0,
        'samples_received': 0,
        'samples_expected': expected,
        'coverage_percent': metrics['coverage_percent'],
        'coverage_status': metrics['coverage_status'],
        'data_reliable': False,
        'active_samples': 0,
        'active_minutes': 0.0,
        'interval_state': 'Sin registros' if status == 'no_data' else 'Configuración anterior pendiente',
        'flow_avg_lps': None,
        'flow_active_avg_lps': None,
        'flow_min_lps': None,
        'flow_max_lps': None,
        'totalizer_open_m3': None,
        'totalizer_close_m3': None,
        'volume_m3': None,
        'validated_volume_m3': None,
        'discarded_volume_m3': 0.0,
        'discarded_totalizer_events': 0,
        'discarded_totalizer_event_details': [],
        'has_discontinuities': False,
        'volume_reliable': False,
        'data_status': status,
    }


def _build_points(
    sensor_id: Any,
    aggregation: Aggregation,
    start_dt: datetime,
    end_dt: datetime,
    rows: list[dict[str, Any]],
    validation_rows: list[dict[str, Any]] | None = None,
    *,
    effective_end_dt: datetime | None = None,
) -> list[dict[str, Any]]:
    aggregates = _aggregate(sensor_id, rows, aggregation, validation_rows)
    result: list[dict[str, Any]] = []
    cursor = _floor(start_dt, aggregation)
    step = _step(aggregation)
    effective_end = effective_end_dt or end_dt
    series_end = min(end_dt, effective_end)
    while cursor < series_end:
        bucket_end = min(cursor + step, end_dt, series_end)
        if bucket_end <= DURANGO_SCADA_CUTOVER_LOCAL:
            result.append(_empty(sensor_id, aggregation, cursor, bucket_end, status='legacy_configuration_pending', expected_samples=0))
            cursor += step
            continue
        expected_start = max(cursor, start_dt, DURANGO_SCADA_CUTOVER_LOCAL)
        expected = expected_minute_samples(expected_start, bucket_end)
        item = aggregates.get(cursor)
        if not item:
            result.append(_empty(sensor_id, aggregation, cursor, bucket_end, expected_samples=expected))
        else:
            samples = int(item['samples'])
            active_samples = int(item.get('active_samples') or 0)
            flow_avg = item['flow_avg']
            volume = item['volume']
            metrics = interval_operation_metrics(
                samples_received=samples,
                samples_expected=expected,
                active_samples=active_samples,
                validated_volume_m3=volume,
                has_discontinuities=bool(item.get('has_discontinuities')),
            ).payload()
            result.append({
                'sensor_id': sensor_id,
                'bucket_start': cursor.isoformat(timespec='seconds'),
                'bucket_end': bucket_end.isoformat(timespec='seconds'),
                'aggregation': aggregation,
                'samples': samples,
                'samples_received': metrics['samples_received'],
                'samples_expected': metrics['samples_expected'],
                'coverage_percent': metrics['coverage_percent'],
                'coverage_status': metrics['coverage_status'],
                'data_reliable': metrics['data_reliable'],
                'active_samples': metrics['active_samples'],
                'active_minutes': metrics['active_minutes'],
                'interval_state': metrics['interval_state'],
                'flow_avg_lps': flow_avg,
                'flow_active_avg_lps': item.get('flow_active_avg'),
                'flow_min_lps': item['flow_min'],
                'flow_max_lps': item['flow_max'],
                'totalizer_open_m3': item['total_open'],
                'totalizer_close_m3': item['total_close'],
                'volume_m3': volume,
                'validated_volume_m3': item.get('validated_volume_m3'),
                'discarded_volume_m3': item.get('discarded_volume_m3', 0.0),
                'discarded_totalizer_events': item.get('discarded_totalizer_events', 0),
                'discarded_totalizer_event_details': item.get('discarded_totalizer_event_details', []),
                'has_discontinuities': bool(item.get('has_discontinuities')),
                'volume_reliable': bool(item['reliable']),
                'data_status': metrics['data_status'],
            })
        cursor += step
    return result


def _fallback_bos(module: Module, sensor_id: int, start: date, end: date, aggregation: Aggregation) -> list[dict[str, Any]]:
    if start != end:
        return []
    try:
        payload = get_bos_water_dashboard_payload(start_date=start.isoformat(), end_date=end.isoformat(), period='hourly', include_history=True, include_energy_water=False) or {}
        key = {'well': 'well_flow_history', 'line': 'production_line_history', 'flow': 'flow_history'}[module]
        history = payload.get(key) or []
        # El fallback se usa solo si contiene una serie real del sensor, nunca la lectura actual aislada.
        matching = [row for row in history if int(row.get('sensor_id') or row.get('sensor') or 0) == sensor_id]
        if len(matching) < 2:
            return []
        return matching
    except Exception:
        logger.exception('BOS history fallback failed module=%s sensor=%s', module, sensor_id)
        return []


def _fallback_points(sensor_id: int, aggregation: Aggregation, start: date, end: date, rows: list[dict[str, Any]], *, effective_end_dt: datetime | None = None) -> list[dict[str, Any]]:
    """Normalize the strictly limited one-day BOS fallback to the history contract."""
    by_bucket: dict[datetime, dict[str, Any]] = {}
    for row in rows:
        stamp = _dt(row.get('timestamp') or row.get('bucket'))
        if stamp is None:
            continue
        if effective_end_dt is not None and stamp >= effective_end_dt:
            continue
        bucket = _floor(stamp, aggregation)
        flow = _num(row.get('flow_lps') if row.get('flow_lps') is not None else row.get('flujo_lps'))
        volume = _num(row.get('period_m3') if row.get('period_m3') is not None else row.get('volumen_periodo_m3'))
        samples = int(row.get('samples') or 0)
        active_samples = samples if flow is not None and flow > 0 else 0
        interval_end = min(bucket + _step(aggregation), effective_end_dt or (bucket + _step(aggregation)))
        metrics = interval_operation_metrics(
            samples_received=samples,
            samples_expected=expected_minute_samples(bucket, interval_end),
            active_samples=active_samples,
            validated_volume_m3=volume,
        ).payload()
        by_bucket[bucket] = {
            'sensor_id': sensor_id,
            'bucket_start': bucket.isoformat(timespec='seconds'),
            'bucket_end': (bucket + _step(aggregation)).isoformat(timespec='seconds'),
            'aggregation': aggregation,
            'samples': samples,
            'samples_received': metrics['samples_received'],
            'samples_expected': metrics['samples_expected'],
            'coverage_percent': metrics['coverage_percent'],
            'coverage_status': metrics['coverage_status'],
            'data_reliable': metrics['data_reliable'],
            'active_samples': metrics['active_samples'],
            'active_minutes': metrics['active_minutes'],
            'interval_state': metrics['interval_state'],
            'flow_avg_lps': flow if samples > 0 else None,
            'flow_active_avg_lps': flow if active_samples > 0 else None,
            'flow_min_lps': flow if samples > 0 else None,
            'flow_max_lps': flow if samples > 0 else None,
            'totalizer_open_m3': None,
            'totalizer_close_m3': _num(row.get('total_m3') if row.get('total_m3') is not None else row.get('totalizador_m3')),
            'volume_m3': volume if samples > 0 else None,
            'validated_volume_m3': volume if samples > 0 else None,
            'discarded_volume_m3': 0.0,
            'discarded_totalizer_events': 0,
            'discarded_totalizer_event_details': [],
            'has_discontinuities': False,
            'volume_reliable': bool(samples > 0 and volume is not None),
            'data_status': metrics['data_status'],
        }
    start_dt = datetime.combine(start, time.min)
    end_dt = datetime.combine(end + timedelta(days=1), time.min)
    points: list[dict[str, Any]] = []
    cursor = _floor(start_dt, aggregation)
    effective_end = effective_end_dt or end_dt
    while cursor < end_dt:
        bucket_end = min(cursor + _step(aggregation), end_dt)
        if cursor >= effective_end:
            break
        bucket_end = min(bucket_end, effective_end)
        points.append(by_bucket.get(cursor) or _empty(
            sensor_id,
            aggregation,
            cursor,
            bucket_end,
            expected_samples=expected_minute_samples(max(cursor, DURANGO_SCADA_CUTOVER_LOCAL), bucket_end),
        ))
        cursor += _step(aggregation)
    return points




def _history_cache_ttl(start: date, end: date, now_day: date | None = None) -> int:
    today = now_day or local_now_naive().date()
    return CACHE_TTL_CURRENT_SECONDS if start <= today <= end else CACHE_TTL_HISTORICAL_SECONDS


def _store_cache(cache_key: str, value: dict[str, Any], ttl_seconds: int) -> dict[str, Any]:
    _CACHE[cache_key] = {'expires_at': monotonic() + ttl_seconds, 'value': value}
    return value

def get_water_history(*, module: str, sensor_id: Any, start_date: str, end_date: str, aggregation: str, force_refresh: bool = False) -> dict[str, Any]:
    module, aggregation, start, end = _validate(module, sensor_id, start_date, end_date, aggregation)
    identity: Any = int(sensor_id) if str(sensor_id).isdigit() else identity_key(sensor_id)
    now_local = local_now_naive()
    requested_start_dt = datetime.combine(start, time.min)
    requested_end_dt = datetime.combine(end + timedelta(days=1), time.min)
    effective_end_dt = effective_local_end(requested_end_dt, now=now_local)
    query_start_dt, query_end_dt, legacy_only, crosses_cutover = clamp_to_validated_segment(
        requested_start_dt, effective_end_dt
    )
    query_end_dt = max(query_start_dt, query_end_dt)
    cache_ttl = _history_cache_ttl(start, end, now_local.date())
    cache_key = f'durango:{module}:{identity}:{start}:{end}:{aggregation}:{effective_end_dt.isoformat(timespec="minutes")}'
    cached = _CACHE.get(cache_key)
    if not force_refresh and cached and monotonic() < cached['expires_at']:
        return cached['value']

    contract = item_contract(identity)
    source = 'legacy_configuration_pending' if legacy_only else 'readings_minute'
    rows: list[dict[str, Any]] = []
    validation_rows: list[dict[str, Any]] = []
    if not legacy_only and module == 'flow' and contract.get('table') != 'dbo.SensorsBOS_Linea':
        if str(identity) == '3010':
            raw_rows = query_jarabes_rows(query_start_dt, query_end_dt)
            source = 'dbo.SensorsBOS_Tanque' if raw_rows else 'no_data'
        else:
            raw_rows = query_lavadora_rows(query_start_dt, query_end_dt).get(str(identity), [])
            source = 'dbo.SensorsBOS_Lavadoras' if raw_rows else 'no_data'
        rows = _bos_rows_to_15m(identity, raw_rows)
        validation_rows = raw_rows
    elif not legacy_only:
        try:
            rows = _query_15m(int(identity), query_start_dt, query_end_dt) if query_end_dt > query_start_dt else []
        except WaterHistoryError as exc:
            if module != 'well' or start != end:
                raise exc
            fallback_rows = query_bos_well_rows(int(identity), query_start_dt, query_end_dt)
            if not fallback_rows:
                raise exc
            rows = _bos_rows_to_15m(identity, fallback_rows)
            validation_rows = fallback_rows
            source = 'bos_fallback'
        if module == 'well' and not validation_rows and query_end_dt > query_start_dt:
            validation_rows = _query_physical_validation_rows([int(identity)], query_start_dt, query_end_dt)

    points = _build_points(
        identity, aggregation, requested_start_dt, requested_end_dt, rows, validation_rows,
        effective_end_dt=effective_end_dt,
    )
    payload = {
        'plant': 'Planta Durango',
        'module': module,
        'sensor_id': identity if isinstance(identity, int) else None,
        'operational_key': contract.get('operational_key') or str(identity),
        'name': contract.get('display_name'),
        'flow_unit': flow_unit_for_sensor(identity),
        'start_date': start.isoformat(),
        'end_date': end.isoformat(),
        'aggregation': aggregation,
        'effective_end_at': effective_end_dt.isoformat(timespec='seconds'),
        'validated_segment_start': None if legacy_only else query_start_dt.isoformat(timespec='seconds'),
        'crosses_scada_cutover': crosses_cutover,
        'legacy_notice': 'Configuración anterior pendiente de validación' if legacy_only else ('El histórico corresponde al segmento validado posterior al cambio de SCADA.' if crosses_cutover else None),
        'has_future_intervals': effective_end_dt < requested_end_dt,
        'points': points,
        'source_status': source,
        'has_data': any(int(point.get('samples') or 0) > 0 for point in points),
    }
    return _store_cache(cache_key, payload, cache_ttl)



def _validate_module_request(module: str, start_date: str, end_date: str, aggregation: str) -> tuple[Module, Aggregation, date, date]:
    sensor_ids = SENSORS_BY_MODULE.get(module)
    if not sensor_ids:
        raise ValueError('Módulo histórico no permitido.')
    return _validate(module, sensor_ids[0], start_date, end_date, aggregation)


def _query_15m_multi(sensor_ids: list[int], start_dt: datetime, end_dt: datetime) -> list[dict[str, Any]]:
    params: dict[str, Any] = {
        'start_dt': local_to_source_naive(start_dt, LOCAL_TIMEZONE),
        'end_dt': local_to_source_naive(end_dt, LOCAL_TIMEZONE),
        'pozo_1_sensor_id': POZO_1_FLOW_SENSOR_ID,
        'pozo_1_flow_cutoff': POZO_1_FLOW_CALIBRATION_CUTOFF_LOCAL,
        'pozo_1_legacy_factor': POZO_1_LEGACY_FLOW_NORMALIZATION_FACTOR,
    }
    placeholders = []
    for index, sensor_id in enumerate(sensor_ids):
        key = f'sensor_{index}'
        placeholders.append(f':{key}')
        params[key] = int(sensor_id)
    sql = text(f"""
        WITH source_rows AS (
            SELECT reading.sensor_id, COALESCE(reading.ts_local, reading.ts_minute) AS reading_ts,
                   CASE
                       WHEN reading.sensor_id = :pozo_1_sensor_id
                            AND COALESCE(reading.ts_local, reading.ts_minute) < :pozo_1_flow_cutoff
                       THEN TRY_CONVERT(float, reading.instant_value) * :pozo_1_legacy_factor
                       ELSE TRY_CONVERT(float, reading.instant_value)
                   END AS flow_value,
                   TRY_CONVERT(float, reading.total_value) AS total_value
            FROM iot.readings_minute AS reading
            WHERE reading.sensor_id IN ({', '.join(placeholders)})
              AND COALESCE(reading.ts_local, reading.ts_minute) >= :start_dt
              AND COALESCE(reading.ts_local, reading.ts_minute) < :end_dt
        ), bucketed AS (
            SELECT sensor_id, reading_ts, flow_value, total_value,
                   DATEADD(minute, (DATEDIFF(minute, CONVERT(datetime2, '20000101'), reading_ts) / 15) * 15, CONVERT(datetime2, '20000101')) AS bucket_start
            FROM source_rows
        ), aggregates AS (
            SELECT sensor_id, bucket_start,
                   SUM(CASE WHEN flow_value IS NOT NULL OR total_value IS NOT NULL THEN 1 ELSE 0 END) AS samples,
                   SUM(CASE WHEN flow_value > 0 THEN 1 ELSE 0 END) AS active_samples,
                   AVG(flow_value) AS flow_avg,
                   AVG(CASE WHEN flow_value > 0 THEN flow_value END) AS flow_active_avg,
                   MIN(flow_value) AS flow_min, MAX(flow_value) AS flow_max
            FROM bucketed
            GROUP BY sensor_id, bucket_start
        )
        SELECT aggregate.sensor_id, aggregate.bucket_start, aggregate.samples, aggregate.active_samples,
               aggregate.flow_avg, aggregate.flow_active_avg, aggregate.flow_min, aggregate.flow_max,
               opening.total_value AS total_open, closing.total_value AS total_close
        FROM aggregates AS aggregate
        OUTER APPLY (
            SELECT TOP (1) candidate.total_value FROM bucketed AS candidate
            WHERE candidate.sensor_id = aggregate.sensor_id AND candidate.bucket_start = aggregate.bucket_start
              AND candidate.total_value IS NOT NULL
            ORDER BY CASE WHEN candidate.total_value > 0 THEN 0 ELSE 1 END, candidate.reading_ts ASC
        ) AS opening
        OUTER APPLY (
            SELECT TOP (1) candidate.total_value FROM bucketed AS candidate
            WHERE candidate.sensor_id = aggregate.sensor_id AND candidate.bucket_start = aggregate.bucket_start
              AND candidate.total_value IS NOT NULL
            ORDER BY CASE WHEN candidate.total_value > 0 THEN 0 ELSE 1 END, candidate.reading_ts DESC
        ) AS closing
        ORDER BY aggregate.sensor_id, aggregate.bucket_start
    """)
    try:
        with SessionLocal() as session:
            exists = session.execute(text("SELECT CASE WHEN OBJECT_ID('iot.readings_minute','U') IS NULL THEN 0 ELSE 1 END")).scalar()
            if not exists:
                raise WaterHistoryError('La fuente histórica no está disponible.', status='no_history_source')
            rows = [dict(row._mapping) for row in session.execute(sql, params).fetchall()]
            return _localized_rows(rows, 'bucket_start', source_timezone=LOCAL_TIMEZONE, normalize_flows=False)
    except WaterHistoryError:
        raise
    except OperationalError as exc:
        message = str(exc).lower()
        status = 'timeout' if any(token in message for token in ('timeout', 'hyt00', 'hyt01')) else 'sql_error'
        raise WaterHistoryError('La consulta histórica tardó demasiado.' if status == 'timeout' else 'No fue posible consultar el histórico de planta.', status=status) from exc
    except SQLAlchemyError as exc:
        raise WaterHistoryError('No fue posible consultar el histórico de planta.', status='sql_error') from exc


def _bos_rows_to_15m(sensor_id: int, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[datetime, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        stamp = _dt(row.get('operational_ts'))
        if stamp is not None:
            grouped[_floor(stamp, 'quarter_hour')].append(row)
    result = []
    for bucket, bucket_rows in sorted(grouped.items()):
        bucket_rows = sorted(bucket_rows, key=lambda row: _dt(row.get('operational_ts')) or datetime.min)
        # SensorsBOS_Lavadoras puede registrar más de una fila dentro del mismo
        # minuto. Para cobertura y tiempo activo cada minuto cuenta una sola vez.
        rows_by_minute: dict[datetime, dict[str, Any]] = {}
        for row in bucket_rows:
            stamp = _dt(row.get('operational_ts'))
            if stamp is not None:
                rows_by_minute[stamp.replace(second=0, microsecond=0)] = row
        bucket_rows = list(rows_by_minute.values())
        valid_rows = [
            row for row in bucket_rows
            if _num(row.get('instant_value')) is not None or _num(row.get('total_value')) is not None
        ]
        flows = [_num(row.get('instant_value')) for row in valid_rows]
        flows = [value for value in flows if value is not None]
        active_flows = [value for value in flows if value > 0]
        totals = [_num(row.get('total_value')) for row in bucket_rows]
        totals = [value for value in totals if value is not None and value > 0]
        result.append({
            'sensor_id': sensor_id,
            'bucket_start': bucket,
            'samples': len(valid_rows),
            'active_samples': len(active_flows),
            'flow_avg': sum(flows) / len(flows) if flows else None,
            'flow_active_avg': sum(active_flows) / len(active_flows) if active_flows else None,
            'flow_min': min(flows) if flows else None,
            'flow_max': max(flows) if flows else None,
            'total_open': totals[0] if totals else None,
            'total_close': totals[-1] if totals else None,
        })
    return result


def get_water_history_module(*, module: str, start_date: str, end_date: str, aggregation: str, force_refresh: bool = False) -> dict[str, Any]:
    module, aggregation, start, end = _validate_module_request(module, start_date, end_date, aggregation)
    now_local = local_now_naive()
    requested_start_dt = datetime.combine(start, time.min)
    requested_end_dt = datetime.combine(end + timedelta(days=1), time.min)
    effective_end_dt = effective_local_end(requested_end_dt, now=now_local)
    cache_ttl = _history_cache_ttl(start, end, now_local.date())
    cache_key = f'durango:module:{module}:{start}:{end}:{aggregation}:{effective_end_dt.isoformat(timespec="minutes")}'
    cached = _CACHE.get(cache_key)
    if not force_refresh and cached and monotonic() < cached['expires_at']:
        return cached['value']
    identities = list(SENSORS_BY_MODULE[module])
    query_start_dt, query_end_dt, legacy_only, crosses_cutover = clamp_to_validated_segment(
        requested_start_dt, effective_end_dt
    )
    query_end_dt = max(query_start_dt, query_end_dt)
    query_error: WaterHistoryError | None = None
    grouped: dict[Any, list[dict[str, Any]]] = {identity: [] for identity in identities}
    validation_grouped: dict[Any, list[dict[str, Any]]] = {identity: [] for identity in identities}
    if not legacy_only and module == 'flow':
        line_flow_ids = [
            int(identity)
            for identity in identities
            if str(identity).isdigit() and item_contract(identity).get('table') == 'dbo.SensorsBOS_Linea'
        ]
        if line_flow_ids and query_end_dt > query_start_dt:
            try:
                for row in _query_15m_multi(line_flow_ids, query_start_dt, query_end_dt):
                    row_sensor = int(row.get('sensor_id') or 0)
                    if row_sensor in grouped:
                        grouped[row_sensor].append(row)
            except WaterHistoryError as exc:
                query_error = exc
        washer_rows = query_lavadora_rows(query_start_dt, query_end_dt)
        jarabes_rows = query_jarabes_rows(query_start_dt, query_end_dt) if 3010 in identities else []
        for identity in identities:
            if item_contract(identity).get('table') == 'dbo.SensorsBOS_Linea':
                continue
            raw_rows = jarabes_rows if str(identity) == '3010' else washer_rows.get(str(identity), [])
            grouped[identity] = _bos_rows_to_15m(identity, raw_rows)
            validation_grouped[identity] = raw_rows
    elif not legacy_only:
        numeric_ids = [int(value) for value in identities]
        rows: list[dict[str, Any]] = []
        try:
            if query_end_dt > query_start_dt:
                rows = _query_15m_multi(numeric_ids, query_start_dt, query_end_dt)
        except WaterHistoryError as exc:
            query_error = exc
        for row in rows:
            row_sensor = int(row.get('sensor_id') or 0)
            if row_sensor in grouped:
                grouped[row_sensor].append(row)
        if module == 'well' and query_end_dt > query_start_dt:
            for row in _query_physical_validation_rows(numeric_ids, query_start_dt, query_end_dt):
                validation_sensor = int(row.get('sensor_id') or 0)
                if validation_sensor in validation_grouped:
                    validation_grouped[validation_sensor].append(row)

    series = []
    for identity in identities:
        sensor_rows = grouped[identity]
        contract = item_contract(identity)
        source_status = (
            'legacy_configuration_pending'
            if legacy_only
            else 'readings_minute'
            if contract.get('table') == 'dbo.SensorsBOS_Linea'
            else 'dbo.SensorsBOS_Tanque'
            if module == 'flow' and str(identity) == '3010'
            else 'dbo.SensorsBOS_Lavadoras'
            if module == 'flow'
            else 'readings_minute'
        )
        sensor_validation_rows = validation_grouped.get(identity, [])
        if not sensor_rows and module == 'well' and start == end and query_end_dt > query_start_dt:
            bos_rows = query_bos_well_rows(int(identity), query_start_dt, query_end_dt)
            if bos_rows:
                sensor_rows = _bos_rows_to_15m(identity, bos_rows)
                sensor_validation_rows = bos_rows
                source_status = 'bos_fallback'
        points = _build_points(
            identity, aggregation, requested_start_dt, requested_end_dt, sensor_rows, sensor_validation_rows,
            effective_end_dt=effective_end_dt,
        )
        contract = sensor_contract(identity)
        series.append({
            'sensor_id': identity if isinstance(identity, int) else None,
            'operational_key': contract.get('operational_key') or str(identity),
            'name': contract.get('display_name'),
            'flow_unit': flow_unit_for_sensor(identity),
            'source_status': source_status if sensor_rows or legacy_only else 'no_data',
            'has_data': any(int(point.get('samples') or 0) > 0 for point in points),
            'has_future_intervals': any(point.get('data_status') == 'future_interval' for point in points),
            'points': points,
        })
    if query_error is not None and query_error.status not in {'no_history_source'} and not any(item['has_data'] for item in series):
        raise query_error
    payload = {
        'plant': 'Planta Durango',
        'module': module,
        'start_date': start.isoformat(),
        'end_date': end.isoformat(),
        'aggregation': aggregation,
        'effective_end_at': effective_end_dt.isoformat(timespec='seconds'),
        'validated_segment_start': None if legacy_only else query_start_dt.isoformat(timespec='seconds'),
        'crosses_scada_cutover': crosses_cutover,
        'legacy_notice': 'Configuración anterior pendiente de validación' if legacy_only else ('El histórico corresponde al segmento validado posterior al cambio de SCADA.' if crosses_cutover else None),
        'has_future_intervals': effective_end_dt < requested_end_dt,
        'series': series,
        'source_status': 'legacy_configuration_pending' if legacy_only else ('operational' if any(item['has_data'] for item in series) else 'no_data'),
    }
    return _store_cache(cache_key, payload, cache_ttl)



def _parse_local_datetime(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', ''))
    except ValueError as exc:
        raise ValueError('Fecha y hora inválidas.') from exc
    return parsed.replace(tzinfo=None)


def _query_minute_rows(sensor_ids: list[int], start_dt: datetime, end_dt: datetime) -> list[dict[str, Any]]:
    params: dict[str, Any] = {'start_dt': local_to_source_naive(start_dt, LOCAL_TIMEZONE), 'end_dt': local_to_source_naive(end_dt, LOCAL_TIMEZONE)}
    placeholders = []
    for index, sensor_id in enumerate(sensor_ids):
        key = f'sensor_{index}'; params[key] = sensor_id; placeholders.append(f':{key}')
    sql = text(f"""
        SELECT reading.sensor_id, COALESCE(reading.ts_local, reading.ts_minute) AS reading_ts,
               TRY_CONVERT(float, reading.instant_value) AS flow_value
        FROM iot.readings_minute AS reading
        WHERE reading.sensor_id IN ({', '.join(placeholders)})
          AND COALESCE(reading.ts_local, reading.ts_minute) >= :start_dt
          AND COALESCE(reading.ts_local, reading.ts_minute) < :end_dt
        ORDER BY reading.sensor_id, COALESCE(reading.ts_local, reading.ts_minute)
    """)
    try:
        with SessionLocal() as session:
            exists = session.execute(text("SELECT CASE WHEN OBJECT_ID('iot.readings_minute','U') IS NULL THEN 0 ELSE 1 END")).scalar()
            if not exists: return []
            rows = [dict(row._mapping) for row in session.execute(sql, params).fetchall()]
            return _localized_rows(rows, 'reading_ts', source_timezone=LOCAL_TIMEZONE)
    except SQLAlchemyError:
        logger.exception('minute well flow query failed')
        return []


def get_wells_minute_flow(*, start_datetime: str, end_datetime: str, force_refresh: bool = False) -> dict[str, Any]:
    start_dt = _parse_local_datetime(start_datetime)
    requested_end_dt = _parse_local_datetime(end_datetime)
    if requested_end_dt <= start_dt:
        raise ValueError('La hora final debe ser mayor a la hora inicial.')
    if requested_end_dt - start_dt > timedelta(hours=24):
        raise ValueError('El rango máximo permitido es de 24 horas.')
    now_local = local_now_naive()
    effective_end_dt = effective_local_end(requested_end_dt, now=now_local)
    cache_ttl = CACHE_TTL_CURRENT_SECONDS if start_dt.date() <= now_local.date() <= requested_end_dt.date() else CACHE_TTL_HISTORICAL_SECONDS
    cache_key = f'durango:wells-minute:{start_dt.isoformat()}:{requested_end_dt.isoformat()}:{effective_end_dt.isoformat(timespec="minutes")}'
    cached = _CACHE.get(cache_key)
    if not force_refresh and cached and monotonic() < cached['expires_at']:
        return cached['value']

    sensor_ids = list(SENSORS_BY_MODULE['well'])
    query_start_dt, query_end_dt, legacy_only, crosses_cutover = clamp_to_validated_segment(start_dt, effective_end_dt)
    query_end_dt = max(query_start_dt, query_end_dt)
    rows = _query_minute_rows(sensor_ids, query_start_dt, query_end_dt) if query_end_dt > query_start_dt else []
    grouped: dict[int, list[dict[str, Any]]] = {sensor_id: [] for sensor_id in sensor_ids}
    for row in rows:
        sensor_id = int(row.get('sensor_id') or 0)
        if sensor_id in grouped:
            grouped[sensor_id].append(row)
    series = []
    for sensor_id in sensor_ids:
        sensor_rows = grouped[sensor_id]
        source_status = 'readings_minute'
        if not sensor_rows and query_end_dt > query_start_dt:
            bos_rows = query_bos_well_rows(sensor_id, query_start_dt, query_end_dt)
            sensor_rows = [{'reading_ts': row.get('operational_ts'), 'flow_value': row.get('instant_value')} for row in bos_rows]
            if sensor_rows:
                source_status = 'bos_fallback'
        minute_values: dict[datetime, list[float]] = defaultdict(list)
        for row in sensor_rows:
            stamp = _dt(row.get('reading_ts') or row.get('operational_ts'))
            value = _num(row.get('flow_value') if 'flow_value' in row else row.get('instant_value'))
            if stamp is not None and value is not None and stamp < effective_end_dt:
                minute_values[stamp.replace(second=0, microsecond=0)].append(value)
        points = []
        cursor = start_dt.replace(second=0, microsecond=0)
        minute_series_end = min(requested_end_dt, effective_end_dt)
        while cursor < minute_series_end:
            if cursor < DURANGO_SCADA_CUTOVER_LOCAL:
                points.append({
                    'timestamp': cursor.isoformat(timespec='seconds'),
                    'flow_value': None,
                    'samples': 0,
                    'data_status': 'legacy_configuration_pending',
                })
            else:
                values = minute_values.get(cursor, [])
                average = sum(values) / len(values) if values else None
                points.append({
                    'timestamp': cursor.isoformat(timespec='seconds'),
                    'flow_value': average,
                    'samples': len(values),
                    'data_status': 'operational' if average is not None and average > 0 else 'zero_consumption' if values else 'no_data',
                })
            cursor += timedelta(minutes=1)
        contract = sensor_contract(sensor_id)
        series.append({
            'sensor_id': sensor_id,
            'name': contract.get('display_name'),
            'flow_unit': flow_unit_for_sensor(sensor_id),
            'source_status': 'legacy_configuration_pending' if legacy_only else (source_status if any(point['samples'] for point in points) else 'no_data'),
            'has_data': any(point['samples'] for point in points),
            'has_future_intervals': any(point['data_status'] == 'future_interval' for point in points),
            'points': points,
        })
    payload = {
        'plant': 'Planta Durango',
        'start_datetime': start_dt.isoformat(timespec='seconds'),
        'end_datetime': requested_end_dt.isoformat(timespec='seconds'),
        'effective_end_at': effective_end_dt.isoformat(timespec='seconds'),
        'validated_segment_start': None if legacy_only else query_start_dt.isoformat(timespec='seconds'),
        'crosses_scada_cutover': crosses_cutover,
        'legacy_notice': 'Configuración anterior pendiente de validación' if legacy_only else ('El histórico corresponde al segmento validado posterior al cambio de SCADA.' if crosses_cutover else None),
        'has_future_intervals': effective_end_dt < requested_end_dt,
        'series': series,
        'source_status': 'legacy_configuration_pending' if legacy_only else ('operational' if any(item['has_data'] for item in series) else 'no_data'),
    }
    return _store_cache(cache_key, payload, cache_ttl)
