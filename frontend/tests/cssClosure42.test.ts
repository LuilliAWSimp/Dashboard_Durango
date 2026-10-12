import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('global.css ya no contiene familias de modulos deshabilitados', () => {
  const globalCss = read('src/styles/global.css');
  assert.doesNotMatch(globalCss, /\.concession-|\.concesion-/);
  assert.doesNotMatch(globalCss, /\.tanque-|\.tanques-/);
  assert.doesNotMatch(globalCss, /\.uv-/);
});

test('responsabilidades vivas migradas salen de global.css', () => {
  const globalCss = read('src/styles/global.css');
  for (const selector of [
    '.water-balance-hero',
    '.operational-element-card',
    '.metric-pair {',
    '.operational-sibling-navigation',
    '.module-history-panel.operational-module-comparison',
    '.five-minute-export-action',
    '.email-report-modal',
    '.toast-viewport',
    '.pozos-operacion-table',
  ]) {
    assert.equal(globalCss.includes(selector), false, `${selector} no debe regresar a global.css`);
  }
});

test('cada responsabilidad migrada vive en su hoja propietaria', () => {
  const balance = read('src/styles/pages/balance.css');
  const modules = read('src/styles/pages/operational-modules.css');
  const details = read('src/styles/pages/detalles.css');
  const history = read('src/styles/pages/historicos.css');
  const shifts = read('src/styles/pages/turnos.css');
  const reports = read('src/styles/pages/reportes.css');
  const shared = read('src/styles/shared.css');
  const summary = read('src/styles/pages/resumen.css');

  assert.match(balance, /\.water-balance-hero\s*\{/);
  assert.match(balance, /\.balance-chart-panel\s*\{/);
  assert.match(modules, /\.operational-element-card\s*\{/);
  assert.match(modules, /\.metric-pair\s*\{/);
  assert.match(details, /\.operational-sibling-navigation\s*\{/);
  assert.match(history, /\.module-history-panel\.operational-module-comparison/);
  assert.match(history, /\.five-minute-export-action\s*\{/);
  assert.match(shifts, /\.shift-selector-field select\s*\{/);
  assert.match(reports, /\.email-report-modal\s*\{/);
  assert.match(shared, /\.toast-viewport\s*\{/);
  assert.match(shared, /\.pozos-operacion-table\s*\{/);
  assert.match(summary, /\.operational-alerts-heading/);
});

test('global.css queda reducido a base heredada acotada', () => {
  const globalCss = read('src/styles/global.css');
  const lines = globalCss.split(/\r?\n/).length;
  assert.ok(lines < 1600, `global.css no debe volver a crecer por encima de la base V2 (${lines} lineas)`);
  assert.match(globalCss, /BASE HEREDADA CONGELADA - Durango/);
});

test('hojas CSS modificadas mantienen llaves balanceadas', () => {
  const files = [
    'src/styles/global.css',
    'src/styles/shared.css',
    'src/styles/pages/balance.css',
    'src/styles/pages/operational-modules.css',
    'src/styles/pages/detalles.css',
    'src/styles/pages/historicos.css',
    'src/styles/pages/turnos.css',
    'src/styles/pages/reportes.css',
    'src/styles/pages/resumen.css',
  ];
  for (const file of files) {
    const css = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    let depth = 0;
    for (const char of css) {
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;
      assert.ok(depth >= 0, `${file} tiene una llave de cierre sin apertura`);
    }
    assert.equal(depth, 0, `${file} tiene llaves sin cerrar`);
  }
});
