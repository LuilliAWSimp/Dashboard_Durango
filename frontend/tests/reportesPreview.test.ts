import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const reports = readFileSync(new URL('../src/pages/pozos/sections/ReportesSection.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../src/services/waterReportService.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const capabilities = readFileSync(new URL('../src/config/plantCapabilities.ts', import.meta.url), 'utf8');

test('la navegación visible utiliza Balance de Agua desde capabilities', () => {
  assert.match(capabilities, /label: 'Balance de Agua'/);
  assert.match(app, /buildDurangoNavigation/);
  assert.doesNotMatch(app, /Comparativo Operativo/);
});

test('Reportes usa preview ligero sin históricos ni turnos', () => {
  assert.match(reports, /fetchDailyWaterReportPreview\(nextFilters\)/);
  assert.match(service, /includeHistory: false, includeShifts: false/);
  assert.doesNotMatch(reports, /setReport\(null\)/);
});

test('exportaciones completas se generan únicamente bajo demanda', () => {
  assert.match(reports, /downloadDailyWaterReportPdf\(appliedFilters\)/);
  assert.match(reports, /downloadDailyWaterReportExcel\(appliedFilters\)/);
  assert.match(reports, /includeHistory: true, includeShifts: true/);
  assert.match(reports, /formats: selectedFormats/);
});


test('Reportes separa Lavadoras y Jarabes y no muestra Flujos como sección visible', () => {
  assert.match(reports, /label: 'Lavadoras'/);
  assert.match(reports, /label: 'Jarabes'/);
  assert.doesNotMatch(reports, /label: 'Flujos'/);
  assert.match(reports, /Pozos, Líneas, Lavadoras y Jarabes/);
  assert.match(reports, /operationalVolumeLabel\('flow'\)\} de lavadoras/);
  assert.match(reports, /operationalVolumeLabel\('flow'\)\} de Jarabes/);
  assert.doesNotMatch(reports, /de flujos/);
});

test('Balance de Agua permite que el tooltip escape del panel', () => {
  const balance = readFileSync(new URL('../src/pages/pozos/sections/BalanceSection.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/styles/pages/balance.css', import.meta.url), 'utf8');
  assert.match(balance, /balance-chart-panel/);
  assert.match(balance, /allowEscapeViewBox=\{\{ x: true, y: true \}\}/);
  assert.match(styles, /\.balance-chart-panel\s*\{/);
  assert.match(styles, /\.balance-chart-panel \.recharts-tooltip-wrapper/);
});


test('Resumen ejecutivo conserva volúmenes separados de Lavadoras y Jarabes', () => {
  const resumen = readFileSync(new URL('../src/pages/pozos/sections/DashboardBaseSection.tsx', import.meta.url), 'utf8');
  assert.match(resumen, /operationalVolumeLabel\('flow'\)\} de lavadoras/);
  assert.match(resumen, /operationalVolumeLabel\('flow'\)\} de Jarabes/);
  assert.match(resumen, /Elementos con flujo actual/);
  assert.match(resumen, /Alertas activas/);
  assert.doesNotMatch(resumen, /de flujos/);
  assert.doesNotMatch(resumen, /Subtotal validado/);
});
