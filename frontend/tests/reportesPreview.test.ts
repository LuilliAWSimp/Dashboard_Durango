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


test('Reportes separa Lavadoras y Jarabes y no muestra Flujos como sección visible', () => {
  assert.match(reports, /label: 'Lavadoras'/);
  assert.match(reports, /label: 'Jarabes'/);
  assert.doesNotMatch(reports, /label: 'Flujos'/);
  assert.match(reports, /Pozos, Líneas, Lavadoras y Jarabes/);
  assert.match(reports, /Volumen validado de lavadoras/);
  assert.match(reports, /Volumen validado de Jarabes/);
  assert.doesNotMatch(reports, /Volumen validado de flujos/);
});

test('Balance de Agua permite que el tooltip escape del panel', () => {
  const balance = readFileSync(new URL('../src/pages/pozos/sections/BalanceSection.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  assert.match(balance, /balance-chart-panel/);
  assert.match(balance, /allowEscapeViewBox=\{\{ x: true, y: true \}\}/);
  assert.match(styles, /\.balance-chart-panel\s*\{/);
  assert.match(styles, /\.balance-chart-panel \.recharts-tooltip-wrapper/);
});


test('Resumen separa Lavadoras y Jarabes en KPI visibles', () => {
  const resumen = readFileSync(new URL('../src/pages/pozos/sections/DashboardBaseSection.tsx', import.meta.url), 'utf8');
  assert.match(resumen, /Volumen validado de lavadoras/);
  assert.match(resumen, /Volumen validado de Jarabes/);
  assert.match(resumen, /Lavadoras con flujo actual/);
  assert.match(resumen, /Jarabes con flujo actual/);
  assert.doesNotMatch(resumen, /Volumen validado de flujos/);
  assert.doesNotMatch(resumen, /Flujos con flujo actual/);
  assert.doesNotMatch(resumen, /label="Validación parcial"/);
});
