import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const component = source('src/pages/pozos/components/ModuleHistoryPanel.tsx');
const helper = source('src/pages/pozos/flowThreshold.ts');
const client = source('src/services/waterThresholdExportService.ts');

test('H02: umbrales solo aparecen para un detalle individual y nunca en historico general', () => {
  assert.match(component, /\{singleElement \? <div className="dgo-h02-threshold-panel"/);
  assert.match(component, /checked=\{thresholdDraft.enabled\}/);
  assert.match(component, /aria-label="Sentido del umbral"/);
  assert.match(component, /aria-label="Criterio de evaluación"/);
  assert.match(component, /ReferenceLine yAxisId="flow"/);
});

test('H02: reglas estrictas y ausencia diferenciada de cero real', () => {
  assert.match(helper, /\(numeric\(point.samples\) \?\? 0\) <= 0/);
  assert.match(helper, /low < config.minValue/);
  assert.match(helper, /high > config.maxValue/);
  assert.match(helper, /'Fuera de rango'/);
  assert.match(helper, /if \(!draft.enabled\) return ''/);
});

test('H02: exportacion con umbrales usa GET del backend sin enviar buckets calculados en navegador', () => {
  assert.match(client, /api.get<Blob>\(`\/water\/history\/detail\/\$\{format\}`/);
  assert.match(client, /threshold_direction: config.direction/);
  assert.match(client, /threshold_basis: config.basis/);
  assert.doesNotMatch(client, /rows: exportRows/);
  assert.match(component, /downloadWaterThresholdDetail\('pdf'/);
  assert.match(component, /downloadWaterThresholdDetail\('excel'/);
  assert.match(component, /downloadFiveMinuteModuleHistoryExcel/);
});
