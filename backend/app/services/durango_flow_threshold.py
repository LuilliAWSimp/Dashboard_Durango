"""H02: evaluacion opcional de umbrales de flujo por bucket historico.

No persiste reglas, no modifica mediciones ni genera alarmas SCADA.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Any


def number(value: Any) -> float | None:
    if value is None or value == '':
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return parsed if isfinite(parsed) else None


@dataclass(frozen=True)
class FlowThreshold:
    enabled: bool = False
    direction: str = 'below'
    basis: str = 'extreme'
    min_value: float | None = None
    max_value: float | None = None

    def validate(self) -> None:
        if not self.enabled:
            return
        if self.direction not in {'below', 'above', 'both'}:
            raise ValueError('Sentido de umbral invalido.')
        if self.basis not in {'extreme', 'average'}:
            raise ValueError('Criterio de umbral invalido.')
        if self.direction in {'below', 'both'} and self.min_value is None:
            raise ValueError('Indica el limite minimo en L/s.')
        if self.direction in {'above', 'both'} and self.max_value is None:
            raise ValueError('Indica el limite maximo en L/s.')
        for value in (self.min_value, self.max_value):
            if value is not None and (not isfinite(value) or value < 0):
                raise ValueError('Los limites deben ser finitos y mayores o iguales a cero.')
        if self.direction == 'both' and self.min_value > self.max_value:
            raise ValueError('El limite minimo no puede superar al maximo.')

    def label(self) -> str:
        criterion = 'Promedio' if self.basis == 'average' else 'Min/Máx del intervalo'
        if self.direction == 'both':
            return f'Entre {self.min_value:.2f} y {self.max_value:.2f} L/s · {criterion}'
        if self.direction == 'below':
            return f'Por debajo de {self.min_value:.2f} L/s · {criterion}'
        return f'Por encima de {self.max_value:.2f} L/s · {criterion}'


def evaluate(point: dict[str, Any], rule: FlowThreshold) -> str:
    if not rule.enabled:
        return 'No revisado'
    samples = number(point.get('samples'))
    if samples is None or samples <= 0:
        return 'Sin lectura'
    average = number(point.get('flow_avg_lps'))
    minimum = number(point.get('flow_min_lps'))
    maximum = number(point.get('flow_max_lps'))
    low = average if rule.basis == 'average' else (minimum if minimum is not None else average)
    high = average if rule.basis == 'average' else (maximum if maximum is not None else average)
    need_low = rule.direction in {'below', 'both'}
    need_high = rule.direction in {'above', 'both'}
    if (need_low and low is None) or (need_high and high is None):
        return 'Sin lectura'
    below = bool(need_low and low < rule.min_value)
    above = bool(need_high and high > rule.max_value)
    if below and above:
        return 'Fuera de rango'
    if below:
        return 'Bajo umbral'
    if above:
        return 'Sobre umbral'
    return 'Dentro de rango'


def summarize(points: list[dict[str, Any]], rule: FlowThreshold) -> dict[str, int]:
    states = [evaluate(point, rule) for point in points]
    return {
        'total': len(states),
        'breached': sum(state in {'Bajo umbral', 'Sobre umbral', 'Fuera de rango'} for state in states),
        'below': sum(state in {'Bajo umbral', 'Fuera de rango'} for state in states),
        'above': sum(state in {'Sobre umbral', 'Fuera de rango'} for state in states),
        'within': states.count('Dentro de rango'),
        'no_reading': states.count('Sin lectura'),
    }
