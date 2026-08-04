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
from app.services.durango_capabilities import LOCAL_TIMEZONE, SENSORS_BY_MODULE, flow_unit_for_sensor, sensor_contract
from app.services.totalizer_quality import analyze_totalizer_series
from app.services.water_bos_service import get_bos_water_dashboard_payload

logger = logging.getLogger(__name__)
LOCAL_ZONE = ZoneInfo(LOCAL_TIMEZONE)
Aggregation = Literal['quarter_hour', 'hourly', 'daily']
Module = Literal['well', 'line', 'flow']
_CACHE: dict[str, dict[str, Any]] = {}
CACHE_TTL_SECONDS = 10 * 60


class WaterHistoryError(RuntimeError):
    def __init__(self, message: str, *, status: str = 'sql_error'):
        super().__init__(message)
        self.status = status


def _parse_date(value: str) -> date:
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except (TypeError, ValueError) as exc:
        raise ValueError('Fecha inválida.') from exc


def _validate(module: str, sensor_id: int, start_date: str, end_date: str, aggregation: str) -> tuple[Module, Aggregation, date, date]:
    if module not in SENSORS_BY_MODULE:
        raise ValueError('Módulo histórico no permitido.')
    if int(sensor_id) not in SENSORS_BY_MODULE[module]:
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


def _query_15m(sensor_id: int, start_dt: datetime, end_dt: datetime) -> list[dict[str, Any]]:
    sql = text("""
        WITH source_rows AS (
            SELECT
                COALESCE(reading.ts_local, reading.ts_minute) AS reading_ts,
                TRY_CONVERT(float, reading.instant_value) AS flow_value,
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
                COUNT_BIG(1) AS samples,
                AVG(flow_value) AS flow_avg,
                MIN(flow_value) AS flow_min,
                MAX(flow_value) AS flow_max
            FROM bucketed
            GROUP BY bucket_start
        )
        SELECT
            aggregate.bucket_start,
            aggregate.samples,
            aggregate.flow_avg,
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
            return [dict(row._mapping) for row in session.execute(sql, {'sensor_id': sensor_id, 'start_dt': start_dt, 'end_dt': end_dt}).fetchall()]
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


def _aggregate(sensor_id: int, rows: list[dict[str, Any]], aggregation: Aggregation) -> dict[datetime, dict[str, Any]]:
    grouped: dict[datetime, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        stamp = _dt(row.get('bucket_start'))
        if stamp is not None:
            grouped[_floor(stamp, aggregation)].append(row)
    result: dict[datetime, dict[str, Any]] = {}
    for bucket, bucket_rows in grouped.items():
        samples = sum(int(row.get('samples') or 0) for row in bucket_rows)
        weighted = [(_num(row.get('flow_avg')), int(row.get('samples') or 0)) for row in bucket_rows]
        weighted = [(value, count) for value, count in weighted if value is not None and count > 0]
        flow_avg = sum(value * count for value, count in weighted) / sum(count for _, count in weighted) if weighted else None
        mins = [_num(row.get('flow_min')) for row in bucket_rows]
        maxs = [_num(row.get('flow_max')) for row in bucket_rows]
        mins = [value for value in mins if value is not None]
        maxs = [value for value in maxs if value is not None]
        total_points: list[dict[str, Any]] = []
        for row in bucket_rows:
            stamp = _dt(row.get('bucket_start')) or bucket
            total_points.append({'timestamp': stamp, 'total_value': row.get('total_open')})
            total_points.append({'timestamp': stamp + timedelta(minutes=14, seconds=59), 'total_value': row.get('total_close')})
        analysis = analyze_totalizer_series(total_points, sensor_id=sensor_id)
        result[bucket] = {
            'samples': samples,
            'flow_avg': flow_avg,
            'flow_min': min(mins) if mins else None,
            'flow_max': max(maxs) if maxs else None,
            'total_open': analysis.opening_m3,
            'total_close': analysis.closing_m3,
            'volume': analysis.volume_m3 if analysis.reliable else None,
            'reliable': analysis.reliable,
            'status': analysis.status,
        }
    return result


def _empty(sensor_id: int, aggregation: Aggregation, start: datetime, end: datetime) -> dict[str, Any]:
    return {
        'sensor_id': sensor_id,
        'bucket_start': start.isoformat(timespec='seconds'),
        'bucket_end': end.isoformat(timespec='seconds'),
        'aggregation': aggregation,
        'samples': 0,
        'flow_avg_lps': None,
        'flow_min_lps': None,
        'flow_max_lps': None,
        'totalizer_open_m3': None,
        'totalizer_close_m3': None,
        'volume_m3': None,
        'volume_reliable': False,
        'data_status': 'no_data',
    }


def _build_points(sensor_id: int, aggregation: Aggregation, start_dt: datetime, end_dt: datetime, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    aggregates = _aggregate(sensor_id, rows, aggregation)
    result: list[dict[str, Any]] = []
    cursor = _floor(start_dt, aggregation)
    step = _step(aggregation)
    while cursor < end_dt:
        bucket_end = min(cursor + step, end_dt)
        item = aggregates.get(cursor)
        if not item:
            result.append(_empty(sensor_id, aggregation, cursor, bucket_end))
        else:
            samples = int(item['samples'])
            flow_avg = item['flow_avg']
            volume = item['volume']
            if not item['reliable']:
                status = 'invalid_totalizer'
            elif (volume or 0) > 0:
                status = 'operational'
            elif samples > 0:
                status = 'zero_consumption'
            else:
                status = 'no_data'
            result.append({
                'sensor_id': sensor_id,
                'bucket_start': cursor.isoformat(timespec='seconds'),
                'bucket_end': bucket_end.isoformat(timespec='seconds'),
                'aggregation': aggregation,
                'samples': samples,
                'flow_avg_lps': flow_avg,
                'flow_min_lps': item['flow_min'],
                'flow_max_lps': item['flow_max'],
                'totalizer_open_m3': item['total_open'],
                'totalizer_close_m3': item['total_close'],
                'volume_m3': volume,
                'volume_reliable': bool(item['reliable']),
                'data_status': status,
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


def _fallback_points(sensor_id: int, aggregation: Aggregation, start: date, end: date, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalize the strictly limited one-day BOS fallback to the history contract."""
    by_bucket: dict[datetime, dict[str, Any]] = {}
    for row in rows:
        stamp = _dt(row.get('timestamp') or row.get('bucket'))
        if stamp is None:
            continue
        bucket = _floor(stamp, aggregation)
        flow = _num(row.get('flow_lps') if row.get('flow_lps') is not None else row.get('flujo_lps'))
        volume = _num(row.get('period_m3') if row.get('period_m3') is not None else row.get('volumen_periodo_m3'))
        samples = int(row.get('samples') or 0)
        by_bucket[bucket] = {
            'sensor_id': sensor_id,
            'bucket_start': bucket.isoformat(timespec='seconds'),
            'bucket_end': (bucket + _step(aggregation)).isoformat(timespec='seconds'),
            'aggregation': aggregation,
            'samples': samples,
            'flow_avg_lps': flow if samples > 0 else None,
            'flow_min_lps': flow if samples > 0 else None,
            'flow_max_lps': flow if samples > 0 else None,
            'totalizer_open_m3': None,
            'totalizer_close_m3': _num(row.get('total_m3') if row.get('total_m3') is not None else row.get('totalizador_m3')),
            'volume_m3': volume if samples > 0 else None,
            'volume_reliable': bool(samples > 0 and volume is not None),
            'data_status': ('operational' if volume is not None and volume > 0 else 'zero_consumption') if samples > 0 else 'no_data',
        }
    start_dt = datetime.combine(start, time.min)
    end_dt = datetime.combine(end + timedelta(days=1), time.min)
    points: list[dict[str, Any]] = []
    cursor = _floor(start_dt, aggregation)
    while cursor < end_dt:
        points.append(by_bucket.get(cursor) or _empty(sensor_id, aggregation, cursor, min(cursor + _step(aggregation), end_dt)))
        cursor += _step(aggregation)
    return points


def get_water_history(*, module: str, sensor_id: int, start_date: str, end_date: str, aggregation: str, force_refresh: bool = False) -> dict[str, Any]:
    module, aggregation, start, end = _validate(module, sensor_id, start_date, end_date, aggregation)
    cache_key = f'{module}:{sensor_id}:{start}:{end}:{aggregation}'
    cached = _CACHE.get(cache_key)
    if not force_refresh and cached and monotonic() < cached['expires_at']:
        return cached['value']
    start_dt = datetime.combine(start, time.min)
    end_dt = datetime.combine(end + timedelta(days=1), time.min)
    source = 'readings_minute'
    try:
        rows = _query_15m(sensor_id, start_dt, end_dt)
    except WaterHistoryError as exc:
        fallback = _fallback_bos(module, sensor_id, start, end, aggregation)
        if fallback:
            fallback_points = _fallback_points(sensor_id, aggregation, start, end, fallback)
            payload = {
                'plant': 'Planta Durango', 'module': module, 'sensor_id': sensor_id,
                'name': sensor_contract(sensor_id).get('display_name'), 'flow_unit': flow_unit_for_sensor(sensor_id),
                'start_date': start.isoformat(), 'end_date': end.isoformat(), 'aggregation': aggregation,
                'points': fallback_points, 'source_status': 'bos_fallback',
                'has_data': any(int(point.get('samples') or 0) > 0 for point in fallback_points),
            }
            _CACHE[cache_key] = {'expires_at': monotonic() + CACHE_TTL_SECONDS, 'value': payload}
            return payload
        raise exc
    points = _build_points(sensor_id, aggregation, start_dt, end_dt, rows)
    payload = {
        'plant': 'Planta Durango',
        'module': module,
        'sensor_id': sensor_id,
        'name': sensor_contract(sensor_id).get('display_name'),
        'flow_unit': flow_unit_for_sensor(sensor_id),
        'start_date': start.isoformat(),
        'end_date': end.isoformat(),
        'aggregation': aggregation,
        'points': points,
        'source_status': source,
        'has_data': any(int(point.get('samples') or 0) > 0 for point in points),
    }
    _CACHE[cache_key] = {'expires_at': monotonic() + CACHE_TTL_SECONDS, 'value': payload}
    return payload
