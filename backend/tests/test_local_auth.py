from __future__ import annotations

import hashlib
import sqlite3
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

import app.api.routes.auth as auth_routes
from app.api.routes.auth import router as auth_router
from app.auth.dependencies import require_roles
from app.auth.middleware import (
    ApiExceptionBoundaryMiddleware,
    BROWSER_SESSION_HEADER,
    LocalAuthMiddleware,
    USER_ACTIVITY_HEADER,
)
from app.auth.service import (
    AccountLockedError,
    AuthPolicy,
    AuthService,
    InactiveUserError,
    InvalidCredentialsError,
    LastAdministratorError,
    iso,
    utc_now,
)

COOKIE_NAME = 'arca_dgo_session'
CSRF_HEADER = 'X-CSRF-Token'
ORIGIN = 'https://durango.dashboardrsrc.com.mx'
LOCAL_ORIGIN = 'http://localhost:5173'
LAN_ORIGIN = 'http://100.102.159.109:5173'
ADMIN_PASSWORD = 'Administrador2026!'
VIEWER_PASSWORD = 'Consulta2026!'
OPERATOR_PASSWORD = 'Operador2026!'


class LocalAuthTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / 'auth.sqlite3'
        self.service = AuthService(
            self.db_path,
            AuthPolicy(
                idle_hours=8,
                absolute_hours=12,
                max_failed_attempts=5,
                lock_minutes=15,
                require_browser_session=True,
            ),
        )
        self.service.initialize()
        self.admin = self.service.create_user(
            username='adminlocal',
            display_name='Administrador Local',
            password=ADMIN_PASSWORD,
            role='admin',
        )
        self.original_cookie_name = auth_routes.settings.auth_cookie_name
        self.original_cookie_secure = auth_routes.settings.auth_cookie_secure
        self.original_cookie_session_only = auth_routes.settings.auth_cookie_session_only
        self.original_cookie_samesite = auth_routes.settings.auth_cookie_samesite
        auth_routes.settings.auth_cookie_name = COOKIE_NAME
        auth_routes.settings.auth_cookie_secure = False
        auth_routes.settings.auth_cookie_session_only = True
        auth_routes.settings.auth_cookie_samesite = 'lax'

    def tearDown(self):
        auth_routes.settings.auth_cookie_name = self.original_cookie_name
        auth_routes.settings.auth_cookie_secure = self.original_cookie_secure
        auth_routes.settings.auth_cookie_session_only = self.original_cookie_session_only
        auth_routes.settings.auth_cookie_samesite = self.original_cookie_samesite
        self.temp_dir.cleanup()

    def build_app(self):
        app = FastAPI()
        app.state.auth_service = self.service
        app.add_middleware(
            LocalAuthMiddleware,
            api_prefix='/api/v1',
            cookie_name=COOKIE_NAME,
            csrf_header=CSRF_HEADER,
        )
        app.add_middleware(ApiExceptionBoundaryMiddleware)
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[ORIGIN, LOCAL_ORIGIN, 'http://127.0.0.1:5173', LAN_ORIGIN],
            allow_credentials=True,
            allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allow_headers=['Accept', 'Content-Type', CSRF_HEADER, BROWSER_SESSION_HEADER, USER_ACTIVITY_HEADER],
        )
        app.include_router(auth_router, prefix='/api/v1')

        @app.get('/api/v1/dashboard')
        def dashboard():
            return {'ok': True}

        @app.get('/api/v1/admin-only', dependencies=[Depends(require_roles('admin'))])
        def admin_only():
            return {'ok': True}

        @app.post('/api/v1/water/reports/daily/email')
        def email_report():
            return {'sent': True}

        @app.get('/api/v1/boom')
        def boom():
            raise RuntimeError('boom')

        return app

    def session_client(self, username='adminlocal', password=ADMIN_PASSWORD):
        result = self.service.authenticate(username=username, password=password, ip_address='127.0.0.1')
        client = TestClient(self.build_app())
        client.cookies.set(COOKIE_NAME, result.token)
        client.headers.update({BROWSER_SESSION_HEADER: result.browser_session})
        return client, result

    def test_sqlite_independiente_e_inicializacion(self):
        self.assertTrue(self.db_path.exists())
        with sqlite3.connect(self.db_path) as connection:
            tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            mode = connection.execute('PRAGMA journal_mode').fetchone()[0]
        self.assertIn('users', tables)
        self.assertIn('sessions', tables)
        self.assertIn('auth_audit', tables)
        self.assertEqual(str(mode).lower(), 'wal')

    def test_usuario_unico_sin_distinguir_mayusculas(self):
        with self.assertRaises(Exception):
            self.service.create_user(
                username='ADMINLOCAL', display_name='Otro', password=VIEWER_PASSWORD, role='viewer'
            )

    def test_hash_argon2_y_token_solo_hash(self):
        result = self.service.authenticate(username='adminlocal', password=ADMIN_PASSWORD)
        with self.service.database.connect() as connection:
            user = connection.execute('SELECT password_hash FROM users WHERE id = ?', (self.admin['id'],)).fetchone()
            session = connection.execute('SELECT token_hash, browser_session_hash FROM sessions ORDER BY id DESC LIMIT 1').fetchone()
        self.assertTrue(str(user['password_hash']).startswith('$argon2'))
        self.assertNotIn(ADMIN_PASSWORD, user['password_hash'])
        self.assertEqual(session['token_hash'], hashlib.sha256(result.token.encode()).hexdigest())
        self.assertEqual(session['browser_session_hash'], hashlib.sha256(result.browser_session.encode()).hexdigest())
        self.assertNotEqual(session['token_hash'], result.token)

    def test_login_cookie_http_only_samesite_session_only(self):
        client = TestClient(self.build_app())
        response = client.post('/api/v1/auth/login', json={'username': 'adminlocal', 'password': ADMIN_PASSWORD})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload['browser_session'])
        self.assertTrue(payload['csrf_token'])
        cookie = response.headers['set-cookie'].lower()
        self.assertIn('httponly', cookie)
        self.assertIn('samesite=lax', cookie)
        self.assertNotIn('max-age', cookie)
        self.assertNotIn('expires=', cookie)

    def test_cookie_secure_en_produccion(self):
        auth_routes.settings.auth_cookie_secure = True
        client = TestClient(self.build_app(), base_url='https://testserver')
        response = client.post('/api/v1/auth/login', json={'username': 'adminlocal', 'password': ADMIN_PASSWORD})
        self.assertIn('secure', response.headers['set-cookie'].lower())

    def test_cookie_local_http_no_secure_sin_debilitar_https(self):
        auth_routes.settings.auth_cookie_secure = True
        client = TestClient(self.build_app())
        local = client.post(
            '/api/v1/auth/login',
            json={'username': 'adminlocal', 'password': ADMIN_PASSWORD},
            headers={'Origin': LOCAL_ORIGIN},
        )
        self.assertEqual(local.status_code, 200)
        self.assertNotIn('secure', local.headers['set-cookie'].lower())

        lan = TestClient(self.build_app()).post(
            '/api/v1/auth/login',
            json={'username': 'adminlocal', 'password': ADMIN_PASSWORD},
            headers={'Origin': LAN_ORIGIN},
        )
        self.assertEqual(lan.status_code, 200)
        self.assertNotIn('secure', lan.headers['set-cookie'].lower())

        production = TestClient(self.build_app(), base_url='https://testserver').post(
            '/api/v1/auth/login',
            json={'username': 'adminlocal', 'password': ADMIN_PASSWORD},
            headers={'Origin': ORIGIN},
        )
        self.assertEqual(production.status_code, 200)
        self.assertIn('secure', production.headers['set-cookie'].lower())

    def test_login_incorrecto_usuario_inactivo_y_bloqueo(self):
        with self.assertRaises(InvalidCredentialsError):
            self.service.authenticate(username='adminlocal', password='Incorrecta2026')
        user = self.service.create_user(username='viewer1', display_name='Viewer', password=VIEWER_PASSWORD, role='viewer')
        self.service.update_user(user['id'], is_active=False)
        with self.assertRaises(InactiveUserError):
            self.service.authenticate(username='viewer1', password=VIEWER_PASSWORD)
        # Ya hubo un intento fallido arriba; cuatro adicionales completan los cinco permitidos.
        for _ in range(4):
            with self.assertRaises(InvalidCredentialsError):
                self.service.authenticate(username='adminlocal', password='Incorrecta2026')
        with self.assertRaises(AccountLockedError):
            self.service.authenticate(username='adminlocal', password=ADMIN_PASSWORD)

    def test_binding_ausente_o_incorrecto_devuelve_401(self):
        result = self.service.authenticate(username='adminlocal', password=ADMIN_PASSWORD)
        client = TestClient(self.build_app())
        client.cookies.set(COOKIE_NAME, result.token)
        self.assertEqual(client.get('/api/v1/dashboard').status_code, 401)
        self.assertEqual(client.get('/api/v1/dashboard', headers={BROWSER_SESSION_HEADER: 'incorrecto'}).status_code, 401)

    def test_multiples_pestanas_comparten_sesion_y_csrf_estable(self):
        first, result = self.session_client()
        second = TestClient(self.build_app())
        second.cookies.set(COOKIE_NAME, result.token)
        second.headers.update({BROWSER_SESSION_HEADER: result.browser_session})
        third = TestClient(self.build_app())
        third.cookies.set(COOKIE_NAME, result.token)
        third.headers.update({BROWSER_SESSION_HEADER: result.browser_session})

        self.assertEqual(first.get('/api/v1/dashboard').status_code, 200)
        self.assertEqual(second.get('/api/v1/dashboard').status_code, 200)
        self.assertEqual(third.get('/api/v1/dashboard').status_code, 200)
        me1 = first.get('/api/v1/auth/me')
        me2 = second.get('/api/v1/auth/me')
        self.assertEqual(me1.json()['csrf_token'], result.csrf_token)
        self.assertEqual(me2.json()['csrf_token'], result.csrf_token)

        payload = {'username': 'multitab', 'display_name': 'Multi Tab', 'password': VIEWER_PASSWORD, 'role': 'viewer'}
        self.assertEqual(first.post('/api/v1/auth/users', json=payload, headers={CSRF_HEADER: result.csrf_token}).status_code, 201)
        self.assertEqual(second.patch('/api/v1/auth/users/2', json={'display_name': 'Multi Tab 2'}, headers={CSRF_HEADER: result.csrf_token}).status_code, 200)

    def test_csrf_ausente_e_incorrecto(self):
        client, result = self.session_client()
        payload = {'username': 'csrfuser', 'display_name': 'CSRF', 'password': VIEWER_PASSWORD, 'role': 'viewer'}
        self.assertEqual(client.post('/api/v1/auth/users', json=payload).status_code, 403)
        self.assertEqual(client.post('/api/v1/auth/users', json=payload, headers={CSRF_HEADER: 'incorrecto'}).status_code, 403)
        self.assertEqual(client.post('/api/v1/auth/users', json=payload, headers={CSRF_HEADER: result.csrf_token}).status_code, 201)

    def test_logout_revoca_sesion(self):
        client, result = self.session_client()
        response = client.post('/api/v1/auth/logout', headers={CSRF_HEADER: result.csrf_token})
        self.assertEqual(response.status_code, 200)
        client.cookies.set(COOKIE_NAME, result.token)
        self.assertEqual(client.get('/api/v1/dashboard').status_code, 401)

    def test_idle_y_expiracion_absoluta(self):
        client, result = self.session_client()
        token_hash = hashlib.sha256(result.token.encode()).hexdigest()
        with self.service.database.connect() as connection:
            connection.execute(
                'UPDATE sessions SET last_activity_at = ? WHERE token_hash = ?',
                (iso(utc_now() - timedelta(hours=9)), token_hash),
            )
        self.assertEqual(client.get('/api/v1/dashboard').status_code, 401)

        fresh = self.service.authenticate(username='adminlocal', password=ADMIN_PASSWORD)
        second = TestClient(self.build_app())
        second.cookies.set(COOKIE_NAME, fresh.token)
        second.headers.update({BROWSER_SESSION_HEADER: fresh.browser_session})
        fresh_hash = hashlib.sha256(fresh.token.encode()).hexdigest()
        with self.service.database.connect() as connection:
            connection.execute(
                'UPDATE sessions SET created_at = ? WHERE token_hash = ?',
                (iso(utc_now() - timedelta(hours=13)), fresh_hash),
            )
        self.assertEqual(second.get('/api/v1/dashboard').status_code, 401)

    def test_polling_no_extiende_idle_sin_actividad_humana(self):
        client, result = self.session_client()
        token_hash = hashlib.sha256(result.token.encode()).hexdigest()
        with self.service.database.connect() as connection:
            before = connection.execute('SELECT last_activity_at FROM sessions WHERE token_hash = ?', (token_hash,)).fetchone()['last_activity_at']
        self.assertEqual(client.get('/api/v1/dashboard').status_code, 200)
        with self.service.database.connect() as connection:
            after_poll = connection.execute('SELECT last_activity_at FROM sessions WHERE token_hash = ?', (token_hash,)).fetchone()['last_activity_at']
        self.assertEqual(before, after_poll)

        old = iso(utc_now() - timedelta(minutes=5))
        with self.service.database.connect() as connection:
            connection.execute('UPDATE sessions SET last_activity_at = ? WHERE token_hash = ?', (old, token_hash))
        self.assertEqual(client.get('/api/v1/dashboard', headers={USER_ACTIVITY_HEADER: '1'}).status_code, 200)
        with self.service.database.connect() as connection:
            touched = connection.execute('SELECT last_activity_at FROM sessions WHERE token_hash = ?', (token_hash,)).fetchone()['last_activity_at']
        self.assertNotEqual(old, touched)

    def test_reset_desactivar_y_revocar_invalidan_sesiones(self):
        user = self.service.create_user(username='operator2', display_name='Operador', password=OPERATOR_PASSWORD, role='operator')
        old = self.service.authenticate(username='operator2', password=OPERATOR_PASSWORD)
        self.service.reset_password(user['id'], 'NuevaClave2026!')
        self.assertIsNone(self.service.get_session(old.token, old.browser_session))
        fresh = self.service.authenticate(username='operator2', password='NuevaClave2026!')
        self.service.update_user(user['id'], is_active=False)
        self.assertIsNone(self.service.get_session(fresh.token, fresh.browser_session))

    def test_ultimo_administrador_protegido(self):
        with self.assertRaises(LastAdministratorError):
            self.service.update_user(self.admin['id'], role='viewer')
        with self.assertRaises(LastAdministratorError):
            self.service.update_user(self.admin['id'], is_active=False)

    def test_permisos_admin_operator_viewer(self):
        self.service.create_user(username='operator3', display_name='Operador', password=OPERATOR_PASSWORD, role='operator')
        self.service.create_user(username='viewer3', display_name='Viewer', password=VIEWER_PASSWORD, role='viewer')
        operator, operator_session = self.session_client('operator3', OPERATOR_PASSWORD)
        viewer, viewer_session = self.session_client('viewer3', VIEWER_PASSWORD)
        admin, admin_session = self.session_client()

        self.assertEqual(operator.get('/api/v1/dashboard').status_code, 200)
        self.assertEqual(viewer.get('/api/v1/dashboard').status_code, 200)
        self.assertEqual(operator.get('/api/v1/auth/users').status_code, 403)
        self.assertEqual(viewer.get('/api/v1/auth/users').status_code, 403)
        self.assertEqual(admin.get('/api/v1/auth/users').status_code, 200)
        self.assertEqual(operator.post('/api/v1/water/reports/daily/email', headers={CSRF_HEADER: operator_session.csrf_token}).status_code, 200)
        self.assertEqual(viewer.post('/api/v1/water/reports/daily/email', headers={CSRF_HEADER: viewer_session.csrf_token}).status_code, 403)
        self.assertEqual(operator.post('/api/v1/auth/users/1/revoke-sessions', headers={CSRF_HEADER: operator_session.csrf_token}).status_code, 403)
        self.assertEqual(admin.post('/api/v1/auth/logout', headers={CSRF_HEADER: admin_session.csrf_token}).status_code, 200)

    def test_preflight_y_respuestas_cors_incluyen_headers(self):
        client = TestClient(self.build_app())
        preflight = client.options(
            '/api/v1/auth/me',
            headers={
                'Origin': ORIGIN,
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': f'{BROWSER_SESSION_HEADER},{CSRF_HEADER}',
            },
        )
        self.assertEqual(preflight.status_code, 200)
        self.assertEqual(preflight.headers.get('access-control-allow-origin'), ORIGIN)
        self.assertEqual(preflight.headers.get('access-control-allow-credentials'), 'true')

        lan_preflight = client.options(
            '/api/v1/auth/me',
            headers={
                'Origin': LAN_ORIGIN,
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': f'{BROWSER_SESSION_HEADER},{CSRF_HEADER}',
            },
        )
        self.assertEqual(lan_preflight.status_code, 200)
        self.assertEqual(lan_preflight.headers.get('access-control-allow-origin'), LAN_ORIGIN)
        self.assertEqual(lan_preflight.headers.get('access-control-allow-credentials'), 'true')

        public = client.get('/api/v1/auth/setup-status', headers={'Origin': ORIGIN})
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.headers.get('access-control-allow-origin'), ORIGIN)

        unauthorized = client.get('/api/v1/auth/me', headers={'Origin': ORIGIN})
        self.assertEqual(unauthorized.status_code, 401)
        self.assertEqual(unauthorized.headers.get('access-control-allow-origin'), ORIGIN)

        malformed = client.post('/api/v1/auth/login', json={}, headers={'Origin': ORIGIN})
        self.assertEqual(malformed.status_code, 422)
        self.assertEqual(malformed.headers.get('access-control-allow-origin'), ORIGIN)

        self.service.create_user(username='viewer4', display_name='Viewer', password=VIEWER_PASSWORD, role='viewer')
        viewer, _ = self.session_client('viewer4', VIEWER_PASSWORD)
        forbidden = viewer.get('/api/v1/admin-only', headers={'Origin': ORIGIN})
        self.assertEqual(forbidden.status_code, 403)
        self.assertEqual(forbidden.headers.get('access-control-allow-origin'), ORIGIN)

        admin, _ = self.session_client()
        internal = admin.get('/api/v1/boom', headers={'Origin': ORIGIN})
        self.assertEqual(internal.status_code, 500)
        self.assertEqual(internal.headers.get('access-control-allow-origin'), ORIGIN)

    def test_origen_no_autorizado_no_recibe_allow_origin(self):
        client = TestClient(self.build_app())
        response = client.get('/api/v1/auth/setup-status', headers={'Origin': 'https://malicioso.example'})
        self.assertNotIn('access-control-allow-origin', response.headers)


if __name__ == '__main__':
    unittest.main()
