import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import KpiCard from '../../../components/KpiCard';
import { DURANGO_CAPABILITIES } from '../../../config/plantCapabilities';
import { fetchWaterDailyReview } from '../../../services/waterService';
import { JARABES_SECTION_CONFIG, LAVADORAS_SECTION_CONFIG } from '../operationalSectionConfig';
import ChartEmptyState from '../components/ChartEmptyState';
import ModuleHistoryPanel from '../components/ModuleHistoryPanel';
import PanelHeader from '../components/PanelHeader';
import StatusBadge from '../components/StatusBadge';
import OperationalAlertsPanel from '../components/OperationalAlertsPanel';
import WellsMinuteFlowPanel from '../components/WellsMinuteFlowPanel';
import { defaultTodayRange, formatSqlDate, recommendedHistoryAggregation } from '../dateUtils';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';
import type { DashboardData, FlexibleRecord } from '../types';
import { evaluateDurangoWaterAlerts } from '../waterOperationalAlerts';


function rows(value: unknown): FlexibleRecord[] {
  return Array.isArray(value) ? value as FlexibleRecord[] : [];
}
function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function fmt(value: unknown): string {
  const parsed = number(value);
  return parsed === null ? 'No disponible' : parsed.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function asRecord(value: unknown): FlexibleRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as FlexibleRecord : {};
}
function summaryGroup(summary: FlexibleRecord, key: string): FlexibleRecord {
  return asRecord(summary[key]);
}
function operationalKey(item: FlexibleRecord): string {
  return String(item.operational_key ?? item.operationalKey ?? '').trim();
}
function validatedRowVolume(item: FlexibleRecord): number | null {
  const direct = number(item.validated_volume_m3);
  if (direct !== null) return direct;
  if (item.period_m3_reliable === false || item.reliable === false) return null;
  return number(item.period_m3 ?? item.volume_m3);
}
function rowSummary(items: FlexibleRecord[]): FlexibleRecord {
  let total = 0;
  let hasVolume = false;
  let active = 0;
  let currentFlow = 0;
  items.forEach((item) => {
    const volume = validatedRowVolume(item);
    if (volume !== null) {
      total += volume;
      hasVolume = true;
    }
    const activity = String(item.activity || item.period_activity || '').toLowerCase();
    if (activity.includes('con actividad') || Number(item.active_minutes || 0) > 0 || (volume !== null && volume > 0)) active += 1;
    const flow = number(item.current_flow_lps ?? item.current_flow ?? item.flow_lps ?? item.instant_flow_lps ?? item.flujo_lps);
    if (flow !== null && flow > 0) currentFlow += 1;
  });
  return { total_m3: hasVolume ? total : null, active_count: active, current_flow_count: currentFlow };
}
function groupVolume(group: FlexibleRecord): number | null {
  return number(group.subtotal_validated_m3 ?? group.validated_volume_m3 ?? group.total_m3);
}
function volumeTrend(group: FlexibleRecord, total: number): string {
  if (groupVolume(group) === null) return 'No disponible';
  return `${Number(group.active_count || 0)}/${total} con actividad en el periodo`;
}
function coverageText(group: FlexibleRecord, total: number): string {
  const available = Number(group.coverage_available ?? 0);
  const denominator = Number(group.coverage_total ?? total);
  if (!denominator) return 'Sin elementos monitoreados';
  return `${available}/${denominator} con volumen confiable`;
}
function changeText(current: number | null, reference: number | null): string {
  if (current === null || reference === null) return 'Sin referencia';
  const delta = current - reference;
  if (Math.abs(delta) < 0.000001) return 'Sin cambio';
  if (Math.abs(reference) < 0.000001) return `${delta > 0 ? '+' : ''}${fmt(delta)} m³`;
  const pct = (delta / Math.abs(reference)) * 100;
  return `${delta > 0 ? '+' : ''}${pct.toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`;
}
function dailyVolumeTrend(group: FlexibleRecord, total: number, previous: FlexibleRecord): string {
  const coverage = coverageText(group, total);
  const comparison = changeText(groupVolume(group), groupVolume(previous));
  return `${coverage} · ${comparison} vs día anterior`;
}
function reviewOperationalGroup(review: FlexibleRecord | null, key: string): FlexibleRecord {
  if (!review) return {};
  return summaryGroup(asRecord(review.operational_groups), key);
}
function comparisonOperationalGroup(review: FlexibleRecord | null, comparisonKey: string, key: string): FlexibleRecord {
  if (!review) return {};
  const comparison = summaryGroup(asRecord(review.comparatives), comparisonKey);
  return summaryGroup(asRecord(comparison.operational_groups), key);
}
function dateLabel(value: string | null): string {
  if (!value) return 'día seleccionado';
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function groupStatusType(group: FlexibleRecord): string {
  if (Number(group.coverage_total || 0) === 0 || Number(group.no_data_count || 0) > 0) return 'communication';
  if (group.coverage_complete === true) return 'normal';
  return 'warning';
}

export default function DashboardBaseSection() {
  const navigate = useNavigate();
  const controller = useSqlChartDashboard('dashboard', defaultTodayRange, {
    forceRefresh: true,
    includeHistory: false,
    includeEnergyWater: false,
    autoRefresh: true,
  });
  const dashboard = controller.dashboard as DashboardData | null;
  const [dailyReview, setDailyReview] = useState<FlexibleRecord | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState('');

  const singleReviewDate = controller.range.startDate
    && controller.range.endDate
    && controller.range.startDate === controller.range.endDate
    ? String(controller.range.startDate)
    : null;

  useEffect(() => {
    if (!singleReviewDate) {
      setDailyReview(null);
      setDailyError('');
      setDailyLoading(false);
      return;
    }
    let cancelled = false;
    setDailyLoading(true);
    setDailyError('');
    void fetchWaterDailyReview({
      date: singleReviewDate,
      includeShifts: false,
      includeComparatives: true,
      forceRefresh: false,
    }).then((payload) => {
      if (!cancelled) setDailyReview(asRecord(payload));
    }).catch((caught: unknown) => {
      if (cancelled) return;
      const candidate = caught as { response?: { data?: { detail?: string } }; message?: string };
      setDailyError(candidate.response?.data?.detail || candidate.message || 'No fue posible consultar los comparativos diarios.');
      setDailyReview(null);
    }).finally(() => {
      if (!cancelled) setDailyLoading(false);
    });
    return () => { cancelled = true; };
  }, [singleReviewDate, controller.lastRefreshAt]);

  const dashboardSummary = (dashboard?.operational_summary || {}) as FlexibleRecord;
  const dashboardWells = summaryGroup(dashboardSummary, 'wells');
  const dashboardLines = summaryGroup(dashboardSummary, 'lines');
  const dashboardFlows = summaryGroup(dashboardSummary, 'flows');

  const wellRows = rows(dashboard?.wells);
  const lineRows = rows(dashboard?.production_lines);
  const flowRows = rows(dashboard?.flows);
  const lavadoraKeys = LAVADORAS_SECTION_CONFIG.allowedOperationalKeys;
  const jarabesKeys = JARABES_SECTION_CONFIG.allowedOperationalKeys;
  const lavadorasRows = flowRows.filter((item) => lavadoraKeys.includes(operationalKey(item)));
  const jarabesRows = flowRows.filter((item) => jarabesKeys.includes(operationalKey(item)));

  const snapshotWells = rowSummary(wellRows);
  const snapshotLines = rowSummary(lineRows);
  const snapshotLavadoras = rowSummary(lavadorasRows);
  const snapshotJarabes = rowSummary(jarabesRows);
  const dashboardLavadoras = rowSummary(lavadorasRows);
  const dashboardJarabes = rowSummary(jarabesRows);

  const dailyMode = Boolean(singleReviewDate && dailyReview);
  const wells = dailyMode ? reviewOperationalGroup(dailyReview, 'wells') : dashboardWells;
  const lines = dailyMode ? reviewOperationalGroup(dailyReview, 'lines') : dashboardLines;
  const lavadoras = dailyMode ? reviewOperationalGroup(dailyReview, 'lavadoras') : dashboardLavadoras;
  const jarabes = dailyMode ? reviewOperationalGroup(dailyReview, 'jarabes') : dashboardJarabes;

  const previousDay = {
    wells: comparisonOperationalGroup(dailyReview, 'previous_day', 'wells'),
    lines: comparisonOperationalGroup(dailyReview, 'previous_day', 'lines'),
    lavadoras: comparisonOperationalGroup(dailyReview, 'previous_day', 'lavadoras'),
    jarabes: comparisonOperationalGroup(dailyReview, 'previous_day', 'jarabes'),
  };
  const previousWeek = {
    wells: comparisonOperationalGroup(dailyReview, 'previous_week', 'wells'),
    lines: comparisonOperationalGroup(dailyReview, 'previous_week', 'lines'),
    lavadoras: comparisonOperationalGroup(dailyReview, 'previous_week', 'lavadoras'),
    jarabes: comparisonOperationalGroup(dailyReview, 'previous_week', 'jarabes'),
  };

  const all = useMemo(() => [...wellRows, ...lineRows, ...flowRows], [dashboard]);
  const latestValues = all
    .map((item) => String(item.last_update || item.ultima_lectura || ''))
    .filter(Boolean)
    .sort();
  const latest = latestValues[latestValues.length - 1];
  const reviewCount = dailyMode
    ? [wells, lines, lavadoras, jarabes].reduce((sum, group) => sum + Number(group.review_count || 0), 0)
    : Number(dashboardWells.review_count || 0) + Number(dashboardLines.review_count || 0) + Number(dashboardFlows.review_count || 0);
  const totalValues = [wells, lines, lavadoras, jarabes].map(groupVolume).filter((value): value is number => value !== null);
  const totalValidated = totalValues.length ? totalValues.reduce((sum, value) => sum + value, 0) : null;
  const alerts = useMemo(() => evaluateDurangoWaterAlerts(dashboard), [dashboard]);
  const alertAggregation = useMemo(() => recommendedHistoryAggregation(controller.range), [controller.range.startDate, controller.range.endDate]);
  const wellCount = DURANGO_CAPABILITIES.wells.length;
  const lineCount = DURANGO_CAPABILITIES.lines.length;
  const lavadoraCount = LAVADORAS_SECTION_CONFIG.items.length;
  const jarabesCount = JARABES_SECTION_CONFIG.items.length;
  const volumeScope = dailyMode ? `día ${dateLabel(singleReviewDate)}` : 'periodo seleccionado';

  const comparisonRows = [
    { key: 'wells', label: 'Pozos', group: wells, previous: previousDay.wells, week: previousWeek.wells, total: wellCount, route: '/pozos/pozos' },
    { key: 'lines', label: 'Líneas', group: lines, previous: previousDay.lines, week: previousWeek.lines, total: lineCount, route: '/pozos/lineas' },
    { key: 'lavadoras', label: 'Lavadoras', group: lavadoras, previous: previousDay.lavadoras, week: previousWeek.lavadoras, total: lavadoraCount, route: '/pozos/flujos' },
    { key: 'jarabes', label: 'Jarabes', group: jarabes, previous: previousDay.jarabes, week: previousWeek.jarabes, total: jarabesCount, route: '/pozos/jarabes' },
  ];

  return (
    <>
      <section className="panel fade-up compact-hero">
        <PanelHeader title="Resumen hídrico de Durango" subtitle="Snapshot actual + volumen conciliado del día; histórico, comparativos y alertas usan el día operativo actual." />
        {dailyLoading ? <div className="status-pill auto-refresh-status">Actualizando conciliación y comparativos diarios…</div> : null}
        {dailyError ? <div className="status-pill alert">{dailyError}</div> : null}
      </section>

      <section className="cards-grid stagger-grid summary-operational-kpis">
        <KpiCard label={`Volumen validado de pozos · ${volumeScope}`} value={fmt(groupVolume(wells))} unit={groupVolume(wells) === null ? '' : 'm³'} trend={dailyMode ? dailyVolumeTrend(wells, wellCount, previousDay.wells) : volumeTrend(wells, wellCount)} accent="blue" />
        <KpiCard label={`Volumen validado de líneas · ${volumeScope}`} value={fmt(groupVolume(lines))} unit={groupVolume(lines) === null ? '' : 'm³'} trend={dailyMode ? dailyVolumeTrend(lines, lineCount, previousDay.lines) : volumeTrend(lines, lineCount)} accent="cyan" />
        <KpiCard label={`Volumen validado de lavadoras · ${volumeScope}`} value={fmt(groupVolume(lavadoras))} unit={groupVolume(lavadoras) === null ? '' : 'm³'} trend={dailyMode ? dailyVolumeTrend(lavadoras, lavadoraCount, previousDay.lavadoras) : volumeTrend(lavadoras, lavadoraCount)} accent="indigo" />
        <KpiCard label={`Volumen validado de Jarabes · ${volumeScope}`} value={fmt(groupVolume(jarabes))} unit={groupVolume(jarabes) === null ? '' : 'm³'} trend={dailyMode ? dailyVolumeTrend(jarabes, jarabesCount, previousDay.jarabes) : volumeTrend(jarabes, jarabesCount)} accent="purple" />
        <KpiCard label={`Subtotal validado · ${volumeScope}`} value={fmt(totalValidated)} unit={totalValidated === null ? '' : 'm³'} trend={dailyMode ? 'Suma de grupos con volumen confiable; no convierte faltantes en cero.' : 'Suma de grupos disponibles del periodo.'} accent="cyan" />
        <KpiCard label="Pozos con flujo actual" value={`${Number(snapshotWells.current_flow_count || 0)}/${wellCount}`} unit="pozos" trend="Snapshot actual; independiente del día consultado" accent="teal" />
        <KpiCard label="Líneas con flujo actual" value={`${Number(snapshotLines.current_flow_count || 0)}/${lineCount}`} unit="líneas" trend="Snapshot actual; independiente del día consultado" accent="teal" />
        <KpiCard label="Lavadoras con flujo actual" value={`${Number(snapshotLavadoras.current_flow_count || 0)}/${lavadoraCount}`} unit="lavadoras" trend="Snapshot actual y comunicación reciente" accent="teal" />
        <KpiCard label="Jarabes con flujo actual" value={`${Number(snapshotJarabes.current_flow_count || 0)}/${jarabesCount}`} unit="Jarabes" trend="Snapshot actual y comunicación reciente" accent="teal" />
        <KpiCard label="Revisión / cobertura parcial" value={String(reviewCount)} unit="elementos" trend={dailyMode ? 'Calidad conciliada del día seleccionado' : 'Elementos del periodo que requieren revisión'} accent="brown" />
        <KpiCard label="Última actualización" value={latest ? formatSqlDate(latest) : 'Sin lectura'} unit="" trend={controller.refreshing ? 'Actualizando información…' : 'Snapshot automático cada 60 s'} accent="teal" />
      </section>

      <ModuleHistoryPanel range={controller.range} />
      <WellsMinuteFlowPanel />

      <section className="panel fade-up">
        <PanelHeader
          title="Comparativo diario por módulo"
          subtitle={singleReviewDate
            ? `Día actual ${dateLabel(singleReviewDate)} contra día anterior y misma fecha de la semana anterior.`
            : 'Comparativo diario no disponible.'}
        />
        {!singleReviewDate ? (
          <ChartEmptyState message="El comparativo diario utiliza automáticamente el día operativo actual." />
        ) : dailyReview ? (
          <div className="pozos-table-scroll">
            <table className="pozos-operacion-table">
              <thead>
                <tr>
                  <th>Módulo</th>
                  <th>Día actual</th>
                  <th>Día anterior</th>
                  <th>Variación</th>
                  <th>Semana anterior</th>
                  <th>Variación semanal</th>
                  <th>Actividad</th>
                  <th>Cobertura</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((item) => (
                  <tr key={item.key}>
                    <td><strong>{item.label}</strong></td>
                    <td>{groupVolume(item.group) === null ? 'Sin volumen validado' : `${fmt(groupVolume(item.group))} m³`}</td>
                    <td>{groupVolume(item.previous) === null ? 'Sin referencia' : `${fmt(groupVolume(item.previous))} m³`}</td>
                    <td>{changeText(groupVolume(item.group), groupVolume(item.previous))}</td>
                    <td>{groupVolume(item.week) === null ? 'Sin referencia' : `${fmt(groupVolume(item.week))} m³`}</td>
                    <td>{changeText(groupVolume(item.group), groupVolume(item.week))}</td>
                    <td>{Number(item.group.active_count || 0)}/{item.total}</td>
                    <td><StatusBadge type={groupStatusType(item.group)}>{coverageText(item.group, item.total)}</StatusBadge></td>
                    <td><button type="button" className="date-range-reset" onClick={() => navigate(item.route)}>Abrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : dailyLoading ? (
          <div className="status-pill">Calculando comparativos diarios…</div>
        ) : (
          <ChartEmptyState message="No fue posible obtener el comparativo diario del día actual." />
        )}
      </section>

      <OperationalAlertsPanel alerts={alerts} range={controller.range} aggregation={alertAggregation} />

      <section className="panel fade-up">
        <PanelHeader title="Accesos operativos" subtitle="Módulos confirmados y disponibles para análisis de detalle" />
        <div className="water-type-grid">
          {[
            ['Pozos', 'Elementos operativos confirmados', '/pozos/pozos', 'normal'],
            ['Líneas', 'Producción clasificada desde configuración', '/pozos/lineas', 'normal'],
            ['Lavadoras', 'Tres lavadoras operativas confirmadas', '/pozos/flujos', 'normal'],
            ['Jarabes', 'Elemento operativo independiente', '/pozos/jarabes', 'normal'],
            ['Revisión diaria', 'Cierres por fecha y turnos', '/pozos/revision', 'normal'],
            ['Reportes', 'PDF, Excel, HTML y correo', '/pozos/reportes', 'normal'],
          ].map(([title, detail, path, type]) => (
            <article
              key={title}
              className={`water-type-card ${type}`}
              role="button"
              tabIndex={0}
              onClick={() => navigate(path)}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') navigate(path); }}
            >
              <div className="water-type-head">
                <div><span>Dashboard ARCA</span><strong>{title}</strong></div>
                <StatusBadge type={type}>{type === 'warning' ? 'Pendiente' : 'Disponible'}</StatusBadge>
              </div>
              <div className="water-type-foot"><p>{detail}</p></div>
            </article>
          ))}
        </div>
      </section>

      {controller.error ? <div className="status-pill alert">{controller.error}</div> : null}
      {!dashboard && !controller.loading ? <ChartEmptyState message="No fue posible consultar la información de planta." /> : null}
    </>
  );
}
