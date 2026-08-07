"""Semántica común para la operación intermitente de Planta Durango.

Un cero medido representa un equipo apagado con datos. La ausencia de una
muestra se conserva como ausencia y nunca se transforma en cero.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from math import ceil
from typing import Any


MIN_RELIABLE_COVERAGE_PERCENT = 80.0


@dataclass(frozen=True)
class IntervalOperationMetrics:
    samples_received: int
    samples_expected: int
    coverage_percent: float
    coverage_status: str
    data_reliable: bool
    active_samples: int
    active_minutes: float
    interval_state: str
    data_status: str

    def payload(self) -> dict[str, Any]:
        return asdict(self)


def expected_minute_samples(start: datetime, end: datetime) -> int:
    """Return minute slots observable in the half-open interval [start, end)."""
    seconds = max((end - start).total_seconds(), 0.0)
    return int(ceil(seconds / 60.0)) if seconds > 0 else 0


def interval_operation_metrics(
    *,
    samples_received: int,
    samples_expected: int,
    active_samples: int,
    validated_volume_m3: float | None,
    has_discontinuities: bool = False,
) -> IntervalOperationMetrics:
    received = max(int(samples_received or 0), 0)
    expected = max(int(samples_expected or 0), 0)
    active = min(max(int(active_samples or 0), 0), received)
    coverage = min((received / expected) * 100.0, 100.0) if expected else 0.0

    if received == 0:
        coverage_status = 'Sin registros'
    elif expected and received >= expected:
        coverage_status = 'Completa'
    elif coverage >= MIN_RELIABLE_COVERAGE_PERCENT:
        coverage_status = 'Suficiente'
    else:
        coverage_status = 'Parcial'

    if received == 0:
        interval_state = 'Sin registros'
        data_status = 'no_data'
    elif has_discontinuities:
        interval_state = 'Dato en revisión'
        data_status = 'invalid_totalizer'
    else:
        has_activity = active > 0 or float(validated_volume_m3 or 0.0) > 0.0
        if not has_activity:
            interval_state = 'Apagado con datos'
            data_status = 'zero_consumption'
        elif 0 < active < received:
            interval_state = 'Actividad parcial'
            data_status = 'partial_activity'
        else:
            interval_state = 'Activo'
            data_status = 'operational'

    return IntervalOperationMetrics(
        samples_received=received,
        samples_expected=expected,
        coverage_percent=round(coverage, 2),
        coverage_status=coverage_status,
        data_reliable=bool(
            received > 0
            and expected > 0
            and coverage >= MIN_RELIABLE_COVERAGE_PERCENT
            and not has_discontinuities
        ),
        active_samples=active,
        # iot.readings_minute and the normalized Lavadoras source contribute at
        # most one operational sample per minute to this metric.
        active_minutes=float(active),
        interval_state=interval_state,
        data_status=data_status,
    )
