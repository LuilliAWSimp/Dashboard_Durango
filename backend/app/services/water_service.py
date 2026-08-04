from __future__ import annotations

from datetime import datetime
from typing import Any

from app.schemas.dashboard import KpiCard
from app.schemas.water import WaterDashboardPayload
from app.services.durango_capabilities import capability_payload
from app.services.water_bos_service import get_bos_water_dashboard_payload
from app.services.water_period_service import WaterPeriodError, get_period_data

WATER_SECTION_META = {
    'dashboard': ('Resumen', 'Monitoreo hídrico operativo de Planta Durango'),
    'pozos': ('Pozos', 'Dos pozos confirmados'),
    'lineas': ('Líneas', 'Cinco líneas confirmadas'),
    'flujos': ('Flujos auxiliares', 'Lavadoras y Jarabes confirmados'),
    'tanques': ('Tanques', 'Pendiente de validación de niveles'),
    'balance': ('Comparativo Operativo de Agua', 'Comparación matemática de volúmenes confiables'),
    'concesion': ('Concesión', 'Pendiente de fuente confirmada'),
    'revision': ('Revisión diaria', 'Cierres y consumos por fecha'),
    'reportes': ('Reportes', 'PDF, Excel, vista y correo'),
    'consumos': ('Consumos', 'Puntos auxiliares confirmados'),
    'cip': ('CIP', 'Pendiente de fuente confirmada'),
    'uv': ('Lámparas UV', 'No confirmado para Durango'),
    'fuentes': ('Fuentes', 'Administración de fuentes hidráulicas'),
}

WATER_REPORT_MODULES = ['Pozos', 'Líneas', 'Flujos auxiliares', 'Cortes por turno', 'Comparativo operativo']


def _empty(section: str, status: str, message: str) -> WaterDashboardPayload:
    title, subtitle = WATER_SECTION_META.get(section, WATER_SECTION_META['dashboard'])
    return WaterDashboardPayload(
        title=title,
        subtitle=f'{subtitle}. {message}',
        cards=[], water_entry_by_well=[], water_consumption=[], tank_levels=[], supply_hours=[],
        filters_vs_treated=[], cip_weekly=[], entry_vs_exit=[], monthly_averages=[], daily_indicators=[],
        report_modules=WATER_REPORT_MODULES, hourly_flow=[], wells=[], sensors=[], source_status=status,
        source=None, updated_at=datetime.now(), production_lines=[], tank_inputs=[], distribution_flows=[],
        flows=[], plant_capabilities=capability_payload(),
    )


def _sensor_id(item: dict[str, Any]) -> int:
    try:
        return int(item.get('sensor_id') or item.get('id') or 0)
    except (TypeError, ValueError):
        return 0


def _merge_period(current_rows: list[dict[str, Any]], period_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_sensor = {_sensor_id(item): item for item in period_rows}
    result: list[dict[str, Any]] = []
    for current in current_rows:
        merged = dict(current)
        period = by_sensor.get(_sensor_id(current))
        if period:
            merged.update(period)
            # Mantener la lectura instantánea BOS cuando exista; el periodo no debe reemplazarla.
            if current.get('flow_lps') is not None:
                merged['current_flow'] = current.get('flow_lps')
                merged['flow_lps'] = current.get('flow_lps')
            elif current.get('flow') is not None:
                merged['current_flow'] = current.get('flow')
            if current.get('totalizador_m3') is not None:
                merged['current_totalizer_m3'] = current.get('totalizador_m3')
        result.append(merged)
    return result


def _cards(payload: dict[str, Any]) -> list[KpiCard]:
    summary = payload.get('operational_summary') or {}
    wells = summary.get('wells') or {}
    lines = summary.get('lines') or {}
    flows = summary.get('flows') or {}
    return [
        KpiCard(label='Volumen confiable de pozos', value=f"{float(wells.get('total_m3') or 0):,.2f}", unit='m³', trend=f"{wells.get('active_count', 0)}/2 con actividad", accent='blue'),
        KpiCard(label='Volumen confiable de líneas', value=f"{float(lines.get('total_m3') or 0):,.2f}", unit='m³', trend=f"{lines.get('active_count', 0)}/5 con actividad", accent='cyan'),
        KpiCard(label='Volumen de flujos auxiliares', value=f"{float(flows.get('total_m3') or 0):,.2f}", unit='m³', trend=f"{flows.get('active_count', 0)}/3 con actividad", accent='indigo'),
        KpiCard(label='Datos en revisión', value=str(int(wells.get('review_count', 0)) + int(lines.get('review_count', 0)) + int(flows.get('review_count', 0))), unit='elementos', trend='Excluidos de totales confiables', accent='brown'),
    ]


def get_water_dashboard_payload(section: str = 'dashboard', start_date: Any = None, end_date: Any = None, period: Any = None, include_history: bool = False, include_energy_water: bool = False, force_refresh: bool = False) -> WaterDashboardPayload:
    if section == 'tanques':
        payload = _empty(section, 'pending_validation', 'La instrumentación de niveles requiere validación antes de activarse.')
        payload.plant_capabilities = capability_payload()
        return payload
    if section == 'concesion':
        return _empty(section, 'pending_validation', 'No existe una fuente de concesión confirmada para Durango.')

    current = get_bos_water_dashboard_payload(
        start_date=None, end_date=None, period=None,
        include_history=False, include_energy_water=False, force_refresh=force_refresh,
    )
    if current and current.get('__sql_error__'):
        return _empty(section, 'sql_error', 'No fue posible consultar la información de planta.')
    if not current:
        return _empty(section, 'no_data', 'Sin registros operativos disponibles.')

    payload = dict(current)
    title, subtitle = WATER_SECTION_META.get(section, WATER_SECTION_META['dashboard'])
    payload['title'] = title
    payload['subtitle'] = subtitle
    payload['plant_capabilities'] = capability_payload()
    payload['report_modules'] = WATER_REPORT_MODULES

    # Los cálculos del periodo se solicitan de forma separada a la lectura actual.
    if start_date or end_date:
        try:
            period_payload = get_period_data(start_date, end_date)
            payload['wells'] = _merge_period(list(payload.get('wells') or []), period_payload['wells'])
            payload['production_lines'] = _merge_period(list(payload.get('production_lines') or []), period_payload['lines'])
            payload['flows'] = _merge_period(list(payload.get('flows') or []), period_payload['flows'])
            payload['tank_inputs'] = payload['flows']
            payload['period_data'] = period_payload
            payload['operational_summary'] = period_payload['summary']
            payload['period_source_status'] = period_payload['source_status']
        except WaterPeriodError as exc:
            payload['period_data'] = None
            payload['period_source_status'] = exc.status
            payload['period_error'] = str(exc)
    else:
        payload['operational_summary'] = {
            'wells': {'total_m3': 0, 'active_count': 0, 'inactive_count': 0, 'review_count': 0, 'coverage_available': 0, 'coverage_total': 2},
            'lines': {'total_m3': 0, 'active_count': 0, 'inactive_count': 0, 'review_count': 0, 'coverage_available': 0, 'coverage_total': 5},
            'flows': {'total_m3': 0, 'active_count': 0, 'inactive_count': 0, 'review_count': 0, 'coverage_available': 0, 'coverage_total': 3},
        }
    payload['cards'] = _cards(payload)
    return WaterDashboardPayload(**payload)


def get_water_report_catalog() -> list[str]:
    return list(WATER_REPORT_MODULES)
