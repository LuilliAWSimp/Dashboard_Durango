"""DGO-H07: job modular autenticado, reuso, error seguro y cache de dia abierto."""
from __future__ import annotations

import threading
import time
from datetime import datetime
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import water
from app.services import water_history_service as history
from app.services.water_history_job_service import ModuleHistoryJobManager


def finished(manager, owner, job_id):
    for _ in range(150):
        state = manager.get(owner_id=owner, job_id=job_id)
        if state and state['status'] in {'ready', 'failed'}:
            return state
        time.sleep(.01)
    raise AssertionError('No finalizo')


def test_two_day_query_dedup_and_owner():
    started, release = threading.Event(), threading.Event()
    calls = []

    def loader(**params):
        calls.append(params)
        started.set()
        assert release.wait(2)
        return {'series': [{'sensor_id': 1001, 'points': []}]}

    mgr = ModuleHistoryJobManager(loader)
    try:
        kwargs = dict(owner_id=12, module='well', start_date='2026-10-11', end_date='2026-10-12', aggregation='hourly')
        first = mgr.submit(**kwargs)
        assert started.wait(1)
        duplicate = mgr.submit(**kwargs)
        assert first['id'] == duplicate['id']
        assert mgr.get(owner_id=13, job_id=first['id']) is None
        assert mgr.result(owner_id=13, job_id=first['id']) is None
        release.set()
        assert finished(mgr, 12, first['id'])['status'] == 'ready'
        assert mgr.result(owner_id=12, job_id=first['id'])['series'][0]['sensor_id'] == 1001
        assert mgr.submit(**kwargs)['id'] == first['id']
        assert len(calls) == 1
        assert mgr.submit(**kwargs, force_refresh=True)['id'] != first['id']
    finally:
        release.set()
        mgr.shutdown()


def test_failures_are_safe_and_validation_is_before_queue():
    mgr = ModuleHistoryJobManager(lambda **kwargs: (_ for _ in ()).throw(RuntimeError('ODBC password=secret')))
    try:
        with pytest.raises(ValueError):
            mgr.submit(owner_id=1, module='well', start_date='2026-10-10', end_date='2026-10-12', aggregation='minute')
        first = mgr.submit(owner_id=1, module='well', start_date='2026-10-11', end_date='2026-10-12', aggregation='hourly')
        state = finished(mgr, 1, first['id'])
        assert state['status'] == 'failed'
        assert 'password' not in state['error']
        assert mgr.result(owner_id=1, job_id=first['id']) is None
    finally:
        mgr.shutdown()


def test_routes_require_session_and_job_owner(monkeypatch):
    mgr = ModuleHistoryJobManager(lambda **kwargs: {'module': kwargs['module'], 'series': []})
    monkeypatch.setattr(water, 'module_history_jobs', mgr)
    app = FastAPI()
    app.include_router(water.router, prefix='/api/v1')
    user = {'id': 9, 'role': 'viewer'}
    client = TestClient(app)
    try:
        url = '/api/v1/water/history/module/jobs'
        params = dict(module='well', start_date='2026-10-11', end_date='2026-10-12', aggregation='hourly')
        assert client.post(url, json=params).status_code == 401
        app.dependency_overrides[water.current_user] = lambda: user
        created = client.post(url, json=params)
        assert created.status_code == 200, created.text
        job_id = created.json()['id']
        assert finished(mgr, 9, job_id)['status'] == 'ready'
        assert client.get(f'/api/v1/water/history/module/jobs/{job_id}/result').json()['module'] == 'well'
        user['id'] = 10
        assert client.get(f'/api/v1/water/history/module/jobs/{job_id}').status_code == 404
        assert client.get(f'/api/v1/water/history/module/jobs/{job_id}/result').status_code == 404
        assert client.post(url, json={**params, 'aggregation': 'minute'}).status_code == 422
    finally:
        mgr.shutdown()


def test_today_history_cache_survives_next_minute_without_new_bos_query():
    history._CACHE.clear()
    fixed = datetime(2026, 10, 12, 16, 40, 0)
    with patch.object(history, 'local_now_naive', return_value=fixed), patch.object(history, '_query_15m_multi_chunked', return_value=[]) as query:
        history.get_water_history_module(module='line', start_date='2026-10-11', end_date='2026-10-12', aggregation='hourly')
    with patch.object(history, 'local_now_naive', return_value=fixed.replace(minute=41)), patch.object(history, '_query_15m_multi_chunked', return_value=[]) as query_again:
        history.get_water_history_module(module='line', start_date='2026-10-11', end_date='2026-10-12', aggregation='hourly')
        assert query_again.call_count == 0
    assert query.call_count > 0
    history._CACHE.clear()


def test_viewer_can_start_job_with_csrf_and_session_but_not_bypass_it(monkeypatch):
    from app.auth.middleware import LocalAuthMiddleware

    mgr = ModuleHistoryJobManager(lambda **kwargs: {'module': kwargs['module'], 'series': []})
    monkeypatch.setattr(water, 'module_history_jobs', mgr)

    class FakeAuth:
        def get_session_with_reason(self, token, browser_session, require_browser_session=False):
            if token == 'ok' and browser_session == 'bound':
                return {'id': 1, 'user': {'id': 2, 'role': 'viewer'}}, None
            return None, 'unauthorized'

        def validate_csrf(self, session, token):
            return token == 'csrf'

        def touch_session(self, ident):
            return None

    app = FastAPI()
    app.state.auth_service = FakeAuth()
    app.add_middleware(LocalAuthMiddleware, api_prefix='/api/v1', cookie_name='test_session',
                       browser_cookie_name='test_browser', csrf_header='X-CSRF-Token')
    app.include_router(water.router, prefix='/api/v1')
    client = TestClient(app)
    payload = dict(module='well', start_date='2026-10-11', end_date='2026-10-12', aggregation='hourly')
    path = '/api/v1/water/history/module/jobs'
    try:
        assert client.post(path, json=payload).status_code == 401
        client.cookies.set('test_session', 'ok')
        header = {'X-ARCA-Browser-Session': 'bound', 'X-CSRF-Token': 'bad'}
        assert client.post(path, json=payload, headers=header).status_code == 403
        response = client.post(path, json=payload, headers={**header, 'X-CSRF-Token': 'csrf'})
        assert response.status_code == 200, response.text
        job_id = response.json()['id']
        assert finished(mgr, 2, job_id)['status'] == 'ready'
        assert client.get(f'/api/v1/water/history/module/jobs/{job_id}/result', headers=header).status_code == 200
    finally:
        mgr.shutdown()
