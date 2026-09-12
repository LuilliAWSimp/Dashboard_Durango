from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from app.services.durango_capabilities import LOCAL_TIMEZONE
from app.services.plant_time import local_now_naive
from app.services.water_period_service import WaterPeriodError, get_period_data
from app.services.water_shift_service import get_shift_consumption_data


class DailyReviewError(RuntimeError):
    def __init__(self, message: str, *, status: str = 'error') -> None:
        super().__init__(message)
        self.status = status


def _parse_date(value: Any = None) -> date:
    if value in (None, ''):
        return local_now_naive().date()
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError as exc:
        raise ValueError('La fecha de revisión debe usar formato YYYY-MM-DD.') from exc


def _canonical_item(item: dict[str, Any]) -> dict[str, Any]:
    row = dict(item)
    has_reconciliation = 'reconciled_open_m3' in row
    if has_reconciliation:
        reliable = bool(row.get('reconciled_volume_reliable'))
        volume = row.get('reconciled_validated_volume_m3') if reliable else None
        row.update({
            'period_open_m3': row.get('reconciled_open_m3'),
            'period_close_m3': row.get('reconciled_close_m3'),
            'period_m3': volume,
            'period_delta_m3': volume,
            'validated_volume_m3': volume,
            'period_m3_reliable': reliable,
            'volume_reliable': reliable,
            'has_discontinuities': bool(row.get('reconciled_has_discontinuities')),
            'discarded_volume_m3': row.get('reconciled_discarded_volume_m3') or 0.0,
            'discarded_totalizer_events': row.get('reconciled_discarded_totalizer_events') or 0,
            'validation': row.get('quality_label') or row.get('validation'),
            'validation_status': row.get('quality_status') or row.get('validation_status'),
            'data_status': row.get('quality_data_status') or row.get('data_status'),
        })

    quality_status = str(row.get('quality_status') or '')
    if quality_status == 'valid_zero':
        row['activity'] = 'Sin actividad'
        row['activity_status'] = 'Sin actividad'
    elif quality_status == 'validated':
        volume = row.get('validated_volume_m3')
        active_samples = int(row.get('active_samples') or 0)
        try:
            active = float(volume or 0) > 0 or active_samples > 0
        except (TypeError, ValueError):
            active = active_samples > 0
        row['activity'] = 'Con actividad' if active else 'Sin actividad'
        row['activity_status'] = row['activity']
    elif quality_status == 'partial_coverage':
        row['activity'] = 'Cobertura parcial'
        row['activity_status'] = 'Cobertura parcial'
    elif quality_status == 'review':
        row['activity'] = 'En revisión'
        row['activity_status'] = 'En revisión'
    elif quality_status == 'no_data':
        row['activity'] = 'Sin registros'
        row['activity_status'] = 'Sin registros'

    row['calculation_status'] = row.get('quality_label') or row.get('validation') or 'Sin datos'
    return row


def _module_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    reliable = [item for item in items if bool(item.get('volume_reliable')) and item.get('validated_volume_m3') is not None]
    subtotal = round(sum(float(item.get('validated_volume_m3') or 0.0) for item in reliable), 6) if reliable else None
    quality_counts: dict[str, int] = {}
    for item in items:
        key = str(item.get('quality_status') or 'no_data')
        quality_counts[key] = quality_counts.get(key, 0) + 1
    monitored = len(items)
    complete = monitored > 0 and len(reliable) == monitored
    return {
        'total_m3': subtotal,
        'validated_volume_m3': subtotal,
        'subtotal_validated_m3': subtotal,
        'complete_volume_m3': subtotal if complete else None,
        'coverage_complete': complete,
        'coverage_available': len(reliable),
        'coverage_total': monitored,
        'active_count': sum(1 for item in items if str(item.get('activity') or '') == 'Con actividad'),
        'inactive_count': sum(1 for item in items if str(item.get('activity') or '') == 'Sin actividad'),
        'current_flow_count': sum(1 for item in items if (item.get('current_flow') or 0) and str(item.get('communication_status') or '') == 'operational'),
        'review_count': sum(1 for item in items if str(item.get('quality_status') or '') in {'review', 'partial_coverage'}),
        'no_data_count': sum(1 for item in items if str(item.get('quality_status') or '') == 'no_data'),
        'quality_counts': quality_counts,
        'volume_label': 'Volumen validado' if complete else 'Subtotal validado',
    }


def _flow_subgroups(flows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    lavadoras: list[dict[str, Any]] = []
    jarabes: list[dict[str, Any]] = []
    other: list[dict[str, Any]] = []
    for item in flows:
        key = str(item.get('operational_key') or '').strip().lower()
        if key == 'jarabes':
            jarabes.append(item)
        elif key.startswith('lavadora_'):
            lavadoras.append(item)
        else:
            other.append(item)
    return lavadoras, jarabes, other


def _operational_group_summaries(
    wells: list[dict[str, Any]],
    lines: list[dict[str, Any]],
    flows: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    lavadoras, jarabes, other_flows = _flow_subgroups(flows)
    return {
        'wells': _module_summary(wells),
        'lines': _module_summary(lines),
        'lavadoras': _module_summary(lavadoras),
        'jarabes': _module_summary(jarabes),
        'other_flows': _module_summary(other_flows),
    }


def _period_payload(day: date, *, force_refresh: bool = False) -> dict[str, Any]:
    try:
        return get_period_data(day.isoformat(), day.isoformat(), force_refresh=force_refresh)
    except WaterPeriodError as exc:
        raise DailyReviewError(str(exc), status=exc.status) from exc


def _comparison(day: date, *, force_refresh: bool = False) -> dict[str, Any]:
    period = _period_payload(day, force_refresh=force_refresh)
    modules = {
        'wells': [_canonical_item(item) for item in period.get('wells') or []],
        'lines': [_canonical_item(item) for item in period.get('lines') or []],
        'flows': [_canonical_item(item) for item in period.get('flows') or []],
    }
    module_summaries = {key: _module_summary(items) for key, items in modules.items()}
    operational_groups = _operational_group_summaries(modules['wells'], modules['lines'], modules['flows'])
    values = [summary.get('subtotal_validated_m3') for summary in module_summaries.values()]
    valid_values = [float(value) for value in values if value is not None]
    return {
        'date': day.isoformat(),
        'modules': module_summaries,
        'operational_groups': operational_groups,
        'subtotal_validated_m3': round(sum(valid_values), 6) if valid_values else None,
        'coverage_complete': bool(module_summaries) and all(bool(summary.get('coverage_complete')) for summary in module_summaries.values()),
        'source_status': period.get('source_status'),
    }


def get_daily_water_review(
    review_date: Any = None,
    *,
    include_shifts: bool = True,
    include_comparatives: bool = True,
    force_refresh: bool = False,
) -> dict[str, Any]:
    day = _parse_date(review_date)
    period = _period_payload(day, force_refresh=force_refresh)

    wells = [_canonical_item(item) for item in period.get('wells') or []]
    lines = [_canonical_item(item) for item in period.get('lines') or []]
    flows = [_canonical_item(item) for item in period.get('flows') or []]
    summaries = {
        'wells': _module_summary(wells),
        'lines': _module_summary(lines),
        'flows': _module_summary(flows),
    }
    operational_groups = _operational_group_summaries(wells, lines, flows)
    all_items = [*wells, *lines, *flows]
    total_values = [summary.get('subtotal_validated_m3') for summary in summaries.values()]
    available_totals = [float(value) for value in total_values if value is not None]

    payload: dict[str, Any] = {
        'plant': 'Planta Durango',
        'date': day.isoformat(),
        'generated_at': local_now_naive().isoformat(timespec='seconds'),
        'timezone': LOCAL_TIMEZONE,
        'source_status': period.get('source_status'),
        'validated_segment_start': period.get('validated_segment_start'),
        'crosses_scada_cutover': bool(period.get('crosses_scada_cutover')),
        'legacy_notice': period.get('legacy_notice'),
        'has_future_intervals': bool(period.get('has_future_intervals')),
        'modules': {
            'wells': {'label': 'Pozos', 'items': wells, 'summary': summaries['wells']},
            'lines': {'label': 'Líneas', 'items': lines, 'summary': summaries['lines']},
            'flows': {'label': 'Flujos', 'items': flows, 'summary': summaries['flows']},
        },
        'operational_groups': operational_groups,
        'summary': {
            'subtotal_validated_m3': round(sum(available_totals), 6) if available_totals else None,
            'coverage_complete': all(bool(summary.get('coverage_complete')) for summary in summaries.values()),
            'monitored_count': len(all_items),
            'active_count': sum(int(summary.get('active_count') or 0) for summary in summaries.values()),
            'inactive_count': sum(int(summary.get('inactive_count') or 0) for summary in summaries.values()),
            'review_count': sum(int(summary.get('review_count') or 0) for summary in summaries.values()),
            'no_data_count': sum(int(summary.get('no_data_count') or 0) for summary in summaries.values()),
        },
        # Compatibility aliases used by the current Durango daily-review UI.
        'wells': wells,
        'production_lines': lines,
        'flows': flows,
        'operational_summary': summaries,
    }

    if include_comparatives:
        payload['comparatives'] = {
            'previous_day': _comparison(day - timedelta(days=1), force_refresh=False),
            'previous_week': _comparison(day - timedelta(days=7), force_refresh=False),
        }
    else:
        payload['comparatives'] = {}

    payload['shifts'] = get_shift_consumption_data(day.isoformat(), force_refresh=force_refresh) if include_shifts else None
    return payload
