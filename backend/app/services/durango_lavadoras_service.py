"""Fuente operativa confirmada de las dos lavadoras de Planta Durango."""
from __future__ import annotations

from contextlib import nullcontext
from datetime import date, datetime, timedelta
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.database import SessionLocal
from app.services.durango_capabilities import (
    DURANGO_SCADA_CUTOVER_LOCAL,
    LAVADORAS,
    clamp_to_validated_segment,
    current_flow_threshold_for_sensor,
    normalize_flow_lps,
)
from app.services.operation_semantics import expected_minute_samples, interval_operation_metrics, period_activity_label
from app.services.plant_time import local_now_naive, local_to_source_naive, source_to_local_naive
from app.services.totalizer_quality import analyze_totalizer_series
from app.services.water_interval_reconciliation import reconcile_interval
from app.services.water_quality import build_quality_diagnostic, classify_water_quality

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
        'start_utc': local_to_source_naive(start_local, 'UTC'),
        'end_utc': local_to_source_naive(end_local, 'UTC'),
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
                {'cutover_utc': local_to_source_naive(DURANGO_SCADA_CUTOVER_LOCAL, 'UTC')},
            ).fetchone()
            return _mapping(row) if row is not None else None
    except SQLAlchemyError as exc:
        logger.exception('Durango lavadoras latest query failed: %s', exc)
        raise


def normalize_lavadora_rows(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Convert each UTC timestamp exactly once and expose stable text keys."""
    grouped = {str(item['operational_key']): [] for item in LAVADORAS}
    for raw in rows:
        local_stamp = source_to_local_naive(raw.get('source_timestamp') or raw.get('Time_Stamp'), 'UTC')
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




def query_lavadora_previous_readings(before_local: datetime, *, session: Any = None) -> dict[str, dict[str, Any]]:
    """Return the last valid totalizer reading before ``before_local`` for each washer."""
    before_utc = local_to_source_naive(before_local, 'UTC')
    cutover_utc = local_to_source_naive(DURANGO_SCADA_CUTOVER_LOCAL, 'UTC')
    result: dict[str, dict[str, Any]] = {}
    with _session_scope(session) as active_session:
        for contract in LAVADORAS:
            key = str(contract['operational_key'])
            instant_column = str(contract['instant_column'])
            total_column = str(contract['total_column'])
            sql = text(f"""
                SELECT TOP (1)
                    Time_Stamp AS source_timestamp,
                    TRY_CONVERT(float, {instant_column}) AS instant_value,
                    TRY_CONVERT(float, {total_column}) AS total_value
                FROM dbo.SensorsBOS_Lavadoras
                WHERE Time_Stamp >= :cutover_utc
                  AND Time_Stamp < :before_utc
                  AND TRY_CONVERT(float, {total_column}) IS NOT NULL
                  AND TRY_CONVERT(float, {total_column}) > 0
                ORDER BY Time_Stamp DESC
            """)
            row = active_session.execute(sql, {'cutover_utc': cutover_utc, 'before_utc': before_utc}).fetchone()
            if row is None:
                continue
            raw = _mapping(row)
            stamp = source_to_local_naive(raw.get('source_timestamp'), 'UTC')
            if stamp is None:
                continue
            result[key] = {
                'operational_ts': stamp,
                'instant_value': normalize_flow_lps(key, raw.get('instant_value'), stamp),
                'total_value': _number(raw.get('total_value')),
                'source': 'dbo.SensorsBOS_Lavadoras',
                'period_source': 'dbo.SensorsBOS_Lavadoras',
            }
    return result


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


def build_lavadora_period_item(
    contract: dict[str, Any],
    rows: list[dict[str, Any]],
    end_day: date,
    *,
    window_start: datetime | None = None,
    window_end: datetime | None = None,
    previous_reading: dict[str, Any] | None = None,
) -> dict[str, Any]:
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
    active_threshold = current_flow_threshold_for_sensor(key)
    active_flows = [value for value in flows if value > active_threshold]
    totals = [_number(row.get('total_value')) for row in ordered]
    totals = [value for value in totals if value is not None]
    latest_stamp = ordered[-1].get('operational_ts') if ordered else None
    communication, communication_status = _communication(latest_stamp, end_day)

    valid_minutes = {
        row.get('operational_ts').replace(second=0, microsecond=0)
        for row in ordered
        if isinstance(row.get('operational_ts'), datetime)
        and (_number(row.get('instant_value')) is not None or _number(row.get('total_value')) is not None)
    }
    active_minutes_set = {
        row.get('operational_ts').replace(second=0, microsecond=0)
        for row in ordered
        if isinstance(row.get('operational_ts'), datetime)
        and (_number(row.get('instant_value')) or 0.0) > active_threshold
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
        validated_volume_m3=analysis.validated_volume_m3,
        has_discontinuities=analysis.has_discontinuities,
    ).payload()
    reconciliation = (
        reconcile_interval(
            ordered,
            start=coverage_start,
            end=coverage_end,
            previous_reading=previous_reading,
        )
        if coverage_start and coverage_end
        else None
    )
    reconciled_rows = list(ordered)
    if previous_reading:
        reconciled_rows.insert(0, dict(previous_reading))
    reconciled_analysis = analyze_totalizer_series(
        reconciled_rows,
        sensor_id=None,
        flow_unit='L/s',
        require_flow_validation=bool(contract.get('require_flow_validation')),
    ) if reconciled_rows else analysis
    reconciled_volume = reconciled_analysis.validated_volume_m3
    reconciled_reliable = bool(
        reconciliation
        and reconciliation.boundary_complete
        and reconciled_analysis.reliable
        and reconciliation.closing_m3 is not None
    )
    quality = classify_water_quality(
        samples_received=operation['samples_received'],
        samples_expected=operation['samples_expected'],
        coverage_percent=operation['coverage_percent'],
        volume_m3=reconciled_volume,
        volume_reliable=reconciled_reliable,
        boundary_complete=bool(reconciliation and reconciliation.boundary_complete),
        has_discontinuities=reconciled_analysis.has_discontinuities,
    )
    quality_diagnostic = build_quality_diagnostic(
        quality_status=quality.quality_status,
        coverage_percent=quality.coverage_percent,
        boundary_complete=bool(reconciliation and reconciliation.boundary_complete),
        missing_previous_reading=bool(reconciliation is None or reconciliation.missing_previous_reading),
        closing_m3=reconciliation.closing_m3 if reconciliation else None,
        volume_m3=reconciled_volume,
        volume_reliable=reconciled_reliable,
        discarded_events=list(reconciled_analysis.discarded_events),
    )
    activity = period_activity_label(
        samples_received=operation['samples_received'],
        active_samples=operation['active_samples'],
        validated_volume_m3=analysis.validated_volume_m3,
    )
    data_status = str(operation['data_status'])
    volume_data_status = (
        'invalid_totalizer' if analysis.has_discontinuities
        else 'validated' if bool(analysis.reliable and totals)
        else 'no_totalizer' if not totals
        else analysis.status
    )
    latest_flow = flows[-1] if flows else None
    if not ordered or latest_flow is None:
        current_state = 'Sin registros'
        current_state_status = 'no_data'
    elif latest_flow > active_threshold:
        current_state = 'Activo'
        current_state_status = 'operational'
    else:
        current_state = 'Apagado con datos'
        current_state_status = 'zero_consumption'

    return {
        'operational_key': key,
        'id': key,
        'sensor_id': contract.get('sensor_id'),
        'name': contract['display_name'],
        'nombre': contract['display_name'],
        'module': 'flow',
        'flow_unit': 'L/s',
        'raw_flow_unit': contract.get('raw_flow_unit'),
        'unit_status': contract.get('unit_status'),
        'current_flow': flows[-1] if flows else None,
        'flow_lps': flows[-1] if flows else None,
        'flow_avg': round(sum(flows) / len(flows), 6) if flows else None,
        'flow_active_avg': round(sum(active_flows) / len(active_flows), 6) if active_flows else None,
        'flow_min': min(flows) if flows else None,
        'flow_max': max(flows) if flows else None,
        'samples': len(valid_minutes),
        'samples_received': operation['samples_received'],
        'samples_expected': operation['samples_expected'],
        'coverage_percent': operation['coverage_percent'],
        'coverage_status': operation['coverage_status'],
        'data_reliable': operation['data_reliable'],
        'active_samples': operation['active_samples'],
        'active_minutes': operation['active_minutes'],
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
        'volume_data_status': volume_data_status,
        'validation': operation['validation'],
        'validation_status': operation['validation_status'],
        'period_activity': activity,
        'period_data_status': data_status,
        'current_state': current_state,
        'current_state_status': current_state_status,
        'current_reading_available': bool(ordered),
        'communication': communication,
        'estado_comunicacion': communication,
        'communication_status': communication_status,
        'last_update': latest_stamp.isoformat(timespec='seconds') if latest_stamp else None,
        'ultima_lectura': latest_stamp.isoformat(timespec='seconds') if latest_stamp else None,
        'period_source': str(contract.get('table') or 'dbo.SensorsBOS_Lavadoras') if ordered else 'no_history',
        'reconciled_open_m3': reconciliation.opening_m3 if reconciliation else None,
        'reconciled_close_m3': reconciliation.closing_m3 if reconciliation else None,
        'reconciled_validated_volume_m3': reconciled_volume,
        'reconciled_volume_reliable': reconciled_reliable,
        'reconciled_discarded_volume_m3': reconciled_analysis.discarded_volume_m3,
        'reconciled_discarded_totalizer_events': reconciled_analysis.discarded_totalizer_events,
        'reconciled_discarded_totalizer_event_details': list(reconciled_analysis.discarded_events),
        'reconciled_has_discontinuities': reconciled_analysis.has_discontinuities,
        'opening_source': reconciliation.opening_source if reconciliation else 'no_data',
        'missing_previous_reading': reconciliation.missing_previous_reading if reconciliation else True,
        'boundary_complete': reconciliation.boundary_complete if reconciliation else False,
        'previous_valid_reading': reconciliation.previous_valid_reading.payload() if reconciliation and reconciliation.previous_valid_reading else None,
        'first_period_reading': reconciliation.first_period_reading.payload() if reconciliation and reconciliation.first_period_reading else None,
        'quality_data_status': quality.data_status,
        'quality_status': quality.quality_status,
        'quality_label': quality.quality_label,
        'quality_volume_reliable': quality.volume_reliable,
        **quality_diagnostic,
        'source_table': str(contract.get('table') or 'dbo.SensorsBOS_Lavadoras'),
        'source_key': contract['source_key'],
        'presentation_order': contract['presentation_order'],
    }


def get_lavadora_period_items(
    start_local: datetime,
    end_local: datetime,
    end_day: date,
    *,
    session: Any = None,
    window_start: datetime | None = None,
    window_end: datetime | None = None,
) -> list[dict[str, Any]]:
    grouped = query_lavadora_rows(start_local, end_local, session=session)
    previous = query_lavadora_previous_readings(window_start or start_local, session=session)
    return [
        build_lavadora_period_item(
            contract,
            grouped[str(contract['operational_key'])],
            end_day,
            window_start=window_start or start_local,
            window_end=window_end or end_local,
            previous_reading=previous.get(str(contract['operational_key'])),
        )
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
        item['active'] = bool(flow is not None and flow > 0)
        item['status'] = 'Operando' if item['active'] else 'Sin flujo' if has_reading else 'Sin datos'
        item['statusType'] = 'normal' if item['active'] else 'idle' if has_reading else 'communication'
        item['communicationType'] = item.get('communication_status')
        item['updated'] = item.get('last_update')
        item['category'] = 'lavadora'
        item['ubicacion'] = 'Lavadoras'
    return items
