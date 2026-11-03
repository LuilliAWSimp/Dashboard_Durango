import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const summary = read('src/pages/pozos/sections/DashboardBaseSection.tsx');
const css = read('src/styles/durangoSummaryLF16.css');

test('V03: 4 process cards replace 7 oversized KPIs while retaining plant identity', () => {
  assert.match(summary, /durango-summary-process-grid/);
  assert.match(summary, /comparisonRows\.map\(\(item\) => \(/);
  assert.match(summary, /<SummaryProcessCard/);
  assert.doesNotMatch(summary, /<KpiCard/);
  assert.match(summary, /operationalVolumeLabel\('well'\)/);
  assert.match(summary, /operationalVolumeLabel\('line'\)/);
  assert.match(summary, /operationalVolumeLabel\('flow'\)\} de lavadoras/);
  assert.match(summary, /operationalVolumeLabel\('flow'\)\} de Jarabes/);
});

test('V03: preserve current volume authority and previous-day comparisons', () => {
  assert.match(summary, /const wells = dashboardWells;/);
  assert.match(summary, /const lines = dashboardLines;/);
  assert.match(summary, /const lavadoras = dashboardLavadoras;/);
  assert.match(summary, /const jarabes = dashboardJarabes;/);
  assert.match(summary, /const volume = groupVolume\(group\);/);
  assert.match(summary, /dailyMode \? dailyVolumeTrend\(group, total, previous\)/);
  assert.match(summary, /Sin datos/);
  assert.match(summary, /Sin lectura/);
  assert.match(summary, /comparisonOperationalGroup\(dailyReview, 'previous_day'/);
});

test('V03: operational status and all existing page features remain available', () => {
  assert.match(summary, /Estado general/);
  assert.match(summary, /Elementos con flujo actual/);
  assert.match(summary, /Alertas activas/);
  assert.match(summary, /Última actualización/);
  assert.match(summary, /<ModuleHistoryPanel range=\{controller\.range\} independentRange \/>/);
  assert.match(summary, /Comparativo de volumen por módulo/);
  assert.match(summary, /<OperationalAlertsPanel alerts=\{alerts\}/);
  for (const route of ['/pozos/pozos', '/pozos/lineas', '/pozos/flujos', '/pozos/jarabes']) {
    assert.ok(summary.includes(route), `missing route: ${route}`);
  }
});

test('V03: scoped LF16 layout remains responsive, imports after V02', () => {
  const main = read('src/main.jsx');
  assert.ok(main.indexOf("import './styles/durangoSidebarLF16.css'") < main.indexOf("import './styles/durangoSummaryLF16.css'"));
  assert.match(css, /\.pozos-shell \.durango-summary-process-grid/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 1240px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /var\(--dgo-surface\)/);
  assert.match(css, /var\(--dgo-border\)/);
  assert.doesNotMatch(css, /!important|zoom\s*:/);
});
