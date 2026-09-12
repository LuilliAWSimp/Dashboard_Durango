import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import KpiCard from '../../../components/KpiCard';
import useAutoRefresh from '../../../hooks/useAutoRefresh';
import { fetchWaterDailyReview } from '../../../services/waterService';
import PanelHeader from '../components/PanelHeader';
import OperationalAlertsPanel from '../components/OperationalAlertsPanel';
import ShiftConsumptionPanel from '../components/ShiftConsumptionPanel';
import StatusBadge from '../components/StatusBadge';
import { formatSqlDate, recommendedHistoryAggregation, todayInputDate } from '../dateUtils';
import type { DashboardData, FlexibleRecord, WaterShiftsResponse } from '../types';
import { evaluateDurangoWaterAlerts } from '../waterOperationalAlerts';
import { JARABES_SECTION_CONFIG, LAVADORAS_SECTION_CONFIG } from '../operationalSectionConfig';

function array(value: unknown): FlexibleRecord[] { return Array.isArray(value) ? value as FlexibleRecord[] : []; }
function num(value: unknown): number | null { if (value === null || value === undefined || value === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function fmt(value: unknown): string { const n = num(value); return n === null ? '—' : n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function statusType(value: unknown): string { const t = String(value || '').toLowerCase(); if (t.includes('revisión') || t.includes('revision') || t.includes('parcial') || t.includes('atrasada')) return 'warning'; if (t.includes('sin registro') || t.includes('sin lectura') || t.includes('sin datos')) return 'communication'; return t.includes('con actividad') || t.includes('validado') ? 'normal' : 'idle'; }
function group(summary: FlexibleRecord, key: string): FlexibleRecord { const value = summary[key]; return value && typeof value === 'object' && !Array.isArray(value) ? value as FlexibleRecord : {}; }
function asRecord(value: unknown): FlexibleRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as FlexibleRecord : {}; }

const LAVADORA_KEYS = new Set(LAVADORAS_SECTION_CONFIG.allowedOperationalKeys.map((key) => key.toLowerCase()));
const JARABES_KEYS = new Set(JARABES_SECTION_CONFIG.allowedOperationalKeys.map((key) => key.toLowerCase()));

function flowGroupLabel(item: FlexibleRecord): string {
  const key = String(item.operational_key || item.operationalKey || '').toLowerCase();
  if (JARABES_KEYS.has(key)) return 'Jarabes';
  if (LAVADORA_KEYS.has(key)) return 'Lavadora';
  return 'Flujo auxiliar';
}

function displayValidation(item: FlexibleRecord, validated: number | null): string {
  const quality = String(item.quality_label || item.calculation_status || '').trim();
  if (quality) return quality;
  if (validated !== null) return 'Validado';
  const label = String(item.validation || '').trim();
  return label && label !== 'Validación parcial' ? label : 'Sin volumen validado';
}

function qualityReason(item: FlexibleRecord): string {
  const reason = String(item.quality_reason || '').trim();
  if (!reason) return '';
  const details = asRecord(item.quality_details);
  const stamp = details.timestamp ? ` · ${formatSqlDate(details.timestamp)}` : '';
  return `${reason}${stamp}`;
}

export default function RevisionDiariaSection() {
  const [draftDate, setDraftDate] = useState(todayInputDate());
  const [selectedDate, setSelectedDate] = useState(todayInputDate());
  const [review, setReview] = useState<FlexibleRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);
  const reviewRef = useRef<FlexibleRecord | null>(null);

  useEffect(() => { reviewRef.current = review; }, [review]);

  const load = useCallback(async (forceRefresh = false) => {
    const requestId = ++requestIdRef.current;
    const hasData = reviewRef.current !== null;
    if (hasData) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const payload = asRecord(await fetchWaterDailyReview({
        date: selectedDate,
        includeShifts: true,
        includeComparatives: true,
        forceRefresh,
      }));
      if (requestId !== requestIdRef.current) return;
      setReview(payload);
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      const candidate = caught as { response?: { data?: { detail?: string } }; message?: string };
      setError(candidate.response?.data?.detail || candidate.message || 'No fue posible consultar la revisión diaria conciliada.');
      if (!hasData) setReview(null);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [selectedDate]);

  useEffect(() => { void load(false); }, [load]);
  useAutoRefresh(selectedDate === todayInputDate(), () => { void load(true); });

  const dashboard = review as DashboardData | null;
  const rows = useMemo<Array<FlexibleRecord & { group: string }>>(() => [
    ...array(dashboard?.wells).map((item): FlexibleRecord & { group: string } => ({ ...item, group: 'Pozo' })),
    ...array(dashboard?.production_lines).map((item): FlexibleRecord & { group: string } => ({ ...item, group: 'Línea' })),
    ...array(dashboard?.flows).map((item): FlexibleRecord & { group: string } => ({ ...item, group: flowGroupLabel(item) })),
  ], [dashboard]);
  const summary = (dashboard?.operational_summary || {}) as FlexibleRecord;
  const wells = group(summary, 'wells');
  const lines = group(summary, 'lines');
  const flows = group(summary, 'flows');
  const totals = [wells.subtotal_validated_m3 ?? wells.total_m3, lines.subtotal_validated_m3 ?? lines.total_m3, flows.subtotal_validated_m3 ?? flows.total_m3].map(num).filter((value): value is number => value !== null);
  const total = totals.length ? totals.reduce((sum, value) => sum + value, 0) : null;
  const active = Number(wells.active_count || 0) + Number(lines.active_count || 0) + Number(flows.active_count || 0);
  const inactive = Number(wells.inactive_count || 0) + Number(lines.inactive_count || 0) + Number(flows.inactive_count || 0);
  const currentFlow = Number(wells.current_flow_count || 0) + Number(lines.current_flow_count || 0) + Number(flows.current_flow_count || 0);
  const reviewCount = Number(wells.review_count || 0) + Number(lines.review_count || 0) + Number(flows.review_count || 0);
  const alerts = useMemo(() => evaluateDurangoWaterAlerts(dashboard), [dashboard]);
  const range = useMemo(() => ({ startDate: selectedDate, endDate: selectedDate }), [selectedDate]);
  const alertAggregation = useMemo(() => recommendedHistoryAggregation(range), [range]);
  const historicalNote = selectedDate !== todayInputDate()
    ? 'Este bloque conserva las alertas como referencia operativa; la revisión histórica usa la calidad conciliada del día seleccionado.'
    : undefined;
  const shifts = review?.shifts && typeof review.shifts === 'object' && !Array.isArray(review.shifts)
    ? review.shifts as unknown as WaterShiftsResponse
    : null;

  return <>
    <section className="panel fade-up daily-review-header-panel">
      <PanelHeader title="Revisión diaria" subtitle="Fuente diaria única: cierres conciliados, calidad, actividad y turnos por fecha" />
      <div className="date-range-panel">
        <div className="date-range-fields">
          <label><span>Fecha de revisión</span><div className="date-input-with-icon"><CalendarDays size={16} aria-hidden="true" /><input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} /></div></label>
          <button type="button" className="date-range-apply" onClick={() => { if (draftDate === selectedDate) void load(true); else setSelectedDate(draftDate); }}>Actualizar</button>
          <button type="button" className="date-range-reset" onClick={() => { const value = todayInputDate(); setDraftDate(value); setSelectedDate(value); }}>Hoy</button>
        </div>
      </div>
      {refreshing ? <div className="status-pill auto-refresh-status">Actualizando revisión diaria…</div> : null}
      {error ? <div className="status-pill alert">{error}</div> : null}
      {loading && !review ? <div className="status-pill">Calculando revisión diaria conciliada…</div> : null}
    </section>
    <section className="cards-grid stagger-grid daily-review-kpi-grid">
      <KpiCard label="Volumen validado" value={total === null ? 'No disponible' : fmt(total)} unit={total === null ? '' : 'm³'} trend="Subtotal de elementos con volumen confiable" accent="cyan" />
      <KpiCard label="Con actividad en el periodo" value={String(active)} unit="elementos" trend="Movimiento validado" accent="teal" />
      <KpiCard label="Con flujo al cierre" value={String(currentFlow)} unit="elementos" trend="Última lectura del periodo por encima del umbral" accent="teal" />
      <KpiCard label="Sin actividad" value={String(inactive)} unit="elementos" trend="Cero confirmado" accent="blue" />
      <KpiCard label="Revisión / cobertura parcial" value={String(reviewCount)} unit="elementos" trend="No se presentan como volumen completo" accent="brown" />
    </section>
    <OperationalAlertsPanel alerts={alerts} range={range} aggregation={alertAggregation} title="Alertas operativas actuales" subtitle="Elementos que requieren atención operativa." historicalNote={historicalNote} />
    <section className="panel fade-up daily-review-detail-panel">
      <PanelHeader title="Detalle del día" subtitle="Apertura previa real, cierre interno y calidad usan el mismo contrato [T0,T1)" />
      <div className="pozos-table-scroll"><table className="pozos-operacion-table"><thead><tr><th>Grupo</th><th>Elemento</th><th>Estado actual</th><th>Flujo de cierre</th><th>Apertura</th><th>Totalizador de cierre</th><th>Volumen del día</th><th>Actividad</th><th>Validación</th><th>Tiempo activo</th><th>Cobertura</th><th>Comunicación</th><th>Última actualización</th></tr></thead><tbody>{rows.map((item, index) => { const validated = num(item.validated_volume_m3); const volumeText = validated === null ? 'Sin volumen validado' : `${fmt(validated)} m³`; const validation = displayValidation(item, validated); return <tr key={`${item.group}-${item.sensor_id || item.operational_key || index}`}><td>{String(item.group)}</td><td>{String(item.name || item.nombre || `Elemento ${index + 1}`)}</td><td>{String(item.current_state || 'Sin registros')}</td><td>{num(item.current_flow ?? item.flow_lps) === null ? '—' : `${fmt(item.current_flow ?? item.flow_lps)} ${String(item.flow_unit || 'L/s')}`}</td><td>{num(item.period_open_m3) === null ? '—' : `${fmt(item.period_open_m3)} m³`}</td><td>{num(item.period_close_m3 ?? item.current_totalizer_m3) === null ? '—' : `${fmt(item.period_close_m3 ?? item.current_totalizer_m3)} m³`}</td><td>{volumeText}</td><td><StatusBadge type={statusType(item.activity)}>{String(item.activity || 'Sin registros')}</StatusBadge></td><td><div className="quality-diagnostic-cell"><StatusBadge type={statusType(validation)}>{validation}</StatusBadge>{qualityReason(item) ? <small>{qualityReason(item)}</small> : null}</div></td><td>{num(item.active_minutes) === null ? '—' : `${fmt(item.active_minutes)} min`}</td><td>{num(item.coverage_percent) === null ? '—' : `${fmt(item.coverage_percent)}% · ${String(item.coverage_status || '')}`}</td><td>{String(item.communication || item.estado_comunicacion || 'Sin lectura')}</td><td>{formatSqlDate(item.last_update || item.ultima_lectura)}</td></tr>; })}</tbody></table></div>
    </section>
    <ShiftConsumptionPanel group="all" date={selectedDate} showDateControls={false} reviewMode title="Cortes por turno del día seleccionado" dataOverride={shifts} />
  </>;
}
