import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const reports = readFileSync(new URL('../src/pages/pozos/sections/ReportesSection.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../src/services/waterReportService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('la navegación visible utiliza Balance de Agua', () => {
  assert.match(app, /label: 'Balance de Agua'/);
  assert.doesNotMatch(app, /Comparativo Operativo/);
});

test('Reportes usa preview ligero sin históricos ni turnos', () => {
  assert.match(reports, /fetchDailyWaterReportPreview\(nextFilters\)/);
  assert.match(service, /includeHistory: false, includeShifts: false/);
  assert.doesNotMatch(reports, /setReport\(null\)/);
});

test('exportaciones completas se generan únicamente bajo demanda', () => {
  assert.match(reports, /downloadDailyWaterReportPdf\(filters\)/);
  assert.match(reports, /downloadDailyWaterReportExcel\(filters\)/);
  assert.match(reports, /includeHistory: true, includeShifts: false/);
  assert.match(reports, /formats: selectedFormats/);
});
