import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  aggregateShiftDataState,
  explicitShiftSchedule,
  shiftDataStateLabel,
  shiftElementDataState,
} from '../src/pages/pozos/shiftPresentation.ts';
import type { ShiftElement } from '../src/pages/pozos/types.ts';

const component = readFileSync(new URL('../src/pages/pozos/components/ShiftConsumptionPanel.tsx', import.meta.url), 'utf8');

function row(overrides: Partial<ShiftElement> = {}): ShiftElement {
  return {
    sensor_id: 1001,
    operational_key: 'pozo_1',
    name: 'Pozo 1',
    module: 'well',
    flow_unit: 'L/s',
    period_open_m3: 100,
    period_close_m3: 100,
    period_m3: 0,
    period_m3_reliable: true,
    flow_avg: 0,
    flow_min: 0,
    flow_max: 0,
    samples: 10,
    activity: 'Sin actividad en el periodo',
    data_status: 'operational',
    communication: 'En línea',
    last_update: '2026-09-25T06:59:00',
    ...overrides,
  };
}

test('cero valido permanece como dato completo y no se confunde con sin datos', () => {
  assert.equal(shiftElementDataState(row()), 'complete');
  assert.equal(aggregateShiftDataState([row()], 'Cierre definitivo'), 'complete');
});

test('sin muestras ni lecturas se clasifica como Sin datos', () => {
  const empty = row({ period_open_m3: null, period_close_m3: null, period_m3: null, flow_avg: null, flow_min: null, flow_max: null, samples: 0, activity: 'Sin registros', data_status: 'no_data' });
  assert.equal(shiftElementDataState(empty), 'no_data');
  assert.equal(shiftDataStateLabel('no_data'), 'Sin datos');
});

test('un turno con elementos incompletos se marca Datos parciales sin perder datos validos', () => {
  const empty = row({ sensor_id: 1051, period_open_m3: null, period_close_m3: null, period_m3: null, flow_avg: null, samples: 0, activity: 'Sin registros', data_status: 'no_data' });
  assert.equal(aggregateShiftDataState([row(), empty], 'Cierre definitivo'), 'partial');
  assert.equal(aggregateShiftDataState([row({ has_discontinuities: true })], 'Cierre definitivo'), 'partial');
  assert.equal(shiftElementDataState(row({ period_m3: null, period_m3_reliable: false, flow_avg: 4.2 })), 'partial');
});

test('estado temporal pendiente es independiente del contenido', () => {
  assert.equal(aggregateShiftDataState([row()], 'Pendiente'), 'pending');
});

test('Turno 3 muestra explicitamente el cruce al dia siguiente', () => {
  assert.equal(explicitShiftSchedule('shift_3', '15:00–24:00'), '15:00–00:00 (+1 día)');
  assert.equal(explicitShiftSchedule('shift_2', '07:00–15:00'), '07:00–15:00');
});

test('UI de Turnos V2 separa datos y corte y elimina subtotal transversal', () => {
  assert.match(component, /Estado de datos/);
  assert.match(component, /Cierre definitivo|cut_status/);
  assert.doesNotMatch(component, /<th>Total operativo<\/th>/);
  assert.match(component, /'Sin volumen disponible'/);
  assert.match(component, /dataState === 'no_data' \? 'Sin datos'/);
  assert.match(component, /15:00–00:00 \(\+1 día\)/);
});

test('polling automatico respeta cache y refresco manual conserva force', () => {
  assert.match(component, /useAutoRefresh\([^\n]+load\(false, true\)/);
  assert.match(component, /void load\(true, true\)/);
});
