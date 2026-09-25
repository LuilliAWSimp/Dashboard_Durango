import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const detail = read('src/pages/pozos/components/OperationalDetailSection.tsx');
const elementHistory = read('src/pages/pozos/components/ElementHistoryPanel.tsx');
const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
const shifts = read('src/pages/pozos/components/ShiftConsumptionPanel.tsx');
const ranges = read('src/pages/pozos/components/DateRangeControls.tsx');
const config = read('src/pages/pozos/operationalSectionConfig.ts');

test('detalle elimina textos explicativos redundantes de cabecera rango y resumen', () => {
  assert.doesNotMatch(detail, /Detalle operativo/);
  assert.doesNotMatch(detail, /Análisis individual del elemento para el periodo seleccionado/);
  assert.doesNotMatch(detail, /El rango actualiza indicadores, histórico y cortes del elemento/);
  assert.doesNotMatch(detail, /Lecturas principales del elemento en el rango seleccionado/);
  assert.match(detail, /<PanelHeader title="Resumen del periodo" \/>/);
});

test('detalle elimina Actividad del periodo como dato duplicado', () => {
  assert.doesNotMatch(detail, /MetricPair label="Actividad del periodo"/);
  assert.doesNotMatch(detail, /const activity = String\(item\?\.period_activity \|\| item\?\.activity \|\| 'Sin registros'\)/);
  assert.match(detail, /Estado actual/);
  assert.match(detail, /Última lectura/);
});

test('historico individual puede ocultar el subtitulo interno sin afectar historicos globales', () => {
  assert.match(elementHistory, /panelSubtitle=\{null\}/);
  assert.match(history, /panelSubtitle\?: string \| null/);
  assert.match(history, /panelSubtitle === null \? undefined/);
  assert.match(history, /Histórico operativo global/);
});

test('notas explicativas del motor historico no se muestran en una card individual', () => {
  assert.match(history, /metric === 'both' && !singleElement/);
  assert.match(history, /aggregation === 'minute' && !singleElement/);
});

test('turnos mantiene subtitulo temporal limpio sin explicacion tecnica heredada', () => {
  assert.doesNotMatch(shifts, /Turnos sin traslape/);
  assert.match(shifts, /Turnos del \${dateLabel\(selectedDate\)}/);
});

test('DateRangeControls no reserva espacio para subtitulo vacio y config elimina detailSubtitle muerto', () => {
  assert.match(ranges, /subtitle \? <div className="panel-subtitle">\{subtitle\}<\/div> : null/);
  assert.doesNotMatch(config, /detailSubtitle/);
});
