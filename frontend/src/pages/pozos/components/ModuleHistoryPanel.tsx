import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DURANGO_CAPABILITIES } from '../../../config/plantCapabilities';
import { fetchWaterModuleHistory } from '../../../services/waterService';
import { recommendedHistoryAggregation } from '../dateUtils';
import type { DateRange, HistoryAggregation, WaterModuleHistoryResponse } from '../types';
import ChartEmptyState from './ChartEmptyState';
import PanelHeader from './PanelHeader';

const COLORS = ['#14b8ff', '#7dd3fc', '#a78bfa', '#34d399', '#f59e0b', '#fb7185'];
type ModuleKey = 'well' | 'line' | 'flow' | 'tank';
interface Props { range: DateRange; }
interface ChartRow extends Record<string, unknown> { timestamp: number; bucketStart: string; bucketEnd: string; tooltipAnchor: number; }
const moduleItems = { well: DURANGO_CAPABILITIES.wells, line: DURANGO_CAPABILITIES.lines, flow: DURANGO_CAPABILITIES.flows };

function intervalLabel(startValue: unknown, endValue: unknown, aggregation: HistoryAggregation): string {
  const start = new Date(String(startValue || '')); const end = new Date(String(endValue || ''));
  if (Number.isNaN(start.getTime())) return 'Periodo';
  const date = start.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (aggregation === 'daily') return date;
  const from = start.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const to = Number.isNaN(end.getTime()) ? '' : end.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${from}${to ? `–${to}` : ''}`;
}
function formatNumber(value: unknown): string { const parsed = Number(value); return Number.isFinite(parsed) ? parsed.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Sin datos'; }
function ModuleTooltip({ active, payload, aggregation, selected }: { active?: boolean; payload?: Array<{ payload?: ChartRow }>; aggregation: HistoryAggregation; selected: number[] }) {
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
          const item = catalog.find((entry) => entry.sensorId === sensorId);
          const flow = row[`flow_${sensorId}`];
          const status = String(meta?.status || 'no_data');
          const isFuture = status === 'future_interval';
          return (
            <div className="module-history-tooltip-group" key={sensorId}>
              <div className="module-history-tooltip-title"><span className="chart-tooltip-dot" style={{ background: COLORS[index % COLORS.length] }} />{item?.name || `Elemento ${sensorId}`}</div>
              {isFuture ? (
                <div className="module-history-tooltip-grid"><span>Estado</span><strong>Intervalo futuro</strong></div>
              ) : (
                <div className="module-history-tooltip-grid">
                  <span>Flujo promedio</span><strong>{flow == null ? 'Sin datos' : `${formatNumber(flow)} ${item?.flowUnit || 'L/s'}`}</strong>
                  <span>Mínimo / máximo</span><strong>{meta?.flowMin == null ? 'Sin datos' : `${formatNumber(meta.flowMin)} / ${formatNumber(meta.flowMax)} ${item?.flowUnit || 'L/s'}`}</strong>
                  <span>Muestras</span><strong>{Number(meta?.samples || 0).toLocaleString('es-MX')}</strong>
                  <span>Estado</span><strong>{status === 'no_data' ? 'Sin registros guardados' : status === 'invalid_totalizer' ? 'Dato en revisión' : status === 'zero_consumption' ? 'Sin consumo' : 'Con información'}</strong>
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
function tick(value: number, aggregation: HistoryAggregation): string { const date = new Date(value); if (aggregation === 'daily') return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' }); return date.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }

export default function ModuleHistoryPanel({ range }: Props) {
  const [module, setModule] = useState<ModuleKey>('well');
  const [aggregation, setAggregation] = useState<HistoryAggregation>(() => recommendedHistoryAggregation(range));
  const [data, setData] = useState<WaterModuleHistoryResponse | null>(null);
  const [selected, setSelected] = useState<number[]>(() => DURANGO_CAPABILITIES.wells.map((item) => item.sensorId));
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (module === 'tank') { setData(null); setError(''); return; } const items = moduleItems[module]; setSelected(items.map((item) => item.sensorId)); }, [module]);
  useEffect(() => { if (module === 'tank' || !range.startDate || !range.endDate) return undefined; let mounted = true; setLoading(true); setError(''); fetchWaterModuleHistory({ module, startDate: range.startDate, endDate: range.endDate, aggregation, forceRefresh: Boolean(range.refreshKey) }).then((response) => { if (mounted) setData(response); }).catch((reason: unknown) => { if (mounted) setError((reason as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'No fue posible consultar el histórico por módulo.'); }).finally(() => { if (mounted) setLoading(false); }); return () => { mounted = false; }; }, [module, range.startDate, range.endDate, range.refreshKey, aggregation]);
  const rows = useMemo<ChartRow[]>(() => { if (!data?.series?.length) return []; const byTime = new Map<string, ChartRow>(); data.series.forEach((series) => series.points.forEach((point) => { const key = point.bucket_start; const row = byTime.get(key) || { timestamp: new Date(point.bucket_start).getTime(), bucketStart: point.bucket_start, bucketEnd: point.bucket_end, tooltipAnchor: 0 }; row[`flow_${series.sensor_id}`] = point.flow_avg_lps; row[`meta_${series.sensor_id}`] = { flowMin: point.flow_min_lps, flowMax: point.flow_max_lps, samples: point.samples, status: point.data_status, discardedEvents: point.discarded_totalizer_events || 0, discardedVolume: point.discarded_volume_m3 || 0, hasDiscontinuities: Boolean(point.has_discontinuities) }; byTime.set(key, row); })); return [...byTime.values()].sort((a, b) => a.timestamp - b.timestamp); }, [data]);
  const visible = selected.filter((sensorId) => data?.series?.some((series) => series.sensor_id === sensorId)); const hasAny = data?.series?.some((series) => series.has_data) || false; const hasFuture = Boolean(data?.has_future_intervals || data?.series?.some((series) => series.has_future_intervals));
  const toggle = (sensorId: number) => setSelected((current) => current.includes(sensorId) ? current.filter((value) => value !== sensorId) : [...current, sensorId]);
  const activeItems = module === 'tank' ? [] : moduleItems[module];
  return <section className="panel chart-panel fade-up module-history-panel"><PanelHeader title="Histórico operativo por módulo" subtitle="Flujo promedio por elemento, sin interpolar periodos sin registros"/><div className="module-history-toolbar"><div className="module-history-tabs" role="tablist">{[['well','Pozos'],['line','Líneas'],['flow','Flujos auxiliares'],['tank','Tanques']].map(([value,label]) => <button type="button" role="tab" aria-selected={module===value} className={`module-history-tab ${module===value?'active':''}`} key={value} onClick={()=>setModule(value as ModuleKey)}>{label}{value==='tank'?<small>Pendiente</small>:null}</button>)}</div><label className="module-history-aggregation"><span>Agrupación</span><select value={aggregation} onChange={(event)=>setAggregation(event.target.value as HistoryAggregation)}><option value="quarter_hour">15 minutos</option><option value="hourly">Por hora</option><option value="daily">Por día</option></select></label></div>{module === 'tank' ? <ChartEmptyState message="Los niveles de tanques están pendientes de validación."/> : <><div className="module-history-sensors">{activeItems.map((item) => <button type="button" className={`sensor-chip ${selected.includes(item.sensorId)?'active':''}`} key={item.sensorId} onClick={()=>toggle(item.sensorId)}>{item.name}</button>)}</div>{error ? <div className="status-pill alert">{error}</div> : null}{loading && !data ? <div className="status-pill">Cargando histórico...</div> : null}{rows.length && hasAny && visible.length ? <ResponsiveContainer width="100%" height={390}><LineChart data={rows} margin={{ top: 16, right: 28, bottom: 18, left: 8 }}><CartesianGrid stroke="rgba(56,189,248,.14)" strokeDasharray="3 3"/><XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin','dataMax']} tickFormatter={(value)=>tick(Number(value),aggregation)} minTickGap={32} stroke="#b9e7ff"/><YAxis stroke="#b9e7ff" width={58}/><Tooltip content={<ModuleTooltip aggregation={aggregation} selected={visible}/>} filterNull={false} wrapperStyle={{ zIndex: 60, pointerEvents: 'none' }} offset={16}/><Legend/><Line dataKey="tooltipAnchor" stroke="transparent" dot={false} activeDot={false} legendType="none" isAnimationActive={false}/>{visible.map((sensorId,index)=>{const series=data?.series.find((item)=>item.sensor_id===sensorId);return <Line key={sensorId} type="linear" dataKey={`flow_${sensorId}`} name={`${series?.name || sensorId} (${series?.flow_unit || 'L/s'})`} stroke={COLORS[index%COLORS.length]} strokeWidth={2.4} dot={false} activeDot={{r:4}} connectNulls={false} isAnimationActive={false}/>;})}</LineChart></ResponsiveContainer> : !loading ? <ChartEmptyState message={hasFuture ? 'El rango incluye intervalos futuros; todavía no existe información operativa para ellos.' : 'Sin registros guardados para el periodo seleccionado.'}/> : null}</>}</section>;
}
