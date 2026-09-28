from __future__ import annotations

from threading import Barrier

import app.services.water_service as water_service


def _period_payload():
    return {
        'wells': [],
        'lines': [],
        'flows': [],
        'source_status': 'operational',
    }


def test_automatic_dashboard_loads_current_and_period_in_parallel(monkeypatch):
    rendezvous = Barrier(2, timeout=2)
    calls: list[str] = []

    def fake_current(**kwargs):
        calls.append('current-start')
        rendezvous.wait()
        calls.append('current-end')
        return {'wells': [], 'production_lines': [], 'flows': []}

    def fake_period(*args, **kwargs):
        calls.append('period-start')
        rendezvous.wait()
        calls.append('period-end')
        return _period_payload()

    monkeypatch.setattr(water_service, 'get_bos_water_dashboard_payload', fake_current)
    monkeypatch.setattr(water_service, 'get_period_data', fake_period)

    current, period, error = water_service._load_dashboard_sources(
        '2026-09-28', '2026-09-28', force_refresh=False,
    )

    assert current == {'wells': [], 'production_lines': [], 'flows': []}
    assert period == _period_payload()
    assert error is None
    assert set(calls[:2]) == {'current-start', 'period-start'}


def test_manual_force_refresh_keeps_sequential_source_loading(monkeypatch):
    calls: list[str] = []

    def fake_current(**kwargs):
        assert kwargs['force_refresh'] is True
        calls.append('current')
        return {'wells': [], 'production_lines': [], 'flows': []}

    def fake_period(*args, **kwargs):
        assert kwargs['force_refresh'] is True
        calls.append('period')
        return _period_payload()

    monkeypatch.setattr(water_service, 'get_bos_water_dashboard_payload', fake_current)
    monkeypatch.setattr(water_service, 'get_period_data', fake_period)

    water_service._load_dashboard_sources(
        '2026-09-28', '2026-09-28', force_refresh=True,
    )

    assert calls == ['current', 'period']


def test_dashboard_without_period_only_loads_current_snapshot(monkeypatch):
    calls: list[str] = []

    def fake_current(**kwargs):
        calls.append('current')
        return {'wells': [], 'production_lines': [], 'flows': []}

    def fail_period(*args, **kwargs):
        raise AssertionError('period must not be requested without a date range')

    monkeypatch.setattr(water_service, 'get_bos_water_dashboard_payload', fake_current)
    monkeypatch.setattr(water_service, 'get_period_data', fail_period)

    current, period, error = water_service._load_dashboard_sources(force_refresh=False)

    assert current == {'wells': [], 'production_lines': [], 'flows': []}
    assert period is None
    assert error is None
    assert calls == ['current']
