import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isCompleteCalendarMonth, normalizeReportFilters } from '../src/pages/pozos/reportExportContract.ts';

const source = readFileSync(new URL('../src/pages/pozos/sections/ReportesSection.tsx', import.meta.url), 'utf8');

test('meses calendario de 28, 29, 30 y 31 dias se reconocen correctamente', () => {
  for (const [startDate, endDate] of [
    ['2026-02-01', '2026-02-28'],
    ['2028-02-01', '2028-02-29'],
    ['2026-04-01', '2026-04-30'],
    ['2026-10-01', '2026-10-31'],
  ]) {
    assert.equal(isCompleteCalendarMonth({ startDate, endDate }), true);
  }
  for (const filters of [
    { date: '2026-10-03' },
    { startDate: '2026-10-02', endDate: '2026-10-31' },
    { startDate: '2026-10-01', endDate: '2026-10-30' },
    { startDate: '2026-02-01', endDate: '2026-02-29' },
  ]) {
    assert.equal(isCompleteCalendarMonth(filters), false);
  }
  assert.deepEqual(normalizeReportFilters('range', '', '2026-10-01', '2026-10-31'), {
    startDate: '2026-10-01', endDate: '2026-10-31',
  });
});

test('PDF y Excel mensuales dependen de filtros aplicados y no de preview sincrona', () => {
  assert.match(source, /const monthlyRequest = !background && isCompleteCalendarMonth\(nextFilters\)/);
  assert.match(source, /setAppliedFilters\(nextFilters\);\s*setReport\(null\)/);
  assert.match(source, /const monthlyExportReady = !loading && !hasPendingPeriodChanges && isCompleteCalendarMonth\(appliedFilters\)/);
  assert.match(source, /const pdfExcelReady = exportReady \|\| monthlyExportReady/);
  assert.match(source, /disabled=\{isBusy \|\| !pdfExcelReady\} onClick=\{\(\) => void runExport\('pdf'\)\}/);
  assert.match(source, /disabled=\{isBusy \|\| !pdfExcelReady\} onClick=\{\(\) => void runExport\('xlsx'\)\}/);
  assert.match(source, /downloadDailyWaterReportPdf\(appliedFilters, setExportJob\)/);
  assert.match(source, /downloadDailyWaterReportExcel\(appliedFilters, setExportJob\)/);
  // El PDF y Excel no dependen del HTML, SMTP ni regeneraciones en navegador.
  assert.match(source, /fetchDailyWaterReport\(appliedFilters, \{ includeHistory: true, includeShifts: true \}\)/);
});
