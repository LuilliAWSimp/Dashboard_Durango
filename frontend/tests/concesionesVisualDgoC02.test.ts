import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildConcessionVisualSummary } from '../src/utils/durangoConcessionVisual.ts';

const page = readFileSync(new URL('../src/pages/pozos/sections/ConcesionesSection.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles/pages/concesiones.css', import.meta.url), 'utf8');

test('DGO-C02: distribución de cuotas se calcula desde los registros publicados, no un demo', () => {
  const values = buildConcessionVisualSummary([
    { well_key: 'pozo_1', annual_volume_m3: 460_908, review_state: 'provisional' },
    { well_key: 'pozo_2', annual_volume_m3: 364_407, review_state: 'provisional' },
  ]);
  assert.equal(values.total, 825_315);
  assert.equal(values.largest, 460_908);
  assert.equal(values.documentsPending, 2);
  assert.ok(Math.abs(values.shares[0].relativePercent - 55.846) < 0.01);
  assert.ok(Math.abs(values.shares[1].relativePercent - 44.154) < 0.01);
  assert.equal(Math.round(values.shares.reduce((n, w) => n + w.relativePercent, 0)), 100);
});

test('DGO-C02: actualizaciones de volumen afectan automáticamente el gráfico', () => {
  const changed = buildConcessionVisualSummary([
    { well_key: 'pozo_1', annual_volume_m3: 200, review_state: 'provisional' },
    { well_key: 'pozo_2', annual_volume_m3: 300, review_state: 'validated' },
  ]);
  assert.equal(changed.total, 500);
  assert.equal(changed.documentsPending, 1);
  assert.deepEqual(changed.shares.map((row) => row.relativePercent), [40, 60]);
});

test('DGO-C02: datos nulos/erróneos no fabrican porcentajes ni divisiones inválidas', () => {
  const zero = buildConcessionVisualSummary([
    { well_key: 'pozo_1', annual_volume_m3: 0, review_state: 'provisional' },
    { well_key: 'pozo_2', annual_volume_m3: Number.NaN, review_state: 'provisional' },
  ]);
  assert.equal(zero.total, 0);
  assert.equal(zero.largest, 0);
  assert.deepEqual(zero.shares.map((row) => row.relativePercent), [0, 0]);
});

test('DGO-C02: el histórico mensual es un estado sin mediciones simuladas', () => {
  assert.match(page, /Sin histórico mensual conciliado/);
  assert.match(page, /sin datos mensuales|Sin histórico mensual/i);
  assert.match(page, /chartMode === 'quota'/);
  assert.match(page, /buildConcessionVisualSummary\(records\)/);
  assert.match(page, /No se usarán barras ilustrativas ni lecturas simuladas/);
  assert.doesNotMatch(page, /420[_,]?000|222[_,]?000|537[_,]?895/);
});

test('DGO-C02: preservar administración, PDF, auditoría y refresco de C01', () => {
  for (const contract of [
    /currentUser\?\.role === 'admin'/,
    /previewConcessionPdf\(incoming\)/,
    /saveConcessionPdf\(row\.well_key, form, file\)/,
    /updateConcession\(row\.well_key, form\)/,
    /fetchConcessionAudit\(row\.well_key\)/,
    /downloadConcessionPdf\(row\.well_key/,
    /window\.setInterval/,
    /30000/,
  ]) assert.match(page, contract);
});

test('DGO-C02: CSS de nuevos gráficos limitado a Concesiones y adaptable a móvil y tema claro', () => {
  assert.match(styles, /\.con-v2 \.con-analytics-grid/);
  assert.match(styles, /\.pozos-shell\.theme-light \.con-v2/);
  assert.match(styles, /@media \(max-width: 500px\)/);
  assert.match(styles, /\.con-v2 \.con-well-cards/);
});
