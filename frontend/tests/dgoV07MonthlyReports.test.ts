import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isCompleteCalendarMonth, isExtendedReportRange, isValidReportFilters, normalizeReportFilters } from '../src/pages/pozos/reportExportContract.ts';

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

test('DGO-V07A: PDF/Excel siempre utilizan los filtros visibles, sin Actualizar', () => {
  assert.match(source, /const requestedFilters: ReportFilters = \{ \.\.\.draftFilters \}/);
  assert.match(source, /downloadDailyWaterReportPdf\(requestedFilters, setExportJob\)/);
  assert.match(source, /downloadDailyWaterReportExcel\(requestedFilters, setExportJob\)/);
  assert.doesNotMatch(source, /downloadDailyWaterReportPdf\(appliedFilters/);
  assert.doesNotMatch(source, /downloadDailyWaterReportExcel\(appliedFilters/);
  assert.match(source, /const pdfExcelReady = isValidReportFilters\(draftFilters\)/);
  assert.match(source, /reportFiltersLabel\(draftFilters\)/);
  assert.match(source, /isExtendedReportRange\(nextFilters\)/);
  assert.match(source, /const nextReport = await fetchDailyWaterReportPreview\(nextFilters\)/);
  assert.match(source, /report && !hasPendingPeriodChanges \? <>/);
  assert.deepEqual(normalizeReportFilters('range', '', '2026-10-01', '2026-10-31'), {
    startDate: '2026-10-01', endDate: '2026-10-31',
  });
  assert.equal(isValidReportFilters({ startDate: '2026-10-01', endDate: '2026-10-31' }), true);
  assert.equal(isExtendedReportRange({ startDate: '2026-10-01', endDate: '2026-10-31' }), true);
});
