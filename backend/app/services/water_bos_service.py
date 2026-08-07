from __future__ import annotations

from copy import deepcopy
from datetime import datetime, date, time, timedelta
import logging
from time import monotonic
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.database import SessionLocal
from app.services.durango_capabilities import (
    DURANGO_SCADA_CUTOVER_LOCAL,
    WELLS as DURANGO_WELLS,
    LINE_FLOWS as DURANGO_LINE_FLOWS,
    LINE_SOURCE_ITEMS as DURANGO_LINE_SOURCE_ITEMS,
    FLOWS as DURANGO_FLOWS,
    flow_unit_for_sensor,
    normalize_flow_lps,
)
from app.services.durango_lavadoras_service import get_current_lavadoras
from app.services.durango_jarabes_service import get_current_jarabes
from app.services.plant_time import local_now_naive, local_to_source_naive, source_iso_local, source_to_local_naive


logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 10 * 60
_CURRENT_PAYLOAD_TTL_SECONDS = 20
_HISTORY_PAYLOAD_TTL_SECONDS = 10 * 60
_MONTHLY_PAYLOAD_TTL_SECONDS = 30 * 60
_SENSOR_CATALOG_CACHE: dict[str, Any] = {'expires_at': 0.0, 'value': None}
_WELL_LOCATIONS_CACHE: dict[str, Any] = {'expires_at': 0.0, 'value': None}
_DASHBOARD_PAYLOAD_CACHE: dict[str, dict[str, Any]] = {}
_SQL_OBJECT_EXISTS_CACHE: dict[str, bool] = {}
_OPTIONAL_SOURCE_WARNED: set[str] = set()
_OPTIONAL_BOS_TABLES = {'dbo.NIVELES_BOS'}


def _short_sql_error(exc: Exception) -> str:
    message = str(exc).replace('\n', ' ').strip()
    return message[:220]


def _warn_optional_source_once(source_name: str, reason: str) -> None:
    if source_name in _OPTIONAL_SOURCE_WARNED:
        return
    _OPTIONAL_SOURCE_WARNED.add(source_name)
    logger.warning('water_bos optional SQL source unavailable: %s (%s)', source_name, reason)


def _sql_dialect_name(session) -> str:
    try:
        bind = session.get_bind()
        return str(getattr(getattr(bind, 'dialect', None), 'name', '') or '').lower()
    except Exception:
        return ''


def _sql_object_exists(session, object_name: str) -> bool:
    """Return whether a SQL Server object exists, caching the result per process.

    This is used only for optional ARCA/BOS sources. Required dashboard tables
    still fail visibly if they are unavailable.
    """
    key = object_name.lower()
    if key in _SQL_OBJECT_EXISTS_CACHE:
        return _SQL_OBJECT_EXISTS_CACHE[key]

    if _sql_dialect_name(session) != 'mssql':
        _SQL_OBJECT_EXISTS_CACHE[key] = False
        _warn_optional_source_once(object_name, 'validacion disponible solo en SQL Server')
        return False

    try:
        value = session.execute(
            text('SELECT OBJECT_ID(:object_name) AS object_id'),
            {'object_name': object_name},
        ).scalar()
    except SQLAlchemyError as exc:
        # The existence probe is intentionally non-critical for optional sources.
        # Real connection/query errors in required BOS tables are still logged by
        # the normal read paths.
        _SQL_OBJECT_EXISTS_CACHE[key] = False
        _warn_optional_source_once(object_name, f'no se pudo validar existencia: {_short_sql_error(exc)}')
        return False

    exists = value is not None
    _SQL_OBJECT_EXISTS_CACHE[key] = exists
    if not exists:
        _warn_optional_source_once(object_name, 'objeto no existe en esta planta')
    return exists


def _optional_table_available(session, table_name: str) -> bool:
    return _sql_object_exists(session, table_name)


def tank_level_source_status() -> str:
    """Return availability of the optional tank-level source.

    Values:
    - ``available``: dbo.NIVELES_BOS exists and can be queried.
    - ``missing``: SQL Server is reachable but dbo.NIVELES_BOS does not exist
      in this plant.
    - ``error``: SQL connection/probe failed and should be treated as a real
      backend connectivity problem.
    """
    try:
        with SessionLocal() as session:
            if _sql_dialect_name(session) != 'mssql':
                return 'missing'
            value = session.execute(
                text('SELECT OBJECT_ID(:object_name) AS object_id'),
                {'object_name': 'dbo.NIVELES_BOS'},
            ).scalar()
            if value is None:
                _warn_optional_source_once('dbo.NIVELES_BOS', 'objeto no existe en esta planta')
                return 'missing'
            return 'available'
    except SQLAlchemyError as exc:
        logger.exception('water_bos SQL error validating optional tank levels source: %s', exc)
        return 'error'


def _sql_objects_available(session, object_names: tuple[str, ...]) -> bool:
    return all(_sql_object_exists(session, object_name) for object_name in object_names)


def _cache_get(cache: dict[str, Any], label: str) -> Any | None:
    value = cache.get('value')
    if value is None:
        return None
    if monotonic() >= float(cache.get('expires_at') or 0):
        logger.info('water_bos cache expired: %s', label)
        return None
    logger.info('water_bos cache hit: %s', label)
    return deepcopy(value)


def _cache_get_stale(cache: dict[str, Any], label: str) -> Any | None:
    value = cache.get('value')
    if value is None:
        return None
    logger.warning('water_bos using stale cache after SQL error: %s', label)
    return deepcopy(value)


def _cache_set(cache: dict[str, Any], value: Any, label: str) -> Any:
    if not value:
        logger.info('water_bos cache not stored because value is empty: %s', label)
        return value
    cache['value'] = deepcopy(value)
    cache['expires_at'] = monotonic() + _CACHE_TTL_SECONDS
    logger.info('water_bos cache refreshed: %s ttl=%ss', label, _CACHE_TTL_SECONDS)
    return value


def _payload_cache_key(start_date: Any = None, end_date: Any = None, period: Any = None, include_history: bool = False, include_energy_water: bool = False) -> str:
    start_bound, end_bound = _date_bounds(start_date, end_date)
    normalized_period = _normalize_period(period, start_date, end_date)
    return '|'.join([
        'durango',
        str(start_bound or ''),
        str(end_bound or ''),
        normalized_period,
        'history' if include_history else 'current',
        'energy' if include_energy_water else 'noenergy',
    ])


def _payload_cache_ttl(start_date: Any = None, end_date: Any = None, period: Any = None, include_history: bool = False) -> int:
    if not include_history:
        return _CURRENT_PAYLOAD_TTL_SECONDS
    normalized_period = _normalize_period(period, start_date, end_date)
    start_bound, end_bound = _date_bounds(start_date, end_date)
    if normalized_period == 'monthly' or (start_bound and end_bound and abs((end_bound - start_bound).days) + 1 > 31):
        return _MONTHLY_PAYLOAD_TTL_SECONDS
    return _HISTORY_PAYLOAD_TTL_SECONDS


def _payload_cache_get(cache_key: str) -> dict[str, Any] | None:
    entry = _DASHBOARD_PAYLOAD_CACHE.get(cache_key)
    if not entry:
        return None
    if monotonic() >= float(entry.get('expires_at') or 0):
        _DASHBOARD_PAYLOAD_CACHE.pop(cache_key, None)
        logger.info('water_bos payload cache expired: %s', cache_key)
        return None
    logger.info('water_bos payload cache hit: %s', cache_key)
    return deepcopy(entry.get('value'))


def _payload_cache_set(cache_key: str, payload: dict[str, Any] | None, ttl_seconds: int) -> dict[str, Any] | None:
    if not payload or payload.get('__sql_error__'):
        logger.info('water_bos payload cache skipped for empty/error payload: %s', cache_key)
        return payload
    _DASHBOARD_PAYLOAD_CACHE[cache_key] = {
        'expires_at': monotonic() + max(int(ttl_seconds or _CURRENT_PAYLOAD_TTL_SECONDS), 1),
        'value': deepcopy(payload),
    }
    logger.info('water_bos payload cache refreshed: %s ttl=%ss', cache_key, ttl_seconds)
    return payload


def _sql_connection_error_payload() -> dict[str, Any]:
    return {'__sql_error__': True, 'source_status': 'sql_error'}


# Mapeos centralizados en durango_capabilities.py.
WELL_NAMES = [str(item['display_name']) for item in DURANGO_WELLS]
WELL_IDS = list(range(1, len(DURANGO_WELLS) + 1))
ENERGY_SENSOR_IDS = [0 for _ in DURANGO_WELLS]
FLOW_OUT_SENSOR_IDS = [int(item['sensor_id']) for item in DURANGO_WELLS]
FLOW_IN_SENSOR_IDS = [0 for _ in DURANGO_WELLS]
DISTRIBUTION_NAMES = [str(item['display_name']) for item in DURANGO_FLOWS]
LINE_SENSOR_MAP = [
    {
        'sensor_id': int(item['sensor_id']),
        'numero': int(item['slot_index']) + 1,
        'name': str(item['display_name']),
        'operational_key': str(item['operational_key']),
        'module': str(item['group']),
        'slot_index': int(item['slot_index']),
        'source_key': str(item['source_key']),
    }
    for item in DURANGO_LINE_SOURCE_ITEMS
]
LINE_SENSOR_BY_ID = {int(item['sensor_id']): item for item in LINE_SENSOR_MAP}
CONFIRMED_WELL_SLOT_INDICES = tuple(range(len(WELL_NAMES)))
CONFIRMED_LINE_SLOT_INDICES = tuple(int(item['slot_index']) for item in LINE_SENSOR_MAP)


# dbo.NIVELES_BOS expone niveles por columna. El dashboard conserva el nombre
# visual "Tanques", pero estas lecturas se tratan internamente como niveles BOS.
# Mantener aqui unicamente columnas observadas en SQL Server para no asumir una
# tabla de tanques distinta a la disponible.
TANK_LEVEL_COLUMNS = [
    {'key': 'nivel_1k', 'name': 'Tanque 1K', 'type': 'Nivel 1K', 'columns': ('Nivel1K',)},
    {'key': 'nivel_750a', 'name': 'Tanque 750 A', 'type': 'Nivel 750', 'columns': ('Nivel750A',)},
    {'key': 'nivel_750b', 'name': 'Tanque 750 B', 'type': 'Nivel 750', 'columns': ('Nivel750B',)},
    {'key': 'nivel_500', 'name': 'Tanque 500', 'type': 'Nivel 500', 'columns': ('Nivel500',)},
    {'key': 'nivel_750c', 'name': 'Tanque 750 C', 'type': 'Nivel 750', 'columns': ('Nivel750C', 'Nivel750c')},
    {'key': 'nivel_750d', 'name': 'Tanque 750 D', 'type': 'Nivel 750', 'columns': ('Nivel750D',)},
    {'key': 'nivel_dura', 'name': 'Tanque agua dura', 'type': 'Agua dura', 'columns': ('NivelDura',)},
    {'key': 'nivel_suave', 'name': 'Tanque agua suave', 'type': 'Agua suave', 'columns': ('NivelSuave',)},
    {'key': 'nivel_recuperada', 'name': 'Tanque agua recuperada', 'type': 'Agua recuperada', 'columns': ('NivelRecuperada',)},
    {'key': 'nivel_salmuera', 'name': 'Tanque salmuera', 'type': 'Salmuera', 'columns': ('NivelSalmuera', 'NivelSalmuer')},
]


def _row_to_dict(row: Any) -> dict[str, Any] | None:
    if row is None:
        return None
    data = dict(row._mapping)
    return {str(k).lower(): v for k, v in data.items()}


def _first(row: dict[str, Any] | None, *names: str, default: Any = None) -> Any:
    if not row:
        return default
    for name in names:
        key = name.lower()
        if key in row and row[key] is not None:
            return row[key]
    return default


def _num(value: Any, default: float = 0.0) -> float:
    if value is None or value == '':
        return default
    try:
        return float(str(value).replace(',', '').strip())
    except (TypeError, ValueError):
        return default


def _amps_from_quality(value: Any) -> float | None:
    """Return well amperage from the ARCA quality column.

    Most well sensors store quality as amps * 100, for example 1260 ->
    12.60 A. Some sensors, including Pozo 03 / Viveros, already store the
    amperage as a decimal value, for example 30.87 -> 30.87 A.

    This conversion is intentionally used only for well records. Lines and
    tanks keep quality as the raw database value and do not expose amps.
    """
    if value is None or value == '':
        return None
    quality = _num(value, 0)
    if quality <= 0:
        return None

    # Mixed source format: encoded integer-like values are amps * 100,
    # decimal amp values are already in amperes.
    amps = quality / 100.0 if quality >= 100 else quality
    return round(amps, 2)


def _iso(value: Any) -> str | None:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value.isoformat()
    if value in (None, ''):
        return None
    localized = source_iso_local(value, 'America/Mexico_City')
    return localized or str(value)


def _coerce_date(value: Any) -> date | None:
    if value is None or value == '':
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except (TypeError, ValueError):
        return None


def _date_bounds(start_date: Any = None, end_date: Any = None) -> tuple[date | None, date | None]:
    start = _coerce_date(start_date)
    end = _coerce_date(end_date)
    if start and end and start > end:
        start, end = end, start
    return start, end


def _where_for_dates(start_date: Any = None, end_date: Any = None) -> tuple[str, dict[str, Any]]:
    start, end = _date_bounds(start_date, end_date)
    clauses = []
    params: dict[str, Any] = {}
    if start:
        clauses.append('Time_Stamp >= :start_date')
        params['start_date'] = local_to_source_naive(datetime.combine(start, time.min))
    if end:
        clauses.append('Time_Stamp < :end_date_exclusive')
        params['end_date_exclusive'] = local_to_source_naive(datetime.combine(end + timedelta(days=1), time.min))
    where_sql = f" WHERE {' AND '.join(clauses)}" if clauses else ''
    return where_sql, params


def _latest_row(session, table_name: str, start_date: Any = None, end_date: Any = None) -> dict[str, Any] | None:
    where_sql, params = _where_for_dates(start_date, end_date)
    result = session.execute(text(f'SELECT TOP 1 * FROM {table_name}{where_sql} ORDER BY Time_Stamp DESC'), params)
    return _row_to_dict(result.first())


def _sql_now(session) -> datetime:
    """Return SQL Server current time for timestamp freshness comparisons.

    BOS ``Time_Stamp`` values are generated by SQL Server. Comparing them with
    Python's UTC clock can mark recent Durango readings as stale when the
    database uses local plant/server time. Use ``GETDATE()`` when available and
    fall back to the application clock only if the probe fails.
    """
    try:
        value = session.execute(text('SELECT GETDATE()')).scalar()
        parsed = _parse_datetime(value)
        if parsed:
            return parsed
    except SQLAlchemyError as exc:
        logger.warning('water_bos could not read SQL Server GETDATE(), using app clock: %s', _short_sql_error(exc))
    except Exception as exc:
        logger.warning('water_bos could not parse SQL Server GETDATE(), using app clock: %s', exc)
    return datetime.utcnow()


def _range_rows(session, table_name: str, start_date: Any = None, end_date: Any = None, max_rows: int = 240) -> list[dict[str, Any]]:
    """Return BOS rows for graphing, ordered ascending by Time_Stamp."""
    if table_name in _OPTIONAL_BOS_TABLES and not _optional_table_available(session, table_name):
        return []

    start, end = _date_bounds(start_date, end_date)
    max_rows = max(1, min(int(max_rows or 240), 2000))
    params: dict[str, Any] = {}
    if start or end:
        clauses = []
        if start:
            clauses.append('Time_Stamp >= :start_date')
            params['start_date'] = local_to_source_naive(datetime.combine(start, time.min))
        if end:
            clauses.append('Time_Stamp < :end_date_exclusive')
            params['end_date_exclusive'] = local_to_source_naive(datetime.combine(end + timedelta(days=1), time.min))
        where_sql = f" WHERE {' AND '.join(clauses)}"
        sql = f"""
            SELECT TOP ({max_rows}) *
            FROM {table_name}
            {where_sql}
            ORDER BY Time_Stamp ASC
        """
    else:
        sql = f"""
            SELECT * FROM (
                SELECT TOP ({max_rows}) *
                FROM {table_name}
                ORDER BY Time_Stamp DESC
            ) recent_rows
            ORDER BY Time_Stamp ASC
        """
    try:
        result = session.execute(text(sql), params)
        rows = [_row_to_dict(row) for row in result.fetchall() if row is not None]
        logger.info('water_bos range rows table=%s rows=%s', table_name, len(rows))
        if not rows:
            logger.info('water_bos table returned 0 rows for range: %s', table_name)
        return rows
    except SQLAlchemyError as exc:
        if table_name in _OPTIONAL_BOS_TABLES:
            _warn_optional_source_once(table_name, f'consulta de rango omitida: {_short_sql_error(exc)}')
        else:
            logger.exception('water_bos SQL error reading range table=%s: %s', table_name, exc)
        return []


def _first_row(session, table_name: str, start_date: Any = None, end_date: Any = None) -> dict[str, Any] | None:
    where_sql, params = _where_for_dates(start_date, end_date)
    result = session.execute(text(f'SELECT TOP 1 * FROM {table_name}{where_sql} ORDER BY Time_Stamp ASC'), params)
    return _row_to_dict(result.first())



def _safe_latest_row(session, table_name: str, start_date: Any = None, end_date: Any = None, error_counter: dict[str, int] | None = None) -> dict[str, Any] | None:
    if table_name in _OPTIONAL_BOS_TABLES and not _optional_table_available(session, table_name):
        return None

    try:
        row = _latest_row(session, table_name, start_date, end_date)
        logger.info('water_bos latest row table=%s rows=%s', table_name, 1 if row else 0)
        if not row:
            logger.info('water_bos table returned 0 latest rows: %s', table_name)
        return row
    except SQLAlchemyError as exc:
        if table_name in _OPTIONAL_BOS_TABLES:
            _warn_optional_source_once(table_name, f'ultima lectura omitida: {_short_sql_error(exc)}')
        else:
            if error_counter is not None:
                error_counter['count'] = int(error_counter.get('count') or 0) + 1
            logger.exception('water_bos SQL error reading latest table=%s: %s', table_name, exc)
        return None


def _safe_first_row(session, table_name: str, start_date: Any = None, end_date: Any = None, error_counter: dict[str, int] | None = None) -> dict[str, Any] | None:
    if table_name in _OPTIONAL_BOS_TABLES and not _optional_table_available(session, table_name):
        return None

    try:
        row = _first_row(session, table_name, start_date, end_date)
        logger.info('water_bos first row table=%s rows=%s', table_name, 1 if row else 0)
        if not row:
            logger.info('water_bos table returned 0 first rows: %s', table_name)
        return row
    except SQLAlchemyError as exc:
        if table_name in _OPTIONAL_BOS_TABLES:
            _warn_optional_source_once(table_name, f'primera lectura omitida: {_short_sql_error(exc)}')
        else:
            if error_counter is not None:
                error_counter['count'] = int(error_counter.get('count') or 0) + 1
            logger.exception('water_bos SQL error reading first table=%s: %s', table_name, exc)
        return None


def _level_column_value(row: dict[str, Any] | None, column_names: tuple[str, ...]) -> tuple[str | None, float | None]:
    if not row:
        return None, None
    for column_name in column_names:
        key = column_name.lower()
        if key in row and row[key] is not None:
            return column_name, _num(row[key])
    return None, None


def _level_status(level_value: float | None) -> tuple[str, str]:
    if level_value is None:
        return 'Sin lectura', 'communication'
    if level_value <= 0:
        return 'Sin nivel', 'warning'
    return 'Con lectura', 'normal'


def _clamped_fill_pct(level_value: float | None) -> float:
    if level_value is None:
        return 0.0
    return max(0.0, min(100.0, _num(level_value)))


def _tank_level_columns_metadata() -> list[dict[str, Any]]:
    return [
        {
            'key': item['key'],
            'name': item['name'],
            'type': item['type'],
            'columns': list(item['columns']),
        }
        for item in TANK_LEVEL_COLUMNS
    ]


def _build_tank_level_readings(niveles_row: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not niveles_row:
        return []
    updated = _iso(_first(niveles_row, 'time_stamp', 'timestamp')) or 'Dato SQL Server'
    readings: list[dict[str, Any]] = []
    for index, item in enumerate(TANK_LEVEL_COLUMNS):
        source_column, level_value = _level_column_value(niveles_row, tuple(item['columns']))
        status, status_type = _level_status(level_value)
        readings.append({
            'id': f"nivel-tanque-{index + 1}",
            'name': item['name'],
            'label': item['name'],
            'type': item['type'],
            'source_column': source_column or item['columns'][0],
            'level_key': item['key'],
            'level_value': level_value,
            'level_unit': 'nivel',
            # Campos legacy para consumidores existentes de tank_levels. No representan
            # volumen calculado; el valor real disponible en BD es el nivel crudo.
            'volume_m3': 0,
            'height_m': _num(level_value),
            'capacity_m3': 0,
            'fill_pct': _clamped_fill_pct(level_value),
            'status': status,
            'statusType': status_type,
            'active': bool(level_value and level_value > 0),
            'updated': updated,
            'ultima_lectura': updated,
            'source_table': 'dbo.NIVELES_BOS',
            'diagnosis': f"Lectura desde dbo.NIVELES_BOS.{source_column or item['columns'][0]}",
        })
    return readings


def _build_tank_level_history(rows: list[dict[str, Any]], period: str = 'hourly') -> list[dict[str, Any]]:
    history: list[dict[str, Any]] = []
    for row in rows:
        timestamp_value = _first(row, 'time_stamp', 'timestamp')
        bucket = _bucket_iso(timestamp_value, period)
        point: dict[str, Any] = {
            'timestamp': _iso(timestamp_value),
            'bucket': bucket,
            'aggregation': period,
        }
        has_value = False
        for item in TANK_LEVEL_COLUMNS:
            _source_column, level_value = _level_column_value(row, tuple(item['columns']))
            if level_value is not None:
                point[item['key']] = level_value
                has_value = True
        if has_value:
            history.append(point)
    return history


def _sp_datetime_bounds(start_date: Any = None, end_date: Any = None) -> tuple[str | None, str | None]:
    start, end = _date_bounds(start_date, end_date)
    if not start and not end:
        today = datetime.utcnow().date()
        start = today
        end = today
    if start and not end:
        end = start
    if end and not start:
        start = end
    return (
        f'{start.isoformat()} 00:00:00' if start else None,
        f'{end.isoformat()} 23:59:59.999999' if end else None,
    )


def _period_from_bounds(start_date: Any = None, end_date: Any = None) -> str:
    start, end = _date_bounds(start_date, end_date)
    if start and end:
        days = (end - start).days + 1
        if days <= 1:
            return 'hourly'
        if days > 370:
            return 'monthly'
        return 'daily'
    return 'hourly'


def _normalize_period(period: Any = None, start_date: Any = None, end_date: Any = None) -> str:
    value = str(period or '').strip().lower()
    if value in {'hourly', 'daily', 'monthly'}:
        return value
    return _period_from_bounds(start_date, end_date)


def _energy_water_rows(
    session,
    period: str = 'daily',
    start_date: Any = None,
    end_date: Any = None,
    well_id: int | None = None,
    sensor_id: int | None = None,
) -> list[dict[str, Any]]:
    if not _sql_object_exists(session, 'iot.sp_get_energy_water'):
        return []

    start_dt, end_dt = _sp_datetime_bounds(start_date, end_date)
    try:
        sql = text("""
            EXEC iot.sp_get_energy_water
                @period = :period,
                @well_id = :well_id,
                @sensor_id = :sensor_id,
                @start_date = :start_date,
                @end_date = :end_date
        """)
        result = session.execute(sql, {
            'period': period,
            'well_id': well_id,
            'sensor_id': sensor_id,
            'start_date': start_dt,
            'end_date': end_dt,
        })
        return [{str(k).lower(): v for k, v in dict(row).items()} for row in result.mappings().all()]
    except SQLAlchemyError as exc:
        logger.exception('water_bos SQL error executing iot.sp_get_energy_water: %s', exc)
        return []


def _energy_water_summary(rows: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    summary: dict[int, dict[str, Any]] = {}
    for row in rows:
        try:
            well_id = int(row.get('well_id'))
        except (TypeError, ValueError):
            continue
        item = summary.setdefault(well_id, {
            'well_id': well_id,
            'kwh_value': 0.0,
            'm3_value': 0.0,
            'energy_sensor_id': None,
            'water_sensor_id': None,
            'last_bucket': None,
            'rows': 0,
        })
        item['kwh_value'] += _num(row.get('kwh_value'))
        item['m3_value'] += _num(row.get('m3_value'))
        item['energy_sensor_id'] = row.get('energy_sensor_id') or item.get('energy_sensor_id')
        item['water_sensor_id'] = row.get('water_sensor_id') or item.get('water_sensor_id')
        bucket = row.get('bucket')
        if bucket is not None:
            item['last_bucket'] = bucket
        item['rows'] += 1
    for item in summary.values():
        m3 = _num(item.get('m3_value'))
        kwh = _num(item.get('kwh_value'))
        item['kwh_por_m3'] = round(kwh / m3, 4) if m3 else None
    return summary


def _well_energy_sensor_ids(pozo_row: dict[str, Any] | None) -> list[int]:
    """Return the energy sensor IDs used by well cards."""
    return [
        int(slot['energy_sensor_id'])
        for slot in _discover_bos_well_slots(pozo_row)
        if slot.get('energy_sensor_id')
    ]


def _latest_quality_by_sensor(session, sensor_ids: list[int], start_date: Any = None, end_date: Any = None) -> dict[int, float]:
    """Read the latest raw quality directly from iot.readings_minute.

    Some BOS views/columns can expose quality rounded or truncated. The
    readings_minute table is the source used by SCADA and keeps the amperage
    precision for wells like Pozo 03 / Viveros (for example 30.87 A).
    """
    unique_ids = sorted({int(sensor_id) for sensor_id in sensor_ids if sensor_id})
    if not unique_ids:
        return {}
    if not _sql_object_exists(session, 'iot.readings_minute'):
        return {}

    params: dict[str, Any] = {f'sid_{i}': sensor_id for i, sensor_id in enumerate(unique_ids)}
    id_list = ', '.join(f':sid_{i}' for i in range(len(unique_ids)))
    start, end = _date_bounds(start_date, end_date)
    date_clauses: list[str] = []
    if start:
        date_clauses.append('r.ts_local >= :start_date')
        params['start_date'] = start.isoformat()
    if end:
        date_clauses.append('r.ts_local < DATEADD(day, 1, CAST(:end_date AS date))')
        params['end_date'] = end.isoformat()
    date_sql = (' AND ' + ' AND '.join(date_clauses)) if date_clauses else ''

    try:
        rows = session.execute(text(f"""
            WITH latest AS (
                SELECT
                    r.sensor_id,
                    CAST(r.quality AS float) AS quality,
                    ROW_NUMBER() OVER (
                        PARTITION BY r.sensor_id
                        ORDER BY COALESCE(r.ts_local, r.ts_minute, r.inserted_at) DESC
                    ) AS rn
                FROM iot.readings_minute r
                WHERE r.sensor_id IN ({id_list})
                  AND r.quality IS NOT NULL
                  {date_sql}
            )
            SELECT sensor_id, quality
            FROM latest
            WHERE rn = 1
        """), params).mappings().all()
    except SQLAlchemyError:
        return {}

    result: dict[int, float] = {}
    for row in rows:
        try:
            result[int(row['sensor_id'])] = float(row['quality'])
        except (TypeError, ValueError, KeyError):
            continue
    return result


def _sensor_catalog(session) -> dict[int, dict[str, Any]]:
    cached = _cache_get(_SENSOR_CATALOG_CACHE, 'iot.sensors')
    if cached is not None:
        return cached

    if not _sql_objects_available(session, ('iot.sensors', 'iot.sensor_types', 'iot.units')):
        return _cache_get_stale(_SENSOR_CATALOG_CACHE, 'iot.sensors') or {}

    try:
        rows = session.execute(text('''
            SELECT
                s.sensor_id,
                s.external_code,
                s.name,
                s.location,
                s.active,
                st.code AS sensor_type_code,
                st.description AS sensor_type_description,
                u.symbol AS unit_symbol,
                s.metadata
            FROM iot.sensors s
            LEFT JOIN iot.sensor_types st ON s.sensor_type_id = st.sensor_type_id
            LEFT JOIN iot.units u ON st.default_unit_id = u.unit_id
        ''')).mappings().all()
    except SQLAlchemyError as exc:
        logger.exception('water_bos SQL error reading sensor catalog: %s', exc)
        return _cache_get_stale(_SENSOR_CATALOG_CACHE, 'iot.sensors') or {}

    catalog: dict[int, dict[str, Any]] = {}
    for item in rows:
        try:
            catalog[int(item['sensor_id'])] = dict(item)
        except (TypeError, ValueError, KeyError):
            continue
    logger.info('water_bos SQL connected: iot.sensors rows=%s mapped=%s', len(rows), len(catalog))
    if not rows:
        logger.info('water_bos table returned 0 rows: iot.sensors')
    return _cache_set(_SENSOR_CATALOG_CACHE, catalog, 'iot.sensors')


def _well_locations(session) -> dict[int, dict[str, Any]]:
    cached = _cache_get(_WELL_LOCATIONS_CACHE, 'iot.wells_monitoring')
    if cached is not None:
        return cached

    if not _sql_object_exists(session, 'iot.wells_monitoring'):
        return _cache_get_stale(_WELL_LOCATIONS_CACHE, 'iot.wells_monitoring') or {}

    try:
        rows = session.execute(text('''
            SELECT
                well_id,
                well_name,
                status,
                latitude,
                longitude,
                altitude_masl,
                municipality_state,
                flow_lps_current,
                dynamic_level_m,
                last_update,
                ph_current,
                chlorine_mgL_current
            FROM iot.wells_monitoring
        ''')).mappings().all()
    except SQLAlchemyError as exc:
        logger.exception('water_bos SQL error reading well locations: %s', exc)
        return _cache_get_stale(_WELL_LOCATIONS_CACHE, 'iot.wells_monitoring') or {}

    locations: dict[int, dict[str, Any]] = {}
    for item in rows:
        try:
            locations[int(item['well_id'])] = dict(item)
        except (TypeError, ValueError, KeyError):
            continue
    logger.info('water_bos SQL connected: iot.wells_monitoring rows=%s mapped=%s', len(rows), len(locations))
    if not rows:
        logger.info('water_bos table returned 0 rows: iot.wells_monitoring')
    return _cache_set(_WELL_LOCATIONS_CACHE, locations, 'iot.wells_monitoring')


def _bos_value(row: dict[str, Any] | None, prefix: str, index: int, field: str, default: Any = None) -> Any:
    base = f'{prefix}_{index}'
    bracket_base = f'{prefix}[{index}]'
    bracket_fields = [field]
    if field == 'instant_value':
        bracket_fields.extend(['instant', 'value'])
    if field == 'total_value':
        bracket_fields.extend(['total', 'totalizer', 'accumulated'])
    if field == 'sensor_id':
        bracket_fields.extend(['id', 'sensor'])

    candidates = [
        f'{base}_{field}',
        f'{base}_{field}_value',
        f'{base}_{field}_val',
    ]
    for bracket_field in bracket_fields:
        candidates.extend([
            f'{bracket_base}.{bracket_field}',
            f'${bracket_base}.{bracket_field}',
        ])
    if field == 'instant_value':
        candidates.extend([f'{base}_instant', f'{base}_value', base])
    if field == 'total_value':
        candidates.extend([f'{base}_total', f'{base}_totalizer', f'{base}_accumulated'])
    if field == 'sensor_id':
        candidates.extend([f'{base}_id', f'{base}_sensor'])
    if field == 'quality':
        candidates.extend([f'{base}_quality_code'])
    return _first(row, *candidates, default=default)


def _build_sensor(sensor_id: int, catalog: dict[int, dict[str, Any]], role: str, value: float, well_id: str | None = None) -> dict[str, Any]:
    meta = catalog.get(sensor_id, {})
    return {
        'id': str(sensor_id),
        'name': str(meta.get('name') or meta.get('external_code') or role),
        'type': role,
        'unit': str(meta.get('unit_symbol') or ('kWh' if 'ENERGY' in role.upper() else 'L/s')),
        'value': value,
        'well_id': well_id,
    }


def _status_from_values(
    flow_out: float | None,
    flow_in: float | None,
    amps: float | None = None,
) -> tuple[bool, str, str, str, str]:
    # La ausencia de una lectura no debe convertirse en cero en el payload.
    # Solo se normaliza aquí para decidir si el equipo está activo. Esto permite
    # que Durango mantenga FLOW_IN deshabilitado sin provocar TypeError.
    flow_out_value = _num(flow_out, 0)
    flow_in_value = _num(flow_in, 0)
    amps_value = _num(amps, 0)
    active = max(flow_out_value, flow_in_value) > 0 or amps_value > 0

    # En ARCA el campo quality de los pozos representa amperaje * 100,
    # no calidad de comunicacion. Por eso no se usa para marcar
    # "Sin comunicacion". Si hay flujo o amperaje real, el pozo esta encendido.
    if active:
        return True, 'Encendido', 'normal', 'Normal', 'normal'

    return False, 'Apagado', 'idle', 'Normal', 'normal'


def _reading_freshness(value: Any, stale_minutes: int = 60, now_value: Any = None) -> tuple[bool, str, str, int | None]:
    """Classify whether the BOS timestamp is recent enough for live operation.

    Durango may receive valid values from BOS with an old timestamp. Those
    values must remain visible, but the UI/report should not present them as
    current. Freshness is compared against SQL Server ``GETDATE()`` when
    available, because BOS timestamps are produced in SQL Server time.
    """
    dt_value = source_to_local_naive(value, 'America/Mexico_City')
    if not dt_value:
        return False, 'Sin timestamp BOS', 'communication', None
    try:
        now = source_to_local_naive(now_value, 'America/Mexico_City') if now_value is not None else None
        if not now:
            now = local_now_naive()
        if dt_value.tzinfo and not now.tzinfo:
            now = now.replace(tzinfo=dt_value.tzinfo)
        elif now.tzinfo and not dt_value.tzinfo:
            now = now.replace(tzinfo=None)
        if dt_value > now + timedelta(minutes=5):
            return False, 'Normal', 'normal', 0
        age_minutes = int((now - dt_value).total_seconds() // 60)
    except Exception:
        return False, 'Normal', 'normal', None
    if age_minutes > stale_minutes:
        return True, 'Última comunicación antigua', 'warning', age_minutes
    return False, 'Normal', 'normal', age_minutes


def _source_freshness(timestamp_value: Any, sql_now: Any = None, stale_minutes: int = 60) -> dict[str, Any]:
    """Return a reusable freshness descriptor calculated against SQL Server time.

    All Durango BOS modules compare ``Time_Stamp`` with ``SELECT GETDATE()``
    obtained from the same SQL Server, never with the Python/container clock.
    This avoids false "Lectura no reciente" warnings caused by time-zone drift.
    """
    is_stale, label, label_type, age_minutes = _reading_freshness(
        timestamp_value, stale_minutes=stale_minutes, now_value=sql_now
    )
    return {
        'updated_at': _iso(timestamp_value) or '',
        'sql_now': _iso(sql_now) or '',
        'reading_stale': is_stale,
        'reading_age_minutes': age_minutes,
        'label': label,
        'type': label_type,
    }


def _latest_timestamp_value(*values: Any) -> Any:
    parsed: list[tuple[datetime, Any]] = []
    for value in values:
        dt_value = source_to_local_naive(value, 'America/Mexico_City')
        if dt_value:
            parsed.append((dt_value, value))
    if not parsed:
        return None
    return max(parsed, key=lambda item: item[0])[1]


def _apply_freshness_to_status(
    active: bool,
    status: str,
    status_type: str,
    communication: str,
    communication_type: str,
    timestamp_value: Any,
    now_value: Any = None,
) -> tuple[bool, str, str, str, str, bool, int | None]:
    freshness = _source_freshness(timestamp_value, now_value)
    if freshness['reading_stale']:
        return active, 'Lectura no reciente', 'warning', str(freshness['label']), str(freshness['type']), True, freshness['reading_age_minutes']
    return active, status, status_type, communication, communication_type, False, freshness['reading_age_minutes']


def _optional_num(value: Any) -> float | None:
    if value is None or value == '':
        return None
    try:
        return float(str(value).replace(',', '').strip())
    except (TypeError, ValueError):
        return None


def _max_optional(*values: float | None) -> float | None:
    valid = [value for value in values if value is not None]
    return max(valid) if valid else None


def _period_delta_from_totalizers(current_value: Any, start_value: Any, has_period: bool) -> tuple[float, bool]:
    """Return BOS totalizer delta only when both readings are real values.

    This allows plants without iot.sp_get_energy_water to use BOS period data
    when totalizers exist, without treating missing totalizers as a false 0.
    """
    if not has_period:
        return 0.0, False
    current = _optional_num(current_value)
    start = _optional_num(start_value)
    if current is None or start is None:
        return 0.0, False
    if current < start:
        return 0.0, False
    return _safe_delta(current, start), True


def _optional_int(value: Any) -> int | None:
    number = _optional_num(value)
    if number is None:
        return None
    try:
        return int(number)
    except (TypeError, ValueError):
        return None


def _new_bos_well_group_base(sensor_id: int | None, role: str) -> int | None:
    """Infer new-plant BOS well groups that use N0/N1/N2 sensor IDs."""
    if not sensor_id:
        return None
    last_digit = sensor_id % 10
    if role == 'energy' and last_digit == 0:
        return sensor_id
    if role == 'flow_out' and last_digit == 1:
        return sensor_id - 1
    if role == 'flow_in' and last_digit == 2:
        return sensor_id - 2
    return None


def _has_bos_well_slot_data(pozo_row: dict[str, Any] | None, index: int) -> bool:
    if not pozo_row:
        return False
    for prefix in ('POZO_ENERGY_TOTAL', 'POZO_FLOW_OUT', 'POZO_FLOW_IN'):
        for field in ('sensor_id', 'instant_value', 'total_value', 'quality'):
            if _bos_value(pozo_row, prefix, index, field, None) is not None:
                return True
    return False


def _discover_bos_well_slots(pozo_row: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Discover well sensor groups from dbo.SensorsBOS_Pozo when present.

    The original ARCA plant uses the static 101-110 / 1001-1452 mapping.
    New BOS-only plants can expose explicit sensor IDs per slot, for example
    8000/8001/8002 and 8050/8051/8052. When the row carries explicit
    BOS sensor IDs, those slots are used instead of requiring iot.sensors or
    iot.sp_get_energy_water to be configured.
    """
    # Durango quedó fijado a los dos FLOW_OUT confirmados. No se descubren ni
    # publican FLOW_IN duplicados aunque la tabla conserve columnas heredadas.
    return [
        {
            'index': index,
            'numero': index + 1,
            'well_id': WELL_IDS[index],
            'name': WELL_NAMES[index],
            'energy_sensor_id': 0,
            'flow_out_sensor_id': FLOW_OUT_SENSOR_IDS[index],
            'flow_in_sensor_id': 0,
            'source': 'durango_confirmed_mapping',
        }
        for index in range(len(WELL_IDS))
    ]

def _build_wells(
    pozo_row: dict[str, Any] | None,
    catalog: dict[int, dict[str, Any]],
    locations: dict[int, dict[str, Any]],
    energy_water: dict[int, dict[str, Any]] | None = None,
    pozo_start_row: dict[str, Any] | None = None,
    has_period: bool = False,
    latest_quality_by_sensor: dict[int, float] | None = None,
    well_slots: list[dict[str, Any]] | None = None,
    sql_now: Any = None,
) -> list[dict[str, Any]]:
    wells: list[dict[str, Any]] = []
    slots = well_slots or _discover_bos_well_slots(pozo_row)
    for slot in slots:
        index = int(slot.get('index', 0))
        numero = int(slot.get('numero', index + 1))
        well_id = int(slot.get('well_id') or numero)
        energy_sensor_id = int(slot.get('energy_sensor_id') or ENERGY_SENSOR_IDS[min(index, len(ENERGY_SENSOR_IDS) - 1)])
        flow_out_sensor_id = int(slot.get('flow_out_sensor_id') or FLOW_OUT_SENSOR_IDS[min(index, len(FLOW_OUT_SENSOR_IDS) - 1)])
        flow_in_sensor_id = int(slot.get('flow_in_sensor_id') or FLOW_IN_SENSOR_IDS[min(index, len(FLOW_IN_SENSOR_IDS) - 1)])

        raw_energy_total = _bos_value(pozo_row, 'POZO_ENERGY_TOTAL', index, 'total_value', None)
        raw_energy_instant = _bos_value(pozo_row, 'POZO_ENERGY_TOTAL', index, 'instant_value', None)
        raw_flow_out = _bos_value(pozo_row, 'POZO_FLOW_OUT', index, 'instant_value', None)
        raw_flow_out_total = _bos_value(pozo_row, 'POZO_FLOW_OUT', index, 'total_value', None)
        raw_start_energy_total = _bos_value(pozo_start_row, 'POZO_ENERGY_TOTAL', index, 'total_value', None)
        raw_start_flow_out_total = _bos_value(pozo_start_row, 'POZO_FLOW_OUT', index, 'total_value', None)
        updated_value = _first(pozo_row, 'time_stamp', 'timestamp')
        updated_local = source_to_local_naive(updated_value, 'America/Mexico_City')
        if updated_local is None or updated_local < DURANGO_SCADA_CUTOVER_LOCAL:
            raw_flow_out = None
            raw_flow_out_total = None

        energy_total = _num(raw_energy_total, 0)
        energy_instant = _num(raw_energy_instant, 0)
        flow_out = normalize_flow_lps(flow_out_sensor_id, raw_flow_out)
        flow_in = None
        flow_out_total = _optional_num(raw_flow_out_total)
        flow_out_delta_m3, flow_out_delta_available = _period_delta_from_totalizers(raw_flow_out_total, raw_start_flow_out_total, has_period)
        totalizer_delta_m3 = flow_out_delta_m3
        totalizer_delta_available = flow_out_delta_available
        energy_delta_kwh, energy_delta_available = _period_delta_from_totalizers(raw_energy_total, raw_start_energy_total, has_period)
        quality_energy = _bos_value(pozo_row, 'POZO_ENERGY_TOTAL', index, 'quality', 0)
        quality_out = _bos_value(pozo_row, 'POZO_FLOW_OUT', index, 'quality', 0)
        # Amperaje de pozos: tomar primero el quality exacto desde
        # iot.readings_minute para conservar decimales (ej. Pozo 03 = 30.87 A).
        # Si no existe, usar el dato expuesto por dbo.SensorsBOS_Pozo.
        direct_quality = (latest_quality_by_sensor or {}).get(energy_sensor_id)
        amps = (
            _amps_from_quality(direct_quality)
            or _amps_from_quality(quality_energy)
            or _amps_from_quality(quality_out)
        )
        active, status, status_type, comm, comm_type = _status_from_values(flow_out, flow_in, amps)
        updated_iso = _iso(updated_value) or 'Dato SQL Server'
        active, status, status_type, comm, comm_type, reading_stale, reading_age_minutes = _apply_freshness_to_status(
            active, status, status_type, comm, comm_type, updated_value, sql_now
        )

        location_row = locations.get(well_id, {})
        fallback_name = str(slot.get('name') or (WELL_NAMES[index] if index < len(WELL_NAMES) else f'POZO {numero}')).strip()
        registered_name = str(location_row.get('well_name') or fallback_name).strip()
        municipality_state = str(location_row.get('municipality_state') or '').strip()
        name = registered_name
        # En la columna "Ubicación" se muestra el nombre operativo con el que
        # el pozo está dado de alta con su nombre operativo confirmado.
        # El municipio/estado se conserva aparte para no perder ese dato.
        location = registered_name
        totalizer = flow_out_total
        ew = (energy_water or {}).get(well_id, {})
        sp_m3 = _optional_num(ew.get('m3_value')) if ew else None
        sp_kwh = _optional_num(ew.get('kwh_value')) if ew else None
        # El periodo se usa solo para graficas/reportes. Primero se respeta el SP.
        # Si el SP no trae filas, se usa BOS solo cuando existen totalizadores
        # inicial/final reales; no se convierte una lectura instantanea en m3/kWh.
        period_m3 = sp_m3 if sp_m3 is not None else (totalizer_delta_m3 if totalizer_delta_available else 0)
        period_kwh = sp_kwh if sp_kwh is not None else (energy_delta_kwh if energy_delta_available else 0)
        period_source = 'iot.sp_get_energy_water' if ew else ('bos_totalizer_delta' if totalizer_delta_available or energy_delta_available else 'bos_instant_only')
        period_kwh_m3 = ew.get('kwh_por_m3')
        if period_kwh_m3 is None and period_m3:
            period_kwh_m3 = round(period_kwh / period_m3, 4) if period_kwh else None
        sensors = [
            _build_sensor(energy_sensor_id, catalog, 'ENERGY_TOTAL', energy_total or energy_instant, str(well_id)),
            _build_sensor(flow_out_sensor_id, catalog, 'FLOW_OUT', flow_out, str(well_id)),
        ]
        wells.append({
            'id': f'pozo-{numero}',
            # Canonical operational identity used to merge the current BOS row
            # with the period record. Without this field the current and period
            # versions of the same well can be rendered as separate cards.
            'sensor_id': flow_out_sensor_id,
            'well_id': str(well_id),
            'numero': numero,
            'name': name,
            'nombre': name,
            'ubicacion': location,
            'municipio_estado': municipality_state,
            'entry_m3': period_m3,
            'supply_hours': 0,
            'active': active,
            'status': status,
            'statusType': status_type,
            'estado_comunicacion': comm,
            'communicationType': comm_type,
            'kwh': period_kwh or energy_total or energy_instant,
            'dailyKwh': period_kwh or energy_total or energy_instant,
            'period_m3': period_m3,
            'period_kwh': period_kwh,
            'period_delta_m3': totalizer_delta_m3 if totalizer_delta_available else 0,
            'period_delta_kwh': energy_delta_kwh if energy_delta_available else 0,
            'period_source': period_source,
            'period_data_available': bool(ew or totalizer_delta_available or energy_delta_available),
            'kwh_por_m3': period_kwh_m3,
            'totalizador_m3': totalizer,
            'flujo_entrada': flow_in,
            'flujo_salida': flow_out,
            'flow': flow_out,
            'flow_unit': flow_unit_for_sensor(flow_out_sensor_id),
            'updated': updated_iso,
            'ultima_lectura': updated_iso,
            'reading_stale': reading_stale,
            'reading_age_minutes': reading_age_minutes,
            'latitude': location_row.get('latitude'),
            'longitude': location_row.get('longitude'),
            'dynamic_level_m': location_row.get('dynamic_level_m'),
            'ph_current': location_row.get('ph_current'),
            'chlorine_mgL_current': location_row.get('chlorine_mgL_current'),
            'quality': _num(direct_quality if direct_quality is not None else quality_energy, 0),
            'amps': amps,
            'amperaje': amps,
            'energy_sensor_id': int(_num(ew.get('energy_sensor_id'), energy_sensor_id)),
            'water_sensor_id': int(_num(ew.get('water_sensor_id'), flow_out_sensor_id)),
            'flow_out_sensor_id': flow_out_sensor_id,
            'flow_in_sensor_id': None,
            'bos_sensor_mapping_source': slot.get('source'),
            'sensors': sensors,
            'energy_water_source': 'iot.sp_get_energy_water' if ew else None,
            'diagnosis': 'Estado y flujo desde monitoreo operativo; consumo diario desde fuente energetica bajo demanda.' if ew else ('Lectura y periodo desde monitoreo operativo con delta de totalizadores.' if period_source == 'bos_totalizer_delta' else 'Lectura instantanea desde monitoreo operativo; volumen de periodo/energia no disponible sin totalizadores validos o fuente energetica confirmada.'),
        })
    return wells


def _line_slot_indices(row: dict[str, Any] | None) -> list[int]:
    """Return only the five confirmed Durango line slots.

    SQL Server can expose inherited LINEA_FLOW_IN identifiers. Durango is
    locked by slot to 2002, 2004, 2006, 2008 and 2010; metadata stored in the
    row cannot reorder Línea 2 and Línea 3.
    """
    if not row:
        return []
    indices: list[int] = []
    for index in CONFIRMED_LINE_SLOT_INDICES:
        sensor_id = _optional_int(_bos_value(row, 'LINEA_FLOW_IN', index, 'sensor_id', None))
        raw_flow = _bos_value(row, 'LINEA_FLOW_IN', index, 'instant_value', None)
        raw_total = _bos_value(row, 'LINEA_FLOW_IN', index, 'total_value', None)
        raw_quality = _bos_value(row, 'LINEA_FLOW_IN', index, 'quality', None)
        has_reading = sensor_id is not None or raw_flow is not None or raw_total is not None or raw_quality is not None
        if not has_reading:
            continue
        expected_sensor = int(LINE_SENSOR_MAP[index]['sensor_id'])
        if sensor_id is not None and sensor_id != expected_sensor:
            logger.info(
                'water_bos ignored inherited Durango line identity index=%s reported=%s configured=%s',
                index, sensor_id, expected_sensor,
            )
        indices.append(index)
    return indices


def _line_metadata(index: int, sensor_id: int, catalog: dict[int, dict[str, Any]]) -> tuple[int, str, str]:
    configured = LINE_SENSOR_MAP[index] if index < len(LINE_SENSOR_MAP) else None
    mapped = LINE_SENSOR_BY_ID.get(sensor_id)
    if mapped:
        numero = int(mapped['numero'])
        line_name = str(mapped['name'])
    elif configured:
        numero = int(configured['numero'])
        line_name = str(configured['name'])
    else:
        numero = index + 1
        line_name = f'Línea {numero}'
    meta = catalog.get(sensor_id, {})
    sensor_name = str(meta.get('name') or meta.get('external_code') or line_name)
    return numero, line_name, sensor_name


def _build_lines(
    linea_row: dict[str, Any] | None,
    catalog: dict[int, dict[str, Any]],
    linea_start_row: dict[str, Any] | None = None,
    has_period: bool = False,
    sql_now: Any = None,
) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    for index in _line_slot_indices(linea_row):
        sensor_id = int(LINE_SENSOR_MAP[index]['sensor_id'])
        raw_flow = _bos_value(linea_row, 'LINEA_FLOW_IN', index, 'instant_value', None)
        raw_total = _bos_value(linea_row, 'LINEA_FLOW_IN', index, 'total_value', None)
        raw_start_total = _bos_value(linea_start_row, 'LINEA_FLOW_IN', index, 'total_value', None)
        updated_value = _first(linea_row, 'time_stamp', 'timestamp')
        updated_local = source_to_local_naive(updated_value, 'America/Mexico_City')
        if updated_local is None or updated_local < DURANGO_SCADA_CUTOVER_LOCAL:
            raw_flow = None
            raw_total = None
        flow = normalize_flow_lps(sensor_id, raw_flow)
        total = _optional_num(raw_total)
        period_m3, period_available = _period_delta_from_totalizers(raw_total, raw_start_total, has_period)
        quality = _num(_bos_value(linea_row, 'LINEA_FLOW_IN', index, 'quality', 0))
        numero, line_name, sensor_name = _line_metadata(index, sensor_id, catalog)
        configured = LINE_SENSOR_MAP[index]
        updated_iso = _iso(updated_value) or 'Dato SQL Server'
        has_reading = raw_flow is not None or raw_total is not None
        active, status, status_type, communication, communication_type = _flow_status(
            flow, has_reading, period_m3, period_available
        )
        active, status, status_type, communication, communication_type, reading_stale, reading_age_minutes = _apply_freshness_to_status(
            active, status, status_type, communication, communication_type, updated_value, sql_now
        )
        lines.append({
            'id': f'linea-{numero}',
            'numero': numero,
            'name': line_name,
            'nombre': line_name,
            'operational_key': configured['operational_key'],
            'module': configured['module'],
            'category': 'lavadora' if configured['module'] == 'flow' else 'linea',
            'source_key': configured['source_key'],
            'ubicacion': 'Flujos operativos' if configured['module'] == 'flow' else 'Líneas de producción',
            'sensor_name': sensor_name,
            'sensor_id': sensor_id,
            'flow_lps': flow,
            'flow_unit': flow_unit_for_sensor(sensor_id),
            'total_m3': total,
            'totalizador_m3': total,
            'period_m3': period_m3,
            'period_delta_m3': period_m3,
            'period_source': 'bos_totalizer_delta' if period_available else 'bos_instant_only',
            'period_data_available': period_available,
            'quality': quality,
            'active': active,
            'status': status,
            'statusType': status_type,
            'estado_comunicacion': communication,
            'communicationType': communication_type,
            'updated': updated_iso,
            'ultima_lectura': updated_iso,
            'reading_stale': reading_stale,
            'reading_age_minutes': reading_age_minutes,
        })
    return sorted(lines, key=lambda item: int(item.get('numero') or 0))



def _flow_status(flow: float | None, has_reading: bool, period_m3: float = 0.0, period_available: bool = False) -> tuple[bool, str, str, str, str]:
    if not has_reading:
        return False, 'Sin datos', 'communication', 'Sin comunicación', 'offline'
    if _num(flow, 0) > 0:
        return True, 'Operando', 'normal', 'En línea', 'online'
    if period_available and _num(period_m3, 0) > 0:
        return True, 'Totalizador activo', 'normal', 'En línea', 'online'
    return False, 'Sin flujo instantáneo', 'idle', 'En línea', 'online'


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if value is None or value == '':
        return None
    text_value = str(value).replace('Z', '').strip()
    try:
        return datetime.fromisoformat(text_value)
    except ValueError:
        try:
            return datetime.strptime(text_value[:19], '%Y-%m-%d %H:%M:%S')
        except ValueError:
            return None


def _bucket_datetime(value: Any, period: str = 'hourly') -> datetime | None:
    dt_value = source_to_local_naive(value, 'America/Mexico_City')
    if not dt_value:
        return None
    period = str(period or 'hourly').lower()
    if period == 'daily':
        return datetime(dt_value.year, dt_value.month, dt_value.day)
    if period == 'monthly':
        return datetime(dt_value.year, dt_value.month, 1)
    return datetime(dt_value.year, dt_value.month, dt_value.day, dt_value.hour)


def _bucket_iso(value: Any, period: str = 'hourly') -> str:
    bucket = _bucket_datetime(value, period)
    if not bucket:
        return _iso(value) or 'Dato SQL Server'
    return bucket.isoformat()


def _safe_delta(last_value: float, first_value: float) -> float:
    delta = _num(last_value) - _num(first_value)
    return round(delta, 6) if delta > 0 else 0.0



def _build_well_flow_history(rows: list[dict[str, Any]], period: str = 'hourly', well_slots: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """Aggregate BOS well history by hour for one day, or by day for multi-day ranges."""
    grouped: dict[tuple[int, str], dict[str, Any]] = {}
    slots = well_slots or _discover_bos_well_slots(rows[-1] if rows else None)
    for row in rows:
        timestamp_value = _first(row, 'time_stamp', 'timestamp')
        bucket = _bucket_iso(timestamp_value, period)
        if not bucket:
            continue
        local_stamp = source_to_local_naive(timestamp_value, 'America/Mexico_City')
        if local_stamp is None or local_stamp < DURANGO_SCADA_CUTOVER_LOCAL:
            continue
        for slot in slots:
            index = int(slot.get('index', 0))
            numero = int(slot.get('numero', index + 1))
            well_id = int(slot.get('well_id') or numero)
            flow_out = normalize_flow_lps(slot.get('flow_out_sensor_id'), _bos_value(row, 'POZO_FLOW_OUT', index, 'instant_value', None))
            flow_lps = flow_out
            energy_total = _num(_bos_value(row, 'POZO_ENERGY_TOTAL', index, 'total_value', 0))
            amps = (
                _amps_from_quality(_bos_value(row, 'POZO_ENERGY_TOTAL', index, 'quality', 0))
                or _amps_from_quality(_bos_value(row, 'POZO_FLOW_OUT', index, 'quality', 0))
                or _amps_from_quality(_bos_value(row, 'POZO_FLOW_IN', index, 'quality', 0))
            )
            flow_out_total = _optional_num(_bos_value(row, 'POZO_FLOW_OUT', index, 'total_value', None))
            totalizador = flow_out_total
            if flow_out is None and energy_total == 0 and flow_out_total is None and amps is None:
                continue
            key = (numero, bucket)
            item = grouped.setdefault(key, {
                'well_id': str(well_id),
                'numero': numero,
                'timestamp': bucket,
                'bucket': bucket,
                'aggregation': period,
                'flow_out_sum': 0.0,
                'flow_sum': 0.0,
                'amp_sum': 0.0,
                'amp_samples': 0,
                'samples': 0,
                'first_energy_total_kwh': energy_total,
                'last_energy_total_kwh': energy_total,
                'first_totalizador_m3': totalizador,
                'last_totalizador_m3': totalizador,
            })
            item['flow_out_sum'] += flow_out or 0.0
            item['flow_sum'] += flow_lps or 0.0
            if amps is not None:
                item['amp_sum'] += amps
                item['amp_samples'] += 1
            item['samples'] += 1
            item['last_energy_total_kwh'] = energy_total
            item['last_totalizador_m3'] = totalizador

    history: list[dict[str, Any]] = []
    for item in sorted(grouped.values(), key=lambda row: (row['timestamp'], row['numero'])):
        samples = max(int(item.get('samples') or 1), 1)
        period_m3 = _safe_delta(item.get('last_totalizador_m3'), item.get('first_totalizador_m3'))
        energy_delta = _safe_delta(item.get('last_energy_total_kwh'), item.get('first_energy_total_kwh'))
        history.append({
            'well_id': item['well_id'],
            'numero': item['numero'],
            'timestamp': item['timestamp'],
            'bucket': item['bucket'],
            'aggregation': item['aggregation'],
            'samples': samples,
            'flow_out_lps': round(item['flow_out_sum'] / samples, 4),
            'flow_in_lps': None,
            'flow_lps': round(item['flow_sum'] / samples, 4),
            'amps': round(item['amp_sum'] / item['amp_samples'], 2) if item.get('amp_samples') else None,
            'amperaje': round(item['amp_sum'] / item['amp_samples'], 2) if item.get('amp_samples') else None,
            'energy_total_kwh': item.get('last_energy_total_kwh'),
            'energy_delta_kwh': energy_delta,
            'totalizador_m3': item.get('last_totalizador_m3'),
            'period_m3': period_m3,
        })
    return history


def _build_line_history(rows: list[dict[str, Any]], catalog: dict[int, dict[str, Any]], period: str = 'hourly') -> list[dict[str, Any]]:
    """Aggregate BOS line history by configured sensor_id, not by source/name."""
    grouped: dict[tuple[int, str], dict[str, Any]] = {}
    for row in rows:
        timestamp_value = _first(row, 'time_stamp', 'timestamp')
        bucket = _bucket_iso(timestamp_value, period)
        if not bucket:
            continue
        for index in _line_slot_indices(row):
            fallback_sensor = int(LINE_SENSOR_MAP[index]['sensor_id']) if index < len(LINE_SENSOR_MAP) else 2001 + index * 2
            sensor_id = int(_num(_bos_value(row, 'LINEA_FLOW_IN', index, 'sensor_id', fallback_sensor), fallback_sensor))
            flow = _num(_bos_value(row, 'LINEA_FLOW_IN', index, 'instant_value', 0))
            total = _num(_bos_value(row, 'LINEA_FLOW_IN', index, 'total_value', 0))
            quality = _num(_bos_value(row, 'LINEA_FLOW_IN', index, 'quality', 0))
            if not any([flow, total]):
                continue
            numero, line_name, sensor_name = _line_metadata(index, sensor_id, catalog)
            key = (numero, bucket)
            item = grouped.setdefault(key, {
                'id': f'linea-{numero}',
                'numero': numero,
                'name': line_name,
                'nombre': line_name,
                'sensor_name': sensor_name,
                'sensor_id': sensor_id,
                'timestamp': bucket,
                'bucket': bucket,
                'aggregation': period,
                'flow_sum': 0.0,
                'samples': 0,
                'first_total_m3': total,
                'last_total_m3': total,
                'quality': quality,
            })
            item['flow_sum'] += flow
            item['samples'] += 1
            item['last_total_m3'] = total
            item['quality'] = quality

    history: list[dict[str, Any]] = []
    for item in sorted(grouped.values(), key=lambda row: (row['timestamp'], row['numero'])):
        samples = max(int(item.get('samples') or 1), 1)
        period_m3 = _safe_delta(item.get('last_total_m3'), item.get('first_total_m3'))
        history.append({
            'id': item['id'],
            'numero': item['numero'],
            'name': item['name'],
            'nombre': item['nombre'],
            'sensor_name': item['sensor_name'],
            'sensor_id': item['sensor_id'],
            'timestamp': item['timestamp'],
            'bucket': item['bucket'],
            'aggregation': item['aggregation'],
            'samples': samples,
            'flow_lps': round(item['flow_sum'] / samples, 4),
            'total_m3': item.get('last_total_m3'),
            'period_m3': period_m3,
            'quality': item.get('quality'),
        })
    return history

def _cards(wells: list[dict[str, Any]], lines: list[dict[str, Any]], tank_inputs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    active_wells = sum(1 for item in wells if item.get('active'))
    total_flow_out = sum(_num(item.get('flujo_salida')) for item in wells)
    total_flow_in = sum(_num(item.get('flujo_entrada')) for item in wells)
    active_lines = sum(1 for item in lines if item.get('active'))
    active_tank = sum(1 for item in tank_inputs if item.get('active') or _num(item.get('total_m3'), 0) > 0)
    return [
        {'label': 'Pozos operando', 'value': f'{active_wells}/{len(wells)}', 'unit': 'pozos', 'trend': 'Datos desde monitoreo', 'accent': 'blue'},
        {'label': 'Flujo salida pozos', 'value': f'{total_flow_out:,.2f}', 'unit': 'L/s', 'trend': 'Lectura actual de salida', 'accent': 'cyan'},
        {'label': 'Pozos con lectura actual', 'value': f'{len([item for item in wells if item.get("flow_lps") is not None])}/{len(wells)}', 'unit': 'pozos', 'trend': 'Solo sensores FLOW_OUT confirmados', 'accent': 'teal'},
        {'label': 'Líneas activas', 'value': f'{active_lines}/{len(lines)}', 'unit': 'líneas', 'trend': 'Datos desde monitoreo', 'accent': 'sky'},
        {'label': 'Flujos', 'value': f'{active_tank}/{len(tank_inputs)}', 'unit': 'equipos con actividad', 'trend': 'Lavadoras y Jarabes', 'accent': 'indigo'},
    ]


def get_bos_water_dashboard_payload(start_date: Any = None, end_date: Any = None, period: Any = None, include_history: bool = False, include_energy_water: bool = False, force_refresh: bool = False) -> dict[str, Any] | None:
    start_bound, end_bound = _date_bounds(start_date, end_date)
    has_period = bool(start_bound or end_bound)
    cache_key = _payload_cache_key(start_date, end_date, period, include_history, include_energy_water)
    if not force_refresh:
        cached_payload = _payload_cache_get(cache_key)
        if cached_payload is not None:
            return cached_payload
    sql_errors = {'count': 0}
    try:
        with SessionLocal() as session:
            sql_now = _sql_now(session)
            pozo_row = _safe_latest_row(session, 'dbo.SensorsBOS_Pozo', start_date, end_date, sql_errors)
            linea_row = _safe_latest_row(session, 'dbo.SensorsBOS_Linea', start_date, end_date, sql_errors)
            lavadoras = get_current_lavadoras(session=session)
            jarabes = get_current_jarabes(session=session)
            niveles_row = None
            pozo_start_row = _safe_first_row(session, 'dbo.SensorsBOS_Pozo', start_date, end_date, sql_errors) if has_period else None
            linea_start_row = _safe_first_row(session, 'dbo.SensorsBOS_Linea', start_date, end_date, sql_errors) if has_period else None
            pozo_history_rows = _range_rows(session, 'dbo.SensorsBOS_Pozo', start_date, end_date) if include_history else []
            linea_history_rows = _range_rows(session, 'dbo.SensorsBOS_Linea', start_date, end_date) if include_history else []
            niveles_history_rows = []
            has_flow_reading = any(item.get('current_reading_available') for item in [*lavadoras, *jarabes])
            if not any([pozo_row, linea_row, has_flow_reading]):
                if int(sql_errors.get('count') or 0) >= 2:
                    logger.warning('water_bos SQL unavailable: required dashboard latest queries failed for start_date=%s end_date=%s', start_date, end_date)
                    return _sql_connection_error_payload()
                logger.warning('water_bos SQL connected but dashboard tables returned 0 latest rows for start_date=%s end_date=%s', start_date, end_date)
                return None
            catalog = _sensor_catalog(session)
            locations = _well_locations(session)
            well_slots = _discover_bos_well_slots(pozo_row)
            latest_quality_by_sensor = _latest_quality_by_sensor(
                session,
                [int(slot['energy_sensor_id']) for slot in well_slots if slot.get('energy_sensor_id')],
                start_date=start_date,
                end_date=end_date,
            )
            normalized_period = _normalize_period(period, start_date, end_date)
            energy_water_rows = []
            if include_energy_water:
                logger.info('water_bos iot.sp_get_energy_water skipped: Durango has no confirmed operational energy source')
            else:
                logger.info('water_bos iot.sp_get_energy_water skipped: Durango has no confirmed operational energy source for fast dashboard loads')
            energy_water = {}
    except SQLAlchemyError as exc:
        logger.exception('water_bos SQL connection/payload error: %s', exc)
        return _sql_connection_error_payload()

    wells = _build_wells(pozo_row, catalog, locations, energy_water, pozo_start_row=pozo_start_row, has_period=has_period, latest_quality_by_sensor=latest_quality_by_sensor, well_slots=well_slots, sql_now=sql_now)
    tank_inputs: list[dict[str, Any]] = []
    line_source_rows = _build_lines(linea_row, catalog, linea_start_row=linea_start_row, has_period=has_period, sql_now=sql_now)
    line_flow_ids = {int(item['sensor_id']) for item in DURANGO_LINE_FLOWS}
    lines = [item for item in line_source_rows if int(item.get('sensor_id') or 0) not in line_flow_ids]
    line_flows = [item for item in line_source_rows if int(item.get('sensor_id') or 0) in line_flow_ids]
    flows = [*line_flows, *lavadoras, *jarabes]
    tank_level_readings = _build_tank_level_readings(niveles_row)
    normalized_period = _normalize_period(period, start_date, end_date)
    well_flow_history = _build_well_flow_history(pozo_history_rows, normalized_period, well_slots=well_slots)
    line_source_history = _build_line_history(linea_history_rows, catalog, normalized_period)
    production_line_history = [item for item in line_source_history if int(item.get('sensor_id') or 0) not in line_flow_ids]
    flow_history: list[dict[str, Any]] = [item for item in line_source_history if int(item.get('sensor_id') or 0) in line_flow_ids]
    tank_level_history = _build_tank_level_history(niveles_history_rows, normalized_period)
    sensors = [sensor for well in wells for sensor in well.get('sensors', [])]
    water_entry_by_well = [
        {'name': item['nombre'], 'value': _num(item.get('flujo_salida')), 'unit': 'L/s', 'detail': item.get('ubicacion', '')}
        for item in wells
    ]
    water_consumption = [
        {
            'name': item.get('name') or item.get('label') or f'Flujo {idx + 1}',
            'value': _optional_num(item.get('flow_lps')),
            'unit': 'L/s',
            'detail': ('Lavadora' if item.get('category') == 'lavadora' else 'Jarabes' if item.get('category') == 'jarabes' else 'Flujo auxiliar'),
            'operational_key': item.get('operational_key'),
            'category': item.get('category'),
        }
        for idx, item in enumerate(flows)
    ]
    entry_vs_exit: list[dict[str, Any]] = []
    pozo_updated = _first(pozo_row, 'time_stamp', 'timestamp')
    linea_updated = _first(linea_row, 'time_stamp', 'timestamp')
    niveles_updated = _first(niveles_row, 'time_stamp', 'timestamp')
    flows_updated = max((str(item.get('last_update') or '') for item in flows), default='') or None
    updated = _latest_timestamp_value(pozo_updated, linea_updated, niveles_updated)
    source_freshness = {
        'pozos': _source_freshness(pozo_updated, sql_now),
        'lineas': _source_freshness(linea_updated, sql_now),
        'flujos': {
            'status': 'available' if any(item.get('current_reading_available') for item in flows) else 'no_data',
            'updated_at': flows_updated,
        },
    }
    payload = {
        'title': 'Pozos',
        'subtitle': 'Lectura directa desde SQL Server ARCA / BOS',
        'cards': _cards(wells, lines, flows),
        'water_entry_by_well': water_entry_by_well,
        'water_consumption': water_consumption,
        # Mantener tank_levels legacy vacío para no cambiar la salida de Reportes;
        # Tanques consume las lecturas crudas desde tank_level_readings.
        'tank_levels': [],
        'tank_level_readings': tank_level_readings,
        'tank_level_history': tank_level_history,
        'tank_level_columns': [],
        'supply_hours': [{'name': item['nombre'], 'value': _num(item.get('flow')), 'unit': 'L/s', 'detail': item.get('ubicacion', '')} for item in wells],
        'filters_vs_treated': [],
        'cip_weekly': [],
        'entry_vs_exit': entry_vs_exit,
        'monthly_averages': [],
        'daily_indicators': water_consumption,
        'report_modules': ['Pozos SQL Server', 'Líneas SQL Server', 'Flujos SQL Server', 'Comparativo operativo', 'Reporte diario operativo'],
        'hourly_flow': [],
        'wells': wells,
        'sensors': sensors,
        'production_lines': lines,
        'tank_inputs': [],
        'flows': flows,
        'flow_history': flow_history,
        'distribution_flows': water_consumption,
        'energy_water_rows': energy_water_rows,
        'source_freshness': source_freshness,
        'well_flow_history': well_flow_history,
        'production_line_history': production_line_history,
        'source_status': 'sqlserver_sp' if energy_water_rows else 'sqlserver_bos',
        'source_mode': 'sp_get_energy_water' if energy_water_rows else 'bos_operational',
        'source_notes': 'Lecturas operativas desde tablas BOS confirmadas para Durango; energía deshabilitada',
        'source': None,
        'updated_at': _iso(updated or sql_now),
        'sql_server_time': _iso(sql_now),
        'date_range': {'start_date': str(start_bound or ''), 'end_date': str(end_bound or ''), 'period': normalized_period},
        'aggregation': normalized_period,
    }
    return _payload_cache_set(cache_key, payload, _payload_cache_ttl(start_date, end_date, period, include_history))
