"""Fuente operativa de Jarabes para Planta Durango.

Jarabes conserva una sola identidad operativa (``jarabes``), aunque el canal
físico cambió el 11/08/2026 19:40:29 UTC: antes usa sensor 3010 en
``TANQUE_FLOW_IN[4]`` y desde ese instante usa sensor 3004 en
``TANQUE_FLOW_IN[1]``. Los timestamps de ``dbo.SensorsBOS_Tanque`` están en UTC
 y se convierten una sola vez a ``America/Mexico_City``.
"""
from __future__ import annotations

from contextlib import nullcontext
from datetime import date, datetime
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.database import SessionLocal
from app.services.durango_capabilities import (
    DURANGO_SCADA_CUTOVER_LOCAL,
    JARABES,
    JARABES_CHANNEL_CUTOVER_UTC,
    JARABES_CURRENT_SENSOR_ID,
    JARABES_SOURCE_SEGMENTS,
    clamp_to_validated_segment,
    normalize_flow_lps,
)
from app.services.durango_lavadoras_service import build_lavadora_period_item
from app.services.plant_time import local_now_naive, local_to_source_naive, parse_datetime, source_to_local_naive

logger = logging.getLogger(__name__)
MAX_JARABES_ROWS = 200_000
CONTRACT = JARABES[0]


def _number(value: Any) -> float | None:
    if value in (None, ''):
        return None
    try:
        parsed = float(str(value).replace(',', '').strip())
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def _mapping(row: Any) -> dict[str, Any]:
    if isinstance(row, dict):
        return dict(row)
    return dict(getattr(row, '_mapping', {}) or {})


def _session_scope(session: Any = None):
    return nullcontext(session) if session is not None else SessionLocal()


def _segment_for_source_timestamp(source_timestamp: Any) -> dict[str, Any] | None:
    source_utc = source_timestamp if isinstance(source_timestamp, datetime) else parse_datetime(source_timestamp)
    if source_utc is None:
        return None
    if source_utc.tzinfo is not None:
        source_utc = source_utc.astimezone().replace(tzinfo=None)
    if source_utc < JARABES_CHANNEL_CUTOVER_UTC:
        return JARABES_SOURCE_SEGMENTS[0]
    return JARABES_SOURCE_SEGMENTS[1]


def _query_segment_rows(
    segment: dict[str, Any],
    start_utc: datetime,
    end_utc: datetime,
    *,
    session: Any = None,
) -> list[dict[str, Any]]:
    if end_utc <= start_utc:
        return []
    sensor_column = str(segment['sensor_column'])
    instant_column = str(segment['instant_column'])
    total_column = str(segment['total_column'])
    sql = text(f"""
        SELECT TOP ({MAX_JARABES_ROWS})
            Time_Stamp AS source_timestamp,
            TRY_CONVERT(float, {sensor_column}) AS source_sensor_id,
            TRY_CONVERT(float, {instant_column}) AS raw_flow,
            TRY_CONVERT(float, {total_column}) AS total_value,
            :segment_sensor_id AS segment_sensor_id,
            :segment_slot_index AS segment_slot_index,
            :segment_source_key AS segment_source_key
        FROM dbo.SensorsBOS_Tanque
        WHERE Time_Stamp >= :start_utc
          AND Time_Stamp < :end_utc
        ORDER BY Time_Stamp ASC
    """)
    params = {
        'start_utc': start_utc,
        'end_utc': end_utc,
        'segment_sensor_id': int(segment['sensor_id']),
        'segment_slot_index': int(segment['slot_index']),
        'segment_source_key': str(segment['source_key']),
    }
    try:
        with _session_scope(session) as active_session:
            return [_mapping(row) for row in active_session.execute(sql, params).fetchall()]
    except SQLAlchemyError as exc:
        logger.exception('Durango Jarabes range query failed: %s', exc)
        raise


def _query_rows(start_local: datetime, end_local: datetime, *, session: Any = None) -> list[dict[str, Any]]:
    """Read only Jarabes segments intersecting the requested local range."""
    if end_local <= start_local:
        return []
    start_utc = local_to_source_naive(start_local, 'UTC')
    end_utc = local_to_source_naive(end_local, 'UTC')
    rows: list[dict[str, Any]] = []
    for segment in JARABES_SOURCE_SEGMENTS:
        segment_start = segment.get('start_utc') or datetime.min
        segment_end = segment.get('end_utc') or datetime.max
        query_start = max(start_utc, segment_start)
        query_end = min(end_utc, segment_end)
        if query_end <= query_start:
            continue
        rows.extend(_query_segment_rows(segment, query_start, query_end, session=session))
    rows.sort(key=lambda row: row.get('source_timestamp') or datetime.min)
    return rows


def _query_latest(*, session: Any = None) -> dict[str, Any] | None:
    """Read the current Jarabes channel only: sensor 3004 / TANQUE_FLOW_IN[1]."""
    current_segment = JARABES_SOURCE_SEGMENTS[1]
    sql = text("""
        SELECT TOP (1)
            Time_Stamp AS source_timestamp,
            TRY_CONVERT(float, TANQUE_FLOW_IN_1_sensor_id) AS source_sensor_id,
            TRY_CONVERT(float, TANQUE_FLOW_IN_1_instant_value) AS raw_flow,
            TRY_CONVERT(float, TANQUE_FLOW_IN_1_total_value) AS total_value,
            :segment_sensor_id AS segment_sensor_id,
            :segment_slot_index AS segment_slot_index,
            :segment_source_key AS segment_source_key
        FROM dbo.SensorsBOS_Tanque
        WHERE Time_Stamp >= :cutover_utc
        ORDER BY Time_Stamp DESC
    """)
    try:
        with _session_scope(session) as active_session:
            row = active_session.execute(
                sql,
                {
                    'cutover_utc': JARABES_CHANNEL_CUTOVER_UTC,
                    'segment_sensor_id': int(current_segment['sensor_id']),
                    'segment_slot_index': int(current_segment['slot_index']),
                    'segment_source_key': str(current_segment['source_key']),
                },
            ).fetchone()
            return _mapping(row) if row is not None else None
    except SQLAlchemyError as exc:
        logger.exception('Durango Jarabes latest query failed: %s', exc)
        raise


def _source_sensor_id(raw: dict[str, Any], segment: dict[str, Any] | None) -> int | None:
    observed = _number(raw.get('source_sensor_id') if raw.get('source_sensor_id') is not None else raw.get('sensor_id'))
    if observed is not None:
        return int(observed)
    if raw.get('segment_sensor_id') is not None:
        return int(_number(raw.get('segment_sensor_id')) or 0) or None
    if segment is not None:
        return int(segment['sensor_id'])
    return None


def normalize_jarabes_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for raw in rows:
        local_stamp = source_to_local_naive(raw.get('source_timestamp'), 'UTC')
        if local_stamp is None or local_stamp < DURANGO_SCADA_CUTOVER_LOCAL:
            continue
        segment = _segment_for_source_timestamp(raw.get('source_timestamp'))
        if segment is None:
            continue
        source_sensor_id = _source_sensor_id(raw, segment)
        expected_sensor_id = int(segment['sensor_id'])
        if source_sensor_id is not None and source_sensor_id != expected_sensor_id:
            continue
        result.append({
            'sensor_id': JARABES_CURRENT_SENSOR_ID,
            'source_sensor_id': expected_sensor_id,
            'source_slot_index': int(segment['slot_index']),
            'source_key': str(segment['source_key']),
            'operational_key': str(CONTRACT['operational_key']),
            'operational_ts': local_stamp,
            'instant_value': normalize_flow_lps(str(CONTRACT['operational_key']), raw.get('raw_flow'), local_stamp),
            'total_value': _number(raw.get('total_value')),
            'source': 'dbo.SensorsBOS_Tanque',
            'period_source': 'dbo.SensorsBOS_Tanque',
        })
    result.sort(key=lambda row: row.get('operational_ts') or datetime.min)
    return result


def query_jarabes_rows(start_local: datetime, end_local: datetime, *, session: Any = None) -> list[dict[str, Any]]:
    effective_start, effective_end, legacy_only, _crosses = clamp_to_validated_segment(start_local, end_local)
    if legacy_only or effective_end <= effective_start:
        return []
    return normalize_jarabes_rows(_query_rows(effective_start, effective_end, session=session))


def get_jarabes_period_items(
    start_local: datetime,
    end_local: datetime,
    end_day: date,
    *,
    session: Any = None,
    window_start: datetime | None = None,
    window_end: datetime | None = None,
) -> list[dict[str, Any]]:
    rows = query_jarabes_rows(start_local, end_local, session=session)
    return [
        build_lavadora_period_item(
            CONTRACT,
            rows,
            end_day,
            window_start=window_start or start_local,
            window_end=window_end or end_local,
        )
    ]


def get_current_jarabes(*, session: Any = None) -> list[dict[str, Any]]:
    raw = _query_latest(session=session)
    rows = normalize_jarabes_rows([raw] if raw else [])
    today = local_now_naive().date()
    item = build_lavadora_period_item(CONTRACT, rows, today)
    has_reading = bool(item.get('current_reading_available'))
    flow = _number(item.get('current_flow'))
    # Una única lectura actual no constituye un periodo. Conserva solamente la
    # lectura/totalizador/comunicación y deja el volumen para la consulta de rango.
    item.update({
        'period_open_m3': None,
        'period_close_m3': None,
        'period_m3': None,
        'period_delta_m3': None,
        'period_m3_reliable': False,
        'validated_volume_m3': None,
        'discarded_volume_m3': 0.0,
        'discarded_totalizer_events': 0,
        'discarded_totalizer_event_details': [],
        'has_discontinuities': False,
        'volume_reliable': False,
        'volume_display_label': 'Sin histórico para el periodo',
        'today_accumulated_m3': None,
        'today_accumulated_reliable': False,
        'activity': 'Sin histórico para el periodo',
        'activity_status': 'Sin histórico para el periodo',
        'period_activity': 'Sin histórico para el periodo',
        'data_status': 'no_history',
        'period_data_status': 'no_history',
        'volume_data_status': 'no_totalizer',
        'validation': 'Sin volumen validado',
        'validation_status': 'unavailable',
        'samples': 0,
        'samples_received': 0,
        'samples_expected': 0,
        'coverage_percent': 0.0,
        'coverage_status': 'Sin histórico para el periodo',
        'data_reliable': False,
        'active_samples': 0,
        'active_minutes': 0.0,
        'flow_active_avg': None,
    })
    item['active'] = bool(flow is not None and flow > 0.01)
    item['status'] = 'Operando' if item['active'] else 'Sin flujo' if has_reading else 'Sin datos'
    item['statusType'] = 'normal' if item['active'] else 'idle' if has_reading else 'communication'
    item['communicationType'] = item.get('communication_status')
    item['updated'] = item.get('last_update')
    item['category'] = 'jarabes'
    item['ubicacion'] = 'Flujos'
    return [item]
