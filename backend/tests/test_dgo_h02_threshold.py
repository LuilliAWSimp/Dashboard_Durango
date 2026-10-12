"""DGO-H02: reglas, exportacion y autentificacion sin conexion a BOS."""
from io import BytesIO

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.api.routes import water
from app.auth.middleware import LocalAuthMiddleware
from app.services.durango_flow_threshold import FlowThreshold, evaluate, summarize
from app.services.durango_threshold_export_service import build_threshold_excel, build_threshold_pdf


def rule(direction='both', basis='extreme', minimum=1, maximum=15):
    return FlowThreshold(True, direction, basis, minimum, maximum)


def points():
    return [
        {'bucket_start': '2026-10-10T00:00:00', 'bucket_end': '2026-10-10T00:15:00', 'samples': 15, 'flow_min_lps': .5, 'flow_avg_lps': 8, 'flow_max_lps': 16.2, 'volume_reliable': True, 'volume_m3': 6.57, 'totalizer_close_m3': 100, 'data_status': 'operational'},
        {'bucket_start': '2026-10-10T00:15:00', 'bucket_end': '2026-10-10T00:30:00', 'samples': 15, 'flow_min_lps': 1, 'flow_avg_lps': 8, 'flow_max_lps': 15, 'volume_reliable': True, 'volume_m3': 3, 'totalizer_close_m3': 103, 'data_status': 'operational'},
        {'bucket_start': '2026-10-10T00:30:00', 'bucket_end': '2026-10-10T00:45:00', 'samples': 15, 'flow_min_lps': 0, 'flow_avg_lps': 0, 'flow_max_lps': 0, 'volume_reliable': True, 'volume_m3': 0, 'totalizer_close_m3': 103, 'data_status': 'zero_consumption'},
        {'bucket_start': '2026-10-10T00:45:00', 'bucket_end': '2026-10-10T01:00:00', 'samples': 0, 'flow_min_lps': None, 'flow_avg_lps': None, 'flow_max_lps': None, 'volume_reliable': False, 'volume_m3': None, 'totalizer_close_m3': None, 'data_status': 'no_data'},
    ]


def history():
    return {'name': 'Pozo 1', 'module': 'well', 'sensor_id': 1001, 'start_date': '2026-10-10', 'end_date': '2026-10-10', 'aggregation': 'quarter_hour', 'points': points()}


def test_rule_extreme_average_both_and_equality():
    p = points()
    assert evaluate(p[0], rule()) == 'Fuera de rango'
    assert evaluate(p[0], rule(basis='average')) == 'Dentro de rango'
    assert evaluate(p[1], rule()) == 'Dentro de rango'
    assert evaluate(p[2], rule()) == 'Bajo umbral'  # cero real
    assert evaluate(p[3], rule()) == 'Sin lectura'
    assert evaluate(p[0], rule(direction='below')) == 'Bajo umbral'
    assert evaluate(p[0], rule(direction='above')) == 'Sobre umbral'
    assert evaluate(p[0], FlowThreshold()) == 'No revisado'
    assert summarize(p, rule()) == {'total': 4, 'breached': 2, 'below': 2, 'above': 1, 'within': 1, 'no_reading': 1}


@pytest.mark.parametrize('candidate', [rule(minimum=20, maximum=1), rule(minimum=None), rule(maximum=None), rule(minimum=float('nan')), rule(direction='invalid'), rule(basis='invalid'), rule(minimum=-1)])
def test_threshold_input_validation(candidate):
    with pytest.raises(ValueError):
        candidate.validate()


def test_pdf_excel_are_independent_and_show_same_diagnosis():
    h, r = history(), rule()
    pdf, name = build_threshold_pdf(h, r)
    assert pdf[:4] == b'%PDF' and name.endswith('.pdf')
    xlsx, name = build_threshold_excel(h, r)
    assert xlsx[:2] == b'PK' and name.endswith('.xlsx')
    sheet = load_workbook(BytesIO(xlsx), data_only=True).active
    assert '2 intervalos fuera de rango' in sheet['B6'].value
    assert sheet['I9'].value == 'Fuera de rango'
    assert sheet['I10'].value == 'Dentro de rango'
    assert sheet['I11'].value == 'Bajo umbral'
    assert sheet['I12'].value == 'Sin lectura'
    assert sheet['C12'].value is None
    assert sheet['F12'].value is None
    assert sheet['A9'].fill.fgColor.rgb.endswith('FFF3C4')


def test_route_uses_backend_history_and_rejects_invalid_params(monkeypatch):
    captured = []
    def fake_history(**kwargs):
        captured.append(kwargs)
        return history()
    monkeypatch.setattr(water, 'get_water_history', fake_history)
    app = FastAPI()
    app.include_router(water.router, prefix='/api/v1')
    client = TestClient(app)
    base = dict(module='well', sensor_id='1001', start_date='2026-10-10', end_date='2026-10-10', aggregation='quarter_hour', threshold_enabled='true', threshold_direction='both', threshold_basis='extreme', threshold_min_value='1', threshold_max_value='15')
    for fmt, signature in (('pdf', b'%PDF'), ('excel', b'PK')):
        response = client.get(f'/api/v1/water/history/detail/{fmt}', params=base)
        assert response.status_code == 200, response.text
        assert response.content.startswith(signature)
    assert len(captured) == 2
    assert captured[0]['sensor_id'] == '1001'
    assert client.get('/api/v1/water/history/detail/pdf', params={**base, 'threshold_min_value': '20'}).status_code == 422
    assert client.get('/api/v1/water/history/detail/pdf', params={**base, 'threshold_enabled': 'false'}).status_code == 422
    assert client.get('/api/v1/water/history/detail/html', params=base).status_code == 404
    assert len(captured) == 2


def test_get_endpoint_requires_session_even_for_viewer(monkeypatch):
    class FakeAuth:
        def get_session_with_reason(self, token, browser_session, require_browser_session=False):
            if token == 'session' and browser_session == 'browser':
                return ({'id': 1, 'user': {'id': 5, 'role': 'viewer'}}, None)
            return None, 'invalid'
        def touch_session(self, session_id):
            pass
    app = FastAPI()
    app.state.auth_service = FakeAuth()
    app.add_middleware(LocalAuthMiddleware, api_prefix='/api/v1', cookie_name='test_session', browser_cookie_name='test_browser', csrf_header='X-CSRF')
    app.include_router(water.router, prefix='/api/v1')
    client = TestClient(app)
    params = dict(module='well', sensor_id='1001', start_date='2026-10-10', end_date='2026-10-10', aggregation='quarter_hour', threshold_enabled='true', threshold_direction='below', threshold_min_value=1)
    assert client.get('/api/v1/water/history/detail/pdf', params=params).status_code == 401
    client.cookies.set('test_session', 'session')
    monkeypatch.setattr(water, 'get_water_history', lambda **_: history())
    response = client.get('/api/v1/water/history/detail/pdf', params=params, headers={'X-ARCA-Browser-Session': 'browser'})
    assert response.status_code == 200
