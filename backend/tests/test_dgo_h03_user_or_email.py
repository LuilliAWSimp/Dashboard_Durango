"""H03: user traditional/email identifier without migrating auth.sqlite3."""
from __future__ import annotations

import sqlite3
import unittest

from app.auth.security import normalize_username
from app.auth.service import DuplicateUserError, InvalidCredentialsError
import test_local_auth as base_auth
from test_local_auth import ADMIN_PASSWORD, OPERATOR_PASSWORD, VIEWER_PASSWORD, CSRF_HEADER


class H03IdentityTests(unittest.TestCase):
    def setUp(self):
        self.base = base_auth.LocalAuthTests('test_sqlite_independiente_e_inicializacion')
        self.base.setUp()
        self.service = self.base.service

    def tearDown(self):
        self.base.tearDown()

    def test_validation_and_normalization(self):
        self.assertEqual(normalize_username(' AdminLOCAL '), 'adminlocal')
        self.assertEqual(normalize_username(' Name.Last+Plant@Example.COM.MX '), 'name.last+plant@example.com.mx')
        for raw in ['a@', '@empresa.com', 'a@@empresa.com', 'a b@empresa.com', 'x'*250+'@e.com', 'ñame']:
            with self.subTest(raw=raw):
                with self.assertRaises(ValueError):
                    normalize_username(raw)
        with self.assertRaises(ValueError):
            normalize_username('ad' )

    def test_create_login_and_case_insensitive_unique(self):
        user = self.service.create_user(username=' OPERADOR+AGUA@EMPRESA.COM.MX ', display_name='Operador', password=OPERATOR_PASSWORD, role='operator')
        self.assertEqual(user['username'], 'operador+agua@empresa.com.mx')
        self.assertEqual(self.service.authenticate(username=' OPERADOR+AGUA@Empresa.COM.MX ', password=OPERATOR_PASSWORD).user['id'], user['id'])
        with self.assertRaises(DuplicateUserError):
            self.service.create_user(username='operador+agua@empresa.com.mx', display_name='Duplicado', password=VIEWER_PASSWORD, role='viewer')
        self.assertEqual(self.service.authenticate(username=' ADMINLOCAL ', password=ADMIN_PASSWORD).user['id'], self.base.admin['id'])
        with self.assertRaises(InvalidCredentialsError):
            self.service.authenticate(username='invalido@', password=ADMIN_PASSWORD)

    def test_rename_preserves_id_password_role_session_and_audit(self):
        user = self.service.create_user(username='operador-old', display_name='Operador', password=OPERATOR_PASSWORD, role='operator')
        opened = self.service.authenticate(username='operador-old', password=OPERATOR_PASSWORD)
        with self.service.database.connect() as conn:
            old = conn.execute('SELECT password_hash FROM users WHERE id=?', (user['id'],)).fetchone()['password_hash']
        changed = self.service.update_user(user['id'], username=' OPERADOR+TURNO@EMPRESA.COM ' ,actor_user_id=self.base.admin['id'])
        self.assertEqual(changed['id'], user['id'])
        self.assertEqual(changed['role'], 'operator')
        self.assertEqual(changed['username'], 'operador+turno@empresa.com')
        session = self.service.get_session(opened.token, opened.browser_session)
        self.assertIsNotNone(session)
        self.assertEqual(session['user']['id'], user['id'])
        self.assertEqual(session['user']['username'], changed['username'])
        with self.service.database.connect() as conn:
            after = conn.execute('SELECT password_hash FROM users WHERE id=?', (user['id'],)).fetchone()['password_hash']
            audit = conn.execute('SELECT action, details FROM auth_audit WHERE target_user_id=? AND action="user_updated" ORDER BY id DESC LIMIT 1', (user['id'],)).fetchone()
        self.assertEqual(old, after)
        self.assertIsNotNone(audit)
        self.assertIn('username_changed', audit['details'])
        with self.assertRaises(InvalidCredentialsError):
            self.service.authenticate(username='operador-old', password=OPERATOR_PASSWORD)
        self.assertEqual(self.service.authenticate(username='OPERADOR+TURNO@EMPRESA.COM', password=OPERATOR_PASSWORD).user['id'], user['id'])

    def test_duplicate_edit_rolls_back_and_preserves_session(self):
        user = self.service.create_user(username='viewer-old', display_name='Viewer', password=VIEWER_PASSWORD, role='viewer')
        with self.assertRaises(DuplicateUserError):
            self.service.update_user(user['id'], username='ADMINLOCAL')
        self.assertEqual(self.service.authenticate(username='viewer-old', password=VIEWER_PASSWORD).user['id'], user['id'])
        with self.assertRaises(ValueError):
            self.service.update_user(user['id'], username='invalido@@example.com')

    def test_http_admin_only_csrf_duplicate_and_legacy(self):
        admin, session = self.base.session_client()
        create = admin.post('/api/v1/auth/users', headers={CSRF_HEADER: session.csrf_token}, json={
            'username':'ANALISTA+UNO@EMPRESA.COM', 'display_name':'Analista',
            'password':VIEWER_PASSWORD,'role':'viewer', 'is_active':True,
        })
        self.assertEqual(create.status_code, 201, create.text)
        user_id = create.json()['id']
        self.assertEqual(create.json()['username'], 'analista+uno@empresa.com')
        duplicate = admin.post('/api/v1/auth/users', headers={CSRF_HEADER: session.csrf_token}, json={
            'username':'analista+uno@empresa.com','display_name':'Dup','password':VIEWER_PASSWORD,'role':'viewer',
        })
        self.assertEqual(duplicate.status_code, 409)
        invalid = admin.post('/api/v1/auth/users', headers={CSRF_HEADER: session.csrf_token}, json={
            'username':'not-an-email@','display_name':'Bad','password':VIEWER_PASSWORD,'role':'viewer',
        })
        self.assertEqual(invalid.status_code, 422)
        without_csrf = admin.patch(f'/api/v1/auth/users/{user_id}', json={'username':'new@empresa.com'})
        self.assertEqual(without_csrf.status_code, 403)
        edited = admin.patch(f'/api/v1/auth/users/{user_id}', headers={CSRF_HEADER: session.csrf_token}, json={'username':'new@empresa.com'})
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(edited.json()['id'], user_id)
        self.assertEqual(edited.json()['username'], 'new@empresa.com')
        duplicate_edit = admin.patch(f'/api/v1/auth/users/{user_id}', headers={CSRF_HEADER: session.csrf_token}, json={'username':'ADMINLOCAL'})
        self.assertEqual(duplicate_edit.status_code, 409)
        viewer, viewer_session = self.base.session_client('new@empresa.com', VIEWER_PASSWORD)
        self.assertEqual(viewer.get('/api/v1/auth/users').status_code, 403)
        self.assertEqual(viewer.patch(f'/api/v1/auth/users/{user_id}', headers={CSRF_HEADER:viewer_session.csrf_token}, json={'username':'other@empresa.com'}).status_code, 403)
        self.assertEqual(admin.get('/api/v1/auth/me').status_code, 200)
        self.assertEqual(self.service.authenticate(username='adminlocal',password=ADMIN_PASSWORD).user['id'], self.base.admin['id'])

    def test_http_login_by_email_and_admin_self_rename_keeps_cookie_session(self):
        admin, opened = self.base.session_client()
        response = admin.patch(
            f"/api/v1/auth/users/{self.base.admin['id']}",
            headers={CSRF_HEADER: opened.csrf_token},
            json={'username': ' ADMIN+LOCAL@EMPRESA.COM.MX '},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(admin.get('/api/v1/auth/me').status_code, 200)
        self.assertEqual(admin.get('/api/v1/auth/me').json()['user']['username'], 'admin+local@empresa.com.mx')
        from fastapi.testclient import TestClient
        new_client = TestClient(self.base.build_app())
        logged = new_client.post('/api/v1/auth/login', json={
            'username': 'ADMIN+LOCAL@EMPRESA.COM.MX', 'password': ADMIN_PASSWORD
        })
        self.assertEqual(logged.status_code, 200, logged.text)
        self.assertEqual(logged.json()['user']['id'], self.base.admin['id'])
        rejected = new_client.post('/api/v1/auth/login', json={
            'username': 'adminlocal', 'password': ADMIN_PASSWORD
        })
        self.assertEqual(rejected.status_code, 401)

    def test_no_migration_of_existing_sqlite_schema(self):
        with sqlite3.connect(self.base.db_path) as conn:
            names = {r[1] for r in conn.execute('PRAGMA table_info(users)')}
            schema_version = conn.execute('PRAGMA user_version').fetchone()[0]
        self.assertIn('username', names)
        self.assertNotIn('email', names)
        self.assertEqual(schema_version, 2)

if __name__ == '__main__':
    unittest.main()
