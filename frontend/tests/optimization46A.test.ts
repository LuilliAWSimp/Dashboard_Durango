import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('46A alertas reutilizan cache y no fuerzan una segunda lectura al montar', () => {
  const center = read('src/pages/pozos/components/NotificationCenter.tsx');
  assert.match(center, /fetchWaterDashboard\('dashboard',\s*\{[\s\S]*?include_history:\s*false,[\s\S]*?include_energy_water:\s*false,[\s\S]*?\}\)/);
  assert.doesNotMatch(center, /force_refresh:\s*true/);
  assert.doesNotMatch(center, /forceRefresh:\s*true/);
});

test('46A precarga y alertas conservan el mismo contrato current sin historico ni energia', () => {
  const app = read('src/App.jsx');
  const center = read('src/pages/pozos/components/NotificationCenter.tsx');
  for (const source of [app, center]) {
    assert.match(source, /include_history:\s*false/);
    assert.match(source, /include_energy_water:\s*false/);
  }
});

test('46A actualizacion manual del dashboard sigue siendo la unica que fuerza refresh', () => {
  const hook = read('src/pages/pozos/hooks/useSqlChartDashboard.ts');
  assert.match(hook, /force_refresh:\s*kind === 'manual'/);
});
