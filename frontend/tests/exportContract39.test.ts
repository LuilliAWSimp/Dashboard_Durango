import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeReportFilters, reportFiltersIncludeDate, sameReportFilters } from '../src/pages/pozos/reportExportContract.ts';

const reports = readFileSync(new URL('../src/pages/pozos/sections/ReportesSection.tsx', import.meta.url), 'utf8');
const history = readFileSync(new URL('../src/pages/pozos/components/ModuleHistoryPanel.tsx', import.meta.url), 'utf8');
const pdfService = readFileSync(new URL('../../backend/app/services/water_module_history_pdf_service.py', import.meta.url), 'utf8');

test('normaliza el periodo del reporte antes de aplicarlo o exportarlo', () => {
  assert.deepEqual(normalizeReportFilters('day', '2026-09-25', '', ''), { date: '2026-09-25' });
  assert.deepEqual(normalizeReportFilters('range', '', '2026-09-25', '2026-09-19'), { startDate: '2026-09-19', endDate: '2026-09-25' });
  assert.equal(sameReportFilters({ date: '2026-09-25' }, { date: '2026-09-25' }), true);
  assert.equal(sameReportFilters({ date: '2026-09-25' }, { date: '2026-09-24' }), false);
  assert.equal(reportFiltersIncludeDate({ startDate: '2026-09-19', endDate: '2026-09-25' }, '2026-09-25'), true);
});

test('Preview y formatos usan filtros aplicados y no los inputs aun sin aplicar', () => {
  assert.match(reports, /const \[appliedFilters, setAppliedFilters\]/);
  assert.match(reports, /downloadDailyWaterReportPdf\(appliedFilters\)/);
  assert.match(reports, /downloadDailyWaterReportExcel\(appliedFilters\)/);
  assert.match(reports, /fetchDailyWaterReport\(appliedFilters, \{ includeHistory: true, includeShifts: true \}\)/);
  assert.match(reports, /date: appliedFilters\.date/);
  assert.match(reports, /start_date: appliedFilters\.startDate/);
  assert.match(reports, /end_date: appliedFilters\.endDate/);
  assert.match(reports, /Cambios de periodo pendientes/);
});

test('auto refresh usa el mismo periodo aplicado que la vista previa', () => {
  assert.match(reports, /reportFiltersIncludeDate\(appliedFilters, today\)/);
  assert.match(reports, /load\(appliedFilters, true\)/);
});

test('PDF historico recibe geometria visible de cada serie', () => {
  assert.match(history, /chart_type: 'line', axis: 'left'/);
  assert.match(history, /chart_type: metric === 'both'.*\? 'bar' : 'line'/s);
  assert.match(history, /axis: metric === 'both' \? 'right' : 'left'/);
  assert.match(history, /left_axis_label: axes\.showFlow \? 'Flujo \(L\/s\)' : totalizerAxisLabel/);
  assert.match(history, /right_axis_label: axes\.independentAxes \? totalizerAxisLabel : undefined/);
});

test('backend PDF dibuja barras y lineas segun el contrato y no segun el texto de metrica', () => {
  assert.match(pdfService, /item\.get\('axis'/);
  assert.match(pdfService, /item\.get\('chart_type'/);
  assert.match(pdfService, /drawing\.add\(Rect\(/);
  assert.doesNotMatch(pdfService, /metric_label\.lower\(\) == 'ambos'/);
});
