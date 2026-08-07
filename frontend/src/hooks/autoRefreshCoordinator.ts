export const AUTO_REFRESH_MS = 60_000;

type RefreshCallback = () => void;
type TimerHandle = unknown;

export interface AutoRefreshEnvironment {
  setInterval: (callback: () => void, delay: number) => TimerHandle;
  clearInterval: (handle: TimerHandle) => void;
  addVisibilityListener: (callback: () => void) => void;
  removeVisibilityListener: (callback: () => void) => void;
  isVisible: () => boolean;
}

export interface AutoRefreshCoordinator {
  subscribe: (callback: RefreshCallback) => () => void;
  subscriberCount: () => number;
  timerActive: () => boolean;
}

export function createAutoRefreshCoordinator(environment: AutoRefreshEnvironment): AutoRefreshCoordinator {
  const subscribers = new Map<number, RefreshCallback>();
  let nextSubscriberId = 1;
  let timer: TimerHandle | null = null;
  let visibilityListenerAttached = false;

  const notifyVisibleSubscribers = () => {
    if (!environment.isVisible()) return;
    [...subscribers.values()].forEach((callback) => {
      try {
        callback();
      } catch {
        // Cada consumidor maneja sus propios errores de red. Un callback no debe
        // impedir que el resto de la pantalla se actualice.
      }
    });
  };

  const stopTimer = () => {
    if (timer === null) return;
    environment.clearInterval(timer);
    timer = null;
  };

  const startTimer = () => {
    if (timer !== null || !subscribers.size || !environment.isVisible()) return;
    timer = environment.setInterval(notifyVisibleSubscribers, AUTO_REFRESH_MS);
  };

  const onVisibilityChange = () => {
    if (!environment.isVisible()) {
      stopTimer();
      return;
    }
    notifyVisibleSubscribers();
    startTimer();
  };

  const attachVisibilityListener = () => {
    if (visibilityListenerAttached) return;
    environment.addVisibilityListener(onVisibilityChange);
    visibilityListenerAttached = true;
  };

  const detachVisibilityListener = () => {
    if (!visibilityListenerAttached) return;
    environment.removeVisibilityListener(onVisibilityChange);
    visibilityListenerAttached = false;
  };

  return {
    subscribe(callback) {
      const subscriberId = nextSubscriberId++;
      subscribers.set(subscriberId, callback);
      attachVisibilityListener();
      startTimer();

      let active = true;
      return () => {
        if (!active) return;
        active = false;
        subscribers.delete(subscriberId);
        if (subscribers.size) return;
        stopTimer();
        detachVisibilityListener();
      };
    },
    subscriberCount: () => subscribers.size,
    timerActive: () => timer !== null,
  };
}

const browserEnvironment: AutoRefreshEnvironment = {
  setInterval: (callback, delay) => window.setInterval(callback, delay),
  clearInterval: (handle) => window.clearInterval(handle as number),
  addVisibilityListener: (callback) => document.addEventListener('visibilitychange', callback),
  removeVisibilityListener: (callback) => document.removeEventListener('visibilitychange', callback),
  isVisible: () => document.visibilityState === 'visible',
};

let browserCoordinator: AutoRefreshCoordinator | null = null;

export function subscribeAutoRefresh(callback: RefreshCallback): () => void {
  if (!browserCoordinator) browserCoordinator = createAutoRefreshCoordinator(browserEnvironment);
  return browserCoordinator.subscribe(callback);
}
