import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DURANGO_CAPABILITIES } from '../../../config/plantCapabilities';
import useAutoRefresh from '../../../hooks/useAutoRefresh';
import { fetchWaterModuleHistory } from '../../../services/waterService';
import { isHistoryPointVisible, rangeIncludesToday, recommendedHistoryAggregation } from '../dateUtils';
import type { DateRange, HistoryAggregation, WaterModuleHistoryResponse } from '../types';
import ChartEmptyState from './ChartEmptyState';
import PanelHeader from './PanelHeader';

const COLORS = ['#14b8ff', '#7dd3fc', '#a78bfa', '#34d399', '#f59e0b', '#fb7185'];
type ModuleKey = 'well' | 'line' | 'flow';
type OperationalIdentity = number | string;
interface Props { range: DateRange; }
interface ChartRow extends Record<string, unknown> { timestamp: number; bucketStart: string; bucketEnd: string; tooltipAnchor: number; }
const moduleItems = { well: DURANGO_CAPABILITIES.wells, line: DURANGO_CAPABILITIES.lines, flow: DURANGO_CAPABILITIES.flows };

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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Sin datos';
}
function configuredIdentity(item: { sensorId: number | null; operationalKey: string }): OperationalIdentity { return item.sensorId ?? item.operationalKey; }
function seriesIdentity(item: { sensor_id?: number | null; operational_key?: string }): OperationalIdentity { return item.sensor_id ?? String(item.operational_key || ''); }
function ModuleTooltip({ active, payload, aggregation, selected }: { active?: boolean; payload?: Array<{ payload?: ChartRow }>; aggregation: HistoryAggregation; selected: OperationalIdentity[] }) {
  if (!active || !payload?.length) return null;
  const row = payload.find((entry) => entry.payload)?.payload;
  if (!row) return null;
  const catalog = [...DURANGO_CAPABILITIES.wells, ...DURANGO_CAPABILITIES.lines, ...DURANGO_CAPABILITIES.flows];
  return (
    <div className="chart-tooltip solid-tooltip pozos-tooltip module-history-tooltip">
      <div className="chart-tooltip-label">{intervalLabel(row.bucketStart, row.bucketEnd, aggregation)}</div>
      <div className="chart-tooltip-list">
        {selected.map((sensorId, index) => {
          const meta = row[`meta_${sensorId}`] as Record<string, unknown> | undefined;
          const item = catalog.find((entry) => configuredIdentity(entry) === sensorId);
          const flow = row[`flow_${sensorId}`];
          const status = String(meta?.status || 'no_data');
          return (
            <div className="module-history-tooltip-group" key={sensorId}>
              <div className="module-history-tooltip-title"><span className="chart-tooltip-dot" style={{ background: COLORS[index % COLORS.length] }} />{item?.name || `Elemento ${sensorId}`}</div>
              {status === 'future_interval' ? (
                <div className="module-history-tooltip-grid"><span>Estado</span><strong>Intervalo futuro</strong></div>
              ) : (
                <div className="module-history-tooltip-grid">
                  <span>Flujo promedio</span><strong>{flow == null ? 'Sin datos' : `${formatNumber(flow)} ${item?.flowUnit || 'L/s'}`}</strong>
                  <span>Promedio activo</span><strong>{meta?.flowActiveAvg == null ? 'Sin actividad' : `${formatNumber(meta.flowActiveAvg)} ${item?.flowUnit || 'L/s'}`}</strong>
                  <span>Mínimo / máximo</span><strong>{meta?.flowMin == null ? 'Sin datos' : `${formatNumber(meta.flowMin)} / ${formatNumber(meta.flowMax)} ${item?.flowUnit || 'L/s'}`}</strong>
                  <span>Tiempo activo</span><strong>{Number(meta?.activeMinutes || 0).toLocaleString('es-MX')} min</strong>
                  <span>Muestras</span><strong>{Number(meta?.samples || 0).toLocaleString('es-MX')}/{Number(meta?.samplesExpected || 0).toLocaleString('es-MX')}</strong>
                  <span>Cobertura</span><strong>{formatNumber(meta?.coveragePercent)}% · {String(meta?.coverageStatus || 'Sin registros')}</strong>
                  <span>Estado</span><strong>{String(meta?.intervalState || (status === 'no_data' ? 'Sin registros' : status === 'invalid_totalizer' ? 'Dato en revisión' : status === 'zero_consumption' ? 'Apagado con datos' : status === 'partial_activity' ? 'Actividad parcial' : 'Activo'))}</strong>
                  {Number(meta?.discardedEvents || 0) > 0 ? <><span>Eventos descartados</span><strong>{Number(meta?.discardedEvents).toLocaleString('es-MX')}</strong><span>Volumen descartado</span><strong>{formatNumber(meta?.discardedVolume)} m³</strong></> : null}
                </div>
              )}
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

export default function ModuleHistoryPanel({ range }: Props) {
  const [module, setModule] = useState<ModuleKey>('well');
  const [aggregation, setAggregation] = useState<HistoryAggregation>(() => recommendedHistoryAggregation(range));
  const [data, setData] = useState<WaterModuleHistoryResponse | null>(null);
  const [selected, setSelected] = useState<OperationalIdentity[]>(() => DURANGO_CAPABILITIES.wells.map(configuredIdentity));
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
    setSelected(moduleItems[module].map(configuredIdentity));
  }, [module]);

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

  useEffect(() => { load(Boolean(range.refreshKey), false); }, [load, range.refreshKey]);
  useAutoRefresh(rangeIncludesToday(range), () => load(true, true));

  const rows = useMemo<ChartRow[]>(() => {
    if (!data?.series?.length) return [];
    const byTime = new Map<string, ChartRow>();
    data.series.forEach((series) => series.points.forEach((point) => {
      const timestamp = new Date(point.bucket_start).getTime();
      if (!isHistoryPointVisible(point.bucket_start, point.data_status)) return;
      const key = point.bucket_start;
      const row = byTime.get(key) || { timestamp, bucketStart: point.bucket_start, bucketEnd: point.bucket_end, tooltipAnchor: 0 };
      const identity = seriesIdentity(series);
      row[`flow_${identity}`] = point.flow_avg_lps;
      row[`meta_${identity}`] = {
        flowMin: point.flow_min_lps,
        flowMax: point.flow_max_lps,
        flowActiveAvg: point.flow_active_avg_lps,
        activeMinutes: point.active_minutes,
        samples: point.samples,
        samplesExpected: point.samples_expected,
        coveragePercent: point.coverage_percent,
        coverageStatus: point.coverage_status,
        intervalState: point.interval_state,
        status: point.data_status,
        discardedEvents: point.discarded_totalizer_events || 0,
        discardedVolume: point.discarded_volume_m3 || 0,
        hasDiscontinuities: Boolean(point.has_discontinuities),
      };
      byTime.set(key, row);
    }));
    return [...byTime.values()].sort((a, b) => a.timestamp - b.timestamp);
  }, [data]);

  const visible = selected.filter((sensorId) => data?.series?.some((series) => seriesIdentity(series) === sensorId));
  const hasAny = data?.series?.some((series) => series.has_data) || false;
  const hasFuture = Boolean(data?.has_future_intervals || data?.series?.some((series) => series.has_future_intervals));
  const toggle = (sensorId: OperationalIdentity) => setSelected((current) => current.includes(sensorId) ? current.filter((value) => value !== sensorId) : [...current, sensorId]);
  const activeItems = moduleItems[module];

  return (
    <section className="panel chart-panel fade-up module-history-panel">
      <PanelHeader title="Histórico operativo por módulo" subtitle="Flujo promedio por elemento, sin interpolar periodos sin registros" />
      <div className="module-history-toolbar">
        <div className="module-history-tabs" role="tablist">
          {([['well', 'Pozos'], ['line', 'Líneas'], ['flow', 'Flujos']] as const).map(([value, label]) => (
            <button type="button" role="tab" aria-selected={module === value} className={`module-history-tab ${module === value ? 'active' : ''}`} key={value} onClick={() => setModule(value)}>{label}</button>
          ))}
        </div>
        <label className="module-history-aggregation"><span>Agrupación</span><select value={aggregation} onChange={(event) => setAggregation(event.target.value as HistoryAggregation)}><option value="quarter_hour">15 minutos</option><option value="hourly">Por hora</option><option value="daily">Por día</option></select></label>
      </div>
      {refreshing ? <div className="status-pill auto-refresh-status">Actualizando histórico visible…</div> : null}
      <>
        <div className="module-history-sensors">{activeItems.map((item) => { const identity = configuredIdentity(item); return <button type="button" className={`sensor-chip ${selected.includes(identity) ? 'active' : ''}`} key={identity} onClick={() => toggle(identity)}>{item.name}</button>; })}</div>
        {error ? <div className="status-pill alert">{error}</div> : null}
        {loading && !data ? <div className="status-pill">Cargando histórico...</div> : null}
        {rows.length && hasAny && visible.length ? (
          <ResponsiveContainer width="100%" height={390}>
            <LineChart data={rows} margin={{ top: 16, right: 28, bottom: 18, left: 8 }}>
              <CartesianGrid stroke="rgba(56,189,248,.14)" strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(value) => tick(Number(value), aggregation)} minTickGap={32} stroke="#b9e7ff" />
              <YAxis stroke="#b9e7ff" width={58} />
              <Tooltip content={<ModuleTooltip aggregation={aggregation} selected={visible} />} filterNull={false} wrapperStyle={{ zIndex: 60, pointerEvents: 'none' }} offset={16} />
              <Legend />
              <Line dataKey="tooltipAnchor" stroke="transparent" dot={false} activeDot={false} legendType="none" isAnimationActive={false} />
              {visible.map((sensorId, index) => { const series = data?.series.find((item) => seriesIdentity(item) === sensorId); return <Line key={sensorId} type="linear" dataKey={`flow_${sensorId}`} name={`${series?.name || sensorId} (${series?.flow_unit || 'L/s'})`} stroke={COLORS[index % COLORS.length]} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />; })}
            </LineChart>
          </ResponsiveContainer>
        ) : !loading ? <ChartEmptyState message={hasFuture ? 'El rango incluye intervalos futuros; todavía no existe información operativa para ellos.' : 'Sin registros guardados para el periodo seleccionado.'} /> : null}
      </>
    </section>
  );
}
