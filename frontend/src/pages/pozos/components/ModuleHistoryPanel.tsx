import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DURANGO_CAPABILITIES } from '../../../config/plantCapabilities';
import useAutoRefresh from '../../../hooks/useAutoRefresh';
import { downloadWaterModuleHistoryPdf } from '../../../services/waterModuleHistoryExportService';
import { downloadWaterThresholdDetail } from '../../../services/waterThresholdExportService';
import { downloadFiveMinuteModuleHistoryExcel, validateFiveMinuteExportRange } from '../../../services/waterFiveMinuteExportService';
import { fetchWaterHistory, fetchWaterModuleHistory } from '../../../services/waterService';
import { formatOperationalDateRange, rangeIncludesToday, recommendedHistoryAggregation } from '../dateUtils';
import { HISTORY_MAX_RANGE_DAYS, inclusiveHistoryRangeDays, supportedHistoryAggregation } from '../historyRangePolicy';
import { operationalVolumeAxisLabel, operationalVolumeLabel } from '../operationalTerminology';
import { withProgressiveVolume, type DetailVolumeDisplay } from '../detailHistoryVolume';
import { detailHistoryIntervalLabel, summarizeDetailHistory, type DetailHistoryPeriodSummary } from '../detailHistorySummary';
import { evaluateFlowThreshold, normalizeThreshold, summarizeFlowThreshold, thresholdValidation, type ThresholdDraft } from '../flowThreshold';
import {
  buildModuleComparisonRows,
  comparisonAxis,
  comparisonModuleItems,
  comparisonSeriesIdentity,
  configuredComparisonIdentity,
  toggleComparisonSelection,
  type ComparisonMetric,
  type ComparisonModule,
  type ComparisonRow,
  type OperationalIdentity,
} from '../moduleComparison';
import type { DateRange, FlexibleRecord, HistoryAggregation, WaterHistoryResponse, WaterModuleHistoryResponse } from '../types';
import ChartEmptyState from './ChartEmptyState';
import PanelHeader from './PanelHeader';

const COLORS = ['#FE019A', '#FEE301', '#a78bfa', '#34d399', '#f59e0b', '#fb7185'];
const TOTALIZER_COLORS = ['#2563eb', '#0ea5e9', '#7c3aed', '#0f766e', '#ea580c', '#be123c'];
const MODULE_LABELS: Record<ComparisonModule, string> = { well: 'Pozos', line: 'Líneas', flow: 'Flujos' };

type HistoryItem = {
  sensorId: number | null;
  operationalKey: string;
  name: string;
  flowUnit?: string;
};

export type OperationalHistoryView = 'well' | 'line' | 'washers' | 'jarabes';

const GLOBAL_HISTORY_VIEWS: Record<OperationalHistoryView, { module: ComparisonModule; label: string; items: HistoryItem[] }> = {
  well: { module: 'well', label: 'Pozos', items: DURANGO_CAPABILITIES.wells.map((item) => ({ ...item })) },
  line: { module: 'line', label: 'Líneas', items: DURANGO_CAPABILITIES.lines.map((item) => ({ ...item })) },
  washers: {
    module: 'flow',
    label: 'Lavadoras',
    items: DURANGO_CAPABILITIES.flows.filter((item) => item.operationalKey !== 'jarabes').map((item) => ({ ...item })),
  },
  jarabes: {
    module: 'flow',
    label: 'Jarabes',
    items: DURANGO_CAPABILITIES.flows.filter((item) => item.operationalKey === 'jarabes').map((item) => ({ ...item })),
  },
};
const AGGREGATION_LABELS: Record<HistoryAggregation, string> = {
  minute: '1 min',
  quarter_hour: '15 min',
  hourly: '1 h',
  daily: '1 día',
};

type TotalizerDisplay = 'delta' | 'absolute';
type ExportSeries = { key: string; name: string; metric: 'flow' | 'totalizer'; unit: string; color: string };

/** Último resultado *confirmado*. Es solo una referencia visual cuando cambia la consulta. */
type HistoryChartSnapshot = {
  response: WaterModuleHistoryResponse;
  identity: string;
  module: ComparisonModule;
  viewLabel: string;
  aggregation: HistoryAggregation;
  metric: ComparisonMetric;
  totalizerDisplay: TotalizerDisplay;
  volumeDisplay: DetailVolumeDisplay;
  flowOnly: boolean;
  items: HistoryItem[];
  selected: OperationalIdentity[];
  palette: string[];
};

interface Props {
  range: DateRange;
  fixedModule?: ComparisonModule;
  fixedView?: OperationalHistoryView;
  aggregation?: HistoryAggregation;
  onAggregationChange?: (value: HistoryAggregation) => void;
  colors?: string[];
  items?: HistoryItem[];
  panelTitle?: string;
  panelSubtitle?: string | null;
  className?: string;
  independentRange?: boolean;
  singleElement?: boolean;
  onPeriodSummaryChange?: (summary: DetailHistoryPeriodSummary) => void;
}

function intervalLabel(startValue: unknown, endValue: unknown, aggregation: HistoryAggregation): string {
  const start = new Date(String(startValue || ''));
  const end = new Date(String(endValue || ''));
  if (Number.isNaN(start.getTime())) return 'Periodo';
  const date = start.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (aggregation === 'daily') return date;
  const from = start.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const to = Number.isNaN(end.getTime()) ? '' : end.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${from}${to ? `–${to}` : ''}`;
}

function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Sin datos';
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : 'Sin datos';
}

function htmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function excelNumber(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : '';
}

function fileToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function downloadModuleHistoryExcel({
  rows,
  series,
  moduleLabel,
  metricLabel,
  aggregationLabel,
  startDate,
  endDate,
  selectedNames,
}: {
  rows: FlexibleRecord[];
  series: ExportSeries[];
  moduleLabel: string;
  metricLabel: string;
  aggregationLabel: string;
  startDate: string;
  endDate: string;
  selectedNames: string[];
}) {
  if (!rows.length || !series.length || !selectedNames.length) return;
  const metadata = [
    ['Planta', `Planta ${DURANGO_CAPABILITIES.plant}`],
    ['Módulo', moduleLabel],
    ['Métrica', metricLabel],
    ['Agrupación', aggregationLabel],
    ['Rango', formatOperationalDateRange({ startDate, endDate })],
    ['Elementos', selectedNames.join(', ')],
    ['Generado', new Date().toLocaleString('es-MX')],
  ];
  const columns = [
    { key: 'bucket', label: 'Inicio' },
    { key: 'label', label: 'Intervalo' },
    ...series.map((item) => ({ key: item.key, label: `${item.name} (${item.unit})` })),
  ];
  const metadataHtml = metadata.map(([label, value]) => `<tr><th>${htmlEscape(label)}</th><td>${htmlEscape(value)}</td></tr>`).join('');
  const headerHtml = columns.map((column) => `<th>${htmlEscape(column.label)}</th>`).join('');
  const dataHtml = rows.map((row) => `<tr>${columns.map((column) => {
    const value = row[column.key];
    return `<td>${column.key === 'bucket' || column.key === 'label' ? htmlEscape(value) : htmlEscape(excelNumber(value))}</td>`;
  }).join('')}</tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
body{font-family:Arial,sans-serif;color:#111827}h1{font-size:18px;margin:0 0 12px}table{border-collapse:collapse;margin-bottom:18px}th,td{border:1px solid #cbd5e1;padding:6px 8px;white-space:nowrap}th{background:#e0f2fe;font-weight:700}.meta th{text-align:left;background:#f1f5f9}
</style></head><body><h1>Histórico operativo por módulo</h1><table class="meta"><tbody>${metadataHtml}</tbody></table><table><thead><tr>${headerHtml}</tr></thead><tbody>${dataHtml}</tbody></table></body></html>`;
  const blob = new Blob(['\uFEFF', html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = ['historico-operativo-durango', fileToken(moduleLabel), fileToken(metricLabel), startDate, endDate, fileToken(aggregationLabel)].filter(Boolean).join('_') + '.xls';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function identityText(identity: OperationalIdentity): string {
  return String(identity);
}

function singleHistoryAsModuleResponse(history: WaterHistoryResponse): WaterModuleHistoryResponse {
  return {
    module: history.module,
    start_date: history.start_date,
    end_date: history.end_date,
    aggregation: history.aggregation,
    effective_end_at: typeof history.effective_end_at === 'string' ? history.effective_end_at : undefined,
    has_future_intervals: history.has_future_intervals,
    source_status: history.source_status,
    series: [{
      sensor_id: history.sensor_id,
      operational_key: history.operational_key,
      name: history.name,
      flow_unit: history.flow_unit,
      source_status: history.source_status,
      has_data: history.has_data,
      has_future_intervals: history.has_future_intervals,
      points: history.points,
    }],
  };
}

function seriesMatchesAllowed(series: { sensor_id?: number | null; operational_key?: string }, allowed: Set<string>) {
  if (!allowed.size) return true;
  const identity = comparisonSeriesIdentity(series);
  const key = String(series.operational_key || '').trim();
  return allowed.has(identityText(identity)) || (key ? allowed.has(key) : false);
}

function ModuleTooltip({
  active,
  payload,
  aggregation,
  selected,
  metric,
  totalizerDisplay,
  volumeDisplay,
  singleElement,
  flowOnly,
  palette,
  items,
  module,
  thresholdStates,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ComparisonRow }>;
  aggregation: HistoryAggregation;
  selected: OperationalIdentity[];
  metric: ComparisonMetric;
  totalizerDisplay: TotalizerDisplay;
  volumeDisplay: DetailVolumeDisplay;
  singleElement: boolean;
  flowOnly: boolean;
  palette: string[];
  items: HistoryItem[];
  module: ComparisonModule;
  thresholdStates?: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload.find((entry) => entry.payload)?.payload;
  if (!row) return null;
  return (
    <div className="chart-tooltip solid-tooltip pozos-tooltip module-history-tooltip">
      <div className="chart-tooltip-label">{intervalLabel(row.bucketStart, row.bucketEnd, aggregation)}</div>
      <div className="chart-tooltip-list">
        {selected.map((identity) => {
          const meta = row[`meta_${identity}`] as Record<string, unknown> | undefined;
          const itemIndex = items.findIndex((entry) => configuredComparisonIdentity(entry) === identity);
          const item = items[itemIndex];
          const status = String(meta?.status || 'no_data');
          const absolute = row[`totalizer_${identity}`];
          const delta = row[`totalizer_delta_${identity}`];
          const volume = row[`volume_${identity}`];
          const cumulativeVolume = row[`volume_cumulative_${identity}`];
          const totalizerValue = metric === 'both'
            ? (singleElement && volumeDisplay === 'cumulative' ? cumulativeVolume : volume)
            : totalizerDisplay === 'delta' ? delta : absolute;
          return (
            <div className="module-history-tooltip-group" key={identity}>
              <div className="module-history-tooltip-title">
                <span className="chart-tooltip-dot" style={{ background: palette[Math.max(itemIndex, 0) % palette.length] }} />
                {item?.name || `Elemento ${identity}`}
              </div>
              <div className="module-history-tooltip-grid">
                {metric !== 'totalizer' ? <><span>Flujo promedio</span><strong>{row[`flow_${identity}`] == null ? 'Sin datos' : `${formatNumber(row[`flow_${identity}`])} ${item?.flowUnit || 'L/s'}`}</strong></> : null}
                {metric !== 'flow' ? <>
                  <span>{metric === 'both' ? (singleElement && volumeDisplay === 'cumulative' ? 'Volumen acumulado del periodo' : operationalVolumeLabel(module, { scope: 'interval' })) : totalizerDisplay === 'delta' ? 'Variación del periodo' : 'Totalizador observado'}</span><strong>{totalizerValue == null ? 'Sin datos' : `${formatNumber(totalizerValue)} m³`}</strong>
                  {metric !== 'both' && totalizerDisplay === 'delta' ? <><span>Totalizador observado</span><strong>{absolute == null ? 'Sin datos' : `${formatNumber(absolute)} m³`}</strong></> : null}
                </> : null}
                {status === 'future_interval' ? <><span>Estado</span><strong>Intervalo futuro</strong></> : <>
                  <span>Promedio activo</span><strong>{meta?.flowActiveAvg == null ? 'Sin actividad' : `${formatNumber(meta.flowActiveAvg)} ${item?.flowUnit || 'L/s'}`}</strong>
                  <span>Mínimo / máximo</span><strong>{meta?.flowMin == null ? 'Sin datos' : `${formatNumber(meta.flowMin)} / ${formatNumber(meta.flowMax)} ${item?.flowUnit || 'L/s'}`}</strong>
                  <span>Tiempo activo</span><strong>{Number(meta?.activeMinutes || 0).toLocaleString('es-MX')} min</strong>
                  <span>Muestras</span><strong>{Number(meta?.samples || 0).toLocaleString('es-MX')}/{Number(meta?.samplesExpected || 0).toLocaleString('es-MX')}</strong>
                  {singleElement && thresholdStates ? <><span>Umbral</span><strong>{thresholdStates[row.bucketStart] || 'Sin lectura'}</strong></> : null}
                  <span>Cobertura</span><strong>{formatNumber(meta?.coveragePercent)}% · {String(meta?.coverageStatus || 'Sin registros')}</strong>
                  <span>Actividad</span><strong>{String(meta?.intervalState || (status === 'no_data' ? 'Sin registros' : status === 'zero_consumption' ? 'Apagado con datos' : status === 'partial_activity' ? 'Actividad parcial' : 'Activo'))}</strong>
                  {!flowOnly ? <><span>Validación</span><strong>{String(meta?.validation || (status === 'invalid_totalizer' ? 'Validación parcial' : status === 'no_data' || status === 'no_history' ? 'Sin volumen validado' : 'Validado'))}</strong></> : null}
                </>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function tick(value: number, aggregation: HistoryAggregation): string {
  const date = new Date(value);
  if (aggregation === 'daily') return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
  return date.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function localDateToken(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDateRange(startDate?: string, endDate?: string): { startDate: string; endDate: string } {
  const fallback = localDateToken();
  const start = String(startDate || fallback).slice(0, 10);
  const end = String(endDate || start).slice(0, 10);
  return start <= end ? { startDate: start, endDate: end } : { startDate: end, endDate: start };
}

export default function ModuleHistoryPanel({ range, fixedModule, fixedView, aggregation: controlledAggregation, onAggregationChange, colors, items, panelTitle, panelSubtitle, className = '', independentRange = false, singleElement = false, onPeriodSummaryChange }: Props) {
  const [globalView, setGlobalView] = useState<OperationalHistoryView>('well');
  const viewConfig = GLOBAL_HISTORY_VIEWS[globalView];
  const lockedViewConfig = fixedView ? GLOBAL_HISTORY_VIEWS[fixedView] : null;
  const module = lockedViewConfig?.module || fixedModule || viewConfig.module;
  const moduleDisplayLabel = lockedViewConfig?.label || (fixedModule ? MODULE_LABELS[module] : viewConfig.label);
  const lockedHistory = Boolean(fixedView || fixedModule);
  const initialLocalRange = normalizeDateRange(range.startDate, range.endDate);
  const [draftRange, setDraftRange] = useState(initialLocalRange);
  const [localRange, setLocalRange] = useState<DateRange>({ ...initialLocalRange, refreshKey: Number(range.refreshKey || 0) });
  const effectiveRange = independentRange ? localRange : range;
  const palette = colors?.length ? colors : COLORS;
  const activeItems = useMemo<HistoryItem[]>(() => {
    const source = items?.length
      ? items
      : lockedViewConfig
        ? lockedViewConfig.items
        : fixedModule
          ? comparisonModuleItems[module]
          : viewConfig.items;
    return source.map((item) => ({ ...item }));
  }, [items, lockedViewConfig, fixedModule, module, viewConfig]);
  const activeIdentities = useMemo(() => activeItems.map(configuredComparisonIdentity), [activeItems]);
  const allowedTokens = useMemo(() => new Set(activeItems.flatMap((item) => [String(configuredComparisonIdentity(item)), item.operationalKey])), [activeItems]);
  const [internalAggregation, setInternalAggregation] = useState<HistoryAggregation>(() => controlledAggregation || recommendedHistoryAggregation(effectiveRange));
  const aggregation = controlledAggregation || internalAggregation;
  const rangeDays = inclusiveHistoryRangeDays(String(effectiveRange.startDate || ''), String(effectiveRange.endDate || ''));
  const [metric, setMetric] = useState<ComparisonMetric>(() => singleElement ? 'both' : 'flow');
  const flowOnly = !singleElement && metric === 'flow';
  const [totalizerDisplay, setTotalizerDisplay] = useState<TotalizerDisplay>('delta');
  const [volumeDisplay, setVolumeDisplay] = useState<DetailVolumeDisplay>('interval');
  const [pdfExporting, setPdfExporting] = useState(false);
  const [fiveMinuteExporting, setFiveMinuteExporting] = useState(false);
  const [excelExporting, setExcelExporting] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState<ThresholdDraft>({ enabled: false, direction: 'below', basis: 'extreme', minText: '', maxText: '' });
  const [data, setData] = useState<WaterModuleHistoryResponse | null>(null);
  const [lastChart, setLastChart] = useState<HistoryChartSnapshot | null>(null);
  const [selected, setSelected] = useState<OperationalIdentity[]>(() => activeIdentities);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [historyJobStatus, setHistoryJobStatus] = useState('');
  const [error, setError] = useState('');
  const [resolvedQueryIdentity, setResolvedQueryIdentity] = useState('');
  const dataRef = useRef<WaterModuleHistoryResponse | null>(null);
  const requestIdRef = useRef(0);
  const inFlightIdentityRef = useRef('');
  const appliedRefreshKeyRef = useRef(Number(effectiveRange.refreshKey || 0));
  const lastResolvedIdentityRef = useRef('');

  const singleIdentity = singleElement && activeIdentities.length === 1 ? activeIdentities[0] : null;
  const queryIdentity = `${module}:${singleIdentity === null ? 'module' : identityText(singleIdentity)}:${effectiveRange.startDate}:${effectiveRange.endDate}:${aggregation}:${flowOnly ? 'flow' : 'complete'}`;

  useEffect(() => { dataRef.current = data; }, [data]);
  // El detalle individual conserva su aislamiento estricto entre sensores.
  // Solo el histórico modular puede mostrar temporalmente la gráfica anterior.
  useEffect(() => {
    if (!singleElement) return;
    setData(null);
    setLastChart(null);
    dataRef.current = null;
    setResolvedQueryIdentity('');
    lastResolvedIdentityRef.current = '';
  }, [singleElement, module, singleIdentity]);

  useEffect(() => {
    setSelected(activeIdentities);
  }, [activeIdentities]);

  // Si se cambia la selección mientras se observa la gráfica vigente,
  // la instantánea conserva exactamente los elementos visibles al consultarla después.
  useEffect(() => {
    if (lastChart?.identity !== queryIdentity) return;
    if (lastChart.selected.length === selected.length && lastChart.selected.every((identity, index) => identity === selected[index])) return;
    setLastChart((previous) => previous?.identity === queryIdentity ? { ...previous, selected: [...selected] } : previous);
  }, [lastChart, queryIdentity, selected]);

  const setAggregation = (value: HistoryAggregation) => {
    if (onAggregationChange) onAggregationChange(value);
    else setInternalAggregation(value);
  };

  const applyIndependentRange = () => {
    const next = normalizeDateRange(draftRange.startDate, draftRange.endDate);
    const supported = supportedHistoryAggregation(aggregation, next.startDate, next.endDate);
    if (supported !== aggregation) setAggregation(supported);
    setDraftRange(next);
    setLocalRange({ ...next, refreshKey: Date.now() });
  };

  const resetIndependentRange = () => {
    const today = localDateToken();
    const next = { startDate: today, endDate: today };
    setDraftRange(next);
    if (!controlledAggregation) setInternalAggregation('hourly');
    setLocalRange({ ...next, refreshKey: Date.now() });
  };

  const load = useCallback(async (forceRefresh = false, background = false) => {
    if (!effectiveRange.startDate || !effectiveRange.endDate) return;
    const identity = queryIdentity;
    if (inFlightIdentityRef.current === identity) return;
    inFlightIdentityRef.current = identity;
    const requestId = ++requestIdRef.current;
    // En consultas distintas se mantiene exclusivamente la última gráfica validada,
    // identificada con sus propias fechas/métrica. Nunca alimenta KPI ni exportaciones.
    const hasCurrentData = lastResolvedIdentityRef.current === identity && Boolean(dataRef.current);
    if (!hasCurrentData) {
      setLoading(true);
    } else {
      // Incluso Actualizar manualmente debe mostrar que hay una consulta en curso.
      setRefreshing(true);
    }
    setHistoryJobStatus('');
    if (!background) setError('');
    try {
      const response = singleIdentity === null
        ? await fetchWaterModuleHistory({
            module,
            startDate: String(effectiveRange.startDate),
            endDate: String(effectiveRange.endDate),
            aggregation,
            forceRefresh,
            flowOnly,
            onStatus: (status: string) => {
              if (requestId === requestIdRef.current) setHistoryJobStatus(status);
            },
          })
        : singleHistoryAsModuleResponse(await fetchWaterHistory({
            module,
            sensorId: singleIdentity,
            startDate: String(effectiveRange.startDate),
            endDate: String(effectiveRange.endDate),
            aggregation,
            forceRefresh,
          }));
      if (requestId !== requestIdRef.current) return;
      setData(response);
      lastResolvedIdentityRef.current = identity;
      setResolvedQueryIdentity(identity);
      setLastChart({
        response,
        identity,
        module,
        viewLabel: moduleDisplayLabel,
        aggregation,
        metric,
        totalizerDisplay,
        volumeDisplay,
        flowOnly,
        items: activeItems.map((item) => ({ ...item })),
        selected: [...selected],
        palette: [...palette],
      });
      setError('');
    } catch (reason: unknown) {
      if (requestId !== requestIdRef.current) return;
      const failure = reason as { code?: string; response?: { status?: number; data?: { detail?: string } }; message?: string };
      setError(failure.response?.data?.detail || (failure.code === 'ECONNABORTED'
        ? 'La comunicación con el servidor agotó el tiempo de espera. Intenta actualizar.'
        : failure.message || 'No fue posible consultar el histórico operativo.'));
    } finally {
      if (requestId === requestIdRef.current) { setLoading(false); setRefreshing(false); setHistoryJobStatus(''); }
      if (inFlightIdentityRef.current === identity) inFlightIdentityRef.current = '';
    }
  }, [module, moduleDisplayLabel, singleIdentity, queryIdentity, effectiveRange.startDate, effectiveRange.endDate, aggregation, flowOnly]);

  useEffect(() => {
    const refreshKey = Number(effectiveRange.refreshKey || 0);
    const manualRefresh = refreshKey !== appliedRefreshKeyRef.current;
    appliedRefreshKeyRef.current = refreshKey;
    void load(manualRefresh, false);
  }, [load, effectiveRange.refreshKey]);
  useAutoRefresh(rangeIncludesToday(effectiveRange), () => { void load(false, true); });

  const filteredData = useMemo<WaterModuleHistoryResponse | null>(() => {
    if (!data || resolvedQueryIdentity !== queryIdentity) return null;
    return { ...data, series: data.series.filter((series) => seriesMatchesAllowed(series, allowedTokens)) };
  }, [data, allowedTokens, resolvedQueryIdentity, queryIdentity]);
  const currentQueryIdentity = queryIdentity;
  const detailSeries = singleElement ? filteredData?.series?.[0] : undefined;
  const thresholdError = singleElement ? thresholdValidation(thresholdDraft) : '';
  const threshold = useMemo(() => normalizeThreshold(thresholdDraft), [thresholdDraft]);
  const thresholdSummary = useMemo(() => summarizeFlowThreshold(detailSeries?.points || [], threshold), [detailSeries?.points, threshold]);
  const thresholdStates = useMemo(() => threshold.enabled ? Object.fromEntries((detailSeries?.points || []).map((point) => [point.bucket_start, evaluateFlowThreshold(point, threshold)])) : undefined, [detailSeries?.points, threshold]);
  const detailPeriodSummary = useMemo(() => summarizeDetailHistory(detailSeries?.points || []), [detailSeries?.points]);
  const detailPeriodInterval = useMemo(
    () => detailHistoryIntervalLabel(detailSeries?.points || [], effectiveRange),
    [detailSeries?.points, effectiveRange.startDate, effectiveRange.endDate],
  );
  const detailPeriodLoading = Boolean(singleElement && (loading || resolvedQueryIdentity !== currentQueryIdentity));

  useEffect(() => {
    if (!singleElement || !onPeriodSummaryChange || !activeIdentities.length) return;
    onPeriodSummaryChange({
      identity: activeIdentities[0],
      loading: detailPeriodLoading,
      intervalLabel: detailPeriodInterval,
      flowAverage: detailPeriodLoading ? null : detailPeriodSummary.flowAverage,
      volumeM3: detailPeriodLoading ? null : detailPeriodSummary.volumeM3,
      error: detailPeriodLoading ? '' : error,
    });
  }, [
    activeIdentities,
    detailPeriodInterval,
    detailPeriodLoading,
    detailPeriodSummary.flowAverage,
    detailPeriodSummary.volumeM3,
    error,
    onPeriodSummaryChange,
    singleElement,
  ]);
  // La vista anterior tiene parámetros propios: jamás se reinterpreta su serie de
  // solo flujo como si incluyera volumen ni se etiqueta con las fechas nuevas.
  const isPreviousChart = !singleElement && Boolean(lastChart && lastChart.identity !== queryIdentity);
  const chartData = isPreviousChart && lastChart ? lastChart.response : filteredData;
  const chartItems = isPreviousChart && lastChart ? lastChart.items : activeItems;
  const chartModule = isPreviousChart && lastChart ? lastChart.module : module;
  const chartMetric = isPreviousChart && lastChart ? lastChart.metric : metric;
  const chartAggregation = isPreviousChart && lastChart ? lastChart.aggregation : aggregation;
  const chartFlowOnly = isPreviousChart && lastChart ? lastChart.flowOnly : flowOnly;
  const chartTotalizerDisplay = isPreviousChart && lastChart ? lastChart.totalizerDisplay : totalizerDisplay;
  const chartVolumeDisplay = isPreviousChart && lastChart ? lastChart.volumeDisplay : volumeDisplay;
  const chartPalette = isPreviousChart && lastChart ? lastChart.palette : palette;
  const chartSelection = isPreviousChart && lastChart ? lastChart.selected : selected;
  const chartAllowedTokens = new Set(chartItems.flatMap((item) => [String(configuredComparisonIdentity(item)), item.operationalKey]));
  const chartFilteredData = chartData
    ? { ...chartData, series: chartData.series.filter((series) => seriesMatchesAllowed(series, chartAllowedTokens)) }
    : null;
  const chartRowsBase = useMemo(() => buildModuleComparisonRows(chartFilteredData), [chartData, chartItems]);
  const chartIdentity = singleElement && chartItems.length === 1 ? configuredComparisonIdentity(chartItems[0]) : null;
  const chartRows = useMemo(() => chartIdentity === null
    ? chartRowsBase
    : withProgressiveVolume(chartRowsBase, chartIdentity), [chartRowsBase, chartIdentity]);
  const chartVisible = chartSelection.filter((identity) => chartFilteredData?.series?.some((series) => comparisonSeriesIdentity(series) === identity));
  const chartHasData = chartFilteredData?.series?.some((series) => series.has_data) || false;
  const chartAxes = comparisonAxis(chartMetric);
  const chartEffectiveTotalizerDisplay = chartMetric === 'both' ? 'delta' : chartTotalizerDisplay;
  const chartTotalizerAxisLabel = chartMetric === 'both'
    ? (singleElement && chartVolumeDisplay === 'cumulative' ? 'Volumen acumulado (m³)' : operationalVolumeAxisLabel(chartModule))
    : chartEffectiveTotalizerDisplay === 'delta' ? 'Variación (m³)' : 'Totalizador (m³)';
  const chartThreshold = isPreviousChart ? { ...threshold, enabled: false } : threshold;
  const chartThresholdStates = isPreviousChart ? undefined : thresholdStates;
  const chartPending = loading || refreshing;

  const rows = useMemo(() => buildModuleComparisonRows(filteredData), [filteredData]);
  const progressiveIdentity = singleElement && activeIdentities.length === 1 ? activeIdentities[0] : null;
  const displayRows = useMemo(
    () => progressiveIdentity === null ? rows : withProgressiveVolume(rows, progressiveIdentity),
    [rows, progressiveIdentity],
  );
  const visible = selected.filter((identity) => filteredData?.series?.some((series) => comparisonSeriesIdentity(series) === identity));
  const hasAny = filteredData?.series?.some((series) => series.has_data) || false;
  const hasFuture = Boolean(filteredData?.has_future_intervals || filteredData?.series?.some((series) => series.has_future_intervals));
  const axes = comparisonAxis(metric);
  const effectiveTotalizerDisplay: TotalizerDisplay = metric === 'both' ? 'delta' : totalizerDisplay;
  const toggle = (identity: OperationalIdentity) => setSelected((current) => toggleComparisonSelection(current, identity));

  const exportSeries = useMemo<ExportSeries[]>(() => visible.flatMap((identity) => {
    const itemIndex = activeItems.findIndex((item) => configuredComparisonIdentity(item) === identity);
    const sourceSeries = filteredData?.series.find((item) => comparisonSeriesIdentity(item) === identity);
    const item = activeItems[itemIndex];
    const color = palette[Math.max(itemIndex, 0) % palette.length];
    const totalizerColor = TOTALIZER_COLORS[Math.max(itemIndex, 0) % TOTALIZER_COLORS.length];
    const result: ExportSeries[] = [];
    if (axes.showFlow) result.push({ key: `flow_${identity}`, name: `${sourceSeries?.name || item?.name || identity} · Flujo`, metric: 'flow', unit: item?.flowUnit || 'L/s', color, chart_type: 'line', axis: 'left' });
    if (axes.showTotalizer) result.push({
      key: metric === 'both'
        ? (singleElement && volumeDisplay === 'cumulative' ? `volume_cumulative_${identity}` : `volume_${identity}`)
        : effectiveTotalizerDisplay === 'delta' ? `totalizer_delta_${identity}` : `totalizer_${identity}`,
      name: `${sourceSeries?.name || item?.name || identity} · ${metric === 'both' ? (singleElement && volumeDisplay === 'cumulative' ? 'Volumen acumulado del periodo' : operationalVolumeLabel(module, { scope: 'period' })) : effectiveTotalizerDisplay === 'delta' ? 'Variación totalizador' : 'Totalizador'}`,
      metric: 'totalizer',
      unit: 'm³',
      color: totalizerColor,
      chart_type: metric === 'both' && (!singleElement || volumeDisplay === 'interval') ? 'bar' : 'line',
      axis: metric === 'both' ? 'right' : 'left',
    });
    return result;
  }), [visible, activeItems, filteredData, palette, axes.showFlow, axes.showTotalizer, effectiveTotalizerDisplay, metric, singleElement, volumeDisplay, module]);

  const exportRows = useMemo<FlexibleRecord[]>(() => displayRows.map((row) => {
    const output: FlexibleRecord = {
      bucket: row.bucketStart,
      label: intervalLabel(row.bucketStart, row.bucketEnd, aggregation),
    };
    exportSeries.forEach((series) => { output[series.key] = row[series.key]; });
    return output;
  }), [displayRows, exportSeries, aggregation]);
  const selectedItems = activeItems.filter((item) => visible.includes(configuredComparisonIdentity(item)));
  const selectedNames = selectedItems.map((item) => item.name);
  const selectedElementIds = selectedItems.map((item) => item.sensorId ?? item.operationalKey);
  const exportDisabled = !exportRows.length || !exportSeries.length || !selectedNames.length;
  const thresholdExportDisabled = exportDisabled || Boolean(thresholdDraft.enabled && thresholdError);
  const thresholdSensorId = selectedElementIds.length === 1 ? selectedElementIds[0] : null;
  const metricLabel = metric === 'flow'
    ? 'Flujo'
    : metric === 'totalizer'
      ? `Totalizador · ${effectiveTotalizerDisplay === 'delta' ? 'Variación del periodo' : 'Valor absoluto'}`
      : singleElement
        ? `Ambos · ${volumeDisplay === 'cumulative' ? 'Volumen acumulado progresivo' : 'Volumen por intervalo'}`
        : 'Ambos';

  const exportExcel = async () => {
    if (thresholdExportDisabled || excelExporting) return;
    if (singleElement && threshold.enabled && thresholdSensorId !== null) {
      setExcelExporting(true);
      try {
        await downloadWaterThresholdDetail('excel', {
          module, sensorId: thresholdSensorId, startDate: String(effectiveRange.startDate),
          endDate: String(effectiveRange.endDate), aggregation, config: threshold,
        });
      } catch (reason: unknown) {
        setError((reason as { response?: { data?: { detail?: string } } })?.response?.data?.detail || (reason instanceof Error ? reason.message : 'No fue posible generar el Excel con umbrales.'));
      } finally {
        setExcelExporting(false);
      }
      return;
    }
    downloadModuleHistoryExcel({
      rows: exportRows,
      series: exportSeries,
      moduleLabel: moduleDisplayLabel,
      metricLabel,
      aggregationLabel: AGGREGATION_LABELS[aggregation],
      startDate: String(filteredData?.start_date || effectiveRange.startDate || ''),
      endDate: String(filteredData?.end_date || effectiveRange.endDate || ''),
      selectedNames,
    });
  };

  const exportPdf = async () => {
    if (thresholdExportDisabled || pdfExporting) return;
    setPdfExporting(true);
    try {
      if (singleElement && threshold.enabled && thresholdSensorId !== null) {
        await downloadWaterThresholdDetail('pdf', {
          module, sensorId: thresholdSensorId, startDate: String(effectiveRange.startDate),
          endDate: String(effectiveRange.endDate), aggregation, config: threshold,
        });
      } else await downloadWaterModuleHistoryPdf({
        module_label: moduleDisplayLabel,
        metric_label: metricLabel,
        aggregation_label: AGGREGATION_LABELS[aggregation],
        start_date: String(filteredData?.start_date || effectiveRange.startDate || ''),
        end_date: String(filteredData?.end_date || effectiveRange.endDate || ''),
        range_label: formatOperationalDateRange({
          startDate: String(filteredData?.start_date || effectiveRange.startDate || ''),
          endDate: String(filteredData?.end_date || effectiveRange.endDate || ''),
        }),
        selected_names: selectedNames,
        rows: exportRows,
        series: exportSeries,
        left_axis_label: axes.showFlow ? 'Flujo (L/s)' : totalizerAxisLabel,
        right_axis_label: axes.independentAxes ? totalizerAxisLabel : undefined,
      });
    } catch (reason: unknown) {
      setError((reason as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'No fue posible generar el PDF del histórico.');
    } finally {
      setPdfExporting(false);
    }
  };

  const exportFiveMinuteExcel = async () => {
    if (fiveMinuteExporting) return;
    const startDate = String(filteredData?.start_date || effectiveRange.startDate || '');
    const endDate = String(filteredData?.end_date || effectiveRange.endDate || '');
    const validation = validateFiveMinuteExportRange(startDate, endDate);
    if (validation) {
      setError(validation);
      return;
    }
    if (!selectedElementIds.length) {
      setError('Selecciona al menos un elemento para exportar.');
      return;
    }
    setFiveMinuteExporting(true);
    setError('');
    try {
      await downloadFiveMinuteModuleHistoryExcel({
        module,
        elementIds: selectedElementIds,
        startDate,
        endDate,
        viewLabel: moduleDisplayLabel,
      });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'No fue posible generar el Excel de 5 minutos.');
    } finally {
      setFiveMinuteExporting(false);
    }
  };

  const totalizerAxisLabel = metric === 'both'
    ? (singleElement && volumeDisplay === 'cumulative' ? 'Volumen acumulado (m³)' : operationalVolumeAxisLabel(module))
    : effectiveTotalizerDisplay === 'delta' ? 'Variación (m³)' : 'Totalizador (m³)';

  return (
    <section className={`panel chart-panel fade-up module-history-panel operational-module-comparison operational-history-panel operational-history-${fixedView || (fixedModule ? module : globalView)} ${className}`.trim()}>
      <PanelHeader
        eyebrow={lockedHistory ? `Histórico operativo · ${moduleDisplayLabel}` : 'Histórico operativo global'}
        title={panelTitle || (lockedHistory ? moduleDisplayLabel : 'Módulos de agua')}
        subtitle={panelSubtitle === null ? undefined : (panelSubtitle || (lockedHistory ? `Consulta ${moduleDisplayLabel.toLowerCase()} con el mismo motor histórico del Resumen.` : 'Consulta Pozos, Líneas, Lavadoras y Jarabes desde un único histórico.'))}
      />
      {independentRange ? (
        <div className="module-history-range-panel" aria-label={lockedHistory ? `Fechas del histórico de ${moduleDisplayLabel}` : 'Fechas del histórico global'}>
          <div className="module-history-range-fields">
            <label><span>Desde</span><input type="date" value={draftRange.startDate} onChange={(event) => setDraftRange((current) => ({ ...current, startDate: event.target.value }))} /></label>
            <label><span>Hasta</span><input type="date" value={draftRange.endDate} onChange={(event) => setDraftRange((current) => ({ ...current, endDate: event.target.value }))} /></label>
          </div>
          <div className="module-history-range-actions">
            <button type="button" className="primary-action" onClick={applyIndependentRange}>Actualizar</button>
            <button type="button" className="ghost-action" onClick={resetIndependentRange}>Restablecer</button>
          </div>
          <span className="module-history-range-label">{formatOperationalDateRange(effectiveRange)}</span>
        </div>
      ) : null}
      <div className="module-history-toolbar">
        {!lockedHistory ? <div className="module-history-tabs" role="tablist">
          {(Object.keys(GLOBAL_HISTORY_VIEWS) as OperationalHistoryView[]).map((value) => {
            const option = GLOBAL_HISTORY_VIEWS[value];
            return <button type="button" role="tab" aria-selected={globalView === value} className={`module-history-tab ${globalView === value ? 'active' : ''}`} key={value} onClick={() => setGlobalView(value)}>{option.label}</button>;
          })}
        </div> : null}
        <div className="module-comparison-controls">
          <div className="module-metric-selector" role="group" aria-label="Métrica comparativa">
            {([['flow', 'Flujo'], ['totalizer', 'Totalizador'], ['both', 'Ambos']] as const).map(([value, label]) => (
              <button type="button" key={value} className={metric === value ? 'active' : ''} aria-pressed={metric === value} onClick={() => setMetric(value)}>{label}</button>
            ))}
          </div>
          <div className="module-history-export-actions">
            <button type="button" className="report-action-button module-history-excel-button" disabled={thresholdExportDisabled || excelExporting} onClick={() => void exportExcel()} title="Exporta exactamente los datos visibles de la gráfica."><FileSpreadsheet size={16} aria-hidden="true" /> Excel</button>
            <button type="button" className="report-action-button module-history-excel-button module-history-five-minute-button" disabled={isPreviousChart || !selectedElementIds.length || fiveMinuteExporting} onClick={() => void exportFiveMinuteExcel()} title="Exportación técnica independiente cada 5 minutos; máximo 3 días calendario."><FileSpreadsheet size={16} aria-hidden="true" /> {fiveMinuteExporting ? 'Generando...' : 'Excel 5 min'}</button>
            <button type="button" className="ghost-action report-action-button module-history-pdf-button" disabled={thresholdExportDisabled || pdfExporting} onClick={() => void exportPdf()} title="Genera un PDF con la misma serie visible."><FileText size={16} aria-hidden="true" /> {pdfExporting ? 'Generando...' : 'PDF'}</button>
          </div>
          <label className="module-history-aggregation"><span>Agrupación</span><select value={aggregation} onChange={(event) => setAggregation(event.target.value as HistoryAggregation)}><option value="minute" disabled={rangeDays > HISTORY_MAX_RANGE_DAYS.minute}>1 minuto</option><option value="quarter_hour" disabled={rangeDays > HISTORY_MAX_RANGE_DAYS.quarter_hour}>15 minutos</option><option value="hourly" disabled={rangeDays > HISTORY_MAX_RANGE_DAYS.hourly}>Por hora</option><option value="daily" disabled={rangeDays > HISTORY_MAX_RANGE_DAYS.daily}>Por día</option></select></label>
        </div>
      </div>
      {singleElement ? <div className="dgo-h02-threshold-panel" aria-label="Revisión de umbrales históricos de flujo">
        <label className="dgo-h02-threshold-toggle"><input type="checkbox" checked={thresholdDraft.enabled} onChange={(event) => { setThresholdDraft((draft) => ({ ...draft, enabled: event.target.checked })); if (event.target.checked && metric === 'totalizer') setMetric('both'); }} /> <strong>Revisar umbrales</strong><span>Consulta opcional · L/s</span></label>
        {thresholdDraft.enabled ? <>
          <div className="dgo-h02-threshold-fields">
            <label><span>Revisar</span><select aria-label="Sentido del umbral" value={thresholdDraft.direction} onChange={(event) => setThresholdDraft((draft) => ({ ...draft, direction: event.target.value as ThresholdDraft['direction'] }))}><option value="below">Por debajo de</option><option value="above">Por encima de</option><option value="both">Ambos límites</option></select></label>
            <label><span>Evaluar con</span><select aria-label="Criterio de evaluación" value={thresholdDraft.basis} onChange={(event) => setThresholdDraft((draft) => ({ ...draft, basis: event.target.value as ThresholdDraft['basis'] }))}><option value="extreme">Mín/Máx del intervalo</option><option value="average">Promedio del intervalo</option></select></label>
            {thresholdDraft.direction !== 'above' ? <label><span>Mínimo (L/s)</span><input aria-label="Límite mínimo L/s" type="number" min="0" step="any" value={thresholdDraft.minText} onChange={(event) => setThresholdDraft((draft) => ({ ...draft, minText: event.target.value }))} /></label> : null}
            {thresholdDraft.direction !== 'below' ? <label><span>Máximo (L/s)</span><input aria-label="Límite máximo L/s" type="number" min="0" step="any" value={thresholdDraft.maxText} onChange={(event) => setThresholdDraft((draft) => ({ ...draft, maxText: event.target.value }))} /></label> : null}
          </div>
          {thresholdError ? <p className="dgo-h02-threshold-error" role="alert">{thresholdError}</p> : null}
          {!thresholdError && !detailPeriodLoading ? <div className="dgo-h02-threshold-stats" aria-live="polite">
            <span><strong>{thresholdSummary.breached}</strong> intervalos fuera</span>
            <span><strong>{thresholdSummary.below}</strong> bajo mínimo</span>
            <span><strong>{thresholdSummary.above}</strong> sobre máximo</span>
            <span><strong>{thresholdSummary.within}</strong> dentro</span>
            <span><strong>{thresholdSummary.noReading}</strong> sin lectura</span>
          </div> : null}
          <p className="dgo-h02-threshold-note">Se evalúa cada intervalo, no el minuto exacto de la incidencia. No genera alarmas SCADA. Los límites no se guardan.</p>
        </> : null}
      </div> : null}
      {metric === 'totalizer' ? <div className="module-history-totalizer-control"><span>Visualización del totalizador</span><div className="module-metric-selector" role="group" aria-label="Visualización del totalizador"><button type="button" className={totalizerDisplay === 'delta' ? 'active' : ''} onClick={() => setTotalizerDisplay('delta')}>Variación del periodo</button><button type="button" className={totalizerDisplay === 'absolute' ? 'active' : ''} onClick={() => setTotalizerDisplay('absolute')}>Valor absoluto</button></div></div> : null}
      {singleElement && metric === 'both' ? <div className="module-history-totalizer-control operational-detail-volume-control"><span>Volumen</span><div className="module-metric-selector" role="group" aria-label="Modo de visualización del volumen"><button type="button" className={volumeDisplay === 'interval' ? 'active' : ''} aria-pressed={volumeDisplay === 'interval'} onClick={() => setVolumeDisplay('interval')} title="Muestra el volumen conciliado de cada intervalo de agrupación.">Por intervalo</button><button type="button" className={volumeDisplay === 'cumulative' ? 'active' : ''} aria-pressed={volumeDisplay === 'cumulative'} onClick={() => setVolumeDisplay('cumulative')} title="Acumula progresivamente sólo los volúmenes válidos dentro del periodo seleccionado.">Acumulado progresivo</button></div></div> : null}
      {metric === 'both' && !singleElement ? <div className="status-pill module-metric-note">Flujo se muestra como línea en el eje izquierdo y {operationalVolumeLabel(module, { scope: 'period' }).toLowerCase()} como barras en el eje derecho.</div> : null}
      {aggregation === 'minute' && !singleElement ? <div className="status-pill module-metric-note">La vista de 1 minuto admite un máximo de un día por consulta.</div> : null}
      {!singleElement ? <>
        <div className="module-selection-heading">
          <span>Elementos visibles</span>
          <div><button type="button" onClick={() => setSelected(activeIdentities)}>Seleccionar todos</button><button type="button" onClick={() => setSelected([])}>Deseleccionar todos</button></div>
        </div>
        <div className="module-history-sensors">
          {activeItems.map((item) => {
            const identity = configuredComparisonIdentity(item);
            const active = selected.includes(identity);
            return <button type="button" aria-pressed={active} className={`sensor-chip ${active ? 'active' : ''}`} key={identity} onClick={() => toggle(identity)}><span aria-hidden="true">{active ? '✓' : '○'}</span>{item.name}</button>;
          })}
        </div>
      </> : null}
      {excelExporting ? <div className="status-pill">Preparando Excel con umbrales…</div> : null}
      {isPreviousChart && lastChart ? <div className="dgo-h09-history-reference" role="status" aria-live="polite">
        <strong>Vista anterior · {lastChart.viewLabel} · {formatOperationalDateRange({ startDate: lastChart.response.start_date, endDate: lastChart.response.end_date })} · {AGGREGATION_LABELS[lastChart.aggregation]} · {lastChart.metric === 'both' ? 'Ambos' : lastChart.metric === 'flow' ? 'Flujo' : 'Totalizador'}</strong>
        <span>{chartPending ? 'La nueva consulta sigue en proceso. Esta gráfica es solo referencia y no corresponde a los controles actuales.' : 'El resultado solicitado no está disponible; se mantiene la última gráfica válida como referencia.'} PDF y Excel se habilitan cuando llegue el resultado solicitado.</span>
      </div> : null}
      {chartPending ? <div className="dgo-h09-history-progress" role="status" aria-live="polite">
        <span className="dgo-h09-spinner" aria-hidden="true" />
        {historyJobStatus === 'queued' ? 'Consulta SQL en cola…' :
          historyJobStatus === 'running' ? 'Consultando SQL Server y validando intervalos…' :
            'Preparando histórico operativo…'}
        {!isPreviousChart && chartHasData ? ' Se mantiene visible la gráfica actual.' : !chartHasData ? ' La gráfica aparecerá al terminar.' : ''}
      </div> : null}
      {error ? <div className="status-pill alert">{error}</div> : null}
      {chartRows.length && chartHasData && chartVisible.length ? (
        <div className={isPreviousChart ? 'dgo-h09-chart-previous' : 'dgo-h09-chart-current'} data-history-view={isPreviousChart ? 'previous' : 'current'}>
        <ResponsiveContainer width="100%" height={410}>
          <ComposedChart data={chartRows} margin={{ top: 16, right: chartAxes.showTotalizer ? 40 : 18, bottom: 18, left: 8 }}>
            <CartesianGrid stroke="rgba(56,189,248,.14)" strokeDasharray="3 3" />
            <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(value) => tick(Number(value), chartAggregation)} minTickGap={32} stroke="#b9e7ff" />
            {chartAxes.showFlow ? <YAxis yAxisId="flow" stroke="#7dd3fc" width={62} tickFormatter={(value) => Number(value).toLocaleString('es-MX')} label={{ value: 'L/s', angle: -90, position: 'insideLeft', fill: '#7dd3fc' }} /> : null}
            {chartAxes.showTotalizer ? <YAxis yAxisId="totalizer" orientation={chartAxes.independentAxes ? 'right' : 'left'} stroke="#c4b5fd" width={78} tickFormatter={(value) => Number(value).toLocaleString('es-MX')} label={{ value: chartTotalizerAxisLabel, angle: chartAxes.independentAxes ? 90 : -90, position: chartAxes.independentAxes ? 'insideRight' : 'insideLeft', fill: '#c4b5fd' }} /> : null}
            <Tooltip content={<ModuleTooltip aggregation={chartAggregation} selected={chartVisible} metric={chartMetric} totalizerDisplay={chartEffectiveTotalizerDisplay} volumeDisplay={chartVolumeDisplay} singleElement={singleElement} flowOnly={chartFlowOnly} palette={chartPalette} items={chartItems} module={chartModule} thresholdStates={chartThresholdStates} />} filterNull={false} allowEscapeViewBox={{ x: true, y: true }} wrapperStyle={{ zIndex: 120, pointerEvents: 'none' }} offset={16} />
            {singleElement && chartThreshold.enabled && chartAxes.showFlow && chartThreshold.direction !== 'above' && chartThreshold.minValue !== null ? <ReferenceLine yAxisId="flow" y={chartThreshold.minValue} stroke="#F59E0B" strokeWidth={1.8} strokeDasharray="6 4" label={{ value: `Mín. ${chartThreshold.minValue} L/s`, fill: '#F59E0B', fontSize: 11, position: 'insideTopRight' }} /> : null}
            {singleElement && chartThreshold.enabled && chartAxes.showFlow && chartThreshold.direction !== 'below' && chartThreshold.maxValue !== null ? <ReferenceLine yAxisId="flow" y={chartThreshold.maxValue} stroke="#FB7185" strokeWidth={1.8} strokeDasharray="6 4" label={{ value: `Máx. ${chartThreshold.maxValue} L/s`, fill: '#FB7185', fontSize: 11, position: 'insideBottomRight' }} /> : null}
            <Legend />
            <Line yAxisId={chartAxes.showFlow ? 'flow' : 'totalizer'} dataKey="tooltipAnchor" stroke="transparent" dot={false} activeDot={false} legendType="none" isAnimationActive={false} />
            {chartVisible.flatMap((identity) => {
              const itemIndex = chartItems.findIndex((item) => configuredComparisonIdentity(item) === identity);
              const series = chartFilteredData?.series.find((item) => comparisonSeriesIdentity(item) === identity);
              const color = chartPalette[Math.max(itemIndex, 0) % chartPalette.length];
              const totalizerColor = TOTALIZER_COLORS[Math.max(itemIndex, 0) % TOTALIZER_COLORS.length];
              const chartSeries = [];
              if (chartAxes.showFlow) chartSeries.push(<Line key={`flow-${identity}`} yAxisId="flow" type="linear" dataKey={`flow_${identity}`} name={`${series?.name || identity} · Flujo (L/s)`} stroke={color} strokeWidth={2.7} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />);
              if (chartAxes.showTotalizer && chartMetric === 'both' && (!singleElement || chartVolumeDisplay === 'interval')) chartSeries.push(<Bar key={`totalizer-bar-${identity}`} yAxisId="totalizer" dataKey={`volume_${identity}`} name={`${series?.name || identity} · ${operationalVolumeLabel(chartModule, { scope: 'period' })} (m³)`} fill={totalizerColor} fillOpacity={0.72} barSize={16} radius={[4, 4, 0, 0]} isAnimationActive={false} />);
              if (chartAxes.showTotalizer && chartMetric === 'both' && singleElement && chartVolumeDisplay === 'cumulative') chartSeries.push(<Line key={`volume-cumulative-${identity}`} yAxisId="totalizer" type="linear" dataKey={`volume_cumulative_${identity}`} name={`${series?.name || identity} · Volumen acumulado del periodo (m³)`} stroke={totalizerColor} strokeWidth={2.8} dot={chartRows.length <= 24 ? { r: 2.8 } : false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />);
              if (chartAxes.showTotalizer && chartMetric !== 'both') chartSeries.push(<Line key={`totalizer-${identity}-${chartEffectiveTotalizerDisplay}`} yAxisId="totalizer" type="linear" dataKey={chartEffectiveTotalizerDisplay === 'delta' ? `totalizer_delta_${identity}` : `totalizer_${identity}`} name={`${series?.name || identity} · ${chartEffectiveTotalizerDisplay === 'delta' ? 'Variación totalizador' : 'Totalizador'} (m³)`} stroke={totalizerColor} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />);
              return chartSeries;
            })}
          </ComposedChart>
        </ResponsiveContainer>
        </div>
      ) : !chartPending ? <ChartEmptyState message={!selected.length ? 'Selecciona al menos un elemento para comparar.' : hasFuture ? 'El rango incluye intervalos futuros; todavía no existe información operativa para ellos.' : 'Sin registros guardados para el periodo seleccionado.'} /> : null}
    </section>
  );
}
