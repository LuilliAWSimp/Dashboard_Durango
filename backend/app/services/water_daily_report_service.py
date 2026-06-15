from __future__ import annotations

from datetime import datetime, date
from typing import Any

from app.services.water_bos_service import get_bos_water_dashboard_payload


def _num(value: Any, default: float = 0.0) -> float:
    if value is None or value == '':
        return default
    try:
        return float(str(value).replace(',', '').strip())
    except (TypeError, ValueError):
        return default


def _parse_date(value: Any = None) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if value:
        try:
            return datetime.fromisoformat(str(value)[:10]).date()
        except ValueError:
            pass
    return datetime.utcnow().date()


def _report_code(day: date) -> str:
    return f"RPDGO{day.strftime('%d%m%y')}"


def _pct(value: float, total: float) -> float:
    return round((value / total) * 100, 2) if total else 0.0


def _missing(payload: dict[str, Any], flow_rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    missing: list[dict[str, str]] = []

    if not payload.get('wells'):
        missing.append({
            'name': 'Pozos Durango',
            'detail': 'No se recibieron lecturas operativas de pozos para el periodo consultado.',
        })
    if not payload.get('production_lines'):
        missing.append({
            'name': 'Lineas Durango',
            'detail': 'No se recibieron lecturas operativas de lineas para el periodo consultado.',
        })
    if not flow_rows:
        missing.append({
            'name': 'Lavadoras y Jarabes',
            'detail': 'No se recibieron lecturas de puntos auxiliares para lavadoras/Jarabes.',
        })

    return missing


def _status_text(item: dict[str, Any]) -> str:
    return str(item.get('status') or item.get('estado') or ('Operando' if item.get('active') else 'Sin flujo'))


def get_daily_water_report(report_date: Any = None, start_date: Any = None, end_date: Any = None) -> dict[str, Any]:
    selected_day = _parse_date(report_date or end_date or start_date)
    query_start = report_date or start_date or selected_day.isoformat()
    query_end = report_date or end_date or selected_day.isoformat()
    # Reporte diario Durango: reutiliza solamente lecturas operativas BOS ya disponibles.
    # No solicita historicos pesados ni iot.sp_get_energy_water.
    payload = get_bos_water_dashboard_payload(
        start_date=query_start,
        end_date=query_end,
        period='daily',
        include_history=False,
        include_energy_water=False,
    ) or {}

    wells = payload.get('wells') or []
    lines = payload.get('production_lines') or []
    flows = payload.get('flows') or payload.get('tank_inputs') or []
    entry_exit = payload.get('entry_vs_exit') or []

    entry_rows: list[dict[str, Any]] = []
    total_pozos = 0.0
    for idx, well in enumerate(wells, start=1):
        name = str(well.get('nombre') or well.get('name') or f'Pozo {idx}')
        supply = _num(well.get('period_m3') or well.get('entry_m3') or well.get('period_delta_m3') or 0)
        total_pozos += supply
        equipo = f"Pozo {well.get('numero') or idx}"
        entry_rows.append({
            'equipo': equipo,
            'ubicacion': well.get('ubicacion') or name,
            'suministro_m3': round(supply, 2),
            'flujo_lps': round(_num(well.get('flow') or well.get('flujo_salida') or well.get('flujo_entrada')), 2),
            'estado': _status_text(well),
            'comunicacion': well.get('estado_comunicacion') or 'Dato BOS',
            'ultima_lectura': well.get('ultima_lectura') or well.get('updated') or '',
            'fuente_consumo': well.get('period_source') or 'BOS',
        })

    line_rows: list[dict[str, Any]] = []
    for idx, line in enumerate(lines, start=1):
        line_rows.append({
            'linea': line.get('nombre') or line.get('name') or f'Linea {idx}',
            'sensor_id': line.get('sensor_id'),
            'flujo_lps': round(_num(line.get('flow_lps') or line.get('flujo_lps') or line.get('flow')), 2),
            'totalizador_m3': round(_num(line.get('total_m3') or line.get('totalizador_m3')), 2),
            'volumen_periodo_m3': round(_num(line.get('period_m3') or line.get('period_delta_m3') or line.get('volumen_periodo_m3')), 2),
            'estado': _status_text(line),
            'ultima_lectura': line.get('ultima_lectura') or line.get('updated') or '',
        })

    flow_rows: list[dict[str, Any]] = []
    for idx, item in enumerate(flows, start=1):
        sensor_id = int(_num(item.get('sensor_id'), 0)) if item.get('sensor_id') is not None else None
        category = str(item.get('category') or '').lower()
        observation_parts: list[str] = []
        flow_lps = _num(item.get('flow_lps') or item.get('flujo_lps') or item.get('flow'))
        volume_period = _num(item.get('period_m3') or item.get('period_delta_m3') or item.get('volumen_periodo_m3'))
        if flow_lps <= 0 and volume_period > 0:
            observation_parts.append('Sin flujo instantaneo; totalizador con avance en el periodo.')
        flow_rows.append({
            'equipo': item.get('nombre') or item.get('name') or f'Punto {idx}',
            'sensor_id': sensor_id,
            'tipo': 'Lavadora' if category == 'lavadora' else 'Flujo',
            'flujo_lps': round(flow_lps, 2),
            'totalizador_m3': round(_num(item.get('total_m3') or item.get('totalizador_m3')), 2),
            'volumen_periodo_m3': round(volume_period, 2),
            'estado': _status_text(item),
            'observacion': ' '.join(observation_parts),
        })

    flow_period_total = sum(_num(item.get('volumen_periodo_m3')) for item in flow_rows)
    consumption_rows = [
        {
            'equipo': item.get('equipo'),
            'ubicacion': f"Sensor {item.get('sensor_id') or '—'} · {item.get('tipo')}",
            'suministro': item.get('volumen_periodo_m3'),
            'unidad': 'm3 periodo',
            'porcentaje': _pct(_num(item.get('volumen_periodo_m3')), flow_period_total),
        }
        for item in flow_rows
    ]

    line_period_total = sum(_num(item.get('volumen_periodo_m3')) for item in line_rows)
    total_entry = total_pozos
    supply_24h = [
        {
            'equipo': row['equipo'],
            'ubicacion': row['ubicacion'],
            'lectura_inicio_m3': None,
            'lectura_final_m3': round(_num(wells[idx].get('totalizador_m3')) if idx < len(wells) else row['suministro_m3'], 2),
            'suministro_m3': row['suministro_m3'],
        }
        for idx, row in enumerate(entry_rows)
    ]

    missing = _missing(payload, flow_rows)
    return {
        'title': 'Reporte Diario de Agua',
        'plant': 'Planta Durango',
        'report_code': _report_code(selected_day),
        'date': selected_day.isoformat(),
        'generated_at': datetime.utcnow().isoformat(),
        'source_status': payload.get('source_status', 'sqlserver_empty'),
        'data_source': 'Datos operativos Durango',
        'energy_water': {
            'rows': [],
            'source': 'Sin fuente energetica confirmada en Durango',
        },
        'water_entry': {
            'rows': entry_rows,
            'total_pozos_m3': round(total_pozos, 2),
            'total_entrada_m3': round(total_entry, 2),
        },
        'water_consumption': {
            'rows': consumption_rows,
            'total': round(flow_period_total, 2),
        },
        'production_lines': {'rows': line_rows, 'total': round(line_period_total, 2)},
        'operational_flows': {'rows': flow_rows, 'total': round(flow_period_total, 2)},
        'tank_levels': {'rows': []},
        'supply_24h': {'rows': supply_24h, 'note': 'Suministro del periodo calculado con diferencias de totalizadores BOS cuando estan disponibles.'},
        'entry_vs_exit': {'rows': entry_exit},
        'filters_vs_treated': {'rows': []},
        'cip_hourly': {'rows': []},
        'monthly_averages': {'rows': []},
        'daily_indicators': {'rows': payload.get('daily_indicators') or []},
        'missing_fields': missing,
        'completeness': {
            'available_sections': [
                name for name, ok in [
                    ('Entrada de Agua', bool(entry_rows)),
                    ('Lineas', bool(line_rows)),
                    ('Lavadoras y Jarabes', bool(flow_rows)),
                    ('Entradas vs Salidas', bool(entry_exit)),
                ] if ok
            ],
            'pending_count': len(missing),
        },
    }
