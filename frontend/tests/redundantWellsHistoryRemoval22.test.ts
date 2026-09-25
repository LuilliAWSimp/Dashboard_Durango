import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Resumen conserva solo el historico operativo global', () => {
  const summary = read('src/pages/pozos/sections/DashboardBaseSection.tsx');
  assert.match(summary, /<ModuleHistoryPanel range=\{controller\.range\} independentRange \/>/);
  assert.doesNotMatch(summary, /WellsMinuteFlowPanel/);
  assert.doesNotMatch(summary, /Flujo minuto a minuto por pozo/);
});

test('el componente minuto a minuto deja de formar parte del grafo del Resumen', () => {
  const summary = read('src/pages/pozos/sections/DashboardBaseSection.tsx');
  assert.doesNotMatch(summary, /components\/WellsMinuteFlowPanel/);
});

test('el historico global conserva consulta a un minuto como reemplazo funcional', () => {
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(history, /value="minute">1 minuto/);
  assert.match(history, /label: 'Pozos'/);
  assert.match(history, /'Fechas del histórico global'/);
});
