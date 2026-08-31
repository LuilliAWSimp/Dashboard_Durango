from datetime import datetime

import pytest

from app.services.water_five_minute_export_service import (
    _export_range,
    _first_bucket_end,
    _module_contract,
)


def test_five_minute_export_rejects_more_than_three_calendar_days():
    with pytest.raises(ValueError, match='maximo de 3 dias'):
        _export_range('2026-08-12', '2026-08-15', now=datetime(2026, 8, 20, 12, 0))


def test_five_minute_export_does_not_mix_pre_scada_segment():
    export_range = _export_range('2026-08-04', '2026-08-04', now=datetime(2026, 8, 5, 12, 0))
    assert export_range.local_start == datetime(2026, 8, 4, 18, 16)
    assert _first_bucket_end(export_range.local_start) == datetime(2026, 8, 4, 18, 20)
    assert export_range.crosses_scada_cutover is True


def test_five_minute_export_accepts_operational_flow_key_without_numeric_sensor():
    module, contract, identity = _module_contract('flow', 'lavadora_vidrio')
    assert module == 'flow'
    assert contract['operational_key'] == 'lavadora_vidrio'
    assert contract['sensor_id'] is None
    assert identity == 'lavadora_vidrio'
