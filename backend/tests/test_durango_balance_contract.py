from app.services.durango_balance_service import build_durango_balance_payload


def _item(key: str, volume, *, module: str = 'flow', partial: bool = False):
    return {
        'operational_key': key,
        'module': module,
        'validated_volume_m3': volume,
        'has_discontinuities': partial,
        'data_status': 'operational' if volume is not None else 'no_data',
        'samples_received': 60 if volume is not None else 0,
        'samples_expected': 60,
    }


def test_balance_does_not_publish_official_difference_without_physical_contract():
    payload = build_durango_balance_payload(
        wells=[_item('pozo_1', 100.0, module='well'), _item('pozo_2', 80.0, module='well')],
        lines=[
            _item('linea_1', 20.0, module='line'),
            _item('linea_3', 15.0, module='line'),
            _item('linea_4', 10.0, module='line'),
            _item('linea_5', 5.0, module='line'),
        ],
        flows=[
            _item('lavadora_linea_2', 10.0),
            _item('lavadora_vidrio', 8.0),
            _item('lavadora_ref_pet', 7.0),
            _item('jarabes', 20.0),
        ],
        period_data={'start_date': '2026-09-12', 'end_date': '2026-09-12'},
    )

    assert payload['status'] == 'pending_physical_validation'
    assert payload['is_official'] is False
    assert payload['contract']['source_base_confirmed'] is False
    assert payload['unreconciled_difference_m3'] is None
    # El comparativo se conserva como referencia operativa, no como balance oficial.
    assert payload['operational_comparison_m3'] == 85.0
    assert payload['operational_comparison_status'] == 'complete_observed_coverage'


def test_balance_preserves_partial_coverage_instead_of_turning_missing_data_into_zero():
    payload = build_durango_balance_payload(
        wells=[_item('pozo_1', 100.0, module='well'), _item('pozo_2', None, module='well')],
        lines=[_item('linea_1', 20.0, module='line')],
        flows=[_item('lavadora_linea_2', 10.0), _item('jarabes', 5.0)],
    )

    source = payload['source_candidate']
    assert source['validated_volume_m3'] == 100.0
    assert source['coverage_available'] == 1
    assert source['coverage_total'] == 2
    assert source['coverage_status'] == 'Cobertura parcial'
    assert payload['operational_comparison_status'] == 'partial_observed_coverage'
    assert payload['unreconciled_difference_m3'] is None


def test_balance_comparison_is_unavailable_when_a_candidate_group_has_no_valid_volume():
    payload = build_durango_balance_payload(
        wells=[_item('pozo_1', 100.0, module='well')],
        lines=[_item('linea_1', None, module='line')],
        flows=[_item('lavadora_linea_2', 10.0), _item('jarabes', 5.0)],
    )

    assert payload['candidate_consumption_total_m3'] is None
    assert payload['operational_comparison_m3'] is None
    assert payload['operational_comparison_status'] == 'unavailable'
    assert payload['unreconciled_difference_m3'] is None
