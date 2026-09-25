from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


class FrontendAuthContractTests(unittest.TestCase):
    def read(self, relative: str) -> str:
        return (ROOT / relative).read_text(encoding='utf-8')

    def test_login_no_tiene_credenciales_demo(self):
        source = self.read('frontend/src/pages/LoginPage.jsx')
        self.assertIn("useState('')", source)
        self.assertIn('autoComplete="username"', source)
        self.assertIn('autoComplete="current-password"', source)
        self.assertNotIn('demo123', source)
        self.assertNotIn('Credenciales:', source)
        self.assertIn('PLANTA DURANGO', source)

    def test_auth_no_guarda_token_principal_en_localstorage(self):
        source = self.read('frontend/src/services/api.js') + self.read('frontend/src/services/authService.js')
        self.assertNotIn('access_token', source)
        self.assertNotIn('Bearer', source)
        self.assertIn('arca_dgo_browser_session', source)
        self.assertIn('BroadcastChannel', source)
        self.assertIn('withCredentials: true', source)
        self.assertIn('X-ARCA-Browser-Session', source)
        self.assertIn('X-CSRF-Token', source)

    def test_multi_pestana_y_401_confirmado_antes_de_logout(self):
        source = self.read('frontend/src/services/api.js')
        self.assertIn("type: 'session-updated'", source)
        self.assertIn("type: 'session-cleared'", source)
        self.assertIn("error?.response?.status === 401", source)
        self.assertIn('confirmSessionAfterUnauthorized', source)
        self.assertIn("authProbe.get('/auth/me'", source)
        self.assertIn("confirmation === 'invalid'", source)
        self.assertIn("return 'unknown'", source)
        self.assertIn("window.addEventListener('storage'", source)

    def test_polling_no_se_marca_como_actividad_humana_automaticamente(self):
        source = self.read('frontend/src/services/api.js')
        self.assertIn('X-ARCA-User-Activity', source)
        self.assertIn('pointerdown', source)
        self.assertIn('lastHumanActivityAt', source)

    def test_app_restaura_sesion_y_menu_usuarios_es_admin(self):
        source = self.read('frontend/src/App.jsx')
        capabilities = self.read('frontend/src/config/plantCapabilities.ts')
        self.assertIn('restoreCurrentSessionWithRetry()', source)
        self.assertIn('getCurrentSession()', source)
        self.assertIn('maxAttempts = 3', source)
        self.assertIn("window.addEventListener('arca-auth-expired'", source)
        self.assertIn('buildDurangoNavigation(runtimeCapabilities, user?.role)', source)
        self.assertIn("key: 'usuarios'", capabilities)
        self.assertIn("role !== 'admin'", capabilities)

    def test_reportes_oculta_correo_a_viewer(self):
        source = self.read('frontend/src/pages/pozos/sections/ReportesSection.tsx')
        self.assertIn("currentUser?.role === 'admin' || currentUser?.role === 'operator'", source)
        self.assertIn('canEmail ?', source)

    def test_servicios_auth_tienen_fuente_canonica_unica(self):
        auth_js = self.read('frontend/src/services/authService.js')
        api_js = self.read('frontend/src/services/api.js')
        self.assertFalse((ROOT / 'frontend/src/services/authService.ts').exists())
        self.assertFalse((ROOT / 'frontend/src/services/api.ts').exists())
        for symbol in (
            'getSetupStatus', 'login', 'getCurrentSession', 'logout', 'changeOwnPassword',
            'listUsers', 'createUser', 'updateUser', 'resetUserPassword', 'revokeUserSessions',
        ):
            self.assertIn(f'function {symbol}', auth_js)
        self.assertIn('withCredentials: true', api_js)
        self.assertIn('X-ARCA-Browser-Session', api_js)
        self.assertIn('X-CSRF-Token', api_js)

    def test_sidebar_muestra_autoservicio_de_sesion(self):
        app_source = self.read('frontend/src/App.jsx')
        sidebar_source = self.read('frontend/src/components/Sidebar.jsx')
        session_source = self.read('frontend/src/components/SessionCard.jsx')
        service_source = self.read('frontend/src/services/authService.js')
        self.assertIn('user={user} onLogout={onLogout}', app_source)
        self.assertIn('SessionCard', sidebar_source)
        self.assertIn('SESIÓN ACTIVA', session_source)
        self.assertIn('Cambiar contraseña', session_source)
        self.assertIn("'/auth/change-password'", service_source)

    def test_webview_tiene_fallback_de_storage_y_broadcastchannel(self):
        source = self.read('frontend/src/services/api.js')
        self.assertIn('safeStorage', source)
        self.assertIn('memoryStorage', source)
        self.assertIn("tabStorage?.setItem", source)
        self.assertIn('createAuthChannel', source)

    def test_registro_de_pestanas_activas_y_heartbeat(self):
        source = self.read('frontend/src/services/api.js')
        self.assertIn("arca_dgo_active_tabs", source)
        self.assertIn('ACTIVE_TAB_TTL_MS = 120_000', source)
        self.assertIn('ACTIVE_TAB_HEARTBEAT_MS = 15_000', source)
        self.assertIn('initializeActiveTabTracking', source)
        self.assertIn("window.addEventListener('pagehide'", source)
        self.assertIn("window.addEventListener('pageshow'", source)
        self.assertIn('sameTabReload', source)
        self.assertNotIn('Object.keys(tabs).length === 0', source)
        self.assertIn('nunca invalida una sesión real', source)

    def test_api_canonica_conserva_contrato_de_pestanas(self):
        js = self.read('frontend/src/services/api.js')
        self.assertFalse((ROOT / 'frontend/src/services/api.ts').exists())
        for token in (
            "arca_dgo_active_tabs",
            'ACTIVE_TAB_TTL_MS = 120_000',
            'ACTIVE_TAB_HEARTBEAT_MS = 15_000',
            'initializeActiveTabTracking',
            'TAB_RELOAD_MARKER_SESSION_STORAGE_KEY',
        ):
            self.assertIn(token, js)


if __name__ == '__main__':
    unittest.main()
