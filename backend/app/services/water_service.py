from __future__ import annotations

from datetime import datetime
from typing import Any

from app.schemas.dashboard import KpiCard
from app.schemas.water import WaterDashboardPayload
from app.services.durango_capabilities import capability_payload
from app.services.water_bos_service import get_bos_water_dashboard_payload
from app.services.water_period_service import WaterPeriodError, get_period_data, summarize_period_items

WATER_SECTION_META = {
    'dashboard': ('Resumen', 'Monitoreo hídrico operativo de Planta Durango'),
    'pozos': ('Pozos', 'Dos pozos confirmados'),
    'lineas': ('Líneas', 'Cinco líneas confirmadas'),
    'flujos': ('Lavadoras', 'Lavadora Vidrio y Lavadora Ref Pet'),
    'balance': ('Comparativo Operativo de Agua', 'Comparación matemática de volúmenes confiables'),
    'concesion': ('Concesión', 'Pendiente de fuente confirmada'),
    'revision': ('Revisión diaria', 'Cierres y consumos por fecha'),
    'reportes': ('Reportes', 'PDF, Excel, vista y correo'),
    'consumos': ('Consumos', 'Puntos auxiliares confirmados'),
    'cip': ('CIP', 'Pendiente de fuente confirmada'),
    'uv': ('Lámparas UV', 'No confirmado para Durango'),
    'fuentes': ('Fuentes', 'Administración de fuentes hidráulicas'),
}

WATER_REPORT_MODULES = ['Pozos', 'Líneas', 'Lavadoras', 'Cortes por turno', 'Comparativo operativo']


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


def _integer_identity(value: Any) -> int:
    if value in (None, ''):
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        digits = ''.join(character for character in str(value) if character.isdigit())
        return int(digits) if digits else 0


def _item_identity(item: dict[str, Any]) -> str:
    """Resolve the canonical operational sensor for current and period rows.

    Legacy well rows used ``id=pozo-1`` plus ``flow_out_sensor_id`` while the
    period service uses ``sensor_id=1001``. Resolving all supported aliases
    prevents the same well from being appended a second time during the merge.
    """
    for key in ('sensor_id', 'water_sensor_id', 'flow_out_sensor_id'):
        candidate = _integer_identity(item.get(key))
        if candidate:
            return str(candidate)
    operational_key = str(item.get('operational_key') or '').strip().lower()
    if operational_key:
        return operational_key
    fallback = str(item.get('id') or '').strip().lower()
    return fallback if fallback and not fallback.startswith(('pozo-', 'linea-')) else str(_integer_identity(fallback) or '')


def _merge_period(current_rows: list[dict[str, Any]], period_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_sensor = {_item_identity(item): item for item in period_rows if _item_identity(item)}
    current_by_sensor: dict[str, dict[str, Any]] = {}
    current_without_sensor: list[dict[str, Any]] = []
    for current in current_rows:
        current_sensor = _item_identity(current)
        if current_sensor:
            # Keep the latest occurrence only. This is a defensive guard for
            # inherited BOS payloads that expose the same position twice.
            current_by_sensor[current_sensor] = current
        else:
            current_without_sensor.append(current)

    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for current_sensor, current in current_by_sensor.items():
        merged = dict(current)
        period = by_sensor.get(current_sensor)
        seen.add(current_sensor)
        if period:
            merged.update(period)
            merged['operational_key'] = period.get('operational_key') or current.get('operational_key') or current_sensor
            if period.get('sensor_id') is not None or current.get('sensor_id') is not None:
                merged['sensor_id'] = period.get('sensor_id') if period.get('sensor_id') is not None else current.get('sensor_id')
            merged['period_activity'] = period.get('activity')
            merged['period_data_status'] = period.get('data_status')
            current_flow = current.get('flow_lps') if current.get('flow_lps') is not None else current.get('flow')
            current_totalizer = current.get('totalizador_m3')
            current_stamp = current.get('last_update') or current.get('ultima_lectura') or current.get('updated')
            if current_flow is not None:
                merged['current_flow'] = current_flow
                merged['flow_lps'] = current_flow
            if current_totalizer is not None:
                merged['current_totalizer_m3'] = current_totalizer
                merged['totalizador_m3'] = current_totalizer
            if current.get('estado_comunicacion') is not None:
                merged['communication'] = current.get('estado_comunicacion')
                merged['estado_comunicacion'] = current.get('estado_comunicacion')
            if current.get('communicationType') is not None:
                merged['communication_status'] = current.get('communicationType')
            if current_stamp:
                merged['last_update'] = current_stamp
                merged['ultima_lectura'] = current_stamp
            merged['current_reading_available'] = bool(current_flow is not None or current_totalizer is not None or current_stamp)
        result.append(merged)

    for sensor_id, period in by_sensor.items():
        if sensor_id not in seen:
            result.append(dict(period))

    # Rows with no resolvable operational identity cannot be safely associated
    # with a confirmed element, so they remain at the end without duplicating a
    # confirmed sensor.
    result.extend(current_without_sensor)
    return result


def _cards(payload: dict[str, Any]) -> list[KpiCard]:
    summary = payload.get('operational_summary') or {}
    wells = summary.get('wells') or {}
    lines = summary.get('lines') or {}
    flows = summary.get('flows') or {}

    def value(group: dict[str, Any]) -> str:
        total = group.get('total_m3')
        return 'No disponible' if total is None else f"{float(total):,.2f}"

    def unit(group: dict[str, Any]) -> str:
        return '' if group.get('total_m3') is None else 'm³'

    def trend(group: dict[str, Any], total: int) -> str:
        if int(group.get('coverage_available') or 0) == 0:
            return 'No disponible'
        prefix = 'Volumen validado parcial · ' if group.get('has_partial_volume') else ''
        return f"{prefix}{group.get('active_count', 0)}/{total} con actividad · {group.get('current_flow_count', 0)}/{total} con flujo actual"

    return [
        KpiCard(label='Volumen validado de pozos', value=value(wells), unit=unit(wells), trend=trend(wells, 2), accent='blue'),
        KpiCard(label='Volumen validado de líneas', value=value(lines), unit=unit(lines), trend=trend(lines, 5), accent='cyan'),
        KpiCard(label='Volumen validado de lavadoras', value=value(flows), unit=unit(flows), trend=trend(flows, 2), accent='indigo'),
        KpiCard(label='Datos en revisión', value=str(int(wells.get('review_count', 0)) + int(lines.get('review_count', 0)) + int(flows.get('review_count', 0))), unit='elementos', trend='Pueden conservar volumen validado parcial', accent='brown'),
    ]


def get_water_dashboard_payload(section: str = 'dashboard', start_date: Any = None, end_date: Any = None, period: Any = None, include_history: bool = False, include_energy_water: bool = False, force_refresh: bool = False) -> WaterDashboardPayload:
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
            period_payload = get_period_data(start_date, end_date, force_refresh=force_refresh)
            payload['wells'] = _merge_period(list(payload.get('wells') or []), period_payload['wells'])
            payload['production_lines'] = _merge_period(list(payload.get('production_lines') or []), period_payload['lines'])
            payload['flows'] = _merge_period(list(payload.get('flows') or []), period_payload['flows'])
            payload['tank_inputs'] = []
            payload['period_data'] = period_payload
            payload['operational_summary'] = {
                'wells': summarize_period_items(payload['wells']),
                'lines': summarize_period_items(payload['production_lines']),
                'flows': summarize_period_items(payload['flows']),
            }
            payload['period_source_status'] = period_payload['source_status']
        except WaterPeriodError as exc:
            payload['period_data'] = None
            payload['period_source_status'] = exc.status
            payload['period_error'] = str(exc)
    else:
        payload['operational_summary'] = {
            'wells': summarize_period_items(list(payload.get('wells') or [])),
            'lines': summarize_period_items(list(payload.get('production_lines') or [])),
            'flows': summarize_period_items(list(payload.get('flows') or [])),
        }
    # Construir siempre el Resumen a partir de las mismas colecciones
    # normalizadas que alimentan tarjetas, tablas y revisión diaria.
    payload['operational_summary'] = {
        'wells': summarize_period_items(list(payload.get('wells') or [])),
        'lines': summarize_period_items(list(payload.get('production_lines') or [])),
        'flows': summarize_period_items(list(payload.get('flows') or [])),
    }
    payload['cards'] = _cards(payload)
    return WaterDashboardPayload(**payload)


def get_water_report_catalog() -> list[str]:
    return list(WATER_REPORT_MODULES)
