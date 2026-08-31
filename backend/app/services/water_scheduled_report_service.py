from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from app.services.durango_capabilities import LOCAL_TIMEZONE, PLANT_NAME
from app.services.water_daily_report_service import (
    JARABES_KEYS,
    LAVADORA_KEYS,
    _filter_history,
    _module_validated_summary,
    get_daily_water_report,
)
from app.services.water_history_service import get_water_history_module

LOCAL_ZONE = ZoneInfo(LOCAL_TIMEZONE)


def _point_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if parsed.tzinfo:
            parsed = parsed.astimezone(LOCAL_ZONE).replace(tzinfo=None)
        return parsed.replace(tzinfo=None)
    except (TypeError, ValueError):
        return None


def _weighted_flow(points: list[dict[str, Any]]) -> float | None:
    weighted = 0.0
    samples = 0
    fallback: list[float] = []
    for point in points:
        value = point.get('flow_avg_lps')
        if value is None:
            continue
        numeric = float(value)
        count = int(point.get('samples_received') or point.get('samples') or 0)
        fallback.append(numeric)
        if count > 0:
            weighted += numeric * count
            samples += count
    if samples > 0:
        return round(weighted / samples, 4)
    if fallback:
        return round(sum(fallback) / len(fallback), 4)
    return None


def _first_value(points: list[dict[str, Any]], key: str) -> Any:
    for point in points:
        value = point.get(key)
        if value is not None:
            return value
    return None


def _last_value(points: list[dict[str, Any]], key: str) -> Any:
    for point in reversed(points):
        value = point.get(key)
        if value is not None:
            return value
    return None


def _filter_period_history(history: dict[str, Any], start: datetime, end: datetime) -> dict[str, Any]:
    clone = dict(history or {})
    filtered_series: list[dict[str, Any]] = []
    for series in list((history or {}).get('series') or []):
        item = dict(series)
        item['points'] = [
            dict(point)
            for point in list(series.get('points') or [])
            if (stamp := _point_datetime(point.get('bucket_start') or point.get('timestamp'))) is not None
            and start <= stamp < end
        ]
        filtered_series.append(item)
    clone['series'] = filtered_series
    clone['start_datetime'] = start.isoformat(timespec='minutes')
    clone['end_datetime'] = end.isoformat(timespec='minutes')
    clone['aggregation'] = 'quarter_hour'
    return clone


def _quality_for_points(points: list[dict[str, Any]], expected_buckets: int) -> tuple[str, str, bool]:
    has_data = any(int(point.get('samples_received') or point.get('samples') or 0) > 0 for point in points)
    if not has_data:
        return 'Sin datos', 'no_data', False
    reliable = [
        point for point in points
        if bool(point.get('volume_reliable')) and point.get('validated_volume_m3') is not None
    ]
    has_review = any(
        int(point.get('discarded_totalizer_events') or 0) > 0 or bool(point.get('has_discontinuities'))
        for point in points
    )
    complete = len(points) == expected_buckets and len(reliable) == expected_buckets
    subtotal = sum(float(point.get('validated_volume_m3') or 0.0) for point in reliable)
    if complete:
        return ('Validado', 'validated', True) if subtotal > 0 else ('Cero válido', 'valid_zero', True)
    if has_review:
        return 'Dato en revisión', 'review', False
    return 'Cobertura parcial', 'partial_coverage', False


def _series_row(series: dict[str, Any], expected_buckets: int) -> dict[str, Any]:
    points = list(series.get('points') or [])
    samples = sum(int(point.get('samples_received') or point.get('samples') or 0) for point in points)
    reliable_points = [
        point for point in points
        if bool(point.get('volume_reliable')) and point.get('validated_volume_m3') is not None
    ]
    subtotal = round(sum(float(point.get('validated_volume_m3') or 0.0) for point in reliable_points), 6)
    quality_label, quality_status, volume_reliable = _quality_for_points(points, expected_buckets)
    last_point = next(
        (point for point in reversed(points) if int(point.get('samples_received') or point.get('samples') or 0) > 0),
        None,
    )
    opening = _first_value(points, 'totalizer_open_m3')
    closing = _last_value(points, 'totalizer_close_m3')
    active = subtotal > 0 or any(int(point.get('active_samples') or 0) > 0 for point in points)
    if samples <= 0:
        activity = 'Sin registros'
    else:
        activity = 'Con actividad' if active else 'Sin actividad'
    return {
        'operational_key': series.get('operational_key'),
        'sensor_id': series.get('sensor_id'),
        'module': None,
        'name': series.get('name'),
        'flow': _weighted_flow(points),
        'flow_unit': series.get('flow_unit') or 'L/s',
        'opening_m3': opening,
        'closing_m3': closing,
        'volume_m3': subtotal if reliable_points else None,
        'volume_reliable': volume_reliable,
        'validated_volume_m3': subtotal if volume_reliable else None,
        'discarded_volume_m3': round(sum(float(point.get('discarded_volume_m3') or 0.0) for point in points), 6),
        'discarded_totalizer_events': sum(int(point.get('discarded_totalizer_events') or 0) for point in points),
        'has_discontinuities': any(bool(point.get('has_discontinuities')) for point in points),
        'volume_display_label': 'Volumen del bloque',
        'activity': activity,
        'validation': quality_label,
        'validation_status': quality_status,
        'quality_label': quality_label,
        'quality_status': quality_status,
        'quality_reason_code': None,
        'quality_reason': None,
        'quality_details': {},
        'communication': 'Periodo cerrado' if samples > 0 else 'Sin registros',
        'last_update': (last_point or {}).get('bucket_end') or (last_point or {}).get('bucket_start'),
        'data_status': 'operational' if volume_reliable else ('partial_data' if samples > 0 else 'no_data'),
        'samples': samples,
        'samples_expected': expected_buckets * 15,
        'coverage_percent': round(
            sum(1 for point in points if int(point.get('samples_received') or point.get('samples') or 0) > 0)
            * 100.0 / expected_buckets,
            2,
        ) if expected_buckets else 0.0,
        'opening_source': 'historical_module',
        'boundary_complete': opening is not None and closing is not None,
    }


def _fixed_12h_report(start: datetime, end: datetime) -> dict[str, Any]:
    if end - start != timedelta(hours=12):
        raise ValueError('El reporte programado de 12 h requiere un bloque cerrado de exactamente 12 horas.')

    day = start.date().isoformat()
    expected_buckets = 48
    wells_history = _filter_period_history(
        get_water_history_module(module='well', start_date=day, end_date=day, aggregation='quarter_hour', force_refresh=False),
        start,
        end,
    )
    lines_history = _filter_period_history(
        get_water_history_module(module='line', start_date=day, end_date=day, aggregation='quarter_hour', force_refresh=False),
        start,
        end,
    )
    flows_history = _filter_period_history(
        get_water_history_module(module='flow', start_date=day, end_date=day, aggregation='quarter_hour', force_refresh=False),
        start,
        end,
    )
    washers_history = _filter_history(flows_history, LAVADORA_KEYS)
    jarabes_history = _filter_history(flows_history, JARABES_KEYS)

    wells = [_series_row(series, expected_buckets) for series in wells_history.get('series') or []]
    lines = [_series_row(series, expected_buckets) for series in lines_history.get('series') or []]
    washers = [_series_row(series, expected_buckets) for series in washers_history.get('series') or []]
    jarabes = [_series_row(series, expected_buckets) for series in jarabes_history.get('series') or []]
    operational_flows = [*washers, *jarabes]

    well_summary = _module_validated_summary(wells)
    line_summary = _module_validated_summary(lines)
    washer_summary = _module_validated_summary(washers)
    jarabes_summary = _module_validated_summary(jarabes)
    flow_summary = _module_validated_summary(operational_flows)
    groups = (well_summary, line_summary, washer_summary, jarabes_summary)
    calculable = [item['validated_volume_m3'] for item in groups if item['validated_volume_m3'] is not None]
    total_validated = round(sum(float(value) for value in calculable), 6) if calculable else None
    monitored = sum(int(item['monitored_count']) for item in groups)
    coverage_complete = bool(monitored) and all(bool(item['coverage_complete']) for item in groups)
    partial = sum(int(item['partial_validation_count']) for item in groups)
    no_data = sum(int(item['without_validated_volume_count']) for item in groups)

    period_label = f"{start.strftime('%d/%m/%Y %H:%M')}–{end.strftime('%H:%M')}"
    return {
        'title': 'Reporte de Control Hídrico Durango · Bloque 12 h',
        'plant': PLANT_NAME,
        'date': start.date().isoformat(),
        'start_date': start.date().isoformat(),
        'end_date': (end - timedelta(seconds=1)).date().isoformat(),
        'period_mode': 'fixed_12h_blocks',
        'period_start_at': start.isoformat(timespec='minutes'),
        'period_end_at': end.isoformat(timespec='minutes'),
        'period_label': period_label,
        'generated_at': datetime.now(LOCAL_ZONE).isoformat(timespec='seconds'),
        'source_status': 'historical_module',
        'report_source': 'scheduled_fixed_12h',
        'summary': {
            'well_volume_m3': well_summary['validated_volume_m3'],
            'line_volume_m3': line_summary['validated_volume_m3'],
            'flow_volume_m3': flow_summary['validated_volume_m3'],
            'washer_volume_m3': washer_summary['validated_volume_m3'],
            'jarabes_volume_m3': jarabes_summary['validated_volume_m3'],
            'total_operational_m3': total_validated,
            'well_validated_volume_m3': well_summary['validated_volume_m3'],
            'line_validated_volume_m3': line_summary['validated_volume_m3'],
            'flow_validated_volume_m3': flow_summary['validated_volume_m3'],
            'washer_validated_volume_m3': washer_summary['validated_volume_m3'],
            'jarabes_validated_volume_m3': jarabes_summary['validated_volume_m3'],
            'total_validated_operational_m3': total_validated,
            'discarded_volume_m3': round(sum(float(item['discarded_volume_m3']) for item in groups), 6),
            'wells_active': well_summary['active_count'],
            'lines_active': line_summary['active_count'],
            'flows_active': flow_summary['active_count'],
            'washers_active': washer_summary['active_count'],
            'jarabes_active': jarabes_summary['active_count'],
            'partial_validation_count': partial,
            'without_validated_volume_count': no_data,
            'validated_items_count': sum(int(item['calculable_count']) for item in groups),
            'monitored_items_count': monitored,
            'coverage_complete': coverage_complete,
            'coverage_label': 'Cobertura completa' if coverage_complete else 'Cobertura parcial',
            'volume_basis_label': 'Total validado' if coverage_complete else 'Subtotal validado',
            'review_count': partial,
            'no_data_count': no_data,
            'communication': 'Periodo cerrado',
            'last_update': end.isoformat(timespec='minutes'),
            'note': (
                'Reporte automático de bloque fijo de 12 horas. Los volúmenes mostrados consideran únicamente '
                'intervalos conciliados y validados; los huecos o eventos no confiables no se convierten en cero.'
            ),
        },
        'wells': {'rows': wells, **well_summary},
        'production_lines': {'rows': lines, **line_summary},
        'operational_flows': {'rows': operational_flows, **flow_summary},
        'washers': {'rows': washers, **washer_summary},
        'jarabes': {'rows': jarabes, **jarabes_summary},
        'shifts': [],
        'shift_breakdown_available': False,
        'history': {
            'aggregation': 'quarter_hour',
            'wells': wells_history,
            'lines': lines_history,
            'flows': flows_history,
            'washers': washers_history,
            'jarabes': jarabes_history,
        },
        'includes_history': True,
        'includes_shifts': False,
        'notes': [
            'Bloque fijo [T0,T1) de 12 horas.',
            'La ausencia de volumen validado no se interpreta como cero.',
        ],
    }


def build_scheduled_water_report(period_mode: str, start: datetime, end: datetime) -> dict[str, Any]:
    if period_mode == 'previous_calendar_day_24h':
        report = get_daily_water_report(
            report_date=start.date().isoformat(),
            include_history=True,
            include_shifts=True,
        )
        report['period_mode'] = period_mode
        report['period_start_at'] = start.isoformat(timespec='minutes')
        report['period_end_at'] = end.isoformat(timespec='minutes')
        return report
    if period_mode == 'fixed_12h_blocks':
        return _fixed_12h_report(start, end)
    raise ValueError('Modo de periodo programado no soportado.')
