import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import useAutoRefresh from '../../../hooks/useAutoRefresh';
import { fetchWaterShifts } from '../../../services/waterService';
import type { ShiftElement, WaterShift, WaterShiftsResponse } from '../types';
import ChartEmptyState from './ChartEmptyState';
import PanelHeader from './PanelHeader';
import StatusBadge from './StatusBadge';

type GroupMode = 'well' | 'line' | 'flow' | 'all';

type AllowedItem = {
  sensorId: number | null;
  operationalKey: string;
  name: string;
};

interface Props {
  group?: GroupMode;
  itemIdentity?: number | string;
  date?: string;
  showDateControls?: boolean;
  reviewMode?: boolean;
  title?: string;
  items?: AllowedItem[];
  emptyMessage?: string;
}

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function itemIdentity(item: { sensor_id: number | null; operational_key?: string }): string {
  return String(item.sensor_id ?? item.operational_key ?? '');
}

function allowedIdentity(item: AllowedItem): string {
  return String(item.sensorId ?? item.operationalKey);
}

function matchesAllowedItem(item: ShiftElement, allowedItems?: AllowedItem[]): boolean {
  if (!allowedItems?.length) return true;
  const allowedKeys = new Set(allowedItems.map((allowed) => allowed.operationalKey));
  const key = String(item.operational_key || '').trim();
  if (key) return allowedKeys.has(key);
  const allowedIdentities = new Set(allowedItems.map(allowedIdentity));
  return allowedIdentities.has(itemIdentity(item));
}

function rows(
  shift: WaterShift,
  group: Exclude<GroupMode, 'all'>,
  selectedIdentity?: number | string,
  allowedItems?: AllowedItem[],
) {
  const groupRows = group === 'well' ? shift.wells : group === 'line' ? shift.lines : shift.flows;
  return groupRows.filter((item) => {
    if (!matchesAllowedItem(item, allowedItems)) return false;
    if (selectedIdentity === undefined) return true;
    return itemIdentity(item) === String(selectedIdentity);
  });
}

function countOperating(item: ShiftElement): boolean {
  const avg = number(item.flow_avg);
  const activity = String(item.activity || '').toLowerCase();
  return (avg !== null && avg > 0) || activity.includes('actividad') && !activity.includes('sin actividad');
}

function countReview(item: ShiftElement): boolean {
  const status = String(item.data_status || item.activity || '').toLowerCase();
  return Boolean(item.has_discontinuities) || status.includes('parcial') || status.includes('revisión') || status.includes('revision') || status.includes('invalid');
}

function summarizeRows(detailRows: ShiftElement[]) {
  const volumes = detailRows
    .filter((item) => item.period_m3_reliable !== false)
    .map((item) => number(item.period_m3))
    .filter((value): value is number => value !== null);
  return {
    total_m3: volumes.length ? volumes.reduce((total, value) => total + value, 0) : null,
    active_count: detailRows.filter(countOperating).length,
    inactive_count: detailRows.filter((item) => !countOperating(item)).length,
    review_count: detailRows.filter(countReview).length,
  };
}

function summary(shift: WaterShift, group: Exclude<GroupMode, 'all'>, allowedItems?: AllowedItem[]) {
  if (allowedItems?.length) return summarizeRows(rows(shift, group, undefined, allowedItems));
  return group === 'well' ? shift.summary.wells : group === 'line' ? shift.summary.lines : shift.summary.flows;
}

function shiftTotal(shift: WaterShift, group: GroupMode, selectedIdentity?: number | string, allowedItems?: AllowedItem[]): number | null {
  if (shift.cut_status === 'Pendiente') return null;
  if (group === 'all') return shift.summary.total_operational_m3;
  if (selectedIdentity !== undefined) return rows(shift, group, selectedIdentity, allowedItems)[0]?.period_m3 ?? null;
  return summary(shift, group, allowedItems).total_m3;
}

function statusType(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes('parcial') || normalized.includes('revisión')) return 'warning';
  if (normalized.includes('pendiente') || normalized.includes('sin')) return 'communication';
  return 'normal';
}

function DetailTable({ shift, group, selectedIdentity, allowedItems, emptyMessage }: { shift: WaterShift; group: Exclude<GroupMode, 'all'>; selectedIdentity?: number | string; allowedItems?: AllowedItem[]; emptyMessage?: string }) {
  const detailRows = rows(shift, group, selectedIdentity, allowedItems);
  return (
    <div className="pozos-table-scroll shift-detail-table-wrap">
      <table className="pozos-operacion-table shift-detail-table">
        <thead><tr><th>Elemento</th><th>Apertura</th><th>Cierre</th><th>Volumen turno</th><th>Flujo promedio</th><th>Mínimo / máximo</th><th>Muestras</th><th>Actividad</th><th>Comunicación</th></tr></thead>
        <tbody>
          {detailRows.map((item) => (
            <tr key={`${shift.id}-${group}-${item.sensor_id || item.operational_key}`}>
              <td>{item.name}</td>
              <td>{item.period_open_m3 == null ? '—' : `${fmt(item.period_open_m3)} m³`}</td>
              <td>{item.period_close_m3 == null ? '—' : `${fmt(item.period_close_m3)} m³`}</td>
              <td>{item.period_m3 == null ? item.activity : item.has_discontinuities ? `Volumen validado parcial: ${fmt(item.period_m3)} m³` : `${fmt(item.period_m3)} m³`}</td>
              <td>{item.flow_avg == null ? '—' : `${fmt(item.flow_avg)} ${item.flow_unit || 'L/s'}`}</td>
              <td>{item.flow_min == null || item.flow_max == null ? '—' : `${fmt(item.flow_min)} / ${fmt(item.flow_max)} ${item.flow_unit || 'L/s'}`}</td>
              <td>{Number(item.samples || 0).toLocaleString('es-MX')}</td>
              <td><StatusBadge type={statusType(String(item.activity || ''))}>{String(item.activity || 'Sin registros')}</StatusBadge></td>
              <td>{String(item.communication || 'Sin lectura')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!detailRows.length ? <ChartEmptyState message={shift.cut_status === 'Pendiente' ? 'Turno pendiente.' : emptyMessage || 'Sin registros para este turno.'} /> : null}
    </div>
  );
}

export default function ShiftConsumptionPanel({ group = 'all', itemIdentity: selectedIdentity, date, showDateControls = true, reviewMode = false, title = 'Consumo por turno', items, emptyMessage }: Props) {
  const [draftDate, setDraftDate] = useState(date || today());
  const [selectedDate, setSelectedDate] = useState(date || today());
  const [selectedShift, setSelectedShift] = useState('all');
  const [data, setData] = useState<WaterShiftsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const dataRef = useRef<WaterShiftsResponse | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const inFlightIdentityRef = useRef('');

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!date) return;
    setDraftDate(date);
    setSelectedDate(date);
  }, [date]);

  const load = useCallback(async (forceRefresh = false, background = false) => {
    const identity = `${selectedDate}:${selectedShift}`;
    if (inFlightIdentityRef.current === identity) return;
    inFlightIdentityRef.current = identity;
    const requestId = ++requestIdRef.current;
    if (!dataRef.current) setLoading(true);
    else if (background) setRefreshing(true);
    if (!background) setError('');
    try {
      const response = await fetchWaterShifts({ date: selectedDate, shift: selectedShift as 'all' | 'shift_1' | 'shift_2' | 'shift_3', forceRefresh });
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setData(response);
      setError('');
    } catch (caught) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      const candidate = caught as { response?: { data?: { detail?: string } }; message?: string };
      setError(candidate.response?.data?.detail || candidate.message || 'No fue posible consultar los cortes por turno.');
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      if (inFlightIdentityRef.current === identity) inFlightIdentityRef.current = '';
    }
  }, [selectedDate, selectedShift]);

  useEffect(() => { void load(false, false); }, [load]);
  useAutoRefresh(selectedDate === today(), () => { void load(true, true); });

  const visible = useMemo(() => {
    const shifts = data?.shifts || [];
    return selectedShift === 'all' ? shifts : shifts.filter((item) => item.id === selectedShift);
  }, [data, selectedShift]);

  return (
    <section className="panel fade-up shift-consumption-panel">
      <PanelHeader title={title} subtitle="Turnos sin traslape; apertura y cierre se calculan con totalizadores válidos." />
      <div className="date-range-panel shift-controls-panel">
        <div className="date-range-fields">
          {showDateControls ? <label><span>Día</span><div className="date-input-with-icon"><CalendarDays size={16} /><input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} /></div></label> : null}
          <label className="shift-selector-field"><span>Turno operativo</span><select aria-label="Turno operativo" value={selectedShift} onChange={(event) => setSelectedShift(event.target.value)}><option value="all">Todos los turnos</option><option value="shift_1">Turno 1 · 00:00–07:00</option><option value="shift_2">Turno 2 · 07:00–15:00</option><option value="shift_3">Turno 3 · 15:00–24:00</option></select></label>
          {showDateControls ? <button type="button" className="date-range-apply" onClick={() => { if (draftDate === selectedDate) void load(true, true); else setSelectedDate(draftDate); }}>Actualizar</button> : <button type="button" className="date-range-apply" onClick={() => void load(true, true)}>Actualizar turnos</button>}
          {showDateControls ? <button type="button" className="date-range-reset" onClick={() => { const value = today(); setDraftDate(value); setSelectedDate(value); setSelectedShift('all'); }}>Restablecer</button> : null}
        </div>
      </div>
      {refreshing ? <div className="status-pill auto-refresh-status">Actualizando cortes por turno…</div> : null}
      {error ? <div className="status-pill alert">{error}</div> : null}
      {loading && !data ? <ChartEmptyState message="Calculando cortes por turno..." /> : null}
      {data ? <>
        <div className="shift-summary-cards">
          {data.shifts.map((shift) => {
            const value = shiftTotal(shift, group, selectedIdentity, items);
            const groupSummary = group === 'all' ? null : summary(shift, group, items);
            const selectedRow = group === 'all' || selectedIdentity === undefined ? null : rows(shift, group, selectedIdentity, items)[0];
            const summaryText = selectedIdentity !== undefined
              ? selectedRow ? `${selectedRow.activity} · ${selectedRow.communication}` : 'Sin registros para este elemento'
              : groupSummary ? `Con actividad ${groupSummary.active_count} · Sin actividad ${groupSummary.inactive_count} · Validación parcial ${groupSummary.review_count}` : 'Pozos, Líneas y Flujos';
            return <article key={shift.id} className={`shift-summary-card ${shift.cut_status === 'Corte parcial' ? 'partial' : shift.cut_status === 'Pendiente' ? 'pending' : 'completed'}`}><span>{shift.name}</span><small>{shift.schedule}</small><strong>{shift.cut_status === 'Pendiente' ? 'Pendiente' : `${shift.cut_status === 'Corte parcial' ? 'Corte parcial: ' : ''}${value == null ? 'Sin volumen validado' : `${fmt(value)} m³`}`}</strong><p>{summaryText}</p><em>{shift.cut_status}</em></article>;
          })}
        </div>
        {reviewMode ? <div className="pozos-table-scroll shift-overview-table-wrap"><table className="pozos-operacion-table shift-overview-table"><thead><tr><th>Turno</th><th>Horario</th><th>Pozos</th><th>Líneas</th><th>Flujos</th><th>Total operativo</th><th>Estado</th></tr></thead><tbody>{visible.map((shift) => <tr key={shift.id}><td>{shift.name}</td><td>{shift.schedule}</td><td>{shift.cut_status === 'Pendiente' ? 'Pendiente' : `${fmt(shift.summary.wells.total_m3)} m³`}</td><td>{shift.cut_status === 'Pendiente' ? 'Pendiente' : `${fmt(shift.summary.lines.total_m3)} m³`}</td><td>{shift.cut_status === 'Pendiente' ? 'Pendiente' : `${fmt(shift.summary.flows.total_m3)} m³`}</td><td>{shift.cut_status === 'Pendiente' ? 'Pendiente' : `${fmt(shift.summary.total_operational_m3)} m³`}</td><td><StatusBadge type={statusType(shift.cut_status)}>{shift.cut_status}</StatusBadge></td></tr>)}</tbody></table></div> : null}
        <div className="shift-detail-list">{visible.map((shift) => <details key={`${shift.id}-${group}`} className="shift-detail-disclosure"><summary><span><strong>{shift.name}</strong><small>{shift.schedule}</small></span><StatusBadge type={statusType(shift.cut_status)}>{shift.cut_status}</StatusBadge></summary>{group === 'all' ? <div className="shift-detail-groups"><section><h4>Pozos</h4><DetailTable shift={shift} group="well" /></section><section><h4>Líneas</h4><DetailTable shift={shift} group="line" /></section><section><h4>Flujos</h4><DetailTable shift={shift} group="flow" /></section></div> : <DetailTable shift={shift} group={group} selectedIdentity={selectedIdentity} allowedItems={items} emptyMessage={emptyMessage} />}</details>)}</div>
      </> : null}
    </section>
  );
}
