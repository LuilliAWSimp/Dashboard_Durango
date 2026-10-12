import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('46E polling automatico omite solo la cache cliente sin forzar backend', () => {
  const hook = read('src/pages/pozos/hooks/useSqlChartDashboard.ts');
  assert.match(hook, /force_refresh:\s*kind === 'manual'/);
  assert.match(hook, /bypassCache:\s*kind === 'auto'/);

  const service = read('src/services/waterService.js');
  assert.match(service, /bypassCache = Boolean\(options\.bypassCache \|\| options\.bypass_cache\)/);
  assert.match(service, /!forceRefresh && !bypassCache && cached/);
  assert.doesNotMatch(service, /params\.bypassCache|params\.bypass_cache/);
});

test('46E resumen usa el periodo del dashboard para valores actuales', () => {
  const summary = read('src/pages/pozos/sections/DashboardBaseSection.tsx');
  assert.match(summary, /const wells = dashboardWells;/);
  assert.match(summary, /const lines = dashboardLines;/);
  assert.match(summary, /const lavadoras = dashboardLavadoras;/);
  assert.match(summary, /const jarabes = dashboardJarabes;/);
  assert.doesNotMatch(summary, /reviewOperationalGroup\(dailyReview/);
});

test('46E comparativos diarios ya no se vuelven a pedir en cada tick de 60 s', () => {
  const summary = read('src/pages/pozos/sections/DashboardBaseSection.tsx');
  assert.match(summary, /\}, \[singleReviewDate\]\);/);
  assert.doesNotMatch(summary, /\[singleReviewDate, controller\.lastRefreshAt\]/);
  assert.match(summary, /comparisonOperationalGroup\(dailyReview, 'previous_day'/);
  assert.match(summary, /comparisonOperationalGroup\(dailyReview, 'previous_week'/);
});

test('46E resumen derivado de filas conserva cobertura y calidad para lavadoras y jarabes', () => {
  const summary = read('src/pages/pozos/sections/DashboardBaseSection.tsx');
  assert.match(summary, /coverage_available:\s*coverageAvailable/);
  assert.match(summary, /coverage_total:\s*items\.length/);
  assert.match(summary, /coverage_complete:\s*items\.length > 0 && coverageAvailable === items\.length/);
  assert.match(summary, /no_data_count:\s*noDataCount/);
  assert.match(summary, /partial_count:\s*partialCount/);
});
