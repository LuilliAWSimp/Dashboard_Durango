from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


QUALITY_VALIDATED = 'validated'
QUALITY_VALID_ZERO = 'valid_zero'
QUALITY_PARTIAL_COVERAGE = 'partial_coverage'
QUALITY_REVIEW = 'review'
QUALITY_NO_DATA = 'no_data'

QUALITY_LABELS = {
    QUALITY_VALIDATED: 'Validado',
    QUALITY_VALID_ZERO: 'Cero válido',
    QUALITY_PARTIAL_COVERAGE: 'Cobertura parcial',
    QUALITY_REVIEW: 'Dato en revisión',
    QUALITY_NO_DATA: 'Sin datos',
}


@dataclass(frozen=True)
class WaterQuality:
    data_status: str
    quality_status: str
    quality_label: str
    volume_reliable: bool
    coverage_percent: float
    boundary_complete: bool

    def payload(self) -> dict[str, Any]:
        return asdict(self)


def classify_water_quality(
    *,
    samples_received: int,
    samples_expected: int,
    coverage_percent: float | None,
    volume_m3: float | None,
    volume_reliable: bool,
    boundary_complete: bool,
    has_discontinuities: bool = False,
    minimum_coverage_percent: float = 80.0,
) -> WaterQuality:
    """Return the common ARCA quality contract without changing hydraulics."""
    received = max(int(samples_received or 0), 0)
    expected = max(int(samples_expected or 0), 0)
    if coverage_percent is None:
        coverage = min((received / expected) * 100.0, 100.0) if expected else 0.0
    else:
        coverage = max(min(float(coverage_percent), 100.0), 0.0)

    if received == 0:
        status = QUALITY_NO_DATA
        reliable = False
        data_status = 'no_data'
    elif has_discontinuities or not boundary_complete or volume_m3 is None or not volume_reliable:
        status = QUALITY_REVIEW
        reliable = False
        data_status = 'review'
    elif expected > 0 and coverage < minimum_coverage_percent:
        status = QUALITY_PARTIAL_COVERAGE
        reliable = False
        data_status = 'partial_coverage'
    elif abs(float(volume_m3 or 0.0)) <= 0.001:
        status = QUALITY_VALID_ZERO
        reliable = True
        data_status = 'zero_consumption'
    else:
        status = QUALITY_VALIDATED
        reliable = True
        data_status = 'validated'

    return WaterQuality(
        data_status=data_status,
        quality_status=status,
        quality_label=QUALITY_LABELS[status],
        volume_reliable=reliable,
        coverage_percent=round(coverage, 2),
        boundary_complete=bool(boundary_complete),
    )
