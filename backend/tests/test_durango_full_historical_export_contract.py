from datetime import date, datetime

from app.services.water_historical_export_service import (
    IOT_PHYSICAL_START_LOCAL,
    PHYSICAL_HISTORY_START,
    VALIDATED_SEGMENT_START_LOCAL,
    _coverage_status,
    _expected_minutes,
    _range,
    _specs,
)


def test_default_physical_history_start_is_confirmed_audit_date():
    assert PHYSICAL_HISTORY_START == date(2026, 6, 3)
    assert IOT_PHYSICAL_START_LOCAL == datetime(2026, 6, 3, 15, 35)
    assert VALIDATED_SEGMENT_START_LOCAL == datetime(2026, 8, 4, 18, 16)


def test_first_iot_day_expected_minutes_begin_at_first_physical_reading():
    specs = _specs()
    pozo_1 = next(item for item in specs if item['key'] == 'pozo_1')
    expected = _expected_minutes(date(2026, 6, 3), pozo_1, datetime(2026, 8, 31, 13, 0))
    assert expected == 505


def test_bos_identity_is_outside_physical_window_before_scada_cutover():
    specs = _specs()
    vidrio = next(item for item in specs if item['key'] == 'lavadora_vidrio')
    assert _expected_minutes(date(2026, 8, 3), vidrio, datetime(2026, 8, 31, 13, 0)) == 0
    assert _coverage_status(0, 0, current_day=False) == 'Fuera de ventana física'


def test_current_day_coverage_uses_elapsed_minutes_not_1440():
    specs = _specs()
    pozo_1 = next(item for item in specs if item['key'] == 'pozo_1')
    expected = _expected_minutes(date(2026, 8, 31), pozo_1, datetime(2026, 8, 31, 13, 18, 55))
    assert expected == 799
    assert _coverage_status(799, expected, current_day=True) == 'Completo hasta el momento'


def test_export_range_is_capped_to_confirmed_physical_start():
    start, end, _ = _range('2026-01-01', '2026-06-05', now=datetime(2026, 8, 31, 13, 0))
    assert start == date(2026, 6, 3)
    assert end == date(2026, 6, 5)
