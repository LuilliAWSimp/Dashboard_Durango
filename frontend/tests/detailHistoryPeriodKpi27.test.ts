import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { detailHistoryIntervalLabel, summarizeDetailHistory } from '../src/pages/pozos/detailHistorySummary.ts';

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const point = (overrides: Record<string, unknown>) => ({
  sensor_id: 1001,
  bucket_start: '2026-09-25T00:00:00',
  bucket_end: '2026-09-25T00:15:00',
  aggregation: 'quarter_hour',
  samples: 0,
  flow_avg_lps: null,
  flow_min_lps: null,
  flow_max_lps: null,
  totalizer_open_m3: null,
  totalizer_close_m3: null,
  volume_m3: null,
  volume_reliable: false,
  data_status: 'no_data',
  ...overrides,
}) as any;

test('resumen del detalle pondera flujo por muestras y suma solo volume_m3 valido', () => {
  const summary = summarizeDetailHistory([
    point({ flow_avg_lps: 10, samples: 10, volume_m3: 5, data_status: 'operational' }),
    point({ bucket_start: '2026-09-25T00:15:00', bucket_end: '2026-09-25T00:30:00', flow_avg_lps: 20, samples: 30, volume_m3: null, data_status: 'partial_activity' }),
    point({ bucket_start: '2026-09-25T00:30:00', bucket_end: '2026-09-25T00:45:00', flow_avg_lps: 999, samples: 99, volume_m3: 999, data_status: 'future_interval' }),
    point({ bucket_start: '2026-09-25T00:45:00', bucket_end: '2026-09-25T01:00:00', flow_avg_lps: null, samples: 0, volume_m3: 0, data_status: 'zero_consumption' }),
  ]);

  assert.equal(summary.flowAverage, 17.5);
  assert.equal(summary.flowSamples, 40);
  assert.equal(summary.volumeM3, 5);
});

test('ausencia de volumen permanece null y cero valido permanece cero', () => {
  assert.equal(summarizeDetailHistory([point({ samples: 12, flow_avg_lps: 2 })]).volumeM3, null);
  assert.equal(summarizeDetailHistory([point({ volume_m3: 0, data_status: 'zero_consumption' })]).volumeM3, 0);
});

test('periodo explicito usa primer bucket y cierre del ultimo bucket no futuro', () => {
  const label = detailHistoryIntervalLabel([
    point({ bucket_start: '2026-09-25T00:00:00', bucket_end: '2026-09-25T00:15:00', data_status: 'operational' }),
    point({ bucket_start: '2026-09-25T00:15:00', bucket_end: '2026-09-25T00:30:00', data_status: 'operational' }),
    point({ bucket_start: '2026-09-26T00:00:00', bucket_end: '2026-09-26T00:15:00', data_status: 'future_interval' }),
  ] as any);
  assert.match(label, /^del /);
  assert.match(label, /25\/09\/2026/);
  assert.doesNotMatch(label, /26\/09\/2026/);
});

test('motor historico publica resumen solo del query actualmente resuelto', () => {
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(history, /onPeriodSummaryChange\?: \(summary: DetailHistoryPeriodSummary\) => void/);
  assert.match(history, /resolvedQueryIdentity !== currentQueryIdentity/);
  assert.match(history, /summarizeDetailHistory\(detailSeries\?\.points \|\| \[\]\)/);
  assert.match(history, /flowAverage: detailPeriodLoading \? null : detailPeriodSummary\.flowAverage/);
  assert.match(history, /volumeM3: detailPeriodLoading \? null : detailPeriodSummary\.volumeM3/);
});

test('cabecera del detalle muestra Periodo seleccionado y marca carga al cambiar rango o agrupacion', () => {
  const detail = read('src/pages/pozos/components/OperationalDetailSection.tsx');
  assert.match(detail, /<span>Periodo seleccionado<\/span><DetailHistoryPeriodMetric/);
  assert.match(detail, /markPeriodSummaryLoading\(\);[\s\S]*?current\.apply\(\)/);
  assert.match(detail, /markPeriodSummaryLoading\(\);\s*setHistoryAggregation\(value\)/);
  assert.match(detail, /onPeriodSummaryChange=\{setPeriodSummary\}/);
  assert.doesNotMatch(detail, /value=\{fmt\(item\?\.flow_active_avg\)\}/);
});

test('estilos del KPI de periodo viven en detalles css y no en global css', () => {
  const detailCss = read('src/styles/pages/detalles.css');
  const globalCss = read('src/styles/global.css');
  assert.match(detailCss, /Durango 27 · KPI del mismo periodo visible/);
  assert.match(detailCss, /\.detail-period-kpi-values/);
  assert.doesNotMatch(globalCss, /Durango 27/);
});
