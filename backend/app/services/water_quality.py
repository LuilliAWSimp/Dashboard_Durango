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


QUALITY_REASON_LABELS = {
    'VALIDATED': 'Volumen conciliado y validado.',
    'VALID_ZERO': 'Cero confirmado con fronteras y datos suficientes.',
    'NO_DATA': 'No existen muestras válidas en el periodo.',
    'PARTIAL_COVERAGE': 'La cobertura del periodo es insuficiente para considerarlo completo.',
    'TOTALIZER_RESET_OR_DROP': 'Se detectó una caída o reinicio del totalizador.',
    'TOTALIZER_INCREMENT_WITH_ZERO_FLOW': 'El totalizador aumentó sin volumen de flujo suficiente para respaldar el incremento.',
    'TOTALIZER_FLOW_MISMATCH': 'El incremento del totalizador no coincide con el flujo integrado y el tiempo transcurrido.',
    'INSUFFICIENT_FLOW_VALIDATION': 'No hubo cobertura de flujo suficiente para validar físicamente un incremento del totalizador.',
    'MISSING_OPENING_READING': 'Falta una lectura válida anterior al inicio para establecer la apertura real.',
    'MISSING_CLOSING_READING': 'Falta una lectura válida dentro del periodo para establecer el cierre.',
    'INCOMPLETE_BOUNDARY': 'El periodo no tiene fronteras de apertura y cierre completas.',
    'VOLUME_NOT_CALCULABLE': 'No fue posible calcular un volumen conciliado para el periodo.',
    'VOLUME_NOT_RELIABLE': 'El volumen calculado no cumple las condiciones de confiabilidad.',
    'REVIEW_REQUIRED': 'El periodo requiere revisión antes de reportar el volumen como confiable.',
}

_TOTALIZER_REASON_CODES = {
    'reinicio_o_caida_de_totalizador': 'TOTALIZER_RESET_OR_DROP',
    'incremento_incompatible_con_flujo_cero': 'TOTALIZER_INCREMENT_WITH_ZERO_FLOW',
    'incremento_incompatible_con_flujo_y_tiempo': 'TOTALIZER_FLOW_MISMATCH',
    'flujo_insuficiente_para_validar_incremento': 'INSUFFICIENT_FLOW_VALIDATION',
}


def build_quality_diagnostic(
    *,
    quality_status: str,
    coverage_percent: float | None = None,
    boundary_complete: bool = False,
    missing_previous_reading: bool = False,
    closing_m3: float | None = None,
    volume_m3: float | None = None,
    volume_reliable: bool = False,
    discarded_events: list[dict[str, Any]] | tuple[dict[str, Any], ...] | None = None,
) -> dict[str, Any]:
    """Explain *why* the common quality contract chose its visible state.

    This function is diagnostic only. It does not alter thresholds, accepted
    increments, discarded increments, or any hydraulic result.
    """
    status = str(quality_status or '').strip().lower()
    events = list(discarded_events or [])
    details: dict[str, Any] = {}

    if status == QUALITY_NO_DATA:
        code = 'NO_DATA'
    elif status == QUALITY_PARTIAL_COVERAGE:
        code = 'PARTIAL_COVERAGE'
        if coverage_percent is not None:
            details['coverage_percent'] = round(float(coverage_percent), 2)
    elif status == QUALITY_VALID_ZERO:
        code = 'VALID_ZERO'
    elif status == QUALITY_VALIDATED:
        code = 'VALIDATED'
    elif events:
        first = dict(events[0])
        raw_reason = str(first.get('reason') or '')
        code = _TOTALIZER_REASON_CODES.get(raw_reason, 'REVIEW_REQUIRED')
        details = {
            'event_count': len(events),
            'timestamp': first.get('timestamp'),
            'previous_totalizer_m3': first.get('previous_totalizer_m3', first.get('previous')),
            'new_totalizer_m3': first.get('new_totalizer_m3', first.get('current')),
            'increment_m3': first.get('increment_m3', first.get('difference')),
            'expected_flow_volume_m3': first.get('expected_flow_volume_m3'),
            'elapsed_seconds': first.get('elapsed_seconds'),
            'raw_reason': raw_reason or None,
        }
    elif not boundary_complete:
        if missing_previous_reading:
            code = 'MISSING_OPENING_READING'
        elif closing_m3 is None:
            code = 'MISSING_CLOSING_READING'
        else:
            code = 'INCOMPLETE_BOUNDARY'
    elif volume_m3 is None:
        code = 'VOLUME_NOT_CALCULABLE'
    elif not volume_reliable:
        code = 'VOLUME_NOT_RELIABLE'
    else:
        code = 'REVIEW_REQUIRED'

    return {
        'quality_reason_code': code,
        'quality_reason': QUALITY_REASON_LABELS.get(code, QUALITY_REASON_LABELS['REVIEW_REQUIRED']),
        'quality_details': details,
    }
