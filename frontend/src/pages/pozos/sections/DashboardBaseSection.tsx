import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DURANGO_CAPABILITIES } from '../../../config/plantCapabilities';
import { fetchWaterDailyReview } from '../../../services/waterService';
import { JARABES_SECTION_CONFIG, LAVADORAS_SECTION_CONFIG } from '../operationalSectionConfig';
import ChartEmptyState from '../components/ChartEmptyState';
import ModuleHistoryPanel from '../components/ModuleHistoryPanel';
import PanelHeader from '../components/PanelHeader';
import StatusBadge from '../components/StatusBadge';
import OperationalAlertsPanel from '../components/OperationalAlertsPanel';
import { defaultTodayRange, formatSqlDate, recommendedHistoryAggregation } from '../dateUtils';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';
import type { DashboardData, FlexibleRecord } from '../types';
import { evaluateDurangoWaterAlerts } from '../waterOperationalAlerts';
import { operationalVolumeLabel } from '../operationalTerminology';
import { currentFlowSummary } from '../summaryFlow';


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
  let inactive = 0;
  let currentFlow = 0;
  let coverageAvailable = 0;
  let qualityIssueCount = 0;
  let noDataCount = 0;
  let partialCount = 0;
  items.forEach((item) => {
    const volume = validatedRowVolume(item);
    if (volume !== null) {
      total += volume;
      hasVolume = true;
      coverageAvailable += 1;
    }
    const activity = String(item.activity || item.period_activity || '').toLowerCase();
    if (activity.includes('con actividad') || Number(item.active_minutes || 0) > 0 || (volume !== null && volume > 0)) active += 1;
    if (activity.includes('sin actividad')) inactive += 1;
    const flow = number(item.current_flow_lps ?? item.current_flow ?? item.flow_lps ?? item.instant_flow_lps ?? item.flujo_lps);
    if (flow !== null && flow > 0) currentFlow += 1;
    const dataStatus = String(item.data_status || item.period_data_status || '').toLowerCase();
    const qualityStatus = String(item.quality_status || '').toLowerCase();
    if (Boolean(item.has_discontinuities)) partialCount += 1;
    if (Boolean(item.has_discontinuities) || dataStatus === 'invalid_totalizer' || ['review', 'partial_coverage'].includes(qualityStatus)) qualityIssueCount += 1;
    if (['no_history', 'no_data'].includes(dataStatus) || qualityStatus === 'no_data') noDataCount += 1;
  });
  const validatedTotal = hasVolume ? total : null;
  return {
    total_m3: validatedTotal,
    validated_volume_m3: validatedTotal,
    subtotal_validated_m3: validatedTotal,
    active_count: active,
    inactive_count: inactive,
    current_flow_count: currentFlow,
    coverage_available: coverageAvailable,
    coverage_total: items.length,
    coverage_complete: items.length > 0 && coverageAvailable === items.length,
    review_count: qualityIssueCount,
    no_data_count: noDataCount,
    no_history_count: noDataCount,
    partial_count: partialCount,
  };
}
function groupVolume(group: FlexibleRecord): number | null {
  return number(group.subtotal_validated_m3 ?? group.validated_volume_m3 ?? group.total_m3);
}
function coverageText(group: FlexibleRecord, total: number): string {
  const available = Number(group.coverage_available ?? 0);
  const denominator = Number(group.coverage_total ?? total);
  if (!denominator) return 'Sin elementos monitoreados';
  return `${available}/${denominator} con datos`;
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

interface SummaryProcessCardProps {
  title: string;
  route: string;
  volumeLabel: string;
  group: FlexibleRecord;
  previous: FlexibleRecord;
  items: FlexibleRecord[];
  total: number;
  dailyMode: boolean;
}

function SummaryProcessCard({ title, route, volumeLabel, group, previous, items, total, dailyMode }: SummaryProcessCardProps) {
  const volume = groupVolume(group);
  const flow = currentFlowSummary(items);
  const active = Number(group.active_count ?? 0);
  return (
    <Link className="durango-summary-process-card" to={route} aria-label={`Abrir módulo ${title}`}>
      <div className="durango-summary-process-head">
        <strong>{title}</strong>
        <span>Abrir módulo →</span>
      </div>
      <div className="durango-summary-process-primary">
        <span>{volumeLabel}</span>
        <div className="durango-summary-process-value">
          <strong>{volume === null ? 'Sin datos' : fmt(volume)}</strong>
          {volume !== null ? <span>m³</span> : null}
        </div>
      </div>
      <div className="durango-summary-process-secondary">
        <div>
          <span>Flujo reportado</span>
          <strong>{flow === null ? 'Sin lectura' : `${fmt(flow)} L/s`}</strong>
        </div>
        <div>
          <span>Actividad del periodo</span>
          <strong>{active}/{total}</strong>
        </div>
      </div>
      <div className="durango-summary-process-foot">
        {dailyMode ? dailyVolumeTrend(group, total, previous) : coverageText(group, total)}
      </div>
    </Link>
  );
}

export default function DashboardBaseSection() {
  const navigate = useNavigate();
  const controller = useSqlChartDashboard('dashboard', defaultTodayRange, {
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
  }, [singleReviewDate]);

  const dashboardSummary = (dashboard?.operational_summary || {}) as FlexibleRecord;
  const dashboardWells = summaryGroup(dashboardSummary, 'wells');
  const dashboardLines = summaryGroup(dashboardSummary, 'lines');

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
  // El volumen/actividad actual proviene del periodo que ya cargó el dashboard.
  // Revisión diaria queda reservada a referencias históricas (ayer/semana anterior)
  // y no se vuelve a consultar en cada tick de 60 s.
  const wells = dashboardWells;
  const lines = dashboardLines;
  const lavadoras = dashboardLavadoras;
  const jarabes = dashboardJarabes;

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
  const alerts = useMemo(() => evaluateDurangoWaterAlerts(dashboard), [dashboard]);
  const alertAggregation = useMemo(() => recommendedHistoryAggregation(controller.range), [controller.range.startDate, controller.range.endDate]);
  const wellCount = DURANGO_CAPABILITIES.wells.length;
  const lineCount = DURANGO_CAPABILITIES.lines.length;
  const lavadoraCount = LAVADORAS_SECTION_CONFIG.items.length;
  const jarabesCount = JARABES_SECTION_CONFIG.items.length;
  const volumeScope = dailyMode ? `día ${dateLabel(singleReviewDate)}` : 'periodo seleccionado';
  const currentFlowCount = [snapshotWells, snapshotLines, snapshotLavadoras, snapshotJarabes]
    .reduce((sum, group) => sum + Number(group.current_flow_count || 0), 0);
  const monitoredCount = wellCount + lineCount + lavadoraCount + jarabesCount;
  const criticalAlertCount = alerts.filter((alert) => alert.severity === 'critical').length;
  const alertTrend = alerts.length === 0
    ? 'Sin alertas operativas activas'
    : criticalAlertCount > 0
      ? `${criticalAlertCount} crítica${criticalAlertCount === 1 ? '' : 's'} · revisar alertas`
      : `${alerts.length} aviso${alerts.length === 1 ? '' : 's'} · revisar alertas`;

  // Single catalog for both the LF16-style cards and the original comparison table.
  const comparisonRows = [
    { key: 'wells', label: 'Pozos', volumeLabel: `${operationalVolumeLabel('well')} de pozos`, items: wellRows, group: wells, previous: previousDay.wells, week: previousWeek.wells, total: wellCount, route: '/pozos/pozos' },
    { key: 'lines', label: 'Líneas', volumeLabel: `${operationalVolumeLabel('line')} de líneas`, items: lineRows, group: lines, previous: previousDay.lines, week: previousWeek.lines, total: lineCount, route: '/pozos/lineas' },
    { key: 'lavadoras', label: 'Lavadoras', volumeLabel: `${operationalVolumeLabel('flow')} de lavadoras`, items: lavadorasRows, group: lavadoras, previous: previousDay.lavadoras, week: previousWeek.lavadoras, total: lavadoraCount, route: '/pozos/flujos' },
    { key: 'jarabes', label: 'Jarabes', volumeLabel: `${operationalVolumeLabel('flow')} de Jarabes`, items: jarabesRows, group: jarabes, previous: previousDay.jarabes, week: previousWeek.jarabes, total: jarabesCount, route: '/pozos/jarabes' },
  ];

  return (
    <div className="dashboard-resumen-page">
      <section className="durango-summary-shell fade-up" aria-label="Resumen de agua Durango">
        <div className="durango-summary-top">
          <div className="durango-summary-heading">
            <span className="durango-summary-eyebrow">Dashboard ARCA · Planta Durango</span>
            <h1>Resumen operativo de agua</h1>
            <p>Vista ejecutiva de la operación, el histórico consolidado, los comparativos por módulo y las alertas de la planta.</p>
          </div>
          <div className="durango-summary-state" role="status" aria-live="polite">
            <span className="durango-summary-state-label">Estado general</span>
            <strong>{controller.loading ? 'Actualizando información' : controller.refreshing ? 'Actualizando lecturas' : controller.error ? 'Sin actualización reciente' : dashboard ? 'Información actualizada' : 'Sin datos disponibles'}</strong>
            <span>Última actualización: {latest ? formatSqlDate(latest) : 'Sin lectura'}</span>
            <span>Elementos con flujo actual: <b>{currentFlowCount}/{monitoredCount}</b></span>
            <span>Alertas activas: <b>{alerts.length}</b></span>
            <span className="durango-summary-state-note">{alertTrend}</span>
          </div>
        </div>
        <div className="durango-summary-process-grid" aria-label="Módulos principales de Durango">
          {comparisonRows.map((item) => (
            <SummaryProcessCard
              key={item.key}
              title={item.label}
              route={item.route}
              volumeLabel={`${item.volumeLabel} · ${volumeScope}`}
              group={item.group}
              previous={item.previous}
              items={item.items}
              total={item.total}
              dailyMode={dailyMode}
            />
          ))}
        </div>
        {dailyLoading ? <div className="status-pill auto-refresh-status">Actualizando comparativos diarios…</div> : null}
        {dailyError ? <div className="status-pill alert">{dailyError}</div> : null}
      </section>

      <ModuleHistoryPanel range={controller.range} independentRange />

      <section className="panel fade-up">
        <PanelHeader
          title="Comparativo de volumen por módulo"
          subtitle={singleReviewDate
            ? `Fecha seleccionada ${dateLabel(singleReviewDate)} frente al día anterior y la misma fecha de la semana anterior.`
            : 'Selecciona un solo día para consultar el comparativo.'}
        />
        {!singleReviewDate ? (
          <ChartEmptyState message="Selecciona un solo día para consultar el comparativo por módulo." />
        ) : dailyReview ? (
          <div className="pozos-table-scroll">
            <table className="pozos-operacion-table">
              <thead>
                <tr>
                  <th>Módulo</th>
                  <th>Fecha seleccionada</th>
                  <th>Día anterior</th>
                  <th>Variación</th>
                  <th>Semana anterior</th>
                  <th>Variación semanal</th>
                  <th>Actividad</th>
                  <th>Datos</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((item) => (
                  <tr key={item.key}>
                    <td><strong>{item.label}</strong></td>
                    <td>{groupVolume(item.group) === null ? 'Sin dato' : `${fmt(groupVolume(item.group))} m³`}</td>
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
          <ChartEmptyState message="No fue posible obtener el comparativo de la fecha seleccionada." />
        )}
      </section>

      <OperationalAlertsPanel alerts={alerts} range={controller.range} aggregation={alertAggregation} />

      {controller.error ? <div className="status-pill alert">{controller.error}</div> : null}
      {!dashboard && !controller.loading ? <ChartEmptyState message="No fue posible consultar la información de planta." /> : null}
    </div>
  );
}
