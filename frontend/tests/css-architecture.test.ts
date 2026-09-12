import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('main carga tokens, legado y capas modulares en orden estable', () => {
  const main = read('src/main.jsx');
  const expected = [
    "import './styles/tokens.css';",
    "import './styles/global.css';",
    "import './styles/pages/resumen.css';",
    "import './styles/pages/operational-modules.css';",
    "import './styles/pages/operational-cards-details.css';",
    "import './styles/shared.css';",
  ];

  let previous = -1;
  for (const statement of expected) {
    const index = main.indexOf(statement);
    assert.ok(index > previous, `${statement} debe conservar el orden de cascada`);
    previous = index;
  }
});

test('global.css queda marcado como base heredada congelada', () => {
  const globalCss = read('src/styles/global.css');
  assert.match(globalCss, /BASE HEREDADA CONGELADA - Durango/);
  assert.doesNotMatch(globalCss, /Homologacion Durango 11B:/);
  assert.doesNotMatch(globalCss, /Homologacion Durango 11C:/);
  assert.doesNotMatch(globalCss, /Homologacion Durango 11F:/);
  assert.doesNotMatch(globalCss, /Homologacion Durango 11J:/);
  assert.doesNotMatch(globalCss, /Durango live summary refresh/);
  assert.doesNotMatch(globalCss, /Durango operational alerts and notifications/);
});

test('tokens concentra variables heredadas y aliases semanticos', () => {
  const tokens = read('src/styles/tokens.css');
  assert.match(tokens, /--bg:/);
  assert.match(tokens, /--text:/);
  assert.match(tokens, /--arca-primary:/);
  assert.match(tokens, /--arca-excel:/);
  assert.match(tokens, /--arca-pdf:/);
});

test('responsabilidades migradas viven fuera de global.css', () => {
  const resumen = read('src/styles/pages/resumen.css');
  const modules = read('src/styles/pages/operational-modules.css');
  const details = read('src/styles/pages/operational-cards-details.css');
  const shared = read('src/styles/shared.css');

  assert.match(resumen, /\.dashboard-resumen-page/);
  assert.match(resumen, /\.summary-operational-kpis/);
  assert.match(resumen, /\.operational-alerts-panel/);
  assert.match(resumen, /\.water-type-card/);
  assert.match(modules, /\.operational-module-page/);
  assert.match(modules, /\.operational-element-card/);
  assert.match(modules, /\.metric-pair/);
  assert.match(details, /\.well-detail-main-head/);
  assert.match(details, /\.operational-card-footer/);
  assert.match(shared, /\.export-excel-button/);
  assert.match(shared, /\.export-pdf-button/);
});

test('Resumen y modulos operativos exponen scopes reales sin alterar el layout', () => {
  const dashboard = read('src/pages/pozos/sections/DashboardBaseSection.tsx');
  const operational = read('src/pages/pozos/components/OperationalModuleSection.tsx');
  const resumen = read('src/styles/pages/resumen.css');
  const modules = read('src/styles/pages/operational-modules.css');

  assert.match(dashboard, /className="dashboard-resumen-page"/);
  assert.match(operational, /operational-module-page operational-module-\$\{module\}-page/);
  assert.match(resumen, /\.dashboard-resumen-page\s*\{\s*display:\s*contents;/s);
  assert.match(modules, /\.operational-module-page\s*\{\s*display:\s*contents;/s);
});
