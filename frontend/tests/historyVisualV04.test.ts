import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const component = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
const css = read('src/styles/durangoHistoryLF16.css');
const main = read('src/main.jsx');

test('V04: historical toolbar groups metrics, PDF, both Excels, dates and aggregation', () => {
  const start = component.indexOf('<div className="module-history-toolbar"');
  const end = component.indexOf('{singleElement ? <div className="dgo-h02-threshold-panel"', start);
  assert.ok(start >= 0 && end > start, 'historical commandbar remains before threshold/detail options');
  const bar = component.slice(start, end);
  for (const token of ['module-comparison-controls', 'module-metric-selector', 'module-history-pdf-button',
    'module-history-excel-button', 'module-history-five-minute-button', 'module-history-range-panel',
    'module-history-range-fields', 'module-history-aggregation', 'module-history-range-actions']) {
    assert.ok(bar.includes(token), `missing: ${token}`);
  }
  assert.ok(component.indexOf('module-history-tabs') < start, 'module tabs precede bounded toolbar');
});

test('V04: preserve all query, selection and download behaviors', () => {
  for (const token of ['fetchWaterHistory(', 'fetchWaterModuleHistory(', 'downloadModuleHistoryExcel({',
    'downloadWaterModuleHistoryPdf({', 'downloadFiveMinuteModuleHistoryExcel({',
    'disabled={thresholdExportDisabled || pdfExporting}', 'disabled={thresholdExportDisabled || excelExporting}',
    'disabled={isPreviousChart || !selectedElementIds.length || fiveMinuteExporting}',
    'onClick={applyIndependentRange}', 'onClick={resetIndependentRange}',
    'setGlobalView(value)', 'setMetric(value)', 'setSelected(activeIdentities)',
    'HISTORY_MAX_RANGE_DAYS.minute', 'HISTORY_MAX_RANGE_DAYS.daily',
    "isPreviousChart ? 'dgo-h09-chart-previous'", 'connectNulls={false}']) {
    assert.ok(component.includes(token), `regression risk: ${token}`);
  }
});

test('V04: series palette and chart height match LF16, without global zoom', () => {
  assert.match(component, /const COLORS = \['#38bdf8', '#fbbf24', '#34d399', '#c084fc'/);
  assert.match(component, /<ResponsiveContainer width="100%" height=\{390\}>/);
  assert.ok(css.includes('var(--dgo-surface)'));
  assert.ok(css.includes('var(--dgo-border)'));
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.doesNotMatch(css, /\bzoom\s*:/);
  assert.doesNotMatch(css, /!important/);
});

test('V04: compact LF16 toolbar is imported after V03 and remains scoped', () => {
  assert.ok(main.indexOf("import './styles/durangoSummaryLF16.css'") < main.indexOf("import './styles/durangoHistoryLF16.css'"));
  assert.match(css, /\.pozos-shell \.module-history-panel \.module-history-toolbar/);
  assert.match(css, /\.pozos-shell \.module-history-panel \.module-history-range-panel/);
  assert.match(css, /\.pozos-shell \.module-history-panel > \.panel-header\.compact/);
  assert.match(component, /dgo-v04-selection-count/);
});
