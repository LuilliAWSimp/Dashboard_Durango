import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('histórico modular usa jobs y sondeos cortos en lugar del GET de 30s', () => {
  const code = read('src/services/waterService.js');
  const modular = code.slice(code.indexOf('export async function fetchWaterModuleHistory'), code.indexOf('export async function fetchWellsMinuteFlow'));
  assert.match(modular, /history\/module\/jobs/);
  assert.match(modular, /history\/module\/jobs\/\$\{job\.id\}/);
  assert.match(modular, /history\/module\/jobs\/\$\{job\.id\}\/result/);
  assert.match(modular, /15 \* 60 \* 1000/);
  assert.doesNotMatch(modular, /timeout: 30000/);
});

test('cambio de fechas no mantiene gráfica antigua durante error o recarga', () => {
  const component = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(component, /lastResolvedIdentityRef\.current === identity/);
  assert.match(component, /setData\(null\)/);
  assert.match(component, /resolvedQueryIdentity !== queryIdentity/);
  assert.match(component, /Histórico en cola/);
  assert.match(component, /Consultando BOS y validando intervalos/);
});
