import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AUTO_REFRESH_MS,
  createAutoRefreshCoordinator,
  type AutoRefreshEnvironment,
} from '../src/hooks/autoRefreshCoordinator.ts';
import { isHistoryPointVisible, rangeIncludesToday, todayInputDate } from '../src/pages/pozos/dateUtils.ts';

function fakeEnvironment(initiallyVisible = true) {
  let visible = initiallyVisible;
  let nextTimerId = 1;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const visibilityListeners = new Set<() => void>();
  const environment: AutoRefreshEnvironment = {
    setInterval(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearInterval(handle) {
      timers.delete(Number(handle));
    },
    addVisibilityListener(callback) {
      visibilityListeners.add(callback);
    },
    removeVisibilityListener(callback) {
      visibilityListeners.delete(callback);
    },
    isVisible: () => visible,
  };
  return {
    environment,
    timers,
    visibilityListeners,
    tick() {
      [...timers.values()].forEach(({ callback }) => callback());
    },
    setVisible(next: boolean) {
      visible = next;
      [...visibilityListeners].forEach((callback) => callback());
    },
  };
}

test('todos los consumidores visibles comparten un solo intervalo de 60 segundos', () => {
  const fake = fakeEnvironment();
  const coordinator = createAutoRefreshCoordinator(fake.environment);
  let currentRefreshes = 0;
  let historyRefreshes = 0;
  const unsubscribeCurrent = coordinator.subscribe(() => { currentRefreshes += 1; });
  const unsubscribeHistory = coordinator.subscribe(() => { historyRefreshes += 1; });

  assert.equal(fake.timers.size, 1);
  assert.equal([...fake.timers.values()][0]?.delay, AUTO_REFRESH_MS);
  fake.tick();
  assert.equal(currentRefreshes, 1);
  assert.equal(historyRefreshes, 1);

  unsubscribeCurrent();
  assert.equal(fake.timers.size, 1);
  unsubscribeHistory();
  assert.equal(fake.timers.size, 0);
  assert.equal(fake.visibilityListeners.size, 0);
});

test('cambiar de ruta limpia suscripciones sin duplicar el timer', () => {
  const fake = fakeEnvironment();
  const coordinator = createAutoRefreshCoordinator(fake.environment);
  const unsubscribeFirstRoute = coordinator.subscribe(() => undefined);
  unsubscribeFirstRoute();
  const unsubscribeSecondRoute = coordinator.subscribe(() => undefined);

  assert.equal(coordinator.subscriberCount(), 1);
  assert.equal(fake.timers.size, 1);
  unsubscribeSecondRoute();
  assert.equal(coordinator.timerActive(), false);
});

test('la pestaña oculta suspende el timer y al volver refresca de inmediato una vez', () => {
  const fake = fakeEnvironment();
  const coordinator = createAutoRefreshCoordinator(fake.environment);
  let refreshes = 0;
  const unsubscribe = coordinator.subscribe(() => { refreshes += 1; });

  fake.setVisible(false);
  assert.equal(fake.timers.size, 0);
  fake.setVisible(true);
  assert.equal(refreshes, 1);
  assert.equal(fake.timers.size, 1);
  unsubscribe();
});

test('un consumidor con error no detiene los demás ni el siguiente ciclo', () => {
  const fake = fakeEnvironment();
  const coordinator = createAutoRefreshCoordinator(fake.environment);
  let successfulRefreshes = 0;
  const unsubscribeFailure = coordinator.subscribe(() => { throw new Error('backend temporal'); });
  const unsubscribeSuccess = coordinator.subscribe(() => { successfulRefreshes += 1; });

  fake.tick();
  fake.tick();
  assert.equal(successfulRefreshes, 2);
  assert.equal(fake.timers.size, 1);
  unsubscribeFailure();
  unsubscribeSuccess();
});

test('solo el rango que incluye hoy habilita la suscripción de periodo actual', () => {
  const today = todayInputDate();
  assert.equal(rangeIncludesToday({ startDate: today, endDate: today }), true);
  assert.equal(rangeIncludesToday({ startDate: '2026-01-01', endDate: '2026-01-31' }), false);
});

test('las gráficas excluyen intervalos futuros y estados future_interval', () => {
  const now = Date.parse('2026-08-07T18:00:00Z');
  assert.equal(isHistoryPointVisible('2026-08-07T17:59:00Z', 'operational', now), true);
  assert.equal(isHistoryPointVisible('2026-08-07T18:01:00Z', 'operational', now), false);
  assert.equal(isHistoryPointVisible('2026-08-07T17:00:00Z', 'future_interval', now), false);
});
