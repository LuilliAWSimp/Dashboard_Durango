import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import useAutoRefresh from '../../../hooks/useAutoRefresh';
import { fetchWellsMinuteFlow } from '../../../services/waterService';
import { isHistoryPointVisible, todayInputDate } from '../dateUtils';
import type { WellsMinuteFlowResponse } from '../types';
import ChartEmptyState from './ChartEmptyState';
import PanelHeader from './PanelHeader';

const COLORS: Record<number, string> = { 1001: '#14b8ff', 1051: '#a78bfa' };
interface MinuteRange { date: string; from: string; to: string; }
function defaultState(): MinuteRange { return { date: todayInputDate(), from: '00:00', to: '23:59' }; }
function format(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Sin datos'; }
function MinuteTooltip({ active, payload, selected, data }: { active?: boolean; payload?: Array<{ payload?: Record<string, unknown> }>; selected: number[]; data: WellsMinuteFlowResponse | null; }) {
  if (!active || !payload?.length) return null;
  const row = payload.find((entry) => entry.payload)?.payload;
  if (!row) return null;
  return <div className="chart-tooltip solid-tooltip pozos-tooltip minute-well-tooltip"><div className="chart-tooltip-label">{new Date(Number(row.timestamp)).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div><div className="chart-tooltip-list">{selected.map((sensorId) => { const series = data?.series.find((item) => item.sensor_id === sensorId); const value = row[`flow_${sensorId}`]; const status = String(row[`status_${sensorId}`] || 'no_data'); return <div className="chart-tooltip-row" key={sensorId}><span className="chart-tooltip-dot" style={{ background: COLORS[sensorId] }} /><span className="chart-tooltip-name">{series?.name || sensorId}</span><span className="chart-tooltip-value">{status === 'future_interval' ? 'Intervalo futuro' : value == null ? 'Sin datos' : `${format(value)} ${series?.flow_unit || 'L/s'}`}</span></div>; })}</div></div>;
}

export default function WellsMinuteFlowPanel() {
  const initial = useMemo(defaultState, []);
  const [draft, setDraft] = useState<MinuteRange>(initial);
  const [activeRange, setActiveRange] = useState<MinuteRange>(initial);
  const [selected, setSelected] = useState<number[]>([1001, 1051]);
  const [data, setData] = useState<WellsMinuteFlowResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const dataRef = useRef<WellsMinuteFlowResponse | null>(null);
  const requestIdRef = useRef(0);
  const inFlightIdentityRef = useRef('');
  useEffect(() => { dataRef.current = data; }, [data]);

  const load = useCallback(async (next: MinuteRange, force: boolean, background: boolean, selectedIds: number[]) => {
    if (!next.date || !next.from || !next.to) { setError('Completa fecha y horas.'); return; }
    const start = `${next.date}T${next.from}:00`;
    const end = next.to === '23:59' ? `${next.date}T23:59:59` : `${next.date}T${next.to}:00`;
    if (new Date(end) <= new Date(start)) { setError('La hora final debe ser mayor a la hora inicial.'); return; }
    if (!selectedIds.length) { setError('Selecciona al menos un pozo.'); return; }
    const identity = `${start}:${end}`;
    if (inFlightIdentityRef.current === identity) return;
    inFlightIdentityRef.current = identity;
    const requestId = ++requestIdRef.current;
    if (!dataRef.current) setLoading(true); else if (background) setRefreshing(true);
    if (!background) setError('');
    try {
      const response = await fetchWellsMinuteFlow({ startDateTime: start, endDateTime: end, forceRefresh: force });
      if (requestId !== requestIdRef.current) return;
      setData(response); setError('');
    } catch (reason: unknown) {
      if (requestId !== requestIdRef.current) return;
      setError((reason as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'No fue posible consultar el flujo minuto a minuto.');
    } finally {
      if (requestId === requestIdRef.current) { setLoading(false); setRefreshing(false); }
      if (inFlightIdentityRef.current === identity) inFlightIdentityRef.current = '';
    }
  }, []);

  useEffect(() => { load(initial, false, false, [1001, 1051]); }, [initial, load]);
  useAutoRefresh(activeRange.date === todayInputDate() && selected.length > 0, () => load(activeRange, true, true, selected));

  const apply = () => { setActiveRange(draft); load(draft, true, false, selected); };
  const reset = () => { const next = defaultState(); setDraft(next); setActiveRange(next); setSelected([1001, 1051]); load(next, true, false, [1001, 1051]); };
  const rows = useMemo(() => { if (!data?.series.length) return []; const map = new Map<string, Record<string, unknown>>(); data.series.forEach((series) => series.points.forEach((point) => { const timestamp = new Date(point.timestamp).getTime(); if (!isHistoryPointVisible(point.timestamp, point.data_status)) return; const row = map.get(point.timestamp) || { timestamp, tooltipAnchor: 0 }; row[`flow_${series.sensor_id}`] = point.flow_value; row[`status_${series.sensor_id}`] = point.data_status; map.set(point.timestamp, row); })); return [...map.values()].sort((a, b) => Number(a.timestamp) - Number(b.timestamp)); }, [data]);
  const hasData = data?.series.some((series) => series.has_data) || false;
  const hasFuture = Boolean(data?.has_future_intervals || data?.series.some((series) => series.has_future_intervals));

  return <section className="panel chart-panel fade-up minute-flow-panel"><PanelHeader title="Flujo minuto a minuto por pozo" subtitle="Comparación de los dos pozos confirmados, sin conectar huecos" /><div className="minute-flow-controls"><label><span>Fecha</span><input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label><label><span>Hora desde</span><input type="time" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label><label><span>Hora hasta</span><input type="time" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label><button type="button" className="date-range-apply" onClick={apply}>Actualizar</button><button type="button" className="date-range-reset" onClick={reset}>Restablecer</button></div><div className="minute-flow-selection"><button type="button" className="sensor-chip" onClick={() => setSelected([1001, 1051])}>Todos</button><button type="button" className="sensor-chip" onClick={() => setSelected([])}>Limpiar</button>{[1001, 1051].map((sensorId) => <button type="button" key={sensorId} className={`sensor-chip ${selected.includes(sensorId) ? 'active' : ''}`} onClick={() => setSelected((current) => current.includes(sensorId) ? current.filter((value) => value !== sensorId) : [...current, sensorId])}>{sensorId === 1001 ? 'Pozo 1' : 'Pozo 2'}</button>)}</div>{refreshing ? <div className="status-pill auto-refresh-status">Actualizando flujo minuto a minuto…</div> : null}{error ? <div className="status-pill alert">{error}</div> : null}{loading && !data ? <div className="status-pill">Cargando información...</div> : null}{rows.length && hasData && selected.length ? <ResponsiveContainer width="100%" height={360}><LineChart data={rows} margin={{ top: 12, right: 26, bottom: 16, left: 8 }}><CartesianGrid stroke="rgba(56,189,248,.14)" strokeDasharray="3 3" /><XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(value) => new Date(Number(value)).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} minTickGap={28} stroke="#b9e7ff" /><YAxis stroke="#b9e7ff" width={58} /><Tooltip content={<MinuteTooltip selected={selected} data={data} />} filterNull={false} wrapperStyle={{ zIndex: 60, pointerEvents: 'none' }} /><Legend /><Line dataKey="tooltipAnchor" stroke="transparent" dot={false} activeDot={false} legendType="none" />{selected.map((sensorId) => <Line key={sensorId} type="linear" dataKey={`flow_${sensorId}`} name={`${sensorId === 1001 ? 'Pozo 1' : 'Pozo 2'} (${data?.series.find((item) => item.sensor_id === sensorId)?.flow_unit || 'L/s'})`} stroke={COLORS[sensorId]} strokeWidth={2.3} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />)}</LineChart></ResponsiveContainer> : !loading ? <ChartEmptyState message={hasFuture ? 'El rango incluye intervalos futuros; todavía no existe información operativa para ellos.' : 'Sin registros guardados para el rango seleccionado.'} /> : null}</section>;
}
