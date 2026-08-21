import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

let csrfToken = '';
let authExpiryDispatched = false;
let lastHumanActivityAt = 0;

const BROWSER_SESSION_STORAGE_KEY = 'arca_dgo_browser_session';
const CSRF_STORAGE_KEY = 'arca_dgo_csrf_token';
const LEGACY_TAB_SESSION_STORAGE_KEY = 'arca_dgo_tab_session';
const LEGACY_TOKEN_KEY = 'siem_demo_token';
const LEGACY_USER_KEY = 'siem_demo_user';
const AUTH_CHANNEL = 'arca-dgo-auth';
const USER_ACTIVITY_WINDOW_MS = 30_000;

const sharedStorage = typeof window !== 'undefined' ? window.localStorage : undefined;
const tabStorage = typeof window !== 'undefined' ? window.sessionStorage : undefined;
const authChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel(AUTH_CHANNEL)
  : null;

function readSharedValue(key: string): string {
  try { return sharedStorage?.getItem(key) || ''; } catch { return ''; }
}

function writeSharedValue(key: string, value: string): void {
  try { sharedStorage?.setItem(key, value); } catch { /* memoria de la pestaña sigue funcionando */ }
}

function removeSharedValue(key: string): void {
  try { sharedStorage?.removeItem(key); } catch { /* sin acción */ }
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
