import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import Header from './components/Header';
import { DASHBOARD_TITLE, PLANT_NAME } from './config/plant';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import PozosDashboardPage from './pages/PozosDashboardPage';
import { getAuth, logout } from './services/authService';

const DEFAULT_POZOS_SECTION = 'dashboard';

const POZOS_MENU = [
  {
    group: 'Operación de agua',
    items: [
      { key: 'dashboard', label: 'Resumen', iconKey: 'pozos-dashboard' },
      { key: 'pozos', label: 'Pozos', iconKey: 'pozos-pozos' },
      { key: 'lineas', label: 'Líneas', iconKey: 'pozos-lineas' },
      { key: 'flujos', label: 'Flujos', iconKey: 'pozos-flujos' },
      { key: 'balance', label: 'Balance de Agua', iconKey: 'pozos-balance' },
      { key: 'revision', label: 'Revisión Diaria', iconKey: 'pozos-revision' },
      { key: 'reportes', label: 'Reportes', iconKey: 'pozos-reportes' },
    ],
  },
];

function nowText() {
  return new Date().toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function Shell({ user, onLogout, sidebarProps, children, headerMeta, shellClass = '' }) {
  const [clock, setClock] = useState(nowText());

  useEffect(() => {
    const interval = setInterval(() => setClock(nowText()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`app-shell ${shellClass}`.trim()}>
      <Sidebar {...sidebarProps} />
      <div className="main-shell">
        <Header
          title={headerMeta.title}
          subtitle={headerMeta.subtitle}
          now={clock}
          onExport={headerMeta.onExport}
          onEmail={headerMeta.onEmail}
          user={user}
          onLogout={onLogout}
        />
        <div className="plant-context-bar" aria-label="Nombre de planta">
          <span>{PLANT_NAME}</span>
        </div>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}

function PozosShell({ user, onLogout }) {
  const { section = DEFAULT_POZOS_SECTION, itemId } = useParams();
  const [collapsed, setCollapsed] = useState(true);
  const [headerMeta, setHeaderMeta] = useState({
    title: 'Resumen de Pozos',
    subtitle: '',
    onExport: () => {},
    onEmail: () => {},
  });

  return (
    <Shell
      user={user}
      onLogout={onLogout}
      headerMeta={headerMeta}
      shellClass="pozos-shell"
      sidebarProps={{
        collapsed,
        onToggle: () => setCollapsed((value) => !value),
        sections: POZOS_MENU,
        basePath: '/pozos',
        brandTitle: 'Durango',
        brandSubtitle: 'Monitoreo hídrico operativo',
      }}
    >
      <PozosDashboardPage section={section} itemId={itemId} setHeaderMeta={setHeaderMeta} />
    </Shell>
  );
}

function ProtectedRoute({ auth, children }) {
  if (!auth?.token) return <Navigate to="/login" replace />;
  return children;
}

function LegacyPozosRedirect() {
  const { legacySection } = useParams();
  return <Navigate to={`/pozos/${legacySection || DEFAULT_POZOS_SECTION}`} replace />;
}

export default function App() {
  const [auth, setAuth] = useState(getAuth());

  useEffect(() => {
    document.title = DASHBOARD_TITLE;
  }, []);
  const handleLoginSuccess = () => setAuth(getAuth());
  const handleLogout = () => {
    logout();
    setAuth(null);
  };

  useEffect(() => {
    const syncAuth = () => setAuth(getAuth());
    window.addEventListener('storage', syncAuth);
    return () => window.removeEventListener('storage', syncAuth);
  }, []);

  const defaultRoute = auth?.token ? `/pozos/${DEFAULT_POZOS_SECTION}` : '/login';

  return (
    <Routes>
      <Route
        path="/login"
        element={auth?.token ? <Navigate to={`/pozos/${DEFAULT_POZOS_SECTION}`} replace /> : <LoginPage onSuccess={handleLoginSuccess} />}
      />

      <Route path="/" element={<Navigate to={defaultRoute} replace />} />
      <Route path="/domains" element={<Navigate to={defaultRoute} replace />} />

      <Route path="/electric" element={<Navigate to={`/pozos/${DEFAULT_POZOS_SECTION}`} replace />} />
      <Route path="/electric/:section" element={<Navigate to={`/pozos/${DEFAULT_POZOS_SECTION}`} replace />} />

      <Route path="/pozos" element={<Navigate to={`/pozos/${DEFAULT_POZOS_SECTION}`} replace />} />
      <Route
        path="/pozos/:section"
        element={
          <ProtectedRoute auth={auth}>
            <PozosShell user={auth?.user} onLogout={handleLogout} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pozos/:section/:itemId"
        element={
          <ProtectedRoute auth={auth}>
            <PozosShell user={auth?.user} onLogout={handleLogout} />
          </ProtectedRoute>
        }
      />

      <Route path="/:legacySection" element={<ProtectedRoute auth={auth}><LegacyPozosRedirect /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to={defaultRoute} replace />} />
    </Routes>
  );
}
