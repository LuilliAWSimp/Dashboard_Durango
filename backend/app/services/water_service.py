from __future__ import annotations

from datetime import datetime
from typing import Any

from app.schemas.dashboard import KpiCard
from app.schemas.water import (
    BalancePoint,
    CipPoint,
    FilterTreatedPoint,
    HourlyFlowPoint,
    MonthlyAveragePoint,
    TankLevelItem,
    WaterDashboardPayload,
    WaterMetricItem,
    WaterSensorItem,
    WaterSourceInfo,
    WaterWellItem,
)
from app.services.water_source_service import load_active_source_payload
from app.services.water_bos_service import get_bos_water_dashboard_payload


WATER_SECTION_META = {
    'dashboard': ('Pozos', 'Monitoreo base de agua y balance hidráulico'),
    'pozos': ('Pozos', 'Monitoreo base de agua y balance hidráulico'),
    'consumos': ('Consumos', 'Lavadoras y puntos de consumo'),
    'tanques': ('Tanques', 'Sin sensores de nivel configurados para Durango'),
    'lineas': ('Líneas', 'Flujos de líneas de producción'),
    'flujos': ('Flujos', 'Sensores de flujo independientes'),
    'balance': ('Entradas vs salidas', 'Comparativo operativo de agua'),
    'reportes': ('Reportes', 'Base preparada para exportaciones y seguimiento'),
    'cip': ('CIP', 'Pendiente de fuente confirmada en Durango'),
    'uv': ('Lámparas UV', 'No aplica a la infraestructura confirmada de Durango'),
    'fuentes': ('Fuentes de pozos', 'Administración de datasets hidráulicos cargados'),
}

WATER_REPORT_MODULES = [
    'Pozos SQL Server',
    'Líneas SQL Server',
    'Lavadoras/Jarabes SQL Server',
    'Balance hidráulico SQL Server',
]


def _num(value: Any, default: float = 0) -> float:
    if value is None or value == '':
        return default
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).replace(',', '').strip())
    except ValueError:
        return default


def _metric(item: dict[str, Any]) -> WaterMetricItem:
    return WaterMetricItem(
        name=str(item.get('name', 'Métrica')),
        value=_num(item.get('value')),
        unit=str(item.get('unit', '')),
        detail=str(item.get('detail', '')),
    )


def _build_cards(wells: list[WaterWellItem], consumption: list[WaterMetricItem], source: WaterSourceInfo | None) -> list[KpiCard]:
    total_entry = sum(well.entry_m3 for well in wells)
    treated = next((item.value for item in consumption if item.name.lower() in {'tratada', 'agua tratada'}), 0)
    active_wells = sum(1 for well in wells if well.active)
    total_wells = len(wells)
    balance = total_entry - treated if treated else 0
    return [
        KpiCard(label='Entrada total de agua', value=f'{total_entry:,.0f}', unit='m³/día', trend='Suma de pozos cargados', accent='red'),
        KpiCard(label='Agua tratada', value=f'{treated:,.0f}', unit='m³/día', trend='Dato desde fuente activa', accent='crimson'),
        KpiCard(label='Balance neto', value=f'{balance:,.0f}', unit='m³', trend='Entrada - tratada', accent='wine'),
        KpiCard(label='Pozos operando', value=f'{active_wells}/{total_wells}', unit='pozos', trend=source.name if source else 'Sin fuente activa', accent='brown'),
    ]


def _empty_payload(section: str, source: WaterSourceInfo | None = None) -> WaterDashboardPayload:
    title, subtitle = WATER_SECTION_META.get(section, WATER_SECTION_META['dashboard'])
    suffix = 'No hay una fuente de pozos activa. Carga y activa una fuente para ver datos reales.'
    if source:
        suffix = 'La fuente activa no pudo leerse o no contiene datos válidos.'
    return WaterDashboardPayload(
        title=title,
        subtitle=f'{subtitle}. {suffix}',
        cards=[],
        water_entry_by_well=[],
        water_consumption=[],
        tank_levels=[],
        supply_hours=[],
        filters_vs_treated=[],
        cip_weekly=[],
        entry_vs_exit=[],
        monthly_averages=[],
        daily_indicators=[],
        report_modules=['Carga una fuente de pozos para habilitar reportes reales'],
        hourly_flow=[],
        wells=[],
        sensors=[],
        source_status='missing_data' if source else 'no_source',
        source=source,
        updated_at=datetime.utcnow(),
    )


def _normalize_dashboard_data(data: dict[str, Any], source: WaterSourceInfo | None) -> dict[str, Any]:
    wells = [WaterWellItem(**item) for item in data.get('wells', [])]
    sensors = [WaterSensorItem(**item) for item in data.get('sensors', [])]
    for well in wells:
        sensors.extend(well.sensors)

    seen_sensor_ids = set()
    unique_sensors = []
    for sensor in sensors:
        if sensor.id in seen_sensor_ids:
            continue
        seen_sensor_ids.add(sensor.id)
        unique_sensors.append(sensor)

    water_entry_by_well = [
        WaterMetricItem(
            name=well.name,
            value=well.entry_m3,
            unit='m³',
            detail='Entrada diaria' if well.active else 'Pozo inactivo',
        )
        for well in wells
    ]
    supply_hours = [
        WaterMetricItem(name=well.name, value=well.supply_hours, unit='hrs', detail='Suministro registrado')
        for well in wells
    ]
    water_consumption = [_metric(item) for item in data.get('water_consumption', [])]
    tank_levels = [TankLevelItem(**item) for item in data.get('tank_levels', [])]
    hourly_flow = [HourlyFlowPoint(**item) for item in data.get('hourly_flow', [])]
    filters_vs_treated = [FilterTreatedPoint(**item) for item in data.get('filters_vs_treated', [])]
    cip_weekly = [CipPoint(day=str(item.get('day', item.get('label', ''))), hours=_num(item.get('hours', item.get('value', 0)))) for item in data.get('cip_weekly', [])]
    entry_vs_exit = [
        BalancePoint(label=str(item.get('label', '')), entrada=_num(item.get('entrada')), salida=_num(item.get('salida')))
        for item in data.get('entry_vs_exit', [])
    ]
    monthly_averages = [
        MonthlyAveragePoint(
            month=str(item.get('month', item.get('mes', ''))),
            entrada=_num(item.get('entrada')),
            tratada=_num(item.get('tratada')),
            cruda=_num(item.get('cruda')),
            suave=_num(item.get('suave')),
        )
        for item in data.get('monthly_averages', [])
    ]
    daily_indicators = [_metric(item) for item in data.get('daily_indicators', [])]
    if not daily_indicators:
        daily_indicators = water_entry_by_well + water_consumption
    report_modules = [str(item) for item in data.get('report_modules', [])] or [
        'Dashboard base de pozos',
        'Reporte de entradas vs salidas',
        'Reporte semanal CIP',
        'Monitoreo UV (fase siguiente)',
    ]

    return {
        'wells': wells,
        'sensors': unique_sensors,
        'water_entry_by_well': water_entry_by_well,
        'supply_hours': supply_hours,
        'water_consumption': water_consumption,
        'tank_levels': tank_levels,
        'hourly_flow': hourly_flow,
        'filters_vs_treated': filters_vs_treated,
        'cip_weekly': cip_weekly,
        'entry_vs_exit': entry_vs_exit,
        'monthly_averages': monthly_averages,
        'daily_indicators': daily_indicators,
        'report_modules': report_modules,
        'cards': _build_cards(wells, water_consumption, source),
    }


def get_water_dashboard_payload(section: str = 'dashboard', start_date: Any = None, end_date: Any = None, period: Any = None, include_history: bool = False, include_energy_water: bool = False, force_refresh: bool = False) -> WaterDashboardPayload:
    title, subtitle = WATER_SECTION_META.get(section, WATER_SECTION_META['dashboard'])

    if section == 'tanques':
        empty = _empty_payload(section, None)
        empty.subtitle = f'{subtitle}. Sin niveles de tanques configurados para Durango.'
        empty.source_status = 'not_applicable_no_tank_levels'
        return empty

    bos_data = get_bos_water_dashboard_payload(start_date=start_date, end_date=end_date, period=period, include_history=include_history, include_energy_water=include_energy_water, force_refresh=force_refresh)
    if bos_data and bos_data.get('__sql_error__'):
        empty = _empty_payload(section, None)
        empty.subtitle = f'{subtitle}. Sin conexión a SQL Server ARCA.'
        empty.source_status = 'sql_error'
        return empty

    if bos_data:
        bos_data['title'] = title
        bos_data['subtitle'] = 'Lectura directa desde SQL Server ARCA / BOS'
        return WaterDashboardPayload(**bos_data)

    # No usar datos mock ni datasets locales como respaldo para las vistas operativas.
    # Si SQL Server no devuelve registros en el rango, se devuelve vacío para evitar mostrar datos falsos.
    empty = _empty_payload(section, None)
    empty.subtitle = f'{subtitle}. Sin registros disponibles en SQL Server ARCA para el rango seleccionado.'
    empty.source_status = 'sqlserver_empty'
    return empty


def get_water_report_catalog() -> list[str]:
    return list(WATER_REPORT_MODULES)
