import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DURANGO_CAPABILITIES } from '../../../config/plantCapabilities';
import useAutoRefresh from '../../../hooks/useAutoRefresh';
import { downloadWaterModuleHistoryPdf } from '../../../services/waterModuleHistoryExportService';
import { fetchWaterModuleHistory } from '../../../services/waterService';
import { rangeIncludesToday, recommendedHistoryAggregation } from '../dateUtils';
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
import type { DateRange, FlexibleRecord, HistoryAggregation, WaterModuleHistoryResponse } from '../types';
import ChartEmptyState from './ChartEmptyState';
import PanelHeader from './PanelHeader';

const COLORS = ['#FE019A', '#FEE301', '#a78bfa', '#34d399', '#f59e0b', '#fb7185'];
const MODULE_LABELS: Record<ComparisonModule, string> = { well: 'Pozos', line: 'Líneas', flow: 'Flujos' };
const AGGREGATION_LABELS: Record<HistoryAggregation, string> = {
  minute: '1 min',
  quarter_hour: '15 min',
  hourly: '1 h',
  daily: '1 día',
};

type TotalizerDisplay = 'delta' | 'absolute';
type ExportSeries = { key: string; name: string; metric: 'flow' | 'totalizer'; unit: string; color: string };

type HistoryItem = {
  sensorId: number | null;
  operationalKey: string;
  name: string;
  flowUnit?: string;
};

interface Props {
  range: DateRange;
  fixedModule?: ComparisonModule;
  aggregation?: HistoryAggregation;
  onAggregationChange?: (value: HistoryAggregation) => void;
  colors?: string[];
  items?: HistoryItem[];
  panelTitle?: string;
  panelSubtitle?: string;
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
    ['Rango', `${startDate} a ${endDate}`],
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
  palette,
  items,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ComparisonRow }>;
  aggregation: HistoryAggregation;
  selected: OperationalIdentity[];
  metric: ComparisonMetric;
  totalizerDisplay: TotalizerDisplay;
  palette: string[];
  items: HistoryItem[];
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
          const totalizerValue = totalizerDisplay === 'delta' ? delta : absolute;
          return (
            <div className="module-history-tooltip-group" key={identity}>
              <div className="module-history-tooltip-title">
                <span className="chart-tooltip-dot" style={{ background: palette[Math.max(itemIndex, 0) % palette.length] }} />
                {item?.name || `Elemento ${identity}`}
              </div>
              <div className="module-history-tooltip-grid">
                {metric !== 'totalizer' ? <><span>Flujo promedio</span><strong>{row[`flow_${identity}`] == null ? 'Sin datos' : `${formatNumber(row[`flow_${identity}`])} ${item?.flowUnit || 'L/s'}`}</strong></> : null}
                {metric !== 'flow' ? <>
                  <span>{totalizerDisplay === 'delta' ? 'Variación del periodo' : 'Totalizador observado'}</span><strong>{totalizerValue == null ? 'Sin datos' : `${formatNumber(totalizerValue)} m³`}</strong>
                  {totalizerDisplay === 'delta' ? <><span>Totalizador observado</span><strong>{absolute == null ? 'Sin datos' : `${formatNumber(absolute)} m³`}</strong></> : null}
                </> : null}
                {status === 'future_interval' ? <><span>Estado</span><strong>Intervalo futuro</strong></> : <>
                  <span>Promedio activo</span><strong>{meta?.flowActiveAvg == null ? 'Sin actividad' : `${formatNumber(meta.flowActiveAvg)} ${item?.flowUnit || 'L/s'}`}</strong>
                  <span>Mínimo / máximo</span><strong>{meta?.flowMin == null ? 'Sin datos' : `${formatNumber(meta.flowMin)} / ${formatNumber(meta.flowMax)} ${item?.flowUnit || 'L/s'}`}</strong>
                  <span>Tiempo activo</span><strong>{Number(meta?.activeMinutes || 0).toLocaleString('es-MX')} min</strong>
                  <span>Muestras</span><strong>{Number(meta?.samples || 0).toLocaleString('es-MX')}/{Number(meta?.samplesExpected || 0).toLocaleString('es-MX')}</strong>
                  <span>Cobertura</span><strong>{formatNumber(meta?.coveragePercent)}% · {String(meta?.coverageStatus || 'Sin registros')}</strong>
                  <span>Actividad</span><strong>{String(meta?.intervalState || (status === 'no_data' ? 'Sin registros' : status === 'zero_consumption' ? 'Apagado con datos' : status === 'partial_activity' ? 'Actividad parcial' : 'Activo'))}</strong>
                  <span>Validación</span><strong>{String(meta?.validation || (status === 'invalid_totalizer' ? 'Validación parcial' : status === 'no_data' || status === 'no_history' ? 'Sin volumen validado' : 'Validado'))}</strong>
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

export default function ModuleHistoryPanel({ range, fixedModule, aggregation: controlledAggregation, onAggregationChange, colors, items, panelTitle, panelSubtitle }: Props) {
  const [tabModule, setTabModule] = useState<ComparisonModule>(fixedModule || 'well');
  const module = fixedModule || tabModule;
  const palette = colors?.length ? colors : COLORS;
  const activeItems = useMemo<HistoryItem[]>(() => (items?.length ? items : comparisonModuleItems[module]).map((item) => ({ ...item })), [items, module]);
  const activeIdentities = useMemo(() => activeItems.map(configuredComparisonIdentity), [activeItems]);
  const allowedTokens = useMemo(() => new Set(activeItems.flatMap((item) => [String(configuredComparisonIdentity(item)), item.operationalKey])), [activeItems]);
  const [internalAggregation, setInternalAggregation] = useState<HistoryAggregation>(() => controlledAggregation || recommendedHistoryAggregation(range));
  const aggregation = controlledAggregation || internalAggregation;
  const [metric, setMetric] = useState<ComparisonMetric>('flow');
  const [totalizerDisplay, setTotalizerDisplay] = useState<TotalizerDisplay>('delta');
  const [pdfExporting, setPdfExporting] = useState(false);
  const [data, setData] = useState<WaterModuleHistoryResponse | null>(null);
  const [selected, setSelected] = useState<OperationalIdentity[]>(() => activeIdentities);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const dataRef = useRef<WaterModuleHistoryResponse | null>(null);
  const requestIdRef = useRef(0);
  const inFlightIdentityRef = useRef('');

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => {
    setData(null);
    dataRef.current = null;
    setSelected(activeIdentities);
  }, [module, activeIdentities]);

  const setAggregation = (value: HistoryAggregation) => {
    if (onAggregationChange) onAggregationChange(value);
    else setInternalAggregation(value);
  };

  const load = useCallback(async (forceRefresh = false, background = false) => {
    if (!range.startDate || !range.endDate) return;
    const identity = `${module}:${range.startDate}:${range.endDate}:${aggregation}`;
    if (inFlightIdentityRef.current === identity) return;
    inFlightIdentityRef.current = identity;
    const requestId = ++requestIdRef.current;
    if (!dataRef.current) setLoading(true); else if (background) setRefreshing(true);
    if (!background) setError('');
    try {
      const response = await fetchWaterModuleHistory({ module, startDate: range.startDate, endDate: range.endDate, aggregation, forceRefresh });
      if (requestId !== requestIdRef.current) return;
      setData(response);
      setError('');
    } catch (reason: unknown) {
      if (requestId !== requestIdRef.current) return;
      setError((reason as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'No fue posible consultar el histórico por módulo.');
    } finally {
      if (requestId === requestIdRef.current) { setLoading(false); setRefreshing(false); }
      if (inFlightIdentityRef.current === identity) inFlightIdentityRef.current = '';
    }
  }, [module, range.startDate, range.endDate, aggregation]);

  useEffect(() => { void load(Boolean(range.refreshKey), false); }, [load, range.refreshKey]);
  useAutoRefresh(rangeIncludesToday(range), () => { void load(true, true); });

  const filteredData = useMemo<WaterModuleHistoryResponse | null>(() => {
    if (!data) return null;
    return { ...data, series: data.series.filter((series) => seriesMatchesAllowed(series, allowedTokens)) };
  }, [data, allowedTokens]);
  const rows = useMemo(() => buildModuleComparisonRows(filteredData), [filteredData]);
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
    const result: ExportSeries[] = [];
    if (axes.showFlow) result.push({ key: `flow_${identity}`, name: `${sourceSeries?.name || item?.name || identity} · Flujo`, metric: 'flow', unit: item?.flowUnit || 'L/s', color });
    if (axes.showTotalizer) result.push({
      key: effectiveTotalizerDisplay === 'delta' ? `totalizer_delta_${identity}` : `totalizer_${identity}`,
      name: `${sourceSeries?.name || item?.name || identity} · ${effectiveTotalizerDisplay === 'delta' ? 'Variación totalizador' : 'Totalizador'}`,
      metric: 'totalizer',
      unit: 'm³',
      color,
    });
    return result;
  }), [visible, activeItems, filteredData, palette, axes.showFlow, axes.showTotalizer, effectiveTotalizerDisplay]);

  const exportRows = useMemo<FlexibleRecord[]>(() => rows.map((row) => {
    const output: FlexibleRecord = {
      bucket: row.bucketStart,
      label: intervalLabel(row.bucketStart, row.bucketEnd, aggregation),
    };
    exportSeries.forEach((series) => { output[series.key] = row[series.key]; });
    return output;
  }), [rows, exportSeries, aggregation]);
  const selectedNames = activeItems.filter((item) => visible.includes(configuredComparisonIdentity(item))).map((item) => item.name);
  const exportDisabled = !exportRows.length || !exportSeries.length || !selectedNames.length;
  const metricLabel = metric === 'flow' ? 'Flujo' : metric === 'totalizer' ? `Totalizador · ${effectiveTotalizerDisplay === 'delta' ? 'Variación del periodo' : 'Valor absoluto'}` : 'Ambos';

  const exportExcel = () => {
    if (exportDisabled) return;
    downloadModuleHistoryExcel({
      rows: exportRows,
      series: exportSeries,
      moduleLabel: MODULE_LABELS[module],
      metricLabel,
      aggregationLabel: AGGREGATION_LABELS[aggregation],
      startDate: String(filteredData?.start_date || range.startDate || ''),
      endDate: String(filteredData?.end_date || range.endDate || ''),
      selectedNames,
    });
  };

  const exportPdf = async () => {
    if (exportDisabled || pdfExporting) return;
    setPdfExporting(true);
    try {
      await downloadWaterModuleHistoryPdf({
        module_label: MODULE_LABELS[module],
        metric_label: metricLabel,
        aggregation_label: AGGREGATION_LABELS[aggregation],
        start_date: String(filteredData?.start_date || range.startDate || ''),
        end_date: String(filteredData?.end_date || range.endDate || ''),
        selected_names: selectedNames,
        rows: exportRows,
        series: exportSeries,
      });
    } catch (reason: unknown) {
      setError((reason as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'No fue posible generar el PDF del histórico.');
    } finally {
      setPdfExporting(false);
    }
  };

  const totalizerAxisLabel = effectiveTotalizerDisplay === 'delta' ? 'Variación (m³)' : 'Totalizador (m³)';

  return (
    <section className="panel chart-panel fade-up module-history-panel operational-module-comparison">
      <PanelHeader
        title={panelTitle || (fixedModule ? `Comparativa de ${MODULE_LABELS[module].toLowerCase()}` : 'Histórico operativo por módulo')}
        subtitle={panelSubtitle || 'Compara flujo y totalizador; los huecos permanecen como ausencia de registro'}
      />
      <div className="module-history-toolbar">
        {!fixedModule ? <div className="module-history-tabs" role="tablist">
          {([['well', 'Pozos'], ['line', 'Líneas'], ['flow', 'Flujos']] as const).map(([value, label]) => (
            <button type="button" role="tab" aria-selected={module === value} className={`module-history-tab ${module === value ? 'active' : ''}`} key={value} onClick={() => setTabModule(value)}>{label}</button>
          ))}
        </div> : null}
        <div className="module-comparison-controls">
          <div className="module-metric-selector" role="group" aria-label="Métrica comparativa">
            {([['flow', 'Flujo'], ['totalizer', 'Totalizador'], ['both', 'Ambos']] as const).map(([value, label]) => (
              <button type="button" key={value} className={metric === value ? 'active' : ''} aria-pressed={metric === value} onClick={() => setMetric(value)}>{label}</button>
            ))}
          </div>
          <div className="module-history-export-actions">
            <button type="button" className="report-action-button module-history-excel-button" disabled={exportDisabled} onClick={exportExcel} title="Exporta exactamente los datos visibles de la gráfica."><FileSpreadsheet size={16} aria-hidden="true" /> Excel</button>
            <button type="button" className="ghost-action report-action-button module-history-pdf-button" disabled={exportDisabled || pdfExporting} onClick={() => void exportPdf()} title="Genera un PDF con la misma serie visible."><FileText size={16} aria-hidden="true" /> {pdfExporting ? 'Generando...' : 'PDF'}</button>
          </div>
          <label className="module-history-aggregation"><span>Agrupación</span><select value={aggregation} onChange={(event) => setAggregation(event.target.value as HistoryAggregation)}><option value="minute">1 minuto</option><option value="quarter_hour">15 minutos</option><option value="hourly">Por hora</option><option value="daily">Por día</option></select></label>
        </div>
      </div>
      {metric === 'totalizer' ? <div className="module-history-totalizer-control"><span>Visualización del totalizador</span><div className="module-metric-selector" role="group" aria-label="Visualización del totalizador"><button type="button" className={totalizerDisplay === 'delta' ? 'active' : ''} onClick={() => setTotalizerDisplay('delta')}>Variación del periodo</button><button type="button" className={totalizerDisplay === 'absolute' ? 'active' : ''} onClick={() => setTotalizerDisplay('absolute')}>Valor absoluto</button></div></div> : null}
      {metric === 'both' ? <div className="status-pill module-metric-note">Flujo usa el eje izquierdo y el totalizador se muestra como variación del periodo en el eje derecho.</div> : null}
      {aggregation === 'minute' ? <div className="status-pill module-metric-note">La vista de 1 minuto admite un máximo de un día por consulta.</div> : null}
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
      {refreshing ? <div className="status-pill auto-refresh-status">Actualizando comparativa…</div> : null}
      {error ? <div className="status-pill alert">{error}</div> : null}
      {loading && !data ? <div className="status-pill">Cargando comparativa...</div> : null}
      {rows.length && hasAny && visible.length ? (
        <ResponsiveContainer width="100%" height={410}>
          <LineChart data={rows} margin={{ top: 16, right: axes.showTotalizer ? 40 : 18, bottom: 18, left: 8 }}>
            <CartesianGrid stroke="rgba(56,189,248,.14)" strokeDasharray="3 3" />
            <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(value) => tick(Number(value), aggregation)} minTickGap={32} stroke="#b9e7ff" />
            {axes.showFlow ? <YAxis yAxisId="flow" stroke="#7dd3fc" width={62} tickFormatter={(value) => Number(value).toLocaleString('es-MX')} label={{ value: 'L/s', angle: -90, position: 'insideLeft', fill: '#7dd3fc' }} /> : null}
            {axes.showTotalizer ? <YAxis yAxisId="totalizer" orientation={axes.independentAxes ? 'right' : 'left'} stroke="#c4b5fd" width={78} tickFormatter={(value) => Number(value).toLocaleString('es-MX')} label={{ value: totalizerAxisLabel, angle: axes.independentAxes ? 90 : -90, position: axes.independentAxes ? 'insideRight' : 'insideLeft', fill: '#c4b5fd' }} /> : null}
            <Tooltip content={<ModuleTooltip aggregation={aggregation} selected={visible} metric={metric} totalizerDisplay={effectiveTotalizerDisplay} palette={palette} items={activeItems} />} filterNull={false} allowEscapeViewBox={{ x: true, y: true }} wrapperStyle={{ zIndex: 120, pointerEvents: 'none' }} offset={16} />
            <Legend />
            <Line yAxisId={axes.showFlow ? 'flow' : 'totalizer'} dataKey="tooltipAnchor" stroke="transparent" dot={false} activeDot={false} legendType="none" isAnimationActive={false} />
            {visible.flatMap((identity) => {
              const itemIndex = activeItems.findIndex((item) => configuredComparisonIdentity(item) === identity);
              const series = filteredData?.series.find((item) => comparisonSeriesIdentity(item) === identity);
              const color = palette[Math.max(itemIndex, 0) % palette.length];
              const chartSeries = [];
              if (axes.showFlow) chartSeries.push(<Line key={`flow-${identity}`} yAxisId="flow" type="linear" dataKey={`flow_${identity}`} name={`${series?.name || identity} · Flujo (L/s)`} stroke={color} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />);
              if (axes.showTotalizer) chartSeries.push(<Line key={`totalizer-${identity}-${effectiveTotalizerDisplay}`} yAxisId="totalizer" type="linear" dataKey={effectiveTotalizerDisplay === 'delta' ? `totalizer_delta_${identity}` : `totalizer_${identity}`} name={`${series?.name || identity} · ${effectiveTotalizerDisplay === 'delta' ? 'Variación totalizador' : 'Totalizador'} (m³)`} stroke={color} strokeWidth={2.1} strokeDasharray="7 4" dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />);
              return chartSeries;
            })}
          </LineChart>
        </ResponsiveContainer>
      ) : !loading ? <ChartEmptyState message={!selected.length ? 'Selecciona al menos un elemento para comparar.' : hasFuture ? 'El rango incluye intervalos futuros; todavía no existe información operativa para ellos.' : 'Sin registros guardados para el periodo seleccionado.'} /> : null}
    </section>
  );
}
