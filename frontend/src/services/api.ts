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
