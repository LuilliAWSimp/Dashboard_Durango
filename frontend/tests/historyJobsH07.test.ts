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

test('H09 conserva una instantánea identificada por periodo y no la exporta como el nuevo rango', () => {
  const component = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(component, /lastResolvedIdentityRef\.current === identity/);
  assert.match(component, /resolvedQueryIdentity !== queryIdentity/);
  assert.match(component, /lastChart\.identity !== queryIdentity/);
  assert.match(component, /Vista anterior/);
  assert.match(component, /data-history-view=\{isPreviousChart/);
  assert.match(component, /Consulta SQL en cola/);
  assert.match(component, /setRefreshing\(true\)/);
  assert.match(component, /const exportDisabled = !exportRows\.length/);
  assert.match(component, /disabled=\{isPreviousChart \|\| !selectedElementIds/);
});
