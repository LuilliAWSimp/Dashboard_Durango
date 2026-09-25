"""Balance de Agua protegido para Planta Durango.

La topologia hidraulica de Durango todavia no tiene una fuente base oficial ni
un catalogo confirmado de consumos finales aditivos. Por eso este servicio NO
publica una "diferencia no conciliada" oficial ni calcula restas entre grupos
que todavía no tienen una relación hidráulica confirmada. Expone los volúmenes
observados por grupo y documenta explícitamente que el contrato físico sigue
pendiente de validación.

Cuando el contrato de planta se confirme, este archivo es el punto unico donde
se debe habilitar la fuente base, las inclusiones/exclusiones y el calculo del
balance oficial. La UI no debe reconstruir esa matematica por su cuenta.
"""
from __future__ import annotations

from typing import Any, Iterable

from app.services.water_period_service import summarize_period_items

BALANCE_STATUS_PENDING = 'pending_physical_validation'

LAVADORA_KEYS = {
    'lavadora_linea_2',
    'lavadora_vidrio',
    'lavadora_ref_pet',
}
JARABES_KEYS = {'jarabes'}


def _operational_key(item: dict[str, Any]) -> str:
    return str(item.get('operational_key') or '').strip().lower()


def _group_payload(*, key: str, label: str, role: str, items: Iterable[dict[str, Any]]) -> dict[str, Any]:
    rows = list(items)
    summary = summarize_period_items(rows)
    return {
        'key': key,
        'label': label,
        'role': role,
        'validated_volume_m3': summary.get('validated_volume_m3'),
        'coverage_available': int(summary.get('coverage_available') or 0),
        'coverage_total': int(summary.get('coverage_total') or len(rows)),
        'coverage_status': summary.get('coverage_status') or 'No disponible',
        'has_partial_volume': bool(summary.get('has_partial_volume')),
        'partial_count': int(summary.get('partial_count') or 0),
        'review_count': int(summary.get('review_count') or 0),
        'no_history_count': int(summary.get('no_history_count') or 0),
    }



def build_durango_balance_payload(
    *,
    wells: list[dict[str, Any]],
    lines: list[dict[str, Any]],
    flows: list[dict[str, Any]],
    period_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return the guarded Durango balance contract.

    Important: the sum of wells is only a *candidate* source while physical
    validation is pending. Lines/Lavadoras/Jarabes are likewise only candidate
    downstream groups; they are not automatically declared final/additive.
    """
    lavadoras_rows = [item for item in flows if _operational_key(item) in LAVADORA_KEYS]
    jarabes_rows = [item for item in flows if _operational_key(item) in JARABES_KEYS]

    source_candidate = _group_payload(
        key='wells',
        label='Pozos monitoreados',
        role='candidate_source',
        items=wells,
    )
    line_group = _group_payload(
        key='lines',
        label='Líneas',
        role='candidate_consumption',
        items=lines,
    )
    washer_group = _group_payload(
        key='washers',
        label='Lavadoras',
        role='candidate_consumption',
        items=lavadoras_rows,
    )
    jarabes_group = _group_payload(
        key='jarabes',
        label='Jarabes',
        role='candidate_consumption',
        items=jarabes_rows,
    )
    consumption_candidates = [line_group, washer_group, jarabes_group]

    period_data = period_data or {}
    return {
        'status': BALANCE_STATUS_PENDING,
        'is_official': False,
        'title': 'Balance de Agua · contrato físico pendiente',
        'message': (
            'Los volúmenes mostrados son una referencia operativa. La fuente base y los consumos finales '
            'aditivos de Durango todavía no están confirmados físicamente, por lo que no se publica una '
            'diferencia no conciliada oficial.'
        ),
        'contract': {
            'source_base_confirmed': False,
            'final_consumptions_confirmed': False,
            'parallel_inputs_reviewed': False,
            'double_counting_reviewed': False,
            'reuse_reviewed': False,
            'official_difference_enabled': False,
            'candidate_arithmetic_enabled': False,
            'pending_questions': [
                'Confirmar cuál es la fuente base física del balance y si ambos pozos alimentan el mismo alcance.',
                'Confirmar cuáles de Líneas, Lavadoras y Jarabes son consumos finales aditivos y cuáles podrían estar en serie.',
                'Confirmar si existen entradas paralelas, reúso o cambios de inventario que deban quedar fuera de la demanda nueva.',
                'Confirmar que los totalizadores incluidos son confiables para el intervalo del balance.',
            ],
        },
        'source_candidate': source_candidate,
        'consumption_candidates': consumption_candidates,
        # La guía reserva sumas/restas entre grupos para un contrato físico cerrado.
        # Mientras tanto se exponen los grupos por separado y no se publica una
        # diferencia, eficiencia ni subtotal candidato con significado hidráulico.
        'candidate_consumption_total_m3': None,
        'operational_comparison_m3': None,
        'operational_comparison_status': 'disabled_pending_physical_validation',
        'unreconciled_difference_m3': None,
        'period': {
            'start_date': period_data.get('start_date'),
            'end_date': period_data.get('end_date'),
            'effective_end_at': period_data.get('effective_end_at'),
            'source_status': period_data.get('source_status'),
        },
    }
