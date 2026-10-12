from app.services.durango_capabilities import CAPABILITIES, ACTIVE_MODULES, PENDING_MODULES, DISABLED_MODULES, capability_payload


def test_capabilities_describe_real_durango_navigation_modules():
    assert CAPABILITIES['wells'] is True
    assert CAPABILITIES['lines'] is True
    assert CAPABILITIES['washers'] is True
    assert CAPABILITIES['jarabes'] is True
    assert CAPABILITIES['daily_review'] is True
    assert CAPABILITIES['reports'] is True


def test_inherited_modules_are_explicitly_disabled():
    assert CAPABILITIES['tanks'] is False
    assert CAPABILITIES['cip'] is False
    assert CAPABILITIES['uv'] is False
    assert CAPABILITIES['consumptions'] is False
    assert CAPABILITIES['energy'] is False


def test_pending_modules_remain_pending_without_becoming_confirmed():
    assert CAPABILITIES['balance'] == 'pending_physical_validation'
    assert CAPABILITIES['concession'] is False
    assert 'Balance de Agua' in PENDING_MODULES
    assert 'Concesión' not in PENDING_MODULES
    assert 'Concesión' in DISABLED_MODULES
    assert 'Balance de Agua' not in ACTIVE_MODULES


def test_capability_payload_exposes_same_module_contract():
    payload = capability_payload()
    assert payload['capabilities'] == CAPABILITIES
    assert payload['active_modules'] == ACTIVE_MODULES
    assert payload['pending_modules'] == PENDING_MODULES
    assert payload['disabled_modules'] == DISABLED_MODULES
    assert 'Lavadoras' in payload['active_modules']
    assert 'Jarabes' in payload['active_modules']
