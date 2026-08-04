from __future__ import annotations

from datetime import date, datetime, time, timedelta
from time import monotonic
from typing import Any
from zoneinfo import ZoneInfo

from app.services.durango_capabilities import ALL_ITEMS, LOCAL_TIMEZONE
from app.services.water_period_service import build_period_item, query_previous_closes, query_readings_window

LOCAL_ZONE = ZoneInfo(LOCAL_TIMEZONE)
_CACHE: dict[str, dict[str, Any]] = {}
CACHE_TTL_SECONDS = 5 * 60

SHIFT_DEFINITIONS = [
    {'id': 'shift_1', 'name': 'Turno 1', 'label': 'Primer turno', 'start': time(0, 0), 'end': time(7, 0), 'schedule': '00:00–07:00'},
    {'id': 'shift_2', 'name': 'Turno 2', 'label': 'Segundo turno', 'start': time(7, 0), 'end': time(15, 0), 'schedule': '07:00–15:00'},
    {'id': 'shift_3', 'name': 'Turno 3', 'label': 'Tercer turno', 'start': time(15, 0), 'end': time(0, 0), 'schedule': '15:00–24:00'},
]


def _as_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if value:
        try:
            return datetime.fromisoformat(str(value)[:10]).date()
        except ValueError:
            pass
    return datetime.now(LOCAL_ZONE).date()


def _window(day: date, definition: dict[str, Any]) -> tuple[datetime, datetime]:
    start = datetime.combine(day, definition['start'])
    if definition['id'] == 'shift_3':
        end = datetime.combine(day + timedelta(days=1), time.min)
    else:
        end = datetime.combine(day, definition['end'])
    return start, end


def _cut_status(day: date, start: datetime, end: datetime) -> tuple[str, datetime | None]:
    now = datetime.now(LOCAL_ZONE).replace(tzinfo=None)
    if day < now.date() or end <= now:
        return 'Cierre definitivo', end
    if start <= now < end:
        return 'Corte parcial', now
    return 'Pendiente', None


def _summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    reliable = [item for item in items if item.get('period_m3_reliable') and item.get('period_m3') is not None]
    return {
        'total_m3': round(sum(float(item['period_m3']) for item in reliable), 6) if reliable else None,
        'active_count': sum(1 for item in reliable if float(item.get('period_m3') or 0) > 0),
        'inactive_count': sum(1 for item in reliable if float(item.get('period_m3') or 0) == 0),
        'review_count': sum(1 for item in items if item.get('data_status') in {'invalid_totalizer', 'no_totalizer'}),
        'coverage_available': len(reliable),
        'coverage_total': len(items),
    }


def get_shift_consumption_data(report_date: Any = None, *, force_refresh: bool = False) -> dict[str, Any]:
    day = _as_date(report_date)
    cache_key = day.isoformat()
    cached = _CACHE.get(cache_key)
    if not force_refresh and cached and monotonic() < cached['expires_at']:
        return cached['value']

    sensor_ids = [int(item['sensor_id']) for item in ALL_ITEMS]
    shifts: list[dict[str, Any]] = []
    for definition in SHIFT_DEFINITIONS:
        start, scheduled_end = _window(day, definition)
        cut_status, effective_end = _cut_status(day, start, scheduled_end)
        if effective_end is None:
            shifts.append({
                **definition,
                'start_at': start.isoformat(timespec='seconds'),
                'end_at': scheduled_end.isoformat(timespec='seconds'),
                'cut_status': cut_status,
                'items': [],
                'wells': [],
                'lines': [],
                'flows': [],
                'summary': {
                    'wells': {'total_m3': None, 'active_count': 0, 'inactive_count': 0, 'review_count': 0, 'coverage_available': 0, 'coverage_total': 2},
                    'lines': {'total_m3': None, 'active_count': 0, 'inactive_count': 0, 'review_count': 0, 'coverage_available': 0, 'coverage_total': 5},
                    'flows': {'total_m3': None, 'active_count': 0, 'inactive_count': 0, 'review_count': 0, 'coverage_available': 0, 'coverage_total': 3},
                    'total_operational_m3': None,
                },
            })
            continue

        rows = query_readings_window(sensor_ids, start, effective_end)
        previous = query_previous_closes(sensor_ids, start)
        grouped: dict[int, list[dict[str, Any]]] = {sensor_id: [] for sensor_id in sensor_ids}
        for row in rows:
            sensor_id = int(row.get('sensor_id') or 0)
            if sensor_id in grouped:
                grouped[sensor_id].append(row)
        items = [
            build_period_item(contract, grouped[int(contract['sensor_id'])], previous.get(int(contract['sensor_id'])), day)
            for contract in ALL_ITEMS
        ]
        wells = [item for item in items if item.get('module') == 'well']
        lines = [item for item in items if item.get('module') == 'line']
        flows = [item for item in items if item.get('module') == 'flow']
        well_summary = _summary(wells)
        line_summary = _summary(lines)
        flow_summary = _summary(flows)
        shifts.append({
            **definition,
            'start_at': start.isoformat(timespec='seconds'),
            'end_at': scheduled_end.isoformat(timespec='seconds'),
            'effective_end_at': effective_end.isoformat(timespec='seconds'),
            'cut_status': cut_status,
            'items': items,
            'wells': wells,
            'lines': lines,
            'flows': flows,
            'summary': {
                'wells': well_summary,
                'lines': line_summary,
                'flows': flow_summary,
                'total_operational_m3': round(sum(value for value in (well_summary['total_m3'], line_summary['total_m3'], flow_summary['total_m3']) if value is not None), 6) if any(value is not None for value in (well_summary['total_m3'], line_summary['total_m3'], flow_summary['total_m3'])) else None,
            },
        })

    payload = {
        'plant': 'Planta Durango',
        'date': day.isoformat(),
        'generated_at': datetime.now(LOCAL_ZONE).isoformat(timespec='seconds'),
        'shifts': shifts,
        'source_status': 'operational',
    }
    _CACHE[cache_key] = {'expires_at': monotonic() + CACHE_TTL_SECONDS, 'value': payload}
    return payload
