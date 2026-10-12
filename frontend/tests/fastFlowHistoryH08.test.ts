import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('la vista Flujo solicita serie rápida y Totalizador/Ambos la serie completa', () => {
  const code = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(code, /const flowOnly = !singleElement && metric === 'flow'/);
  assert.match(code, /\$\{flowOnly \? 'flow' : 'complete'\}/);
  assert.match(code, /flowOnly,\s*onStatus:/);
  assert.match(code, /if \(!data \|\| resolvedQueryIdentity !== queryIdentity\) return null/);
});

test('caché y jobs diferencian el flujo ligero y la consulta completa', () => {
  const service = read('src/services/waterService.js');
  const modular = service.slice(service.indexOf('export async function fetchWaterModuleHistory'), service.indexOf('export async function fetchWellsMinuteFlow'));
  assert.match(modular, /options\.flowOnly \? 'flow' : 'complete'/);
  assert.match(modular, /flow_only: Boolean\(options\.flowOnly\)/);
  const chart = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(chart, /La gráfica se mostrará cuando termine/);
  assert.doesNotMatch(chart, /La pantalla sigue disponible/);
});
