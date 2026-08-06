"""Fuente operativa confirmada de las dos lavadoras de Planta Durango."""
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
    LAVADORAS,
    clamp_to_validated_segment,
    normalize_flow_lps,
)
from app.services.plant_time import local_now_naive, local_to_source_naive, source_to_local_naive
from app.services.totalizer_quality import analyze_totalizer_series

logger = logging.getLogger(__name__)
MAX_LAVADORAS_ROWS = 200_000


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


def _query_rows(start_local: datetime, end_local: datetime, *, session: Any = None) -> list[dict[str, Any]]:
    """Read both washers in one bounded SQL query using UTC predicates."""
    if end_local <= start_local:
        return []
    sql = text(f"""
        SELECT TOP ({MAX_LAVADORAS_ROWS})
            Time_Stamp AS source_timestamp,
            TRY_CONVERT(float, LAVADORAS_0_instant_value) AS lavadora_vidrio_flow,
            TRY_CONVERT(float, LAVADORAS_0_total_value) AS lavadora_vidrio_total,
            TRY_CONVERT(float, LAVADORAS_1_instant_value) AS lavadora_ref_pet_flow,
            TRY_CONVERT(float, LAVADORAS_1_total_value) AS lavadora_ref_pet_total
        FROM dbo.SensorsBOS_Lavadoras
        WHERE Time_Stamp >= :start_utc
          AND Time_Stamp < :end_utc
        ORDER BY Time_Stamp ASC
    """)
    params = {
        'start_utc': local_to_source_naive(start_local),
        'end_utc': local_to_source_naive(end_local),
    }
    try:
        with _session_scope(session) as active_session:
            return [_mapping(row) for row in active_session.execute(sql, params).fetchall()]
    except SQLAlchemyError as exc:
        logger.exception('Durango lavadoras range query failed: %s', exc)
        raise


def _query_latest(*, session: Any = None) -> dict[str, Any] | None:
    """Read the latest row for both washers with one SQL operation."""
    sql = text("""
        SELECT TOP (1)
            Time_Stamp AS source_timestamp,
            TRY_CONVERT(float, LAVADORAS_0_instant_value) AS lavadora_vidrio_flow,
            TRY_CONVERT(float, LAVADORAS_0_total_value) AS lavadora_vidrio_total,
            TRY_CONVERT(float, LAVADORAS_1_instant_value) AS lavadora_ref_pet_flow,
            TRY_CONVERT(float, LAVADORAS_1_total_value) AS lavadora_ref_pet_total
        FROM dbo.SensorsBOS_Lavadoras
        WHERE Time_Stamp >= :cutover_utc
        ORDER BY Time_Stamp DESC
    """)
    try:
        with _session_scope(session) as active_session:
            row = active_session.execute(
                sql,
                {'cutover_utc': local_to_source_naive(DURANGO_SCADA_CUTOVER_LOCAL)},
            ).fetchone()
            return _mapping(row) if row is not None else None
    except SQLAlchemyError as exc:
        logger.exception('Durango lavadoras latest query failed: %s', exc)
        raise


def normalize_lavadora_rows(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Convert each UTC timestamp exactly once and expose stable text keys."""
    grouped = {str(item['operational_key']): [] for item in LAVADORAS}
    for raw in rows:
        local_stamp = source_to_local_naive(raw.get('source_timestamp') or raw.get('Time_Stamp'))
        if local_stamp is None or local_stamp < DURANGO_SCADA_CUTOVER_LOCAL:
            continue
        for contract in LAVADORAS:
            key = str(contract['operational_key'])
            grouped[key].append({
                'operational_key': key,
                'operational_ts': local_stamp,
                'instant_value': normalize_flow_lps(key, raw.get(f'{key}_flow')),
                'total_value': _number(raw.get(f'{key}_total')),
                'source': 'dbo.SensorsBOS_Lavadoras',
                'period_source': 'dbo.SensorsBOS_Lavadoras',
            })
    return grouped


def query_lavadora_rows(start_local: datetime, end_local: datetime, *, session: Any = None) -> dict[str, list[dict[str, Any]]]:
    effective_start, effective_end, legacy_only, _crosses = clamp_to_validated_segment(start_local, end_local)
    if legacy_only or effective_end <= effective_start:
        return {str(item['operational_key']): [] for item in LAVADORAS}
    return normalize_lavadora_rows(_query_rows(effective_start, effective_end, session=session))


def _communication(stamp: datetime | None, end_day: date) -> tuple[str, str]:
    if stamp is None:
        return 'Sin lectura', 'no_data'
    now = local_now_naive()
    if end_day < now.date():
        return 'Actualizado', 'operational'
    age_minutes = max((now - stamp).total_seconds() / 60, 0.0)
    if age_minutes <= 5:
        return 'Actualizado', 'operational'
    if age_minutes <= 30:
        return 'Lectura atrasada', 'stale_data'
    return 'Revisar comunicación', 'stale_data'


def build_lavadora_period_item(contract: dict[str, Any], rows: list[dict[str, Any]], end_day: date) -> dict[str, Any]:
    key = str(contract['operational_key'])
    ordered = sorted(rows, key=lambda row: row.get('operational_ts') or datetime.min)
    analysis = analyze_totalizer_series(
        ordered,
        sensor_id=None,
        flow_unit='L/s',
        require_flow_validation=bool(contract.get('require_flow_validation')),
    )
    flows = [_number(row.get('instant_value')) for row in ordered]
    flows = [value for value in flows if value is not None]
    totals = [_number(row.get('total_value')) for row in ordered]
    totals = [value for value in totals if value is not None]
    latest_stamp = ordered[-1].get('operational_ts') if ordered else None
    communication, communication_status = _communication(latest_stamp, end_day)

    if not ordered:
        activity = 'Sin histórico para el periodo'
        data_status = 'no_history'
    elif not totals:
        activity = 'Sin totalizador disponible'
        data_status = 'no_totalizer'
    elif analysis.has_discontinuities or not analysis.reliable:
        activity = 'Dato en revisión'
        data_status = 'invalid_totalizer'
    elif float(analysis.validated_volume_m3 or 0.0) > 0:
        activity = 'Con actividad en el periodo'
        data_status = 'operational'
    else:
        activity = 'Sin actividad en el periodo'
        data_status = 'zero_consumption'

    return {
        'operational_key': key,
        'id': key,
        'sensor_id': None,
        'name': contract['display_name'],
        'nombre': contract['display_name'],
        'module': 'flow',
        'flow_unit': 'L/s',
        'raw_flow_unit': contract.get('raw_flow_unit'),
        'unit_status': contract.get('unit_status'),
        'current_flow': flows[-1] if flows else None,
        'flow_lps': flows[-1] if flows else None,
        'flow_avg': round(sum(flows) / len(flows), 6) if flows else None,
        'flow_min': min(flows) if flows else None,
        'flow_max': max(flows) if flows else None,
        'samples': len(ordered),
        'current_totalizer_m3': totals[-1] if totals else None,
        'totalizador_m3': totals[-1] if totals else None,
        'period_open_m3': analysis.opening_m3,
        'period_close_m3': analysis.closing_m3,
        'period_m3': analysis.validated_volume_m3,
        'period_delta_m3': analysis.validated_volume_m3,
        'period_m3_reliable': bool(analysis.reliable and totals),
        'validated_volume_m3': analysis.validated_volume_m3,
        'discarded_volume_m3': analysis.discarded_volume_m3,
        'discarded_totalizer_events': analysis.discarded_totalizer_events,
        'discarded_totalizer_event_details': list(analysis.discarded_events),
        'has_discontinuities': analysis.has_discontinuities,
        'volume_reliable': analysis.volume_reliable,
        'volume_display_label': 'Volumen validado parcial' if analysis.has_discontinuities else 'Volumen del periodo',
        'today_accumulated_m3': analysis.validated_volume_m3,
        'today_accumulated_reliable': bool(analysis.reliable and totals),
        'activity': activity,
        'activity_status': activity,
        'data_status': data_status,
        'period_activity': activity,
        'period_data_status': data_status,
        'current_reading_available': bool(ordered),
        'communication': communication,
        'estado_comunicacion': communication,
        'communication_status': communication_status,
        'last_update': latest_stamp.isoformat(timespec='seconds') if latest_stamp else None,
        'ultima_lectura': latest_stamp.isoformat(timespec='seconds') if latest_stamp else None,
        'period_source': 'dbo.SensorsBOS_Lavadoras' if ordered else 'no_history',
        'source_table': 'dbo.SensorsBOS_Lavadoras',
        'source_key': contract['source_key'],
        'presentation_order': contract['presentation_order'],
    }


def get_lavadora_period_items(start_local: datetime, end_local: datetime, end_day: date, *, session: Any = None) -> list[dict[str, Any]]:
    grouped = query_lavadora_rows(start_local, end_local, session=session)
    return [
        build_lavadora_period_item(contract, grouped[str(contract['operational_key'])], end_day)
        for contract in LAVADORAS
    ]


def get_current_lavadoras(*, session: Any = None) -> list[dict[str, Any]]:
    raw = _query_latest(session=session)
    grouped = normalize_lavadora_rows([raw] if raw else [])
    today = local_now_naive().date()
    items = [
        build_lavadora_period_item(contract, grouped[str(contract['operational_key'])], today)
        for contract in LAVADORAS
    ]
    for item in items:
        has_reading = bool(item.get('current_reading_available'))
        flow = _number(item.get('current_flow'))
        # La consulta actual contiene una sola fila y no representa un periodo.
        # Conserva lectura/totalizador/comunicación sin publicar un volumen cero
        # ni marcar una discontinuidad hasta cargar el histórico solicitado.
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
            'samples': 0,
        })
        item['active'] = bool(flow is not None and flow > 0)
        item['status'] = 'Operando' if item['active'] else 'Sin flujo' if has_reading else 'Sin datos'
        item['statusType'] = 'normal' if item['active'] else 'idle' if has_reading else 'communication'
        item['communicationType'] = item.get('communication_status')
        item['updated'] = item.get('last_update')
        item['category'] = 'lavadora'
        item['ubicacion'] = 'Lavadoras'
    return items
