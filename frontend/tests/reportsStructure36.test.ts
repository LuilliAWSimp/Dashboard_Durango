import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildDailyWaterReportHtml } from '../src/services/dailyWaterReportExportService.ts';

const reports = readFileSync(new URL('../src/pages/pozos/sections/ReportesSection.tsx', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../backend/app/services/water_daily_report_service.py', import.meta.url), 'utf8');

const report = {
  title: 'Reporte Diario de Control Hídrico Durango',
  start_date: '2026-09-25', end_date: '2026-09-25', period_label: '25/09/2026', generated_at: '2026-09-25T15:00:00',
  report_source: 'daily_review',
  summary: { monitored_items_count: 8, review_count: 1, no_data_count: 1 },
  presentation: {
    summary_cards: [
      { key: 'wells_volume', label: 'Volumen bombeado de pozos', kind: 'volume', value: 10 },
      { key: 'lines_volume', label: 'Volumen consumido de líneas', kind: 'volume', value: 8 },
      { key: 'washers_volume', label: 'Volumen consumido de lavadoras', kind: 'volume', value: 4 },
      { key: 'jarabes_volume', label: 'Volumen consumido de Jarabes', kind: 'volume', value: 2 },
      { key: 'active_items', label: 'Con actividad', kind: 'ratio', value: 6, total: 8 },
      { key: 'attention_items', label: 'Con atención', kind: 'ratio', value: 2, total: 8, detail: '1 parciales · 1 sin datos' },
    ],
  },
  wells: { rows: [] }, production_lines: { rows: [] }, washers: { rows: [] }, jarabes: { rows: [] },
  history: { wells: {}, lines: {}, washers: {}, jarabes: {} },
  shifts: [{ name: 'T1', schedule: '00:00–07:00', cut_status: 'Cierre definitivo', summary: { wells: { total_m3: 1 }, lines: { total_m3: 2 } }, flows: [] }],
};

test('web usa el contrato presentation y no reconstruye subtotal operativo visible', () => {
  assert.match(reports, /report\?\.presentation\?\.summary_cards/);
  assert.match(reports, /Con actividad/);
  assert.match(reports, /Con atención/);
  assert.doesNotMatch(reports, /Total validado operativo/);
});

test('las tablas visibles comparten nomenclatura estructural V2', () => {
  for (const label of ['Totalizador apertura', 'Totalizador al cierre', 'Estado de datos', 'Última lectura']) {
    assert.match(reports, new RegExp(label));
    assert.match(backend, new RegExp(label));
  }
});

test('backend publica orden canónico Pozos Líneas Lavadoras Jarabes', () => {
  const indexes = ['Pozos', 'Líneas', 'Lavadoras', 'Jarabes'].map((label) => backend.indexOf(`'label': '${label}'`));
  assert.ok(indexes.every((index) => index >= 0));
  assert.ok(indexes[0] < indexes[1] && indexes[1] < indexes[2] && indexes[2] < indexes[3]);
});

test('HTML incluye el mismo resumen base y anexo de turnos sin total operativo', () => {
  const html = buildDailyWaterReportHtml(report);
  assert.match(html, /Volumen bombeado de pozos/);
  assert.match(html, /Con actividad/);
  assert.match(html, /Con atención/);
  assert.match(html, /<h2>Turnos<\/h2>/);
  assert.match(html, /<th>Pozos<\/th><th>Líneas<\/th><th>Lavadoras<\/th><th>Jarabes<\/th><th>Estado<\/th>/);
  assert.doesNotMatch(html, /Total operativo/);
});

test('Vista HTML solicita histórico y turnos bajo demanda', () => {
  assert.match(reports, /includeHistory: true, includeShifts: true/);
});
