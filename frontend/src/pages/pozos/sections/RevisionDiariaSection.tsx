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

function displayDate(value: unknown): string {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || '—');
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function shiftDate(value: string, days: number): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function operationalVolume(payload: FlexibleRecord | null | undefined, key: string): number | null {
  const groups = asRecord(payload?.operational_groups);
  const summary = asRecord(groups[key]);
  return num(summary.subtotal_validated_m3 ?? summary.validated_volume_m3 ?? summary.total_m3);
}

function sumValidated(items: FlexibleRecord[]): number | null {
  const values = items.map((item) => num(item.validated_volume_m3)).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

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
  return label && label !== 'Validación parcial' ? label : 'Sin datos suficientes';
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
      setError(candidate.response?.data?.detail || candidate.message || 'No fue posible consultar la revisión diaria.');
      if (!hasData) setReview(null);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [selectedDate]);

  useEffect(() => { void load(false); }, [load]);
  useAutoRefresh(selectedDate === todayInputDate(), () => { void load(false); });

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
  const wellRows = rows.filter((item) => item.group === 'Pozo');
  const lineRows = rows.filter((item) => item.group === 'Línea');
  const washerRows = rows.filter((item) => item.group === 'Lavadora');
  const jarabesRows = rows.filter((item) => item.group === 'Jarabes');
  const wellVolume = operationalVolume(review, 'wells') ?? sumValidated(wellRows);
  const lineVolume = operationalVolume(review, 'lines') ?? sumValidated(lineRows);
  const washerVolume = operationalVolume(review, 'lavadoras') ?? sumValidated(washerRows);
  const jarabesVolume = operationalVolume(review, 'jarabes') ?? sumValidated(jarabesRows);
  const active = Number(wells.active_count || 0) + Number(lines.active_count || 0) + Number(flows.active_count || 0);
  const reviewCount = Number(wells.review_count || 0) + Number(lines.review_count || 0) + Number(flows.review_count || 0);
  const noDataCount = Number(wells.no_data_count || 0) + Number(lines.no_data_count || 0) + Number(flows.no_data_count || 0);
  const attentionCount = reviewCount + noDataCount;
  const selectedDateText = displayDate(selectedDate);
  const comparatives = asRecord(review?.comparatives);
  const previousDay = asRecord(comparatives.previous_day);
  const previousWeek = asRecord(comparatives.previous_week);
  const previousDayDate = String(previousDay.date || shiftDate(selectedDate, -1));
  const previousWeekDate = String(previousWeek.date || shiftDate(selectedDate, -7));
  const comparisonRows = [
    { label: 'Pozos', selected: wellVolume, previousDay: operationalVolume(previousDay, 'wells'), previousWeek: operationalVolume(previousWeek, 'wells') },
    { label: 'Líneas', selected: lineVolume, previousDay: operationalVolume(previousDay, 'lines'), previousWeek: operationalVolume(previousWeek, 'lines') },
    { label: 'Lavadoras', selected: washerVolume, previousDay: operationalVolume(previousDay, 'lavadoras'), previousWeek: operationalVolume(previousWeek, 'lavadoras') },
    { label: 'Jarabes', selected: jarabesVolume, previousDay: operationalVolume(previousDay, 'jarabes'), previousWeek: operationalVolume(previousWeek, 'jarabes') },
  ];
  const alerts = useMemo(() => evaluateDurangoWaterAlerts(dashboard), [dashboard]);
  const range = useMemo(() => ({ startDate: selectedDate, endDate: selectedDate }), [selectedDate]);
  const alertAggregation = useMemo(() => recommendedHistoryAggregation(range), [range]);
  const historicalNote = selectedDate !== todayInputDate()
    ? 'Las alertas muestran el estado actual de la planta y no la fecha histórica seleccionada.'
    : undefined;
  const shifts = review?.shifts && typeof review.shifts === 'object' && !Array.isArray(review.shifts)
    ? review.shifts as unknown as WaterShiftsResponse
    : null;

  return <div className="daily-review-page">
    <section className="panel fade-up daily-review-header-panel">
      <PanelHeader title="Revisión diaria" subtitle={`Datos operativos del ${selectedDateText}`} />
      <div className="date-range-panel">
        <div className="date-range-fields">
          <label><span>Día</span><div className="date-input-with-icon"><CalendarDays size={16} aria-hidden="true" /><input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} /></div></label>
          <button type="button" className="date-range-apply" onClick={() => { if (draftDate === selectedDate) void load(true); else setSelectedDate(draftDate); }}>Actualizar</button>
          <button type="button" className="date-range-reset" onClick={() => { const value = todayInputDate(); setDraftDate(value); setSelectedDate(value); }}>Hoy</button>
        </div>
      </div>
      {refreshing ? <div className="status-pill auto-refresh-status">Actualizando datos…</div> : null}
      {error ? <div className="status-pill alert">{error}</div> : null}
      {loading && !review ? <div className="status-pill">Cargando revisión diaria…</div> : null}
    </section>
    <section className="cards-grid stagger-grid daily-review-kpi-grid">
      <KpiCard label="Pozos" value={wellVolume === null ? '—' : fmt(wellVolume)} unit={wellVolume === null ? '' : 'm³'} trend={`Volumen bombeado · ${selectedDateText}`} accent="blue" />
      <KpiCard label="Líneas" value={lineVolume === null ? '—' : fmt(lineVolume)} unit={lineVolume === null ? '' : 'm³'} trend={`Volumen consumido · ${selectedDateText}`} accent="cyan" />
      <KpiCard label="Lavadoras" value={washerVolume === null ? '—' : fmt(washerVolume)} unit={washerVolume === null ? '' : 'm³'} trend={`Volumen consumido · ${selectedDateText}`} accent="teal" />
      <KpiCard label="Jarabes" value={jarabesVolume === null ? '—' : fmt(jarabesVolume)} unit={jarabesVolume === null ? '' : 'm³'} trend={`Volumen consumido · ${selectedDateText}`} accent="teal" />
      <KpiCard label="Con actividad" value={String(active)} unit="elementos" trend={`Durante el ${selectedDateText}`} accent="blue" />
      <KpiCard label="Con atención" value={String(attentionCount)} unit="elementos" trend="Revisión parcial o sin datos" accent={attentionCount ? 'brown' : 'blue'} />
    </section>
    <section className="panel fade-up daily-review-comparison-panel">
      <PanelHeader title="Comparativo de volumen" subtitle={`Fecha seleccionada: ${selectedDateText}`} />
      <div className="pozos-table-scroll"><table className="pozos-operacion-table"><thead><tr><th>Proceso</th><th>{selectedDateText}</th><th>Día anterior · {displayDate(previousDayDate)}</th><th>Semana anterior · {displayDate(previousWeekDate)}</th></tr></thead><tbody>{comparisonRows.map((item) => <tr key={item.label}><td>{item.label}</td><td>{item.selected === null ? '—' : `${fmt(item.selected)} m³`}</td><td>{item.previousDay === null ? '—' : `${fmt(item.previousDay)} m³`}</td><td>{item.previousWeek === null ? '—' : `${fmt(item.previousWeek)} m³`}</td></tr>)}</tbody></table></div>
    </section>
    <OperationalAlertsPanel alerts={alerts} range={range} aggregation={alertAggregation} title="Alertas operativas actuales" subtitle="Elementos que requieren atención operativa." historicalNote={historicalNote} />
    <section className="panel fade-up daily-review-detail-panel">
      <PanelHeader title="Detalle del día" subtitle={`Periodo: ${selectedDateText} · 00:00–23:59`} />
      <div className="pozos-table-scroll"><table className="pozos-operacion-table"><thead><tr><th>Grupo</th><th>Elemento</th><th>Estado al cierre</th><th>Flujo de cierre</th><th>Totalizador inicial</th><th>Totalizador final</th><th>Volumen del día</th><th>Actividad</th><th>Estado de datos</th><th>Tiempo activo</th><th>Cobertura de datos</th><th>Comunicación</th><th>Última lectura</th></tr></thead><tbody>{rows.map((item, index) => { const validated = num(item.validated_volume_m3); const volumeText = validated === null ? 'Sin volumen disponible' : `${fmt(validated)} m³`; const validation = displayValidation(item, validated); return <tr key={`${item.group}-${item.sensor_id || item.operational_key || index}`}><td>{String(item.group)}</td><td>{String(item.name || item.nombre || `Elemento ${index + 1}`)}</td><td>{String(item.current_state || 'Sin registros')}</td><td>{num(item.current_flow ?? item.flow_lps) === null ? '—' : `${fmt(item.current_flow ?? item.flow_lps)} ${String(item.flow_unit || 'L/s')}`}</td><td>{num(item.period_open_m3) === null ? '—' : `${fmt(item.period_open_m3)} m³`}</td><td>{num(item.period_close_m3 ?? item.current_totalizer_m3) === null ? '—' : `${fmt(item.period_close_m3 ?? item.current_totalizer_m3)} m³`}</td><td>{volumeText}</td><td><StatusBadge type={statusType(item.activity)}>{String(item.activity || 'Sin registros')}</StatusBadge></td><td><StatusBadge type={statusType(validation)}>{validation}</StatusBadge></td><td>{num(item.active_minutes) === null ? '—' : `${fmt(item.active_minutes)} min`}</td><td>{num(item.coverage_percent) === null ? '—' : `${fmt(item.coverage_percent)}% · ${String(item.coverage_status || '')}`}</td><td>{String(item.communication || item.estado_comunicacion || 'Sin lectura')}</td><td>{formatSqlDate(item.last_update || item.ultima_lectura)}</td></tr>; })}</tbody></table></div>
    </section>
    <ShiftConsumptionPanel group="all" date={selectedDate} showDateControls={false} reviewMode title="Cortes por turno" subtitle={`Turnos del ${selectedDateText}`} dataOverride={shifts} />
  </div>;
}
