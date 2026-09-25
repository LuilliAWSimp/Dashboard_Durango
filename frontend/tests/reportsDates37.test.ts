import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildDailyWaterReportHtml } from '../src/services/dailyWaterReportExportService.ts';

const reports = readFileSync(new URL('../src/pages/pozos/sections/ReportesSection.tsx', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../backend/app/services/water_daily_report_service.py', import.meta.url), 'utf8');
const htmlService = readFileSync(new URL('../src/services/dailyWaterReportExportService.ts', import.meta.url), 'utf8');

const sample = {
  title: 'Reporte de Control Hídrico Durango',
  start_date: '2026-09-19',
  end_date: '2026-09-25',
  period_date_label: '19/09/2026 → 25/09/2026',
  period_label: 'Del 19/09/2026 00:00 al 25/09/2026 23:59',
  generated_at: '2026-09-25T15:45:30',
  summary: { monitored_items_count: 4, review_count: 0, no_data_count: 0 },
  presentation: { summary_cards: [] },
  comparatives: {
    headers: {
      selected: 'Seleccionado · 19/09/2026 → 25/09/2026',
      previous: 'Anterior · 18/09/2026 → 24/09/2026',
      previous_week: 'Semana anterior · 12/09/2026 → 18/09/2026',
    },
    rows: [{ key: 'wells', label: 'Pozos', selected_m3: 10, previous_m3: 9, previous_week_m3: 8 }],
  },
  wells: { rows: [] }, production_lines: { rows: [] }, washers: { rows: [] }, jarabes: { rows: [] },
  history: { wells: {}, lines: {}, washers: {}, jarabes: {} }, shifts: [],
};

test('comparativos muestran fechas o rangos reales', () => {
  assert.match(reports, /comparativeHeaders\.selected/);
  assert.match(reports, /comparativeHeaders\.previous/);
  assert.match(reports, /comparativeHeaders\.previous_week/);
  assert.match(backend, /'selected': 'Seleccionado'/);
  assert.match(backend, /'previous_week': 'Semana anterior'/);
});

test('columnas de volumen incorporan el periodo consultado', () => {
  assert.match(reports, /reportSectionVolumeLabel\(sectionKey\)\} · \{periodDateLabel\}/);
  const html = buildDailyWaterReportHtml(sample);
  assert.match(html, /Volumen bombeado · 19\/09\/2026 → 25\/09\/2026/);
  assert.match(html, /Totalizador apertura/);
  assert.match(html, /Totalizador al cierre/);
});

test('HTML presenta comparativo con fechas explicitas', () => {
  const html = buildDailyWaterReportHtml(sample);
  assert.match(html, /Comparativo de volumen por módulo/);
  assert.match(html, /Seleccionado · 19\/09\/2026 → 25\/09\/2026/);
  assert.match(html, /Anterior · 18\/09\/2026 → 24\/09\/2026/);
  assert.match(html, /Semana anterior · 12\/09\/2026 → 18\/09\/2026/);
});

test('asunto y nombre de archivo distinguen fecha de rango', () => {
  assert.match(reports, /Reporte de Control Hídrico Durango · \$\{period\}/);
  assert.match(htmlService, /reporte-control-hidrico-durango-\$\{range\}\$\{suffix\}/);
  assert.doesNotMatch(htmlService, /reporte-diario-control-hidrico-durango-/);
});
