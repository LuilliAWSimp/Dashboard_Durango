import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildDailyWaterReportHtml } from '../src/services/dailyWaterReportExportService.js';

const reports = readFileSync(new URL('../src/pages/pozos/sections/ReportesSection.tsx', import.meta.url), 'utf8');
const htmlService = readFileSync(new URL('../src/services/dailyWaterReportExportService.js', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../backend/app/services/water_daily_report_service.py', import.meta.url), 'utf8');

const baseRow = {
  flow: 1.2,
  flow_unit: 'L/s',
  opening_m3: 10,
  closing_m3: 12,
  activity: 'Con actividad',
  communication: 'Actualizado',
  last_update: '2026-09-25T12:00:00',
};

const report = {
  title: 'Reporte de Control Hídrico Durango',
  start_date: '2026-09-25', end_date: '2026-09-25', period_label: 'Del 25/09/2026 00:00 al 25/09/2026 23:59',
  generated_at: '2026-09-25T15:00:00',
  summary: { monitored_items_count: 3, review_count: 1, no_data_count: 1 },
  presentation: { summary_cards: [] }, comparatives: { rows: [] }, shifts: [],
  wells: { rows: [
    { ...baseRow, name: 'Pozo 1', validated_volume_m3: 2, samples: 10, quality_label: 'Validado', quality_status: 'validated' },
    { ...baseRow, name: 'Pozo 2', validated_volume_m3: null, samples: 10, quality_label: 'Dato en revisión', quality_status: 'review' },
    { ...baseRow, name: 'Pozo 3', validated_volume_m3: null, samples: 0, quality_status: 'no_data' },
  ] },
  production_lines: { rows: [] }, washers: { rows: [] }, jarabes: { rows: [] },
  history: { wells: {}, lines: {}, washers: {}, jarabes: {} },
};

test('Reportes 38 retira copy técnico de la pantalla', () => {
  assert.doesNotMatch(reports, /Crudo \+ conciliado \+ cobertura/);
  assert.doesNotMatch(reports, /Fuente: Revisión diaria conciliada/);
  assert.doesNotMatch(reports, /Fuente: periodo conciliado/);
  assert.doesNotMatch(reports, /registro físico confirmado/);
  assert.doesNotMatch(reports, /3010 → 3004/);
  assert.match(reports, /Exportaciones históricas/);
  assert.match(reports, /Resumen en pantalla/);
});

test('HTML traduce estados técnicos a lenguaje operativo', () => {
  const html = buildDailyWaterReportHtml(report);
  assert.match(html, /Datos completos/);
  assert.match(html, /Datos parciales/);
  assert.match(html, /Sin volumen disponible/);
  assert.match(html, /Sin datos/);
  assert.doesNotMatch(html, />Validado</);
  assert.doesNotMatch(html, /Sin volumen validado/);
  assert.doesNotMatch(html, /Revisión diaria conciliada|Periodo conciliado|<strong>Fuente:<\/strong>/);
});

test('HTML nombra gráficas por función física y evita validado visible', () => {
  const html = buildDailyWaterReportHtml(report);
  assert.match(html, /Volumen bombeado por elemento/);
  assert.match(html, /aria-label="Volumen por elemento"/);
  assert.doesNotMatch(html, /Volumen validado por elemento/);
});

test('backend mantiene contrato interno pero traduce salidas visibles', () => {
  assert.match(backend, /def _report_data_label/);
  assert.match(backend, /def _history_data_label/);
  assert.match(backend, /'Volumen del intervalo \(m³\)'/);
  assert.match(backend, /'Volumen del turno \(m³\)'/);
  assert.match(backend, /'Estado de datos'/);
  assert.match(backend, /'Corte'/);
  assert.doesNotMatch(backend, /Paragraph\('Volumen validado por elemento'/);
});

test('servicio HTML usa superficies claras azules y no fondo gris general', () => {
  assert.match(htmlService, /body\{font-family:Arial,sans-serif;color:#1f2937;margin:0;background:#ffffff\}/);
  assert.match(htmlService, /tbody tr:nth-child\(even\)\{background:#f3f9ff\}/);
});
