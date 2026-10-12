import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const path = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const client = path('../src/services/reportExportJobService.js');
const daily = path('../src/services/waterReportService.js');
const historical = path('../src/services/waterHistoricalExportService.ts');
const page = path('../src/pages/pozos/sections/ReportesSection.tsx');

test('PDF y Excel se inician como jobs y no mantienen una consulta pesada abierta', () => {
  assert.match(daily, /runBackgroundReportExport\('daily_pdf'/);
  assert.match(daily, /runBackgroundReportExport\('daily_excel'/);
  assert.match(historical, /'historical_excel'/);
  assert.match(historical, /'historical_pdf'/);
  assert.match(client, /api\.post\('\/water\/reports\/jobs'/);
  assert.match(client, /setTimeout\(resolve, 3000\)/);
  assert.match(client, /download/);
});

test('la pantalla indica progreso del trabajo y conserva HTML/preview originales', () => {
  assert.match(page, /report-export-job-status/);
  assert.match(page, /setExportJob/);
  assert.match(page, /fetchDailyWaterReportPreview\(nextFilters\)/);
  assert.match(page, /fetchDailyWaterReport\(appliedFilters, \{ includeHistory: true, includeShifts: true \}\)/);
});
