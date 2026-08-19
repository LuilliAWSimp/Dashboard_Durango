from __future__ import annotations

import hashlib
import sqlite3
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.api.routes.auth import router as auth_router
from app.auth.middleware import LocalAuthMiddleware, TAB_SESSION_HEADER
from app.config import Settings
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

COOKIE_NAME = "arca_dgo_session"
CSRF_HEADER = "X-CSRF-Token"
DURANGO_ORIGIN = "https://durango.dashboardrsrc.com.mx"
ALLOWED_ORIGINS = [DURANGO_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"]
ADMIN_PASSWORD = "Administrador2026!"
VIEWER_PASSWORD = "Consulta2026!"
OPERATOR_PASSWORD = "Operador2026!"


class LocalAuthTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "auth.sqlite3"
        self.service = AuthService(
            self.db_path,
            AuthPolicy(idle_hours=8, absolute_hours=12, max_failed_attempts=5, lock_minutes=15, require_tab_session=True),
        )
        self.service.initialize()
        self.admin = self.service.create_user(
            username="adminlocal",
            display_name="Administrador Local",
            password=ADMIN_PASSWORD,
            role="admin",
        )

    def tearDown(self):
        self.temp_dir.cleanup()

    def build_app(self):
        app = FastAPI()
        app.state.auth_service = self.service

        @app.middleware("http")
        async def exception_boundary(request, call_next):
            try:
                return await call_next(request)
            except Exception:
                return JSONResponse(status_code=500, content={"detail": "Error interno del servidor."})

        app.add_middleware(
            LocalAuthMiddleware,
            api_prefix="/api/v1",
            cookie_name=COOKIE_NAME,
            csrf_header=CSRF_HEADER,
        )
        app.add_middleware(
            CORSMiddleware,
            allow_origins=ALLOWED_ORIGINS,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Content-Type", CSRF_HEADER, TAB_SESSION_HEADER],
        )
        app.include_router(auth_router, prefix="/api/v1")

        @app.get("/api/v1/dashboard")
        def dashboard():
            return {"ok": True}

        @app.post("/api/v1/water/reports/daily/email")
        def email_report():
            return {"sent": True}

        @app.post("/api/v1/admin-only")
        def admin_only():
            return {"ok": True}

        @app.get("/api/v1/boom")
        def boom():
            raise RuntimeError("boom")

        return app

    def session_client(self, username="adminlocal", password=ADMIN_PASSWORD):
        result = self.service.authenticate(username=username, password=password, ip_address="127.0.0.1")
        client = TestClient(self.build_app())
        client.cookies.set(COOKIE_NAME, result.token)
        client.headers.update({TAB_SESSION_HEADER: result.tab_session})
        return client, result

    def test_configuracion_incluye_origenes_cors_de_durango(self):
        settings = Settings()
        self.assertEqual(
            settings.allowed_origins[:3],
            [DURANGO_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"],
        )
        self.assertNotIn("*", settings.allowed_origins)

    def test_login_genera_cookie_e_identificador_de_pestana(self):
        client = TestClient(self.build_app(), base_url="https://testserver")
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "adminlocal", "password": ADMIN_PASSWORD},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["tab_session"])
        cookie = response.headers["set-cookie"].lower()
        self.assertIn("httponly", cookie)
        self.assertNotIn("max-age", cookie)
        self.assertNotIn("expires=", cookie)

        with self.service.database.connect() as connection:
            row = connection.execute(
                "SELECT token_hash, tab_session_hash FROM sessions ORDER BY id DESC LIMIT 1"
            ).fetchone()
        self.assertEqual(row["tab_session_hash"], hashlib.sha256(payload["tab_session"].encode()).hexdigest())
        self.assertNotEqual(row["tab_session_hash"], payload["tab_session"])

    def test_cookie_sin_identificador_de_pestana_devuelve_401(self):
        result = self.service.authenticate(username="adminlocal", password=ADMIN_PASSWORD)
        client = TestClient(self.build_app())
        client.cookies.set(COOKIE_NAME, result.token)
        self.assertEqual(client.get("/api/v1/dashboard").status_code, 401)

    def test_identificador_de_pestana_incorrecto_devuelve_401(self):
        result = self.service.authenticate(username="adminlocal", password=ADMIN_PASSWORD)
        client = TestClient(self.build_app())
        client.cookies.set(COOKIE_NAME, result.token)
        response = client.get("/api/v1/dashboard", headers={TAB_SESSION_HEADER: "incorrecto"})
        self.assertEqual(response.status_code, 401)

    def test_cookie_e_identificador_correctos_permiten_acceso(self):
        client, _ = self.session_client()
        self.assertEqual(client.get("/api/v1/dashboard").status_code, 200)

    def test_cors_preflight_desde_dominio_durango_no_exige_auth(self):
        client = TestClient(self.build_app())
        response = client.options(
            "/api/v1/auth/me",
            headers={
                "Origin": DURANGO_ORIGIN,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": f"content-type,{CSRF_HEADER},{TAB_SESSION_HEADER}",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), DURANGO_ORIGIN)
        self.assertEqual(response.headers.get("access-control-allow-credentials"), "true")
        allowed_headers = response.headers.get("access-control-allow-headers", "").lower()
        self.assertIn("content-type", allowed_headers)
        self.assertIn(CSRF_HEADER.lower(), allowed_headers)
        self.assertIn(TAB_SESSION_HEADER.lower(), allowed_headers)

    def test_cors_en_respuesta_publica_200(self):
        client = TestClient(self.build_app())
        response = client.get("/api/v1/auth/setup-status", headers={"Origin": DURANGO_ORIGIN})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), DURANGO_ORIGIN)
        self.assertEqual(response.headers.get("access-control-allow-credentials"), "true")

    def test_auth_me_sin_sesion_devuelve_401_visible_con_cors(self):
        client = TestClient(self.build_app())
        response = client.get("/api/v1/auth/me", headers={"Origin": DURANGO_ORIGIN})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers.get("access-control-allow-origin"), DURANGO_ORIGIN)

    def test_permisos_insuficientes_devuelven_403_con_cors(self):
        self.service.create_user(username="viewer_cors", display_name="Viewer CORS", password=VIEWER_PASSWORD, role="viewer")
        client, _ = self.session_client("viewer_cors", VIEWER_PASSWORD)
        response = client.get("/api/v1/auth/users", headers={"Origin": DURANGO_ORIGIN})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.headers.get("access-control-allow-origin"), DURANGO_ORIGIN)

    def test_error_de_validacion_422_conserva_cors(self):
        client = TestClient(self.build_app())
        response = client.post("/api/v1/auth/login", headers={"Origin": DURANGO_ORIGIN}, json={})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.headers.get("access-control-allow-origin"), DURANGO_ORIGIN)

    def test_error_500_conserva_cors(self):
        client, _ = self.session_client()
        response = client.get("/api/v1/boom", headers={"Origin": DURANGO_ORIGIN})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.headers.get("access-control-allow-origin"), DURANGO_ORIGIN)

    def test_identificador_compartido_permite_multiples_pestanas(self):
        first_client, result = self.session_client()
        second_client = TestClient(self.build_app())
        second_client.cookies.set(COOKIE_NAME, result.token)
        second_client.headers.update({TAB_SESSION_HEADER: result.tab_session})

        self.assertEqual(first_client.get("/api/v1/dashboard").status_code, 200)
        self.assertEqual(second_client.get("/api/v1/dashboard").status_code, 200)

        payload = {"username": "multitab", "display_name": "Multi Tab", "password": VIEWER_PASSWORD, "role": "viewer"}
        self.assertEqual(first_client.post("/api/v1/auth/users", json=payload, headers={CSRF_HEADER: result.csrf_token}).status_code, 201)
        self.assertEqual(second_client.patch("/api/v1/auth/users/2", json={"display_name": "Multi Tab 2"}, headers={CSRF_HEADER: result.csrf_token}).status_code, 200)

    def test_auth_me_no_rota_csrf_ni_invalida_otras_pestanas(self):
        first_client, result = self.session_client()
        second_client = TestClient(self.build_app())
        second_client.cookies.set(COOKIE_NAME, result.token)
        second_client.headers.update({TAB_SESSION_HEADER: result.tab_session})

        first_me = first_client.get("/api/v1/auth/me")
        second_me = second_client.get("/api/v1/auth/me")
        self.assertEqual(first_me.status_code, 200)
        self.assertEqual(second_me.status_code, 200)
        self.assertEqual(first_me.json()["csrf_token"], result.csrf_token)
        self.assertEqual(second_me.json()["csrf_token"], result.csrf_token)

        payload = {"username": "csrfstable", "display_name": "CSRF Stable", "password": VIEWER_PASSWORD, "role": "viewer"}
        response = first_client.post("/api/v1/auth/users", json=payload, headers={CSRF_HEADER: first_me.json()["csrf_token"]})
        self.assertEqual(response.status_code, 201)

    def test_login_correcto_y_hash_argon2(self):
        result = self.service.authenticate(username="adminlocal", password=ADMIN_PASSWORD)
        self.assertEqual(result.user["role"], "admin")
        with self.service.database.connect() as connection:
            row = connection.execute("SELECT password_hash FROM users WHERE id = ?", (self.admin["id"],)).fetchone()
        self.assertTrue(str(row["password_hash"]).startswith("$argon2"))
        self.assertNotIn(ADMIN_PASSWORD, row["password_hash"])

    def test_login_incorrecto(self):
        with self.assertRaises(InvalidCredentialsError):
            self.service.authenticate(username="adminlocal", password="Incorrecta2026")

    def test_usuario_desactivado_no_inicia_sesion(self):
        user = self.service.create_user(username="viewer1", display_name="Viewer", password=VIEWER_PASSWORD, role="viewer")
        self.service.update_user(user["id"], is_active=False)
        with self.assertRaises(InactiveUserError):
            self.service.authenticate(username="viewer1", password=VIEWER_PASSWORD)

    def test_bloqueo_despues_de_cinco_intentos(self):
        for _ in range(5):
            with self.assertRaises(InvalidCredentialsError):
                self.service.authenticate(username="adminlocal", password="Incorrecta2026")
        with self.assertRaises(AccountLockedError):
            self.service.authenticate(username="adminlocal", password=ADMIN_PASSWORD)

    def test_sesion_expirada_devuelve_401(self):
        client, result = self.session_client()
        with self.service.database.connect() as connection:
            connection.execute(
                "UPDATE sessions SET expires_at = ? WHERE token_hash = ?",
                (iso(utc_now() - timedelta(minutes=1)), hashlib.sha256(result.token.encode()).hexdigest()),
            )
        response = client.get("/api/v1/dashboard")
        self.assertEqual(response.status_code, 401)

    def test_logout_invalida_sesion(self):
        client, result = self.session_client()
        response = client.post("/api/v1/auth/logout", headers={CSRF_HEADER: result.csrf_token})
        self.assertEqual(response.status_code, 200)
        client.cookies.set(COOKIE_NAME, result.token)
        self.assertEqual(client.get("/api/v1/dashboard").status_code, 401)

    def test_sesion_mayor_de_doce_horas_devuelve_401(self):
        client, result = self.session_client()
        with self.service.database.connect() as connection:
            connection.execute(
                """
                UPDATE sessions
                SET created_at = ?, last_activity_at = ?, expires_at = ?
                WHERE token_hash = ?
                """,
                (
                    iso(utc_now() - timedelta(hours=13)),
                    iso(utc_now()),
                    iso(utc_now() + timedelta(hours=1)),
                    hashlib.sha256(result.token.encode()).hexdigest(),
                ),
            )
        self.assertEqual(client.get("/api/v1/dashboard").status_code, 401)

    def test_dashboard_directo_sin_sesion_devuelve_401(self):
        client = TestClient(self.build_app())
        self.assertEqual(client.get("/api/v1/dashboard").status_code, 401)

    def test_viewer_no_administra_usuarios(self):
        self.service.create_user(username="viewer2", display_name="Viewer", password=VIEWER_PASSWORD, role="viewer")
        client, _ = self.session_client("viewer2", VIEWER_PASSWORD)
        self.assertEqual(client.get("/api/v1/auth/users").status_code, 403)

    def test_operator_no_administra_usuarios(self):
        self.service.create_user(username="operator1", display_name="Operador", password=OPERATOR_PASSWORD, role="operator")
        client, _ = self.session_client("operator1", OPERATOR_PASSWORD)
        self.assertEqual(client.get("/api/v1/auth/users").status_code, 403)

    def test_admin_crea_y_desactiva_usuario(self):
        client, result = self.session_client()
        create_response = client.post(
            "/api/v1/auth/users",
            headers={CSRF_HEADER: result.csrf_token},
            json={"username": "nuevo", "display_name": "Nuevo Usuario", "password": VIEWER_PASSWORD, "role": "viewer", "is_active": True},
        )
        self.assertEqual(create_response.status_code, 201)
        user_id = create_response.json()["id"]
        patch_response = client.patch(
            f"/api/v1/auth/users/{user_id}",
            headers={CSRF_HEADER: result.csrf_token},
            json={"is_active": False},
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertFalse(patch_response.json()["is_active"])

    def test_reset_password_revoca_sesiones(self):
        user = self.service.create_user(username="operator2", display_name="Operador", password=OPERATOR_PASSWORD, role="operator")
        old_session = self.service.authenticate(username="operator2", password=OPERATOR_PASSWORD)
        self.service.reset_password(user["id"], "NuevaClave2026!")
        self.assertIsNone(self.service.get_session(old_session.token, old_session.tab_session))
        new_session = self.service.authenticate(username="operator2", password="NuevaClave2026!")
        self.assertIsNotNone(self.service.get_session(new_session.token, new_session.tab_session))

    def test_token_no_se_guarda_en_texto_plano(self):
        result = self.service.authenticate(username="adminlocal", password=ADMIN_PASSWORD)
        with self.service.database.connect() as connection:
            row = connection.execute("SELECT token_hash, tab_session_hash FROM sessions ORDER BY id DESC LIMIT 1").fetchone()
        self.assertNotEqual(row["token_hash"], result.token)
        self.assertEqual(len(row["token_hash"]), 64)
        self.assertNotEqual(row["tab_session_hash"], result.tab_session)
        self.assertEqual(len(row["tab_session_hash"]), 64)

    def test_migracion_idempotente_conserva_usuarios_existentes(self):
        legacy_path = Path(self.temp_dir.name) / "legacy.sqlite3"
        password_hash = "hash-usuario-existente"
        with sqlite3.connect(legacy_path) as connection:
            connection.executescript(
                """
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    display_name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
                    is_active INTEGER NOT NULL DEFAULT 1,
                    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
                    locked_until TEXT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_login_at TEXT NULL
                );
                CREATE TABLE sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    csrf_token_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    last_activity_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    revoked_at TEXT NULL,
                    ip_address TEXT NULL,
                    user_agent TEXT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                """
            )
            connection.execute(
                """
                INSERT INTO users (
                    username, display_name, password_hash, role, is_active,
                    failed_login_attempts, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 1, 0, ?, ?)
                """,
                ("existente", "Usuario Existente", password_hash, "admin", iso(utc_now()), iso(utc_now())),
            )

        migrated = AuthService(legacy_path, AuthPolicy(require_tab_session=True))
        migrated.initialize()
        migrated.initialize()
        with migrated.database.connect() as connection:
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(sessions)").fetchall()}
            users = connection.execute("SELECT username, role, password_hash FROM users").fetchall()
        self.assertIn("tab_session_hash", columns)
        self.assertEqual(len(users), 1)
        self.assertEqual(users[0]["username"], "existente")
        self.assertEqual(users[0]["role"], "admin")
        self.assertEqual(users[0]["password_hash"], password_hash)

    def test_api_no_devuelve_password_hash(self):
        client, _ = self.session_client()
        response = client.get("/api/v1/auth/users")
        self.assertEqual(response.status_code, 200)
        serialized = response.text.lower()
        self.assertNotIn("password_hash", serialized)
        self.assertNotIn(ADMIN_PASSWORD.lower(), serialized)

    def test_csrf_requerido_en_operaciones_de_escritura(self):
        client, result = self.session_client()
        payload = {"username": "csrfuser", "display_name": "CSRF", "password": VIEWER_PASSWORD, "role": "viewer"}
        self.assertEqual(client.post("/api/v1/auth/users", json=payload).status_code, 403)
        self.assertEqual(client.post("/api/v1/auth/users", json=payload, headers={CSRF_HEADER: result.csrf_token}).status_code, 201)

    def test_viewer_no_envia_correo_y_operator_si(self):
        self.service.create_user(username="viewer3", display_name="Viewer", password=VIEWER_PASSWORD, role="viewer")
        viewer_client, viewer_session = self.session_client("viewer3", VIEWER_PASSWORD)
        self.assertEqual(viewer_client.post("/api/v1/water/reports/daily/email", headers={CSRF_HEADER: viewer_session.csrf_token}).status_code, 403)
        self.service.create_user(username="operator3", display_name="Operador", password=OPERATOR_PASSWORD, role="operator")
        operator_client, operator_session = self.session_client("operator3", OPERATOR_PASSWORD)
        self.assertEqual(operator_client.post("/api/v1/water/reports/daily/email", headers={CSRF_HEADER: operator_session.csrf_token}).status_code, 200)

    def test_no_permite_quitar_ultimo_administrador(self):
        with self.assertRaises(LastAdministratorError):
            self.service.update_user(self.admin["id"], role="viewer")


if __name__ == "__main__":
    unittest.main()
