import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

let csrfToken = '';
let authExpiryDispatched = false;
let lastHumanActivityAt = 0;

const BROWSER_SESSION_STORAGE_KEY = 'arca_dgo_browser_session';
const CSRF_STORAGE_KEY = 'arca_dgo_csrf_token';
const BOS_LOCAL_SESSION_STORAGE_KEY = 'arca_dgo_bos_local_session';
const LEGACY_TAB_SESSION_STORAGE_KEY = 'arca_dgo_tab_session';
const LEGACY_TOKEN_KEY = 'siem_demo_token';
const LEGACY_USER_KEY = 'siem_demo_user';
const AUTH_CHANNEL = 'arca-dgo-auth';
const USER_ACTIVITY_WINDOW_MS = 30_000;
const ACTIVE_TABS_STORAGE_KEY = 'arca_dgo_active_tabs';
const TAB_ID_SESSION_STORAGE_KEY = 'arca_dgo_active_tab_id';
const TAB_RELOAD_MARKER_SESSION_STORAGE_KEY = 'arca_dgo_tab_reloading';
const ACTIVE_TAB_TTL_MS = 20_000;
const ACTIVE_TAB_HEARTBEAT_MS = 5_000;
const BOS_LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '100.102.159.109']);

function safeStorage(kind: 'localStorage' | 'sessionStorage'): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try { return window[kind]; } catch { return undefined; }
}

function createAuthChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return null;
  try { return new BroadcastChannel(AUTH_CHANNEL); } catch { return null; }
}

const sharedStorage = safeStorage('localStorage');
const tabStorage = safeStorage('sessionStorage');
const authChannel = createAuthChannel();
const memoryStorage = new Map<string, string>();

function readSharedValue(key: string): string {
  try {
    const value = sharedStorage?.getItem(key);
    if (value) return value;
  } catch { /* continuar con fallback */ }
  try {
    const value = tabStorage?.getItem(key);
    if (value) return value;
  } catch { /* continuar con fallback */ }
  return memoryStorage.get(key) || '';
}

function writeSharedValue(key: string, value: string): void {
  memoryStorage.set(key, value);
  try { sharedStorage?.setItem(key, value); } catch { /* fallback abajo */ }
  try { tabStorage?.setItem(key, value); } catch { /* memoria mantiene la sesión de esta vista */ }
}

function removeSharedValue(key: string): void {
  memoryStorage.delete(key);
  try { sharedStorage?.removeItem(key); } catch { /* sin acción */ }
  try { tabStorage?.removeItem(key); } catch { /* sin acción */ }
}

function readActiveTabs(): Record<string, number> {
  if (!sharedStorage) return {};
  try {
    const raw = sharedStorage.getItem(ACTIVE_TABS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, number> = {};
    for (const [tabId, value] of Object.entries(parsed)) {
      const timestamp = Number(value);
      if (tabId && Number.isFinite(timestamp)) result[tabId] = timestamp;
    }
    return result;
  } catch {
    return {};
  }
}

function writeActiveTabs(tabs: Record<string, number>): void {
  if (!sharedStorage) return;
  try {
    const entries = Object.entries(tabs);
    if (entries.length) sharedStorage.setItem(ACTIVE_TABS_STORAGE_KEY, JSON.stringify(tabs));
    else sharedStorage.removeItem(ACTIVE_TABS_STORAGE_KEY);
  } catch { /* sin acción: WebBrowser legacy conserva el comportamiento previo */ }
}

function pruneActiveTabs(tabs: Record<string, number>, now = Date.now()): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [tabId, timestamp] of Object.entries(tabs)) {
    if ((now - Number(timestamp)) <= ACTIVE_TAB_TTL_MS) result[tabId] = Number(timestamp);
  }
  return result;
}

function createTabId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* fallback */ }
  return `dgo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function currentNavigationType(): string {
  try {
    const entries = window.performance?.getEntriesByType?.('navigation') || [];
    return String((entries[0] as PerformanceNavigationTiming | undefined)?.type || '');
  } catch {
    return '';
  }
}

let currentActiveTabId = '';
let activeTabHeartbeatTimer = 0;

function registerCurrentTab(): void {
  if (!currentActiveTabId || !sharedStorage) return;
  const now = Date.now();
  const tabs = pruneActiveTabs(readActiveTabs(), now);
  tabs[currentActiveTabId] = now;
  writeActiveTabs(tabs);
}

function unregisterCurrentTab({ markReloadCandidate = true }: { markReloadCandidate?: boolean } = {}): void {
  if (!currentActiveTabId || !sharedStorage) return;
  if (markReloadCandidate) {
    try { tabStorage?.setItem(TAB_RELOAD_MARKER_SESSION_STORAGE_KEY, '1'); } catch { /* sin acción */ }
  }
  const tabs = readActiveTabs();
  delete tabs[currentActiveTabId];
  writeActiveTabs(pruneActiveTabs(tabs));
}

function initializeActiveTabTracking(): void {
  // BOS/WebBrowser local conserva su modo de compatibilidad: el control de
  // pestañas aplica al navegador web normal donde localStorage/sessionStorage
  // son confiables y el backend exige X-ARCA-Browser-Session.
  if (!sharedStorage || !tabStorage || isBosLocalHttpPage()) return;

  const now = Date.now();
  let tabs = pruneActiveTabs(readActiveTabs(), now);
  const storedTabId = tabStorage.getItem(TAB_ID_SESSION_STORAGE_KEY) || '';
  const reloadMarker = tabStorage.getItem(TAB_RELOAD_MARKER_SESSION_STORAGE_KEY) === '1';
  tabStorage.removeItem(TAB_RELOAD_MARKER_SESSION_STORAGE_KEY);
  const sameTabReload = Boolean(storedTabId && reloadMarker && currentNavigationType() === 'reload');

  // Si esta vista no es una recarga de la misma pestaña y no existe ninguna
  // pestaña viva, una browser_session persistida pertenece a una sesión de
  // navegación anterior. Se elimina antes de que App intente /auth/me.
  if (!sameTabReload && Object.keys(tabs).length === 0 && readSharedValue(BROWSER_SESSION_STORAGE_KEY)) {
    clearAuthSession({ broadcast: false, notify: false });
  }

  currentActiveTabId = sameTabReload ? storedTabId : createTabId();
  tabStorage.setItem(TAB_ID_SESSION_STORAGE_KEY, currentActiveTabId);
  tabs[currentActiveTabId] = now;
  writeActiveTabs(tabs);

  activeTabHeartbeatTimer = window.setInterval(registerCurrentTab, ACTIVE_TAB_HEARTBEAT_MS);
  window.addEventListener('pagehide', () => unregisterCurrentTab({ markReloadCandidate: true }));
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      try { tabStorage.removeItem(TAB_RELOAD_MARKER_SESSION_STORAGE_KEY); } catch { /* sin acción */ }
      registerCurrentTab();
    }
  });
}

function isBosLocalHttpPage(): boolean {
  if (typeof window === 'undefined') return false;
  const protocol = String(window.location?.protocol || '').toLowerCase();
  const host = String(window.location?.hostname || '').toLowerCase();
  return protocol === 'http:' && BOS_LOCAL_HTTP_HOSTS.has(host);
}

function readBosLocalSessionToken(): string {
  if (!isBosLocalHttpPage()) return '';
  return readSharedValue(BOS_LOCAL_SESSION_STORAGE_KEY);
}

export function setBosLocalSessionToken(value?: string | null): void {
  if (isBosLocalHttpPage() && value) writeSharedValue(BOS_LOCAL_SESSION_STORAGE_KEY, String(value));
  else removeSharedValue(BOS_LOCAL_SESSION_STORAGE_KEY);
}

function postAuthMessage(message: { type: string }): void {
  try { authChannel?.postMessage(message); } catch { /* storage sigue sincronizando */ }
}

function emitAuthExpired(): void {
  if (typeof window === 'undefined' || authExpiryDispatched) return;
  authExpiryDispatched = true;
  window.dispatchEvent(new CustomEvent('arca-auth-expired'));
}

function emitAuthUpdated(): void {
  if (typeof window === 'undefined') return;
  authExpiryDispatched = false;
  window.dispatchEvent(new CustomEvent('arca-auth-updated'));
}

function clearLegacyAuthStorage(): void {
  removeSharedValue(LEGACY_TOKEN_KEY);
  removeSharedValue(LEGACY_USER_KEY);
  try { tabStorage?.removeItem(LEGACY_TAB_SESSION_STORAGE_KEY); } catch { /* sin acción */ }
}

export function readBrowserSession(): string {
  return readSharedValue(BROWSER_SESSION_STORAGE_KEY);
}

export function hasBrowserSession(): boolean {
  return Boolean(readBrowserSession());
}

export function setAuthSession(browserSession: string, nextCsrfToken?: string): void {
  if (!browserSession) {
    clearAuthSession();
    return;
  }
  writeSharedValue(BROWSER_SESSION_STORAGE_KEY, String(browserSession));
  csrfToken = typeof nextCsrfToken === 'string' ? nextCsrfToken : '';
  if (csrfToken) writeSharedValue(CSRF_STORAGE_KEY, csrfToken);
  else removeSharedValue(CSRF_STORAGE_KEY);
  clearLegacyAuthStorage();
  authExpiryDispatched = false;
  postAuthMessage({ type: 'session-updated' });
}

export function setCsrfToken(value?: string): void {
  csrfToken = typeof value === 'string' ? value : '';
  if (csrfToken) writeSharedValue(CSRF_STORAGE_KEY, csrfToken);
  else removeSharedValue(CSRF_STORAGE_KEY);
}

export function clearAuthSession({ broadcast = true, notify = true }: { broadcast?: boolean; notify?: boolean } = {}): void {
  removeSharedValue(BROWSER_SESSION_STORAGE_KEY);
  removeSharedValue(CSRF_STORAGE_KEY);
  removeSharedValue(BOS_LOCAL_SESSION_STORAGE_KEY);
  csrfToken = '';
  clearLegacyAuthStorage();
  if (broadcast) postAuthMessage({ type: 'session-cleared' });
  if (notify) emitAuthExpired();
}

function currentCsrfToken(): string {
  if (!csrfToken) csrfToken = readSharedValue(CSRF_STORAGE_KEY);
  return csrfToken;
}

function markHumanActivity(): void {
  lastHumanActivityAt = Date.now();
}

function hasRecentHumanActivity(): boolean {
  return lastHumanActivityAt > 0 && (Date.now() - lastHumanActivityAt) <= USER_ACTIVITY_WINDOW_MS;
}

if (typeof window !== 'undefined') {
  initializeActiveTabTracking();
  clearLegacyAuthStorage();
  ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
    window.addEventListener(eventName, markHumanActivity, { capture: true, passive: true });
  });

  window.addEventListener('storage', (event) => {
    if (event.key === BROWSER_SESSION_STORAGE_KEY) {
      if (!event.newValue) {
        csrfToken = '';
        emitAuthExpired();
      } else {
        emitAuthUpdated();
      }
    }
    if (event.key === CSRF_STORAGE_KEY) csrfToken = event.newValue || '';
  });

  authChannel?.addEventListener('message', (event) => {
    if (event.data?.type === 'session-cleared') {
      clearAuthSession({ broadcast: false, notify: true });
    }
    if (event.data?.type === 'session-updated') {
      csrfToken = readSharedValue(CSRF_STORAGE_KEY);
      emitAuthUpdated();
    }
  });
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  withCredentials: true,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const browserSession = readBrowserSession();
  const localSessionToken = readBosLocalSessionToken();
  if (localSessionToken) config.headers['X-ARCA-Local-Session'] = localSessionToken;
  if (browserSession) config.headers['X-ARCA-Browser-Session'] = browserSession;

  const method = String(config.method || 'get').toLowerCase();
  const csrf = currentCsrfToken();
  if (csrf && ['post', 'put', 'patch', 'delete'].includes(method)) {
    config.headers['X-CSRF-Token'] = csrf;
  }
  if (hasRecentHumanActivity() && browserSession) {
    config.headers['X-ARCA-User-Activity'] = '1';
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: string }>) => {
    const url = String(error.config?.url || '');
    if (error.response?.status === 401 && !url.includes('/auth/login')) {
      clearAuthSession({ broadcast: true, notify: true });
    }
    if (error.response?.status === 403 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('arca-auth-forbidden', {
        detail: error.response?.data?.detail || 'No cuenta con permisos para esta operación.',
      }));
    }
    return Promise.reject(error);
  },
);

export default api;
