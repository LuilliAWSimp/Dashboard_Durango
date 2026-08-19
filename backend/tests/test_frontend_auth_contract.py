from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


class FrontendAuthContractTests(unittest.TestCase):
    def read(self, relative: str) -> str:
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_login_form_starts_empty_and_has_autocomplete(self):
        source = self.read("frontend/src/pages/LoginPage.jsx")
        self.assertIn("useState('')", source)
        self.assertIn('autoComplete="username"', source)
        self.assertIn('autoComplete="current-password"', source)
        self.assertNotIn("demo123", source)
        self.assertNotIn("Credenciales:", source)

    def test_auth_uses_shared_browser_binding_without_bearer_token(self):
        source = self.read("frontend/src/services/api.js") + self.read("frontend/src/services/authService.js")
        self.assertNotIn("access_token", source)
        self.assertNotIn("Bearer", source)
        self.assertIn("localStorage", source)
        self.assertIn("BroadcastChannel", source)
        self.assertIn("arca_dgo_browser_session", source)
        self.assertIn("arca_dgo_tab_session", source)
        self.assertIn("setTabSession(data.tab_session)", source)
        self.assertIn("clearTabSession()", source)

    def test_http_client_uses_cookies_and_csrf(self):
        source = self.read("frontend/src/services/api.js")
        self.assertIn("withCredentials: true", source)
        self.assertIn("X-CSRF-Token", source)
        self.assertIn("X-ARCA-Tab-Session", source)
        self.assertIn("arca-auth-expired", source)
        self.assertIn("arca-auth-updated", source)

    def test_app_restores_existing_browser_session_before_dashboard(self):
        source = self.read("frontend/src/App.jsx")
        self.assertIn("hasTabSession()", source)
        self.assertIn("if (!hasTabSession())", source)
        self.assertIn("getCurrentSession()", source)
        self.assertIn("arca-auth-updated", source)
        self.assertIn("setSessionChecked(true)", source)

    def test_users_menu_is_admin_only(self):
        source = self.read("frontend/src/App.jsx")
        self.assertIn("user?.role === 'admin'", source)
        self.assertIn("key: 'usuarios'", source)

    def test_session_expiry_removes_protected_dashboard(self):
        source = self.read("frontend/src/App.jsx")
        self.assertIn("window.addEventListener('arca-auth-expired'", source)
        self.assertIn("setUser(null)", source)
        self.assertIn("ProtectedRoute", source)


if __name__ == "__main__":
    unittest.main()
