from app.services.durango_capabilities import CAPABILITIES, DISABLED_MODULES, PENDING_MODULES
from app.services.durango_balance_service import build_durango_balance_payload
from app.services.water_service import get_water_dashboard_payload


def _item(key: str, volume, *, module: str = 'flow'):
    return {
        'operational_key': key,
        'module': module,
        'validated_volume_m3': volume,
        'data_status': 'operational' if volume is not None else 'no_data',
        'samples_received': 60 if volume is not None else 0,
        'samples_expected': 60,
    }


def test_concession_is_disabled_until_legal_source_is_confirmed():
    assert CAPABILITIES['concession'] is False
    assert 'Concesión' in DISABLED_MODULES
    assert 'Concesión' not in PENDING_MODULES


def test_balance_remains_pending_but_disables_candidate_arithmetic():
    payload = build_durango_balance_payload(
        wells=[_item('pozo_1', 100.0, module='well'), _item('pozo_2', 80.0, module='well')],
        lines=[_item('linea_1', 20.0, module='line')],
        flows=[_item('lavadora_linea_2', 10.0), _item('jarabes', 5.0)],
    )

    assert payload['status'] == 'pending_physical_validation'
    assert payload['is_official'] is False
    assert payload['contract']['candidate_arithmetic_enabled'] is False
    assert payload['candidate_consumption_total_m3'] is None
    assert payload['operational_comparison_m3'] is None
    assert payload['unreconciled_difference_m3'] is None
    assert [item['label'] for item in payload['consumption_candidates']] == ['Líneas', 'Lavadoras', 'Jarabes']


def test_concession_endpoint_returns_not_available_without_querying_legal_data(monkeypatch):
    def fail_bos(*args, **kwargs):
        raise AssertionError('Concesión deshabilitada no debe consultar BOS')

    monkeypatch.setattr('app.services.water_service.get_bos_water_dashboard_payload', fail_bos)
    payload = get_water_dashboard_payload(section='concesion')
    assert payload.source_status == 'not_available'
    assert payload.plant_capabilities['capabilities']['concession'] is False
