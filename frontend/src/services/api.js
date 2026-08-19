import axios from 'axios';

let csrfToken = '';
let authExpiryDispatched = false;
const BROWSER_SESSION_STORAGE_KEY = 'arca_dgo_browser_session';
const LEGACY_TAB_SESSION_STORAGE_KEY = 'arca_dgo_tab_session';
const CSRF_STORAGE_KEY = 'arca_dgo_csrf_token';
const AUTH_CHANNEL = 'arca-dgo-auth';
const browserStorage = typeof window !== 'undefined' ? window.localStorage : undefined;
const tabStorage = typeof window !== 'undefined' ? window.sessionStorage : undefined;
const authChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window ? new BroadcastChannel(AUTH_CHANNEL) : null;

function emitAuthUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('arca-auth-updated'));
}

function emitAuthExpired() {
  if (typeof window === 'undefined') return;
  if (!authExpiryDispatched) {
    authExpiryDispatched = true;
    window.dispatchEvent(new CustomEvent('arca-auth-expired'));
  }
}

function postAuthMessage(message) {
  try {
    authChannel?.postMessage(message);
  } catch {
    // La sincronización por storage sigue disponible si BroadcastChannel falla.
  }
}

function readSharedValue(key) {
  try {
    return browserStorage?.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeSharedValue(key, value) {
  try {
    browserStorage?.setItem(key, value);
  } catch {
    // La app conserva el valor en memoria para la pestaña actual.
  }
}

function removeSharedValue(key) {
  try {
    browserStorage?.removeItem(key);
  } catch {
    // La limpieza de React continúa aunque el navegador bloquee el almacenamiento.
  }
}

function readLegacyTabSession() {
  try {
    return tabStorage?.getItem(LEGACY_TAB_SESSION_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function clearLegacyTabSession() {
  try {
    tabStorage?.removeItem(LEGACY_TAB_SESSION_STORAGE_KEY);
  } catch {
    // La limpieza compartida es suficiente.
  }
}

function readBrowserSession() {
  const shared = readSharedValue(BROWSER_SESSION_STORAGE_KEY);
  if (shared) return shared;
  const legacy = readLegacyTabSession();
  if (legacy) {
    writeSharedValue(BROWSER_SESSION_STORAGE_KEY, legacy);
    clearLegacyTabSession();
    return legacy;
  }
  return '';
}

function readCsrfToken() {
  if (csrfToken) return csrfToken;
  csrfToken = readSharedValue(CSRF_STORAGE_KEY);
  return csrfToken;
}

export function hasTabSession() {
  return Boolean(readBrowserSession());
}

export function setTabSession(value) {
  if (typeof value !== 'string' || !value) {
    clearTabSession();
    return;
  }
  writeSharedValue(BROWSER_SESSION_STORAGE_KEY, value);
  clearLegacyTabSession();
  authExpiryDispatched = false;
  postAuthMessage({ type: 'session-updated' });
}

export function clearTabSession() {
  removeSharedValue(BROWSER_SESSION_STORAGE_KEY);
  clearLegacyTabSession();
  postAuthMessage({ type: 'session-cleared' });
}

export function setCsrfToken(value) {
  csrfToken = typeof value === 'string' ? value : '';
  if (csrfToken) {
    writeSharedValue(CSRF_STORAGE_KEY, csrfToken);
    authExpiryDispatched = false;
    postAuthMessage({ type: 'session-updated' });
  } else {
    removeSharedValue(CSRF_STORAGE_KEY);
  }
}

export function clearCsrfToken() {
  csrfToken = '';
  removeSharedValue(CSRF_STORAGE_KEY);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === BROWSER_SESSION_STORAGE_KEY) {
      if (!event.newValue) {
        clearCsrfToken();
        emitAuthExpired();
      } else {
        authExpiryDispatched = false;
        emitAuthUpdated();
      }
    }
    if (event.key === CSRF_STORAGE_KEY) {
      csrfToken = event.newValue || '';
    }
  });
  authChannel?.addEventListener('message', (event) => {
    if (event.data?.type === 'session-cleared') {
      clearCsrfToken();
      emitAuthExpired();
    }
    if (event.data?.type === 'session-updated') {
      csrfToken = readSharedValue(CSRF_STORAGE_KEY);
      authExpiryDispatched = false;
      emitAuthUpdated();
    }
  });
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const browserSession = readBrowserSession();
  if (browserSession) {
    config.headers = config.headers || {};
    config.headers['X-ARCA-Tab-Session'] = browserSession;
  }
  const method = String(config.method || 'get').toLowerCase();
  const currentCsrfToken = readCsrfToken();
  if (currentCsrfToken && ['post', 'put', 'patch', 'delete'].includes(method)) {
    config.headers = config.headers || {};
    config.headers['X-CSRF-Token'] = currentCsrfToken;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = String(error?.config?.url || '');
    if (error?.response?.status === 401 && !url.includes('/auth/login')) {
      clearCsrfToken();
      clearTabSession();
      emitAuthExpired();
    }
    return Promise.reject(error);
  },
);

export default api;
