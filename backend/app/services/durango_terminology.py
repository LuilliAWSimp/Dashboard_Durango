from __future__ import annotations

from typing import Literal

VolumeScope = Literal['plain', 'period', 'interval', 'day', 'shift']


def _normalized_group(group: object) -> str:
    value = str(group or '').strip().lower()
    aliases = {
        'wells': 'well',
        'pozos': 'well',
        'lines': 'line',
        'lineas': 'line',
        'líneas': 'line',
        'flows': 'flow',
        'flujos': 'flow',
        'washers': 'flow',
        'lavadoras': 'flow',
        'jarabes': 'flow',
    }
    return aliases.get(value, value)


def operational_volume_label(group: object, *, validated: bool = False, scope: VolumeScope = 'plain') -> str:
    normalized = _normalized_group(group)
    base = 'Volumen bombeado' if normalized == 'well' else 'Volumen consumido'
    if validated:
        base += ' validado'
    suffixes = {
        'period': ' del periodo',
        'interval': ' del intervalo',
        'day': ' del día',
        'shift': ' del turno',
    }
    return base + suffixes.get(scope, '')
