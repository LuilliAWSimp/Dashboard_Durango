import assert from 'node:assert/strict';
import test from 'node:test';
import { formatOperationalDateRange } from '../src/pages/pozos/dateUtils.ts';
import { buildOperationalReturnState, resolveOperationalReturnTarget } from '../src/pages/pozos/operationalNavigation.ts';
import { operationalVolumeLabel } from '../src/pages/pozos/operationalTerminology.ts';

test('intervalos cerrados muestran fecha y horas explícitas', () => {
  assert.equal(
    formatOperationalDateRange(
      { startDate: '2026-09-10', endDate: '2026-09-11' },
      'fallback',
      new Date(2026, 8, 12, 10, 47),
    ),
    'Del 10/09/2026 00:00 al 11/09/2026 23:59',
  );
});

test('el día actual no muestra un cierre futuro falso', () => {
  const label = formatOperationalDateRange(
    { startDate: '2026-09-12', endDate: '2026-09-12' },
    'fallback',
    new Date(2026, 8, 12, 10, 47),
  );
  assert.match(label, /^Hoy · 12\/09\/2026 00:00 → ahora 10:47$/);
  assert.doesNotMatch(label, /23:59/);
});

test('terminología de volumen depende del contrato operativo', () => {
  assert.equal(operationalVolumeLabel('well', { scope: 'period' }), 'Volumen bombeado del periodo');
  assert.equal(operationalVolumeLabel('line', { scope: 'period' }), 'Volumen consumido del periodo');
  assert.equal(operationalVolumeLabel('flow', { validated: true }), 'Volumen consumido validado');
});

test('el detalle conserva la pantalla real de origen', () => {
  const state = buildOperationalReturnState('/pozos/dashboard', '?tab=alertas', { source: 'alert' });
  assert.equal(resolveOperationalReturnTarget(state, '/pozos/pozos'), '/pozos/dashboard?tab=alertas');
  assert.equal(resolveOperationalReturnTarget({ returnTo: 'https://example.com' }, '/pozos/pozos'), '/pozos/pozos');
});
