import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import KpiCard from '../../../components/KpiCard';
import { DURANGO_CAPABILITIES } from '../../../config/plantCapabilities';
import { JARABES_SECTION_CONFIG, LAVADORAS_SECTION_CONFIG } from '../operationalSectionConfig';
import ChartEmptyState from '../components/ChartEmptyState';
import ModuleHistoryPanel from '../components/ModuleHistoryPanel';
import PanelHeader from '../components/PanelHeader';
import SqlChartDateControls from '../components/SqlChartDateControls';
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
function summaryGroup(summary: FlexibleRecord, key: string): FlexibleRecord {
  const candidate = summary[key];
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate as FlexibleRecord : {};
}
function volumeTrend(group: FlexibleRecord, total: number): string {
  if (number(group.total_m3) === null) return 'No disponible';
  return `${Number(group.active_count || 0)}/${total} con actividad en el periodo`;
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
    const flow = number(item.current_flow_lps ?? item.flow_lps ?? item.instant_flow_lps ?? item.flujo_lps);
    if (flow !== null && flow > 0) currentFlow += 1;
  });
  return { total_m3: hasVolume ? total : null, active_count: active, current_flow_count: currentFlow };
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
  const summary = (dashboard?.operational_summary || {}) as FlexibleRecord;
  const wells = summaryGroup(summary, 'wells');
  const lines = summaryGroup(summary, 'lines');
  const flows = summaryGroup(summary, 'flows');
  const flowRows = rows(dashboard?.flows);
  const lavadoraKeys = LAVADORAS_SECTION_CONFIG.allowedOperationalKeys;
  const jarabesKeys = JARABES_SECTION_CONFIG.allowedOperationalKeys;
  const lavadorasRows = flowRows.filter((item) => lavadoraKeys.includes(operationalKey(item)));
  const jarabesRows = flowRows.filter((item) => jarabesKeys.includes(operationalKey(item)));
  const lavadoras = rowSummary(lavadorasRows);
  const jarabes = rowSummary(jarabesRows);
  const all = useMemo(
    () => [...rows(dashboard?.wells), ...rows(dashboard?.production_lines), ...flowRows],
    [dashboard],
  );
  const latestValues = all
    .map((item) => String(item.last_update || item.ultima_lectura || ''))
    .filter(Boolean)
    .sort();
  const latest = latestValues[latestValues.length - 1];
  const review = Number(wells.review_count || 0) + Number(lines.review_count || 0) + Number(flows.review_count || 0);
  const alerts = useMemo(() => evaluateDurangoWaterAlerts(dashboard), [dashboard]);
  const alertAggregation = useMemo(() => recommendedHistoryAggregation(controller.range), [controller.range.startDate, controller.range.endDate]);
  const wellCount = DURANGO_CAPABILITIES.wells.length;
  const lineCount = DURANGO_CAPABILITIES.lines.length;
  const lavadoraCount = LAVADORAS_SECTION_CONFIG.items.length;
  const jarabesCount = JARABES_SECTION_CONFIG.items.length;

  return (
    <>
      <section className="panel fade-up compact-hero">
        <PanelHeader title="Resumen hídrico de Durango" subtitle="Lectura actual y volúmenes validados del periodo seleccionado" />
        <SqlChartDateControls controller={controller} title="Periodo del resumen" />
      </section>

      <section className="cards-grid stagger-grid summary-operational-kpis">
        <KpiCard label="Volumen validado de pozos" value={fmt(wells.total_m3)} unit={number(wells.total_m3) === null ? '' : 'm³'} trend={volumeTrend(wells, wellCount)} accent="blue" />
        <KpiCard label="Volumen validado de líneas" value={fmt(lines.total_m3)} unit={number(lines.total_m3) === null ? '' : 'm³'} trend={volumeTrend(lines, lineCount)} accent="cyan" />
        <KpiCard label="Volumen validado de lavadoras" value={fmt(lavadoras.total_m3)} unit={number(lavadoras.total_m3) === null ? '' : 'm³'} trend={volumeTrend(lavadoras, lavadoraCount)} accent="indigo" />
        <KpiCard label="Volumen validado de Jarabes" value={fmt(jarabes.total_m3)} unit={number(jarabes.total_m3) === null ? '' : 'm³'} trend={volumeTrend(jarabes, jarabesCount)} accent="purple" />
        <KpiCard label="Pozos con flujo actual" value={`${Number(wells.current_flow_count || 0)}/${wellCount}`} unit="pozos" trend="Lectura reciente por encima del umbral operativo" accent="teal" />
        <KpiCard label="Líneas con flujo actual" value={`${Number(lines.current_flow_count || 0)}/${lineCount}`} unit="líneas" trend="Independiente de la actividad del periodo" accent="teal" />
        <KpiCard label="Lavadoras con flujo actual" value={`${Number(lavadoras.current_flow_count || 0)}/${lavadoraCount}`} unit="lavadoras" trend="Lectura actual y comunicación válida" accent="teal" />
        <KpiCard label="Jarabes con flujo actual" value={`${Number(jarabes.current_flow_count || 0)}/${jarabesCount}`} unit="Jarabes" trend="Lectura actual y comunicación válida" accent="teal" />
        <KpiCard label="Volúmenes validados" value={String(review)} unit="elementos" trend="Datos revisados para operación" accent="brown" />
        <KpiCard label="Última actualización" value={latest ? formatSqlDate(latest) : 'Sin lectura'} unit="" trend={controller.refreshing ? 'Actualizando información…' : 'Actualización automática cada 60 s'} accent="teal" />
      </section>

      <ModuleHistoryPanel range={controller.range} />
      <WellsMinuteFlowPanel />

      <OperationalAlertsPanel alerts={alerts} range={controller.range} aggregation={alertAggregation} />

      <section className="panel fade-up">
        <PanelHeader title="Accesos operativos" subtitle="Módulos confirmados y pendientes de validación" />
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
