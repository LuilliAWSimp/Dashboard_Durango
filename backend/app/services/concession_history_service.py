"""Lecturas mensuales operativas de pozos para Concesiones Durango.

Reutiliza el histórico diario y su verificación de incrementos del totalizador.
NO calcula extracción legal de la concesión, saldo ni cumplimiento regulatorio.
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date
from math import isfinite

from app.services.concession_service import _WELLS
from app.services.durango_capabilities import DURANGO_SCADA_CUTOVER_LOCAL
from app.services.plant_time import local_now_naive
from app.services.water_history_service import get_water_history_module


def _as_number(value):
    try:
        parsed = float(value)
        return parsed if isfinite(parsed) and parsed >= 0 else None
    except (ValueError, TypeError):
        return None


def summarize_months(history: dict, *, year: int, start: date, end: date) -> dict:
    """La falta de lectura nunca se transforma en consumo cero."""
    by_sensor = {int(item['sensor_id']): item for item in history.get('series', []) if item.get('sensor_id') is not None}
    wells = []
    for well_key, (well_name, sensor_id, _title, _authorized) in _WELLS.items():
        series = by_sensor.get(sensor_id, {})
        points = series.get('points') or []
        indexed = {str(p.get('bucket_start', ''))[:10]: p for p in points}
        months = []
        for month in range(1, 13):
            first = date(year, month, 1)
            last = date(year, month, monthrange(year, month)[1])
            month_start, month_end = max(first, start), min(last, end)
            if month_start > month_end:
                months.append({'month': month, 'volume_m3': None, 'days_with_volume': 0,
                               'days_without_data': 0, 'days_excluded': 0,
                               'coverage_percent': None, 'status': 'outside_window'})
                continue
            count_valid = count_missing = count_excluded = received = expected = 0
            total = 0.0
            current = month_start
            from datetime import timedelta
            while current <= month_end:
                point = indexed.get(current.isoformat())
                if point is None:
                    count_missing += 1
                else:
                    # La cobertura pertenece al sensor operativo; no sustituye una auditoría legal.
                    samples = int(point.get('samples_received') or point.get('samples') or 0)
                    received += samples
                    expected += int(point.get('samples_expected') or 0)
                    measured = _as_number(point.get('volume_m3'))
                    if bool(point.get('volume_reliable')) and measured is not None and samples > 0:
                        total += measured
                        count_valid += 1
                    elif samples > 0:
                        count_excluded += 1
                    else:
                        count_missing += 1
                current += timedelta(days=1)
            has_volume = count_valid > 0
            partial = bool(count_missing or count_excluded or (expected and received < expected))
            months.append({
                'month': month,
                'volume_m3': round(total, 3) if has_volume else None,
                'days_with_volume': count_valid,
                'days_without_data': count_missing,
                'days_excluded': count_excluded,
                'coverage_percent': round(min(100.0, received / expected * 100), 1) if expected else None,
                'status': 'partial' if partial and has_volume else 'available' if has_volume else 'no_data',
            })
        valid_months = [item for item in months if item['volume_m3'] is not None]
        wells.append({
            'well_key': well_key, 'well_name': well_name, 'sensor_id': sensor_id,
            'months': months,
            'operational_total_m3': round(sum(item['volume_m3'] for item in valid_months), 3) if valid_months else None,
            'months_with_data': len(valid_months),
            'has_partial_coverage': start > date(year, 1, 1) or any(item['status'] == 'partial' for item in months),
        })
    return {
        'year': year,
        'period_start': start.isoformat(), 'period_end': end.isoformat(),
        'source': 'water_history_module_daily',
        'legal_period_verified': False,
        'historical_scope_notice': ('La fuente histórica operativa disponible comienza después del corte SCADA. '
                                    'Los meses sin mediciones no equivalen a cero consumo.'),
        'wells': wells,
    }


def get_concession_monthly_history(year: int) -> dict:
    today = local_now_naive().date()
    minimum = DURANGO_SCADA_CUTOVER_LOCAL.date()
    if year < minimum.year or year > today.year:
        raise ValueError(f'El año debe estar entre {minimum.year} y {today.year}.')
    start = max(date(year, 1, 1), minimum)
    end = min(date(year, 12, 31), today)
    history = get_water_history_module(module='well', start_date=start.isoformat(),
                                       end_date=end.isoformat(), aggregation='daily')
    return summarize_months(history, year=year, start=start, end=end)
