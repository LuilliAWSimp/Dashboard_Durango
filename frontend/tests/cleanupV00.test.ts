import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const loadSrc = (relativePath: string): string =>
  readFileSync(new URL(`../src/${relativePath}`, import.meta.url), 'utf8');

// Una misma regla de igual especificidad ya no debe repetirse en el mismo
// contexto solo para resolver un conflicto de cascada que podria evitarse.
function exactSelectorCount(css: string, selector: string): number {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{`, 'g'))].length;
}

test('DGO-V00 elimina duplicaciones exactas de CSS heredado sin retirar selectores activos', () => {
  const global = loadSrc('styles/global.css');
  const login = loadSrc('styles/pages/login.css');
  const shell = loadSrc('styles/pages/shell.css');

  for (const selector of ['.summary-stack', '.circuit-card-subtitle', '.full-width-card', '.wide-fit']) {
    assert.equal(exactSelectorCount(global, selector), 1, selector);
  }
  assert.equal(exactSelectorCount(login, '.login-hint'), 1);
  // .login-brand mantiene otras dos reglas diferentes; solo retiramos la repetida.
  assert.equal((login.match(/\.login-brand\s*\{\s*justify-content:\s*center;\s*\}/g) ?? []).length, 1);
  assert.equal(exactSelectorCount(shell, '.user-chip'), 1);
});

test('DGO-V00 conserva las rutas operativas y retira constantes no utilizadas del contenedor', () => {
  const page = loadSrc('pages/PozosDashboardPage.jsx');
  for (const section of [
    'DashboardBaseSection', 'PozosSection', 'LineasSection', 'FlujosSection',
    'JarabesSection', 'ConcesionesSection', 'BalanceSection',
    'RevisionDiariaSection', 'ReportesSection', 'UsersPage',
  ]) {
    assert.match(page, new RegExp(`\\b${section}\\b`));
  }
  assert.doesNotMatch(page, /\b(?:pieColors|axisColor|gridColor|emptyChartRange)\b/);
});
