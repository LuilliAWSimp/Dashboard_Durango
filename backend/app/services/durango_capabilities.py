"""Contrato operativo central de Dashboard ARCA Durango.

La configuración posterior al cambio de SCADA vive únicamente aquí. Los datos
anteriores al corte no se relabelan con este contrato y nunca se mezclan con el
segmento validado posterior.
"""
from __future__ import annotations

from datetime import datetime, timezone
import math
import struct
from typing import Any
from zoneinfo import ZoneInfo

PLANT_KEY = 'durango'
PLANT_NAME = 'Planta Durango'
PLANT_TITLE = 'Durango'
LOCAL_TIMEZONE = 'America/Mexico_City'
UTC_TIMEZONE = 'UTC'

DURANGO_SCADA_CUTOVER_LOCAL = datetime(2026, 8, 4, 18, 16, 0)
DURANGO_SCADA_CUTOVER_UTC = (
    DURANGO_SCADA_CUTOVER_LOCAL
    .replace(tzinfo=ZoneInfo(LOCAL_TIMEZONE))
    .astimezone(timezone.utc)
    .replace(tzinfo=None)
)

CAPABILITIES: dict[str, str | bool] = {
    'wells': True,
    'lines': True,
    'flows': True,
    'washers': True,
    'jarabes': True,
    'tanks': False,
    'concession': 'pending_validation',
    'energy': False,
    'reports': True,
    'shifts': True,
}


def _common(*, key: str, name: str, group: str, order: int) -> dict[str, Any]:
    return {
        'operational_key': key,
        'name': name,
        'display_name': name,
        'group': group,
        'module': group,
        'display_flow_unit': 'L/s',
        'flow_unit': 'L/s',
        'timezone': LOCAL_TIMEZONE,
        'cutover_local': DURANGO_SCADA_CUTOVER_LOCAL.isoformat(timespec='seconds'),
        'presentation_order': order,
        'enabled': True,
        'unit_status': 'confirmed_after_scada_cutover',
    }


WELLS: list[dict[str, Any]] = [
    {
        **_common(key='pozo_1', name='Pozo 1', group='well', order=1),
        'sensor_id': 1001,
        'table': 'dbo.SensorsBOS_Pozo',
        'source_key': 'POZO_FLOW_OUT[0]',
        'slot_index': 0,
        'raw_flow_unit': 'm3/h',
        'flow_normalization_factor': 1 / 3.6,
        'totalizer_unit': 'm3',
        'source_timestamp_timezone': LOCAL_TIMEZONE,
        'require_flow_validation': True,
    },
    {
        **_common(key='pozo_2', name='Pozo 2', group='well', order=2),
        'sensor_id': 1051,
        'table': 'dbo.SensorsBOS_Pozo',
        'source_key': 'POZO_FLOW_OUT[1]',
        'slot_index': 1,
        'raw_flow_unit': 'L/s',
        'flow_normalization_factor': 1.0,
        'totalizer_unit': 'm3',
        'source_timestamp_timezone': LOCAL_TIMEZONE,
        'require_flow_validation': True,
    },
]

LINES: list[dict[str, Any]] = [
    {
        **_common(key=f'linea_{index + 1}', name=f'Línea {index + 1}', group='line', order=index + 1),
        'sensor_id': sensor_id,
        'table': 'dbo.SensorsBOS_Linea',
        'source_key': f'LINEA_FLOW_IN[{index}]',
        'slot_index': index,
        'raw_flow_unit': 'L/s',
        'flow_normalization_factor': 1.0,
        'totalizer_unit': 'm3',
        'source_timestamp_timezone': LOCAL_TIMEZONE,
        'require_flow_validation': False,
    }
    for index, sensor_id in enumerate((2002, 2004, 2006, 2008, 2010))
]

LAVADORAS: list[dict[str, Any]] = [
    {
        **_common(key='lavadora_vidrio', name='Lavadora Vidrio', group='flow', order=1),
        'sensor_id': None,
        'table': 'dbo.SensorsBOS_Lavadoras',
        'source_key': 'LAVADORAS_0',
        'instant_column': 'LAVADORAS_0_instant_value',
        'total_column': 'LAVADORAS_0_total_value',
        'raw_flow_unit': 'L/s',
        'flow_normalization_factor': 1.0,
        'totalizer_unit': 'm3',
        'source_timestamp_timezone': UTC_TIMEZONE,
        'require_flow_validation': True,
    },
    {
        **_common(key='lavadora_ref_pet', name='Lavadora Ref Pet', group='flow', order=2),
        'sensor_id': None,
        'table': 'dbo.SensorsBOS_Lavadoras',
        'source_key': 'LAVADORAS_1',
        'instant_column': 'LAVADORAS_1_instant_value',
        'total_column': 'LAVADORAS_1_total_value',
        'raw_flow_unit': 'L/s',
        'flow_normalization_factor': 1.0,
        'totalizer_unit': 'm3',
        'source_timestamp_timezone': UTC_TIMEZONE,
        'require_flow_validation': True,
    },
]

JARABES: list[dict[str, Any]] = [
    {
        **_common(key='jarabes', name='Jarabes', group='flow', order=3),
        'sensor_id': 3010,
        'table': 'dbo.SensorsBOS_Tanque',
        'source_key': 'TANQUE_FLOW_IN[4]',
        'slot_index': 4,
        'instant_column': 'TANQUE_FLOW_IN_4_instant_value',
        'total_column': 'TANQUE_FLOW_IN_4_total_value',
        'raw_flow_unit': 'L/s',
        'flow_normalization_factor': 1.0,
        'flow_encoding': 'ieee754_float32_bits_in_numeric',
        'totalizer_unit': 'm3',
        'source_timestamp_timezone': UTC_TIMEZONE,
        'require_flow_validation': True,
    },
]

FLOWS = [*LAVADORAS, *JARABES]
SENSOR_ITEMS = [*WELLS, *LINES]
ALL_ITEMS = [*SENSOR_ITEMS, *FLOWS]

ITEM_BY_SENSOR = {
    int(item['sensor_id']): item
    for item in ALL_ITEMS
    if item.get('sensor_id') is not None
}
ITEM_BY_KEY = {str(item['operational_key']): item for item in ALL_ITEMS}
SENSORS_BY_MODULE = {
    'well': [int(item['sensor_id']) for item in WELLS],
    'line': [int(item['sensor_id']) for item in LINES],
    'flow': [item['sensor_id'] if item.get('sensor_id') is not None else str(item['operational_key']) for item in FLOWS],
}

ACTIVE_MODULES = ['Resumen', 'Pozos', 'Líneas', 'Flujos', 'Comparativo Operativo de Agua', 'Revisión diaria', 'Reportes']
PENDING_MODULES = ['Concesión']
DISABLED_MODULES = ['Energía']

DEFAULT_CURRENT_FLOW_ACTIVE_THRESHOLD = 0.01
CURRENT_FLOW_ACTIVE_THRESHOLD_BY_KEY: dict[str, float] = {}


def identity_key(value: Any) -> str:
    if isinstance(value, dict):
        value = value.get('operational_key') or value.get('sensor_id') or value.get('id')
    if value in (None, ''):
        return ''
    try:
        number = int(value)
        if str(value).strip() == str(number):
            return str(number)
    except (TypeError, ValueError):
        pass
    return str(value).strip().lower()


def item_contract(value: Any) -> dict[str, Any]:
    key = identity_key(value)
    if key in ITEM_BY_KEY:
        return dict(ITEM_BY_KEY[key])
    try:
        sensor_id = int(key)
    except (TypeError, ValueError):
        sensor_id = -1
    if sensor_id in ITEM_BY_SENSOR:
        return dict(ITEM_BY_SENSOR[sensor_id])
    return {
        'operational_key': key,
        'sensor_id': sensor_id if sensor_id > 0 else None,
        'display_name': 'Elemento no confirmado',
        'group': 'unconfirmed',
        'raw_flow_unit': 'L/s',
        'display_flow_unit': 'L/s',
        'flow_unit': 'L/s',
        'flow_normalization_factor': 1.0,
        'source_timestamp_timezone': LOCAL_TIMEZONE,
        'unit_status': 'pending',
        'enabled': False,
    }


def sensor_contract(sensor_id: Any) -> dict[str, Any]:
    return item_contract(sensor_id)


def flow_unit_for_sensor(sensor_id: Any) -> str:
    return str(item_contract(sensor_id).get('display_flow_unit') or 'L/s')


def source_timezone_for_identity(identity: Any) -> str:
    return str(item_contract(identity).get('source_timestamp_timezone') or LOCAL_TIMEZONE)


def _decode_ieee754_float32_bits(value: float) -> float | None:
    """Decode the Durango Jarabes flow when BOS stores Float32 bits as a number.

    Current observations are around 1.0e9 (for example 1064303552 -> ~0.9374).
    If SCADA is later corrected and starts storing a normal engineering value,
    values below one million are preserved instead of being reinterpreted.
    """
    if abs(value) < 1_000_000:
        return value
    try:
        encoded = int(round(value)) & 0xFFFFFFFF
        decoded = struct.unpack('!f', struct.pack('!I', encoded))[0]
    except (OverflowError, ValueError, struct.error):
        return None
    if not math.isfinite(decoded):
        return None
    return float(decoded)


def normalize_flow_lps(identity: Any, raw_value: Any) -> float | None:
    if raw_value in (None, ''):
        return None
    try:
        parsed = float(str(raw_value).replace(',', '').strip())
    except (TypeError, ValueError):
        return None
    if not math.isfinite(parsed):
        return None
    contract = item_contract(identity)
    if contract.get('flow_encoding') == 'ieee754_float32_bits_in_numeric':
        decoded = _decode_ieee754_float32_bits(parsed)
        if decoded is None:
            return None
        parsed = decoded
    factor = float(contract.get('flow_normalization_factor') or 1.0)
    normalized = parsed * factor
    return normalized if math.isfinite(normalized) else None


def current_flow_threshold_for_sensor(sensor_id: Any) -> float:
    key = identity_key(sensor_id)
    return float(CURRENT_FLOW_ACTIVE_THRESHOLD_BY_KEY.get(key, DEFAULT_CURRENT_FLOW_ACTIVE_THRESHOLD))


def clamp_to_validated_segment(start_dt: datetime, end_dt: datetime) -> tuple[datetime, datetime, bool, bool]:
    """Return the post-cutover segment and legacy/crossing flags."""
    legacy_only = end_dt <= DURANGO_SCADA_CUTOVER_LOCAL
    crosses_cutover = start_dt < DURANGO_SCADA_CUTOVER_LOCAL < end_dt
    return max(start_dt, DURANGO_SCADA_CUTOVER_LOCAL), end_dt, legacy_only, crosses_cutover


def capability_payload() -> dict[str, Any]:
    return {
        'plant': PLANT_NAME,
        'capabilities': CAPABILITIES,
        'active_modules': ACTIVE_MODULES,
        'pending_modules': PENDING_MODULES,
        'disabled_modules': DISABLED_MODULES,
        'scada_cutover_local': DURANGO_SCADA_CUTOVER_LOCAL.isoformat(timespec='seconds'),
        'scada_cutover_utc': DURANGO_SCADA_CUTOVER_UTC.isoformat(timespec='seconds') + 'Z',
        'wells': WELLS,
        'lines': LINES,
        'flows': FLOWS,
        'washers': LAVADORAS,
        'jarabes': JARABES,
        'current_flow_active_threshold': DEFAULT_CURRENT_FLOW_ACTIVE_THRESHOLD,
    }
