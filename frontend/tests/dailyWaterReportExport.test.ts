import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDailyWaterReportHtml } from '../src/services/dailyWaterReportExportService.ts';
import { buildDailyWaterReportHtml as buildDailyWaterReportHtmlJs } from '../src/services/dailyWaterReportExportService.js';

function row(name: string, volume: number | null = 1) {
  return {
    name,
    flow: 0,
    flow_unit: 'L/s',
    opening_m3: 100,
    closing_m3: 101,
    validated_volume_m3: volume,
    has_discontinuities: false,
    samples: volume === null ? 0 : 15,
    activity: volume === null ? 'Sin registros guardados' : 'Con actividad en el periodo',
    communication: 'Actualizado',
    last_update: '2026-08-07T10:30:00',
  };
}

function history(names: string[]) {
  return {
    aggregation: 'quarter_hour',
    effective_end_at: '2026-08-07T10:37:00',
    series: names.map((name) => ({
      name,
      points: [
        { bucket_start: '2026-08-07T10:00:00', samples: 15, flow_avg_lps: 0 },
        { bucket_start: '2026-08-07T10:15:00', samples: 0, flow_avg_lps: null },
        { bucket_start: '2026-08-07T10:30:00', samples: 7, flow_avg_lps: 4 },
        { bucket_start: '2026-08-07T10:45:00', samples: 0, flow_avg_lps: null },
      ],
    })),
  };
}

const wells = ['Pozo 1', 'Pozo 2'];
const lines = ['Línea 1', 'Línea 3', 'Línea 4', 'Línea 5'];
const flows = ['Lavadora Línea 2', 'Lavadora Vidrio', 'Lavadora Ref Pet', 'Jarabes'];
const report = {
  title: 'Reporte Diario de Control Hídrico Durango',
  start_date: '2026-08-07',
  end_date: '2026-08-07',
  period_label: '07/08/2026',
  generated_at: '2026-08-07T10:37:00',
  summary: {
    well_validated_volume_m3: 2,
    line_validated_volume_m3: 4,
    flow_validated_volume_m3: 4,
    total_validated_operational_m3: 10,
    wells_active: 2,
    lines_active: 4,
    flows_active: 4,
    review_count: 0,
  },
  wells: { rows: wells.map((name) => row(name)) },
  production_lines: { rows: lines.map((name) => row(name)) },
  operational_flows: { rows: flows.map((name) => row(name)) },
  history: { wells: history(wells), lines: history(lines), flows: history(flows) },
};

test('HTML mantiene tabla y gráfica juntas en el orden Pozos, Líneas, Flujos', () => {
  const html = buildDailyWaterReportHtml(report);
  const wellsIndex = html.indexOf('<h2>Pozos</h2>');
  const linesIndex = html.indexOf('<h2>Líneas</h2>');
  const flowsIndex = html.indexOf('<h2>Flujos</h2>');
  assert.ok(wellsIndex > 0 && wellsIndex < linesIndex && linesIndex < flowsIndex);
  assert.ok(html.indexOf('Comportamiento de flujo · Pozos', wellsIndex) < linesIndex);
  assert.ok(html.indexOf('Comportamiento de flujo · Líneas', linesIndex) < flowsIndex);
  assert.ok(html.indexOf('Comportamiento de flujo · Flujos', flowsIndex) > flowsIndex);
});

test('HTML usa clasificación operativa y omite nombres técnicos', () => {
  const html = buildDailyWaterReportHtml(report);
  for (const name of [...wells, ...lines, ...flows]) assert.match(html, new RegExp(name));
  assert.doesNotMatch(html, /Tanques|FLOW_IN|sensor 2004|<td>Línea 2<\/td>/);
});

test('HTML conserva cero medido, huecos y excluye intervalos futuros', () => {
  const html = buildDailyWaterReportHtml(report);
  assert.match(html, /Cero:<\/strong> lectura válida/);
  assert.match(html, /Hueco:<\/strong> intervalo sin registros/);
  assert.doesNotMatch(html, /10:45/);
});

test('las implementaciones JS y TypeScript generan el mismo HTML', () => {
  assert.equal(buildDailyWaterReportHtmlJs(report), buildDailyWaterReportHtml(report));
});
