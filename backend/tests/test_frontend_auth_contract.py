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

    def test_multi_pestana_y_401_sincronizados(self):
        source = self.read('frontend/src/services/api.js')
        self.assertIn("type: 'session-updated'", source)
        self.assertIn("type: 'session-cleared'", source)
        self.assertIn("error?.response?.status === 401", source)
        self.assertIn("window.addEventListener('storage'", source)

    def test_polling_no_se_marca_como_actividad_humana_automaticamente(self):
        source = self.read('frontend/src/services/api.js')
        self.assertIn('X-ARCA-User-Activity', source)
        self.assertIn('pointerdown', source)
        self.assertIn('lastHumanActivityAt', source)

    def test_app_restaura_sesion_y_menu_usuarios_es_admin(self):
        source = self.read('frontend/src/App.jsx')
        self.assertIn('hasBrowserSession()', source)
        self.assertIn('getCurrentSession()', source)
        self.assertIn("window.addEventListener('arca-auth-expired'", source)
        self.assertIn("user?.role === 'admin'", source)
        self.assertIn("key: 'usuarios'", source)

    def test_reportes_oculta_correo_a_viewer(self):
        source = self.read('frontend/src/pages/pozos/sections/ReportesSection.tsx')
        self.assertIn("currentUser?.role === 'admin' || currentUser?.role === 'operator'", source)
        self.assertIn('canEmail ?', source)

    def test_servicios_ts_conservan_contrato_del_runtime_sin_reexports_circulares(self):
        auth_ts = self.read('frontend/src/services/authService.ts')
        api_ts = self.read('frontend/src/services/api.ts')
        for symbol in (
            'getSetupStatus', 'login', 'getCurrentSession', 'logout',
            'listUsers', 'createUser', 'updateUser', 'resetUserPassword', 'revokeUserSessions',
        ):
            self.assertIn(f'function {symbol}', auth_ts)
        self.assertIn('withCredentials: true', api_ts)
        self.assertIn('X-ARCA-Browser-Session', api_ts)
        self.assertIn('X-CSRF-Token', api_ts)
        self.assertNotIn("export { default } from './api.js'", api_ts)
        self.assertNotIn("export * from './authService.js'", auth_ts)

    def test_webview_tiene_fallback_de_storage_y_broadcastchannel(self):
        source = self.read('frontend/src/services/api.js')
        self.assertIn('safeStorage', source)
        self.assertIn('memoryStorage', source)
        self.assertIn("tabStorage?.setItem", source)
        self.assertIn('createAuthChannel', source)


if __name__ == '__main__':
    unittest.main()
