"""DGO-H01: seguridad, reuso y persistencia temporal de reportes en segundo plano."""
from __future__ import annotations

import tempfile
import threading
import time
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import report_jobs
from app.auth.middleware import LocalAuthMiddleware
from app.services.report_export_job_service import ExportJobManager, validate_options


def wait_for(manager: ExportJobManager, owner: int, job_id: str, timeout: float = 3.0):
    limit = time.monotonic() + timeout
    while time.monotonic() < limit:
        result = manager.get(owner, job_id)
        if result and result['status'] in {'ready', 'failed'}:
            return result
        time.sleep(.01)
    raise AssertionError('El job no terminó a tiempo en la prueba.')


def test_validate_options_prevents_unknown_inputs_and_bad_dates():
    clean = validate_options('daily_pdf', {'date': '2026-10-12'})
    assert clean['date'] == '2026-10-12'
    assert validate_options('historical_excel', {})['start_date'] is None
    for kind, request in [
        ('random', {}),
        ('daily_pdf', {'date': '2030-02-30'}),
        ('daily_pdf', {'extra': 'invalid'}),
        ('daily_pdf', {'date': '2026-10-12', 'start_date': '2026-10-01', 'end_date': '2026-10-12'}),
        ('daily_pdf', {'start_date': '2026-10-01'}),
        ('daily_pdf', {'start_date': '2026-11-01', 'end_date': '2026-10-01'}),
        ('historical_excel', {'date': '2026-10-12'}),
    ]:
        with pytest.raises(ValueError):
            validate_options(kind, request)


def test_async_export_reuses_inflight_job_and_restricts_owner(tmp_path):
    started = threading.Event()
    release = threading.Event()
    calls = []

    def exporter(kind, options):
        calls.append((kind, options))
        started.set()
        assert release.wait(2)
        return b'%PDF-test', 'durango.pdf'

    manager = ExportJobManager(exporter, directory=tmp_path)
    try:
        one = manager.submit(15, 'daily_pdf', {'date': '2026-10-12'})
        assert started.wait(1)
        two = manager.submit(15, 'daily_pdf', {'date': '2026-10-12'})
        assert one['id'] == two['id']
        assert manager.get(99, one['id']) is None
        assert manager.result(99, one['id']) is None
        release.set()
        ready = wait_for(manager, 15, one['id'])
        assert ready['status'] == 'ready'
        path, name, media_type = manager.result(15, one['id'])
        assert name == 'durango.pdf' and path.read_bytes() == b'%PDF-test'
        assert media_type == 'application/pdf'
        assert manager.submit(15, 'daily_pdf', {'date': '2026-10-12'})['id'] == one['id']
        assert len(calls) == 1
    finally:
        release.set()
        manager.shutdown()


def test_failure_is_explicit_and_does_not_expose_sql_errors(tmp_path):
    def failing(*args):
        raise RuntimeError('ODBC password=s3cret select * from BOS')

    manager = ExportJobManager(failing, directory=tmp_path)
    try:
        job = manager.submit(5, 'historical_excel', {})
        failed = wait_for(manager, 5, job['id'])
        assert failed['status'] == 'failed'
        assert 'password' not in failed['error'].lower()
        assert manager.result(5, job['id']) is None
    finally:
        manager.shutdown()


def test_authenticated_viewer_can_submit_export_but_not_other_mutations(monkeypatch, tmp_path):
    manager = ExportJobManager(lambda *_: (b'%PDF', 'durango.pdf'), directory=tmp_path)
    monkeypatch.setattr(report_jobs, 'manager', manager)

    class FakeAuth:
        def get_session_with_reason(self, token, browser_session, require_browser_session=False):
            if token == 'session' and browser_session == 'browser':
                return ({'id': 7, 'user': {'id': 11, 'role': 'viewer'}}, None)
            return None, 'unauthorized'

        def validate_csrf(self, session, token):
            return token == 'csrf'

        def touch_session(self, ident):
            pass

    app = FastAPI()
    app.state.auth_service = FakeAuth()
    app.add_middleware(LocalAuthMiddleware,
                       api_prefix='/api/v1', cookie_name='test_session',
                       browser_cookie_name='test_browser', csrf_header='X-CSRF-Token')
    app.include_router(report_jobs.router, prefix='/api/v1')

    @app.post('/api/v1/admin-only')
    def admin_only():
        return {'ok': True}

    client = TestClient(app)
    client.cookies.set('test_session', 'session')
    headers = {'X-CSRF-Token': 'csrf', 'X-ARCA-Browser-Session': 'browser'}
    try:
        assert client.post('/api/v1/admin-only', headers=headers).status_code == 403
        assert client.post('/api/v1/water/reports/jobs', headers={**headers, 'X-CSRF-Token': 'bad'}, json={'kind': 'daily_pdf'}).status_code == 403
        resp = client.post('/api/v1/water/reports/jobs', headers=headers, json={'kind': 'daily_pdf', 'options': {'date': '2026-10-12'}})
        assert resp.status_code == 200, resp.text
        ident = resp.json()['id']
        ready = wait_for(manager, 11, ident)
        assert ready['status'] == 'ready'
        assert client.get(f'/api/v1/water/reports/jobs/{ident}', headers=headers).json()['status'] == 'ready'
        file_response = client.get(f'/api/v1/water/reports/jobs/{ident}/download', headers=headers)
        assert file_response.status_code == 200
        assert file_response.content == b'%PDF'
        assert client.get('/api/v1/water/reports/jobs/unknown', headers=headers).status_code == 404
        assert client.post('/api/v1/water/reports/jobs', headers=headers, json={'kind': 'daily_pdf', 'options': {'date': 'bad'}}).status_code == 422
    finally:
        manager.shutdown()
