"""Contrato operativo central de Dashboard ARCA Durango.

Solo contiene mapeos confirmados para esta planta. Los modulos pendientes no se
activan automaticamente y las unidades permanecen configurables por elemento.
"""
from __future__ import annotations

from typing import Any

PLANT_KEY = 'durango'
PLANT_NAME = 'Planta Durango'
PLANT_TITLE = 'Durango'
LOCAL_TIMEZONE = 'America/Mexico_City'
# Durango operational timestamps are interpreted as UTC and normalized to the
# plant clock before filtering, bucketing, display and freshness labels.
SOURCE_TIMESTAMP_TIMEZONE = 'UTC'

CAPABILITIES: dict[str, str | bool] = {
    'wells': True,
    'lines': True,
    'flows': True,
    'tanks': 'pending_validation',
    'concession': 'pending_validation',
    'energy': False,
    'reports': True,
    'shifts': True,
}

WELLS: list[dict[str, Any]] = [
    {'sensor_id': 1001, 'name': 'Pozo 1', 'display_name': 'Pozo 1', 'group': 'well', 'flow_unit': 'L/s', 'unit_status': 'current_configuration'},
    {'sensor_id': 1051, 'name': 'Pozo 2', 'display_name': 'Pozo 2', 'group': 'well', 'flow_unit': 'L/s', 'unit_status': 'current_configuration'},
]

# El orden operativo de Durango no sigue una secuencia numerica de sensor.
LINES: list[dict[str, Any]] = [
    {'sensor_id': 2002, 'name': 'Línea 1', 'display_name': 'Línea 1', 'group': 'line', 'flow_unit': 'L/s', 'unit_status': 'current_configuration'},
    {'sensor_id': 2006, 'name': 'Línea 2', 'display_name': 'Línea 2', 'group': 'line', 'flow_unit': 'L/s', 'unit_status': 'current_configuration'},
    {'sensor_id': 2004, 'name': 'Línea 3', 'display_name': 'Línea 3', 'group': 'line', 'flow_unit': 'L/s', 'unit_status': 'current_configuration'},
    {'sensor_id': 2008, 'name': 'Línea 4', 'display_name': 'Línea 4', 'group': 'line', 'flow_unit': 'L/s', 'unit_status': 'current_configuration'},
    {'sensor_id': 2010, 'name': 'Línea 5', 'display_name': 'Línea 5', 'group': 'line', 'flow_unit': 'L/s', 'unit_status': 'current_configuration'},
]

FLOWS: list[dict[str, Any]] = [
    {'sensor_id': 3002, 'name': 'Lavadora Ciel', 'display_name': 'Lavadora Ciel', 'group': 'flow', 'category': 'lavadora', 'source_tokens': ['CIEL'], 'flow_unit': 'L/s', 'unit_status': 'current_configuration'},
    {'sensor_id': 3004, 'name': 'Jarabes', 'display_name': 'Jarabes', 'group': 'flow', 'category': 'flujo', 'source_tokens': ['JARABE'], 'flow_unit': 'L/s', 'unit_status': 'current_configuration'},
    {'sensor_id': 3006, 'name': 'Lavadora de Vidrio', 'display_name': 'Lavadora de Vidrio', 'group': 'flow', 'category': 'lavadora', 'source_tokens': ['VIDRIO'], 'flow_unit': 'L/s', 'unit_status': 'current_configuration'},
]

ALL_ITEMS = [*WELLS, *LINES, *FLOWS]
ITEM_BY_SENSOR = {int(item['sensor_id']): dict(item) for item in ALL_ITEMS}
SENSORS_BY_MODULE = {
    'well': [int(item['sensor_id']) for item in WELLS],
    'line': [int(item['sensor_id']) for item in LINES],
    'flow': [int(item['sensor_id']) for item in FLOWS],
}

ACTIVE_MODULES = ['Resumen', 'Pozos', 'Líneas', 'Flujos', 'Comparativo Operativo de Agua', 'Revisión diaria', 'Reportes']
PENDING_MODULES = ['Tanques', 'Concesión']
DISABLED_MODULES = ['Energía']

TANKS_DIAGNOSTIC = {
    'status': 'pending_validation',
    'message': 'Tanques pendiente de validación operativa.',
    'diagnostic_sql_file': 'docs/diagnostico_niveles_durango.sql',
}


def sensor_contract(sensor_id: int | str | None) -> dict[str, Any]:
    try:
        parsed = int(sensor_id)
    except (TypeError, ValueError):
        parsed = -1
    return dict(ITEM_BY_SENSOR.get(parsed, {
        'sensor_id': parsed,
        'display_name': 'Elemento no confirmado',
        'group': 'unconfirmed',
        'flow_unit': 'L/s',
        'unit_status': 'pending',
    }))


def flow_unit_for_sensor(sensor_id: int | str | None) -> str:
    return str(sensor_contract(sensor_id).get('flow_unit') or 'Unidad por confirmar')


def capability_payload() -> dict[str, Any]:
    return {
        'plant': PLANT_NAME,
        'capabilities': CAPABILITIES,
        'active_modules': ACTIVE_MODULES,
        'pending_modules': PENDING_MODULES,
        'disabled_modules': DISABLED_MODULES,
        'wells': WELLS,
        'lines': LINES,
        'flows': FLOWS,
        'tanks': TANKS_DIAGNOSTIC,
    }
