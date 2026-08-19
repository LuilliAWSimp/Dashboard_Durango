import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import useAutoRefresh from '../../../hooks/useAutoRefresh';
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
import type { DateRange, HistoryAggregation, WaterModuleHistoryResponse } from '../types';
import ChartEmptyState from './ChartEmptyState';
import PanelHeader from './PanelHeader';

const COLORS = ['#FE019A', '#FEE301', '#a78bfa', '#34d399', '#f59e0b', '#fb7185'];
const MODULE_LABELS: Record<ComparisonModule, string> = { well: 'Pozos', line: 'Líneas', flow: 'Flujos' };

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
  palette,
  items,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ComparisonRow }>;
  aggregation: HistoryAggregation;
  selected: OperationalIdentity[];
  metric: ComparisonMetric;
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
          return (
            <div className="module-history-tooltip-group" key={identity}>
              <div className="module-history-tooltip-title">
                <span className="chart-tooltip-dot" style={{ background: palette[Math.max(itemIndex, 0) % palette.length] }} />
                {item?.name || `Elemento ${identity}`}
              </div>
              <div className="module-history-tooltip-grid">
                {metric !== 'totalizer' ? <><span>Flujo promedio</span><strong>{row[`flow_${identity}`] == null ? 'Sin datos' : `${formatNumber(row[`flow_${identity}`])} ${item?.flowUnit || 'L/s'}`}</strong></> : null}
                {metric !== 'flow' ? <><span>Totalizador observado</span><strong>{row[`totalizer_${identity}`] == null ? 'Sin datos' : `${formatNumber(row[`totalizer_${identity}`])} m³`}</strong></> : null}
                {status === 'future_interval' ? <><span>Estado</span><strong>Intervalo futuro</strong></> : <>
                  <span>Promedio activo</span><strong>{meta?.flowActiveAvg == null ? 'Sin actividad' : `${formatNumber(meta.flowActiveAvg)} ${item?.flowUnit || 'L/s'}`}</strong>
                  <span>Mínimo / máximo</span><strong>{meta?.flowMin == null ? 'Sin datos' : `${formatNumber(meta.flowMin)} / ${formatNumber(meta.flowMax)} ${item?.flowUnit || 'L/s'}`}</strong>
                  <span>Tiempo activo</span><strong>{Number(meta?.activeMinutes || 0).toLocaleString('es-MX')} min</strong>
                  <span>Muestras</span><strong>{Number(meta?.samples || 0).toLocaleString('es-MX')}/{Number(meta?.samplesExpected || 0).toLocaleString('es-MX')}</strong>
                  <span>Cobertura</span><strong>{formatNumber(meta?.coveragePercent)}% · {String(meta?.coverageStatus || 'Sin registros')}</strong>
                  <span>Actividad</span><strong>{String(meta?.intervalState || (status === 'no_data' ? 'Sin registros' : status === 'zero_consumption' ? 'Apagado con datos' : status === 'partial_activity' ? 'Actividad parcial' : 'Activo'))}</strong>
                  <span>Validación</span><strong>{status === 'invalid_totalizer' ? 'Validación parcial' : status === 'no_data' || status === 'no_history' ? 'Sin volumen validado' : 'Validado'}</strong>
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
  const toggle = (identity: OperationalIdentity) => setSelected((current) => toggleComparisonSelection(current, identity));

  return (
    <section className="panel chart-panel fade-up module-history-panel operational-module-comparison">
      <PanelHeader
        title={panelTitle || (fixedModule ? `Comparativa de ${MODULE_LABELS[module].toLowerCase()}` : 'Histórico operativo por módulo')}
        subtitle={panelSubtitle || 'Compara flujo y totalizador observado; los huecos permanecen como ausencia de registro'}
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
          <label className="module-history-aggregation"><span>Agrupación</span><select value={aggregation} onChange={(event) => setAggregation(event.target.value as HistoryAggregation)}><option value="quarter_hour">15 minutos</option><option value="hourly">Por hora</option><option value="daily">Por día</option></select></label>
        </div>
      </div>
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
      {metric === 'both' ? <div className="status-pill module-metric-note">Flujo usa el eje izquierdo (L/s) y totalizador el eje derecho (m³).</div> : null}
      {refreshing ? <div className="status-pill auto-refresh-status">Actualizando comparativa…</div> : null}
      {error ? <div className="status-pill alert">{error}</div> : null}
      {loading && !data ? <div className="status-pill">Cargando comparativa...</div> : null}
      {rows.length && hasAny && visible.length ? (
        <ResponsiveContainer width="100%" height={410}>
          <LineChart data={rows} margin={{ top: 16, right: axes.showTotalizer ? 32 : 18, bottom: 18, left: 8 }}>
            <CartesianGrid stroke="rgba(56,189,248,.14)" strokeDasharray="3 3" />
            <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(value) => tick(Number(value), aggregation)} minTickGap={32} stroke="#b9e7ff" />
            {axes.showFlow ? <YAxis yAxisId="flow" stroke="#7dd3fc" width={62} tickFormatter={(value) => Number(value).toLocaleString('es-MX')} label={{ value: 'L/s', angle: -90, position: 'insideLeft', fill: '#7dd3fc' }} /> : null}
            {axes.showTotalizer ? <YAxis yAxisId="totalizer" orientation={axes.independentAxes ? 'right' : 'left'} stroke="#c4b5fd" width={72} tickFormatter={(value) => Number(value).toLocaleString('es-MX')} label={{ value: 'm³', angle: axes.independentAxes ? 90 : -90, position: axes.independentAxes ? 'insideRight' : 'insideLeft', fill: '#c4b5fd' }} /> : null}
            <Tooltip content={<ModuleTooltip aggregation={aggregation} selected={visible} metric={metric} palette={palette} items={activeItems} />} filterNull={false} wrapperStyle={{ zIndex: 60, pointerEvents: 'none' }} offset={16} />
            <Legend />
            <Line yAxisId={axes.showFlow ? 'flow' : 'totalizer'} dataKey="tooltipAnchor" stroke="transparent" dot={false} activeDot={false} legendType="none" isAnimationActive={false} />
            {visible.flatMap((identity) => {
              const itemIndex = activeItems.findIndex((item) => configuredComparisonIdentity(item) === identity);
              const series = filteredData?.series.find((item) => comparisonSeriesIdentity(item) === identity);
              const color = palette[Math.max(itemIndex, 0) % palette.length];
              const chartSeries = [];
              if (axes.showFlow) chartSeries.push(<Line key={`flow-${identity}`} yAxisId="flow" type="linear" dataKey={`flow_${identity}`} name={`${series?.name || identity} · Flujo (L/s)`} stroke={color} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />);
              if (axes.showTotalizer) chartSeries.push(<Line key={`totalizer-${identity}`} yAxisId="totalizer" type="linear" dataKey={`totalizer_${identity}`} name={`${series?.name || identity} · Totalizador (m³)`} stroke={color} strokeWidth={2.1} strokeDasharray="7 4" dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />);
              return chartSeries;
            })}
          </LineChart>
        </ResponsiveContainer>
      ) : !loading ? <ChartEmptyState message={!selected.length ? 'Selecciona al menos un elemento para comparar.' : hasFuture ? 'El rango incluye intervalos futuros; todavía no existe información operativa para ellos.' : 'Sin registros guardados para el periodo seleccionado.'} /> : null}
    </section>
  );
}
