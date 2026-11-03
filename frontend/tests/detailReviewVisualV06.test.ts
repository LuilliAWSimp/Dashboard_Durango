import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../src/', import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), 'utf8');
const css = source('styles/durangoDetailReviewLF16.css');
const main = source('main.jsx');
const detail = source('pages/pozos/components/OperationalDetailSection.tsx');
const shifts = source('pages/pozos/components/ShiftConsumptionPanel.tsx');
const review = source('pages/pozos/sections/RevisionDiariaSection.tsx');

test('DGO-V06 se carga despues de V00-V05 sin alterar el contrato visual de esos modulos', () => {
  const v05 = main.indexOf("import './styles/durangoModulesLF16.css'");
  const v06 = main.indexOf("import './styles/durangoDetailReviewLF16.css'");
  assert.ok(v05 > 0 && v06 > v05);
  for (const token of ['--dgo-surface', '--dgo-raised', '--dgo-border', '--dgo-text', '--dgo-muted', '--dgo-accent']) {
    assert.ok(css.includes(token));
  }
  assert.match(css, /\.pozos-shell\.theme-light \.operational-detail-hero\.well-detail-hero/);
  assert.match(css, /\.pozos-shell\.theme-light \.operational-shifts-panel\.shift-consumption-panel/);
  assert.match(css, /\.pozos-shell\.theme-light \.daily-review-page \.daily-review-header-panel/);
});

test('DGO-V06 mantiene los enlaces y el control de fechas en detalle individual', () => {
  assert.match(detail, /<button type="button" className="back-inline-button" onClick=\{goBack\}/);
  assert.match(detail, /navigateToSibling\(previous.identity\)/);
  assert.match(detail, /navigateToSibling\(next.identity\)/);
  assert.match(detail, /<DateRangeControls\b/);
  assert.match(detail, /<ElementHistoryPanel\b/);
  assert.match(detail, /<ShiftConsumptionPanel\b/);
  assert.match(css, /\.operational-detail-hero \.well-detail-hero-metrics/);
  assert.match(css, /\.operational-detail-range/);
});

test('DGO-V06 conserva los datos reales y la semantica de cortes por turno', () => {
  assert.match(shifts, /fetchWaterShifts\(/);
  assert.match(shifts, /aggregateShiftDataState\(/);
  assert.match(shifts, /shift\.cut_status === 'Pendiente'/);
  assert.match(shifts, /item\.period_m3 == null/);
  assert.match(shifts, /<DetailTable\b/);
  assert.match(shifts, /className="shift-summary-cards"/);
  assert.match(css, /\.shift-summary-card\.partial/);
  assert.match(css, /\.shift-summary-card\.pending/);
  assert.match(css, /\.shift-detail-disclosure/);
});

test('DGO-V06 mantiene las seis tarjetas, comparativos, alertas y cortes en revision diaria', () => {
  assert.equal((review.match(/<KpiCard\b/g) || []).length, 6);
  assert.match(review, /fetchWaterDailyReview\(/);
  assert.match(review, /includeComparatives: true/);
  assert.match(review, /<OperationalAlertsPanel\b/);
  assert.match(review, /<ShiftConsumptionPanel group="all"/);
  assert.match(review, /className="panel fade-up daily-review-comparison-panel"/);
  assert.match(review, /daily-review-detail-panel/);
  assert.match(css, /\.daily-review-page \.daily-review-kpi-grid/);
});

test('DGO-V06 responsive y sin ocultar secciones funcionales', () => {
  for (const width of [1190, 900, 700, 480]) {
    assert.ok(css.includes(`@media (max-width: ${width}px)`));
  }
  // Se permite ocultar el adorno ::before de las tarjetas, no controles operativos.
  assert.doesNotMatch(css, /(?:\.shift-detail-list|\.shift-detail-table|\.operational-detail-history|\.daily-review-detail-panel)\s*\{[^}]*display\s*:\s*none/);
  assert.doesNotMatch(css, /visibility\s*:\s*hidden/);
  assert.doesNotMatch(css, /zoom\s*:/);
  assert.match(css, /overflow-x:\s*auto/);
});
