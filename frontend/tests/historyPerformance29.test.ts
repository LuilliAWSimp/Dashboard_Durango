import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('polling del dashboard respeta cache y solo la accion manual fuerza refresh', () => {
  const hook = read('src/pages/pozos/hooks/useSqlChartDashboard.ts');
  assert.match(hook, /force_refresh:\s*kind === 'manual'/);
  assert.match(hook, /load\('auto'\)/);
  assert.match(hook, /manualRefresh = refreshKey !== appliedRefreshKeyRef\.current/);
  assert.doesNotMatch(hook, /forceRefresh\?: boolean/);
});

test('consumidores operativos ya no fuerzan cada lectura automatica', () => {
  for (const path of [
    'src/pages/pozos/sections/DashboardBaseSection.tsx',
    'src/pages/pozos/components/OperationalModuleSection.tsx',
    'src/pages/pozos/components/OperationalDetailSection.tsx',
    'src/pages/pozos/sections/BalanceSection.tsx',
  ]) {
    assert.doesNotMatch(read(path), /forceRefresh:\s*true/);
  }
});

test('detalle individual consulta solo su elemento y comparativa conserva endpoint modular', () => {
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(history, /fetchWaterHistory, fetchWaterModuleHistory/);
  assert.match(history, /singleIdentity === null[\s\S]*?fetchWaterModuleHistory/);
  assert.match(history, /singleHistoryAsModuleResponse\(await fetchWaterHistory/);
  assert.match(history, /sensorId:\s*singleIdentity/);
  assert.match(history, /queryIdentity = `\$\{module\}:\$\{singleIdentity === null \? 'module' : identityText\(singleIdentity\)\}/);
});

test('polling del historico usa cache mientras Actualizar conserva refresh forzado', () => {
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(history, /useAutoRefresh\(rangeIncludesToday\(effectiveRange\), \(\) => \{ void load\(false, true\); \}\)/);
  assert.match(history, /manualRefresh = refreshKey !== appliedRefreshKeyRef\.current/);
  assert.match(history, /void load\(manualRefresh, false\)/);
});

test('cache frontend conserva dedupe in-flight y queda acotada', () => {
  const service = read('src/services/waterService.js');
  assert.match(service, /const MAX_CACHE_ENTRIES = 100/);
  assert.match(service, /const pending = inFlight\.get\(key\); if \(pending\) return pending/);
  assert.match(service, /cache\.size >= MAX_CACHE_ENTRIES/);
  assert.match(service, /cache\.delete\(oldestKey\)/);
});
