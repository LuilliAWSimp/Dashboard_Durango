import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import Header from './components/Header';
import BrandLogo from './components/BrandLogo';
import { DASHBOARD_TITLE, PLANT_NAME } from './config/plant';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import PozosDashboardPage from './pages/PozosDashboardPage';
import { getAuth, logout } from './services/authService';
import { fetchWaterDashboard } from './services/waterService';

const DEFAULT_POZOS_SECTION = 'dashboard';

const POZOS_MENU = [
  {
    group: 'Operación de agua',
    items: [
      { key: 'dashboard', label: 'Resumen', iconKey: 'pozos-dashboard' },
      { key: 'pozos', label: 'Pozos', iconKey: 'pozos-pozos' },
      { key: 'lineas', label: 'Líneas', iconKey: 'pozos-lineas' },
      { key: 'flujos', label: 'Flujos', iconKey: 'pozos-flujos' },
      { key: 'tanques', label: 'Tanques', iconKey: 'pozos-tanques' },
      { key: 'balance', label: 'Balance de Agua', iconKey: 'pozos-balance' },
      { key: 'concesion', label: 'Concesión', iconKey: 'pozos-concesion' },
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


function preloadWithTimeout(timeoutMs = 12000) {
  const preload = fetchWaterDashboard('dashboard', {
    include_history: false,
    include_energy_water: false,
  }).then((data) => {
    if (String(data?.source_status || '').toLowerCase() === 'sql_error') {
      throw new Error('No se pudo preparar la información de planta.');
    }
    return data;
  });
  const timeout = new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error('Tiempo de espera agotado al preparar los datos de planta.')), timeoutMs);
  });
  return Promise.race([preload, timeout]);
}

function warmWaterHistoryCache() {
  const today = new Date().toISOString().slice(0, 10);
  window.setTimeout(() => {
    fetchWaterDashboard('dashboard', {
      startDate: today,
      endDate: today,
      period: 'hourly',
      include_history: true,
      include_energy_water: false,
    }).catch(() => {
      // Warm cache no debe bloquear ni mostrar errores al usuario.
    });
  }, 1200);
}

function InitialPlantLoader({ status, error, onRetry, onSkip }) {
  const hasError = status === 'error';
  return (
    <div className="initial-loader-screen" role="status" aria-live="polite">
      <div className="initial-loader-card">
        <div className="initial-loader-brand" aria-hidden="true">
          <div className="login-brand-frame initial-loader-logo-frame">
            <div className="login-brand-glow" />
            <div className="login-brand-inner initial-loader-logo-inner">
              <BrandLogo className="brand-logo login-logo initial-loader-logo" />
            </div>
          </div>
        </div>
        <div className="initial-loader-copy">
          <span>{PLANT_NAME}</span>
          <h1>Cargando Dashboard ARCA</h1>
          <p>{hasError ? 'No se pudo preparar la información de planta.' : 'Preparando datos de planta...'}</p>
        </div>
        {hasError ? (
          <>
            <div className="initial-loader-error">{error || 'La información operativa no respondió dentro del tiempo esperado.'}</div>
            <div className="initial-loader-actions">
              <button type="button" onClick={onRetry}>Reintentar</button>
              <button type="button" className="secondary" onClick={onSkip}>Abrir dashboard sin precarga</button>
            </div>
          </>
        ) : (
          <div className="initial-loader-progress" aria-hidden="true"><span /></div>
        )}
      </div>
    </div>
  );
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
  const [preloadState, setPreloadState] = useState({ status: 'loading', error: '' });
  const [headerMeta, setHeaderMeta] = useState({
    title: 'Resumen de Pozos',
    subtitle: '',
    onExport: () => {},
    onEmail: () => {},
  });

  const runPreload = () => {
    setPreloadState({ status: 'loading', error: '' });
    preloadWithTimeout()
      .then(() => {
        setPreloadState({ status: 'ready', error: '' });
        warmWaterHistoryCache();
      })
      .catch((error) => {
        setPreloadState({ status: 'error', error: error?.message || 'No se pudo preparar la información de planta.' });
      });
  };

  useEffect(() => {
    runPreload();
  }, []);

  if (preloadState.status !== 'ready') {
    return (
      <InitialPlantLoader
        status={preloadState.status}
        error={preloadState.error}
        onRetry={runPreload}
        onSkip={() => setPreloadState({ status: 'ready', error: '' })}
      />
    );
  }

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
