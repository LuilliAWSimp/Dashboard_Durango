"""Pruebas de la vista operativa sin conectarse al SQL Server industrial."""
from datetime import date, datetime

import pytest

from app.services import concession_history_service as service


def _point(day, volume=None, reliable=True, samples=1200, expected=1440):
    return {
        'bucket_start': day,
        'volume_m3': volume,
        'volume_reliable': reliable,
        'samples_received': samples,
        'samples_expected': expected,
    }


def test_monthly_rollup_uses_measured_days_only():
    raw = {'series': [
        {'sensor_id': 1001, 'points': [
            _point('2026-08-04T00:00:00', 20.5),
            _point('2026-08-05T00:00:00', 0.0),
            _point('2026-08-06T00:00:00', 800, reliable=False),
        ]},
        {'sensor_id': 1051, 'points': [_point('2026-08-04T00:00:00', 4)]},
    ]}
    result = service.summarize_months(raw, year=2026, start=date(2026, 8, 4), end=date(2026, 8, 7))
    one, two = result['wells']
    aug = one['months'][7]
    assert aug['volume_m3'] == 20.5
    assert aug['days_with_volume'] == 2
    assert aug['days_without_data'] == 1
    assert aug['days_excluded'] == 1
    assert aug['status'] == 'partial'
    assert one['operational_total_m3'] == 20.5
    assert one['months'][0]['status'] == 'outside_window'
    assert one['months'][0]['volume_m3'] is None
    assert two['operational_total_m3'] == 4
    assert result['legal_period_verified'] is False
    assert all('remaining_m3' not in well for well in result['wells'])


def test_all_missing_is_null_not_zero():
    result = service.summarize_months({'series': []}, year=2026, start=date(2026, 9, 1), end=date(2026, 9, 2))
    assert all(well['operational_total_m3'] is None for well in result['wells'])
    assert all(well['months'][8]['status'] == 'no_data' for well in result['wells'])
    assert result['wells'][0]['months'][8]['volume_m3'] is None


def test_history_endpoint_uses_existing_daily_well_service(monkeypatch):
    captured = {}
    monkeypatch.setattr(service, 'local_now_naive', lambda: datetime(2026, 10, 12, 13, 0))

    def fake_history(**kwargs):
        captured.update(kwargs)
        return {'series': [{'sensor_id': 1001, 'points': [_point('2026-08-04T00:00:00', 23)]}]}

    monkeypatch.setattr(service, 'get_water_history_module', fake_history)
    response = service.get_concession_monthly_history(2026)
    assert captured == {
        'module': 'well', 'start_date': '2026-08-04', 'end_date': '2026-10-12', 'aggregation': 'daily'
    }
    assert response['period_start'] == '2026-08-04'
    assert response['period_end'] == '2026-10-12'
    assert response['wells'][0]['months'][7]['volume_m3'] == 23
    with pytest.raises(ValueError):
        service.get_concession_monthly_history(2025)
    with pytest.raises(ValueError):
        service.get_concession_monthly_history(2027)
