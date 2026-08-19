import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import Header from './components/Header';
import BrandLogo from './components/BrandLogo';
import { DASHBOARD_TITLE, PLANT_NAME } from './config/plant';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import PozosDashboardPage from './pages/PozosDashboardPage';
import { getCurrentSession, hasTabSession, logout } from './services/authService';
import { fetchWaterDashboard } from './services/waterService';
import { NotificationProvider } from './pages/pozos/components/NotificationCenter';

const DEFAULT_POZOS_SECTION = 'dashboard';

const BASE_POZOS_ITEMS = [
  { key: 'dashboard', label: 'Resumen', iconKey: 'pozos-dashboard' },
  { key: 'pozos', label: 'Pozos', iconKey: 'pozos-pozos' },
  { key: 'lineas', label: 'Líneas', iconKey: 'pozos-lineas' },
  { key: 'flujos', label: 'Lavadoras', iconKey: 'pozos-flujos' },
  { key: 'jarabes', label: 'Jarabes', iconKey: 'pozos-flujos' },
  { key: 'balance', label: 'Balance de Agua', iconKey: 'pozos-balance' },
  { key: 'concesion', label: 'Concesión · Pendiente', iconKey: 'pozos-concesion' },
  { key: 'revision', label: 'Revisión Diaria', iconKey: 'pozos-revision' },
  { key: 'reportes', label: 'Reportes', iconKey: 'pozos-reportes' },
];

function nowText() {
  return new Date().toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function preloadWithTimeout(timeoutMs = 12000, forceRefresh = false) {
  const preload = fetchWaterDashboard('dashboard', {
    include_history: false,
    include_energy_water: false,
    forceRefresh,
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

function InitialPlantLoader({ status = 'loading', error, onRetry, onSkip }) {
  const hasError = status === 'error' && error;
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
              {onSkip ? <button type="button" className="secondary" onClick={onSkip}>Abrir dashboard sin precarga</button> : null}
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
  const [headerMeta, setHeaderMeta] = useState({
    title: 'Resumen hídrico',
    subtitle: '',
    onExport: () => {},
    onEmail: () => {},
  });
  const menu = useMemo(() => [{
    group: 'Operación de agua',
    items: user?.role === 'admin'
      ? [...BASE_POZOS_ITEMS, { key: 'usuarios', label: 'Usuarios', iconKey: 'usuarios' }]
      : BASE_POZOS_ITEMS,
  }], [user?.role]);

  return (
    <NotificationProvider enableWaterAlerts>
      <Shell
        user={user}
        onLogout={onLogout}
        headerMeta={headerMeta}
        shellClass="pozos-shell"
        sidebarProps={{
          collapsed,
          onToggle: () => setCollapsed((value) => !value),
          sections: menu,
          basePath: '/pozos',
          brandTitle: 'Durango',
          brandSubtitle: 'Monitoreo hídrico operativo',
        }}
      >
        <PozosDashboardPage section={section} itemId={itemId} setHeaderMeta={setHeaderMeta} user={user} />
      </Shell>
    </NotificationProvider>
  );
}

function ProtectedRoute({ user, children }) {
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function LegacyPozosRedirect() {
  const { legacySection } = useParams();
  return <Navigate to={`/pozos/${legacySection || DEFAULT_POZOS_SECTION}`} replace />;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(() => !hasTabSession());
  const [preloadState, setPreloadState] = useState({ status: 'idle', error: '' });
  const [preloadAttempt, setPreloadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const expired = () => {
      setUser(null);
      setPreloadState({ status: 'idle', error: '' });
      setSessionChecked(true);
    };
    const restoreSession = () => {
      if (!hasTabSession()) {
        setUser(null);
        setSessionChecked(true);
        return;
      }
      setSessionChecked(false);
      getCurrentSession()
        .then((session) => { if (active) setUser(session.user); })
        .catch(() => { if (active) setUser(null); })
        .finally(() => { if (active) setSessionChecked(true); });
    };
    window.addEventListener('arca-auth-expired', expired);
    window.addEventListener('arca-auth-updated', restoreSession);
    restoreSession();
    return () => {
      active = false;
      window.removeEventListener('arca-auth-expired', expired);
      window.removeEventListener('arca-auth-updated', restoreSession);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!user) {
      setPreloadState({ status: 'idle', error: '' });
      return () => { active = false; };
    }
    setPreloadState({ status: 'loading', error: '' });
    preloadWithTimeout(12000, preloadAttempt > 0)
      .then(() => { if (active) setPreloadState({ status: 'ready', error: '' }); })
      .catch((error) => {
        if (active) setPreloadState({ status: 'error', error: error?.message || 'No se pudo preparar la información de planta.' });
      });
    return () => { active = false; };
  }, [user?.id, preloadAttempt]);

  useEffect(() => {
    document.title = user ? DASHBOARD_TITLE : 'Login ARCA · Durango';
  }, [user]);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setUser(null);
      setPreloadState({ status: 'idle', error: '' });
    }
  };

  const defaultRoute = user ? `/pozos/${DEFAULT_POZOS_SECTION}` : '/login';

  if (!sessionChecked) return <InitialPlantLoader status="loading" error="" onRetry={() => {}} />;
  if (user && preloadState.status !== 'ready') {
    return (
      <InitialPlantLoader
        status={preloadState.status === 'error' ? 'error' : 'loading'}
        error={preloadState.error}
        onRetry={() => setPreloadAttempt((value) => value + 1)}
        onSkip={() => setPreloadState({ status: 'ready', error: '' })}
      />
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to={`/pozos/${DEFAULT_POZOS_SECTION}`} replace /> : <LoginPage onSuccess={setUser} />}
      />
      <Route path="/" element={<Navigate to={defaultRoute} replace />} />
      <Route path="/domains" element={<Navigate to={defaultRoute} replace />} />
      <Route path="/electric" element={<Navigate to={`/pozos/${DEFAULT_POZOS_SECTION}`} replace />} />
      <Route path="/electric/:section" element={<Navigate to={`/pozos/${DEFAULT_POZOS_SECTION}`} replace />} />
      <Route path="/pozos" element={<Navigate to={`/pozos/${DEFAULT_POZOS_SECTION}`} replace />} />
      <Route path="/pozos/:section" element={<ProtectedRoute user={user}><PozosShell user={user} onLogout={handleLogout} /></ProtectedRoute>} />
      <Route path="/pozos/:section/:itemId" element={<ProtectedRoute user={user}><PozosShell user={user} onLogout={handleLogout} /></ProtectedRoute>} />
      <Route path="/:legacySection" element={<ProtectedRoute user={user}><LegacyPozosRedirect /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to={defaultRoute} replace />} />
    </Routes>
  );
}
