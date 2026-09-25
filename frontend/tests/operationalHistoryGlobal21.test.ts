import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Resumen usa el historico global V2 con rango independiente', () => {
  const summary = read('src/pages/pozos/sections/DashboardBaseSection.tsx');
  assert.match(summary, /<ModuleHistoryPanel range=\{controller\.range\} independentRange \/>/);
});

test('historico global separa Pozos, Lineas, Lavadoras y Jarabes sin crear modulos backend ficticios', () => {
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(history, /type GlobalHistoryView = 'well' \| 'line' \| 'washers' \| 'jarabes'/);
  assert.match(history, /washers:\s*\{\s*module: 'flow'/s);
  assert.match(history, /jarabes:\s*\{\s*module: 'flow'/s);
  assert.match(history, /item\.operationalKey !== 'jarabes'/);
  assert.match(history, /item\.operationalKey === 'jarabes'/);
  assert.match(history, /label: 'Pozos'/);
  assert.match(history, /label: 'Líneas'/);
  assert.match(history, /label: 'Lavadoras'/);
  assert.match(history, /label: 'Jarabes'/);
});

test('historico global tiene fechas propias y conserva las cuatro agrupaciones homologadas', () => {
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(history, /aria-label="Fechas del histórico global"/);
  assert.match(history, /type="date" value=\{draftRange\.startDate\}/);
  assert.match(history, /type="date" value=\{draftRange\.endDate\}/);
  assert.match(history, />Actualizar<\/button>/);
  assert.match(history, />Restablecer<\/button>/);
  assert.match(history, /value="minute">1 minuto/);
  assert.match(history, /value="quarter_hour">15 minutos/);
  assert.match(history, /value="hourly">Por hora/);
  assert.match(history, /value="daily">Por día/);
});

test('un rango incompatible escala la agrupacion sin alterar limites backend', () => {
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(history, /current === 'minute' && days > 1/);
  assert.match(history, /current === 'quarter_hour' && days > 7/);
  assert.match(history, /current === 'hourly' && days > 31/);
  assert.match(history, /return 'daily'/);
});

test('estilos del rango global viven en historicos.css y no en global.css', () => {
  const historyCss = read('src/styles/pages/historicos.css');
  const globalCss = read('src/styles/global.css');
  assert.match(historyCss, /Durango 21 · Historico operativo global V2/);
  assert.match(historyCss, /\.module-history-range-panel/);
  assert.match(historyCss, /\.pozos-shell\.theme-light \.module-history-range-panel/);
  assert.doesNotMatch(globalCss, /module-history-range-panel/);
});
