import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('historico global ofrece Excel PDF y Excel 5 min sin sustituir exportaciones visibles', () => {
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(history, /> Excel<\/button>/);
  assert.match(history, /'Excel 5 min'/);
  assert.match(history, /'PDF'/);
  assert.match(history, /downloadModuleHistoryExcel\(/);
  assert.match(history, /downloadWaterModuleHistoryPdf\(/);
  assert.match(history, /downloadFiveMinuteModuleHistoryExcel\(/);
});

test('Excel y PDF visibles conservan rango agrupacion metrica y nombres seleccionados', () => {
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(history, /aggregationLabel: AGGREGATION_LABELS\[aggregation\]/);
  assert.match(history, /metricLabel,/);
  assert.match(history, /selectedNames,/);
  assert.match(history, /module_label: moduleDisplayLabel/);
  assert.match(history, /aggregation_label: AGGREGATION_LABELS\[aggregation\]/);
  assert.match(history, /selected_names: selectedNames/);
});

test('Excel 5 min usa los elementos visibles y conserva operational_key cuando no hay sensor numerico', () => {
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(history, /const selectedItems = activeItems\.filter/);
  assert.match(history, /item\.sensorId \?\? item\.operationalKey/);
  assert.match(history, /elementIds: selectedElementIds/);
  assert.match(history, /viewLabel: moduleDisplayLabel/);
});

test('servicio 5 min por modulo usa endpoint independiente y limite de 3 dias', () => {
  const service = read('src/services/waterFiveMinuteExportService.ts');
  assert.match(service, /downloadFiveMinuteModuleHistoryExcel/);
  assert.match(service, /validateFiveMinuteExportRange\(options\.startDate, options\.endDate\)/);
  assert.match(service, /\/water\/history\/five-minute\/module\/excel/);
  assert.match(service, /element_ids: elementIds\.join\(','\)/);
  assert.match(service, /view_label: options\.viewLabel/);
});

test('backend publica exportacion 5 min multielemento sin cambiar el endpoint individual', () => {
  const route = read('../backend/app/api/routes/water.py');
  const service = read('../backend/app/services/water_five_minute_export_service.py');
  assert.match(route, /@router\.get\('\/history\/five-minute\/excel'\)/);
  assert.match(route, /@router\.get\('\/history\/five-minute\/module\/excel'\)/);
  assert.match(route, /export_five_minute_module_excel/);
  assert.match(service, /def build_five_minute_module_excel\(/);
  assert.match(service, /def export_five_minute_module_excel\(/);
  assert.match(service, /get_five_minute_export_data\(/);
});
