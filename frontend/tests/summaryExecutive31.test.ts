import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const summary = readFileSync(new URL('../src/pages/pozos/sections/DashboardBaseSection.tsx', import.meta.url), 'utf8');

test('Resumen 31 elimina Accesos operativos redundantes', () => {
  assert.doesNotMatch(summary, /Accesos operativos/);
  assert.doesNotMatch(summary, /Módulos confirmados y disponibles para análisis de detalle/);
  assert.doesNotMatch(summary, /water-type-grid/);
  assert.doesNotMatch(summary, /water-type-card/);
});

test('Resumen 31 elimina subtotal transversal y revision tecnica como KPI protagonista', () => {
  assert.doesNotMatch(summary, /Subtotal validado/);
  assert.doesNotMatch(summary, /Revisión \/ cobertura parcial/);
  assert.doesNotMatch(summary, /totalValidated/);
  assert.doesNotMatch(summary, /reviewCount/);
});

test('Resumen 31 conserva volumenes separados por proceso sin etiqueta tecnica validado', () => {
  assert.match(summary, /operationalVolumeLabel\('well'\)/);
  assert.match(summary, /operationalVolumeLabel\('line'\)/);
  assert.match(summary, /operationalVolumeLabel\('flow'\).*lavadoras/);
  assert.match(summary, /operationalVolumeLabel\('flow'\).*Jarabes/);
  assert.doesNotMatch(summary, /operationalVolumeLabel\([^\n]+validated:\s*true/);
});

test('Resumen 31 concentra estado operativo y alertas en KPIs ejecutivos', () => {
  assert.match(summary, /Elementos con flujo actual/);
  assert.match(summary, /currentFlowCount/);
  assert.match(summary, /Alertas activas/);
  assert.match(summary, /criticalAlertCount/);
  assert.match(summary, /Sin alertas operativas activas/);
});

test('Resumen 31 conserva historico global comparativo y panel de alertas', () => {
  assert.match(summary, /<ModuleHistoryPanel range=\{controller\.range\} independentRange \/>/);
  assert.match(summary, /Comparativo de volumen por módulo/);
  assert.match(summary, /<OperationalAlertsPanel alerts=\{alerts\}/);
});

test('Resumen 31 usa copy operativo y evita textos internos en cabecera y comparativo', () => {
  assert.match(summary, /Vista ejecutiva de la operación, histórico, comparativos y alertas de la planta/);
  assert.doesNotMatch(summary, /Snapshot actual \+ volumen conciliado/);
  assert.doesNotMatch(summary, /Actualizando conciliación y comparativos diarios/);
  assert.match(summary, /Fecha seleccionada/);
  assert.match(summary, /con datos/);
});
