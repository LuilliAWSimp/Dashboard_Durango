import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import KpiCard from '../../../components/KpiCard';
import { formatSqlDate } from '../dateUtils';
import {
  buildOperationalDetailPath,
  buildOperationalNavigationSearch,
  configuredOperationalIdentity,
  configuredOperationalItems,
  readOperationalNavigationContext,
  resolveOperationalIdentity,
} from '../operationalNavigation';
import type { OperationalIdentity, OperationalModule } from '../operationalNavigation';
import type { DashboardData, FlexibleRecord } from '../types';
import ChartEmptyState from './ChartEmptyState';
import MetricPair from './MetricPair';
import PanelHeader from './PanelHeader';
import ShiftConsumptionPanel from './ShiftConsumptionPanel';
import SqlChartDateControls from './SqlChartDateControls';
import StatusBadge from './StatusBadge';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';

export type { OperationalIdentity, OperationalModule } from '../operationalNavigation';

interface Props {
  module: OperationalModule;
  title: string;
  subtitle: string;
  route: string;
  confirmedSensorIds?: OperationalIdentity[];
}

function array(value: unknown): FlexibleRecord[] {
  return Array.isArray(value) ? value as FlexibleRecord[] : [];
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmt(value: unknown): string {
  const parsed = number(value);
  return parsed === null
    ? '—'
    : parsed.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function itemName(row: FlexibleRecord, index: number): string {
  return String(row.name || row.nombre || `Elemento ${index + 1}`);
}

function statusType(value: unknown): string {
  const text = String(value || '').toLowerCase();
  if (text.includes('revisión') || text.includes('atrasada') || text.includes('parcial')) return 'warning';
  if (text.includes('sin histórico') || text.includes('sin registro') || text.includes('sin lectura')) return 'communication';
  if (text.includes('apagado')) return 'idle';
  if (text.includes('activo')) return 'normal';
  if (text.includes('actividad')) return text.includes('sin actividad') ? 'idle' : 'normal';
  return 'idle';
}

function rawModuleRows(dashboard: DashboardData | null, module: OperationalModule): FlexibleRecord[] {
  if (module === 'well') return array(dashboard?.wells);
  if (module === 'line') return array(dashboard?.production_lines);
  return array(dashboard?.flows);
}

function periodMessage(row: FlexibleRecord): string {
  const status = String(row.period_data_status || row.data_status || '');
  if (status === 'no_history' || status === 'no_data') {
    return row.current_reading_available
      ? 'Sin histórico para el periodo · Lectura actual disponible'
      : 'Sin registros guardados';
  }
  return String(row.period_activity || row.activity || 'Sin histórico para el periodo');
}

function mergeDuplicateRows(previous: FlexibleRecord | undefined, next: FlexibleRecord): FlexibleRecord {
  if (!previous) return { ...next };
  const merged: FlexibleRecord = { ...previous, ...next };
  const currentKeys = [
    'current_flow', 'flow_lps', 'flow', 'current_totalizer_m3', 'totalizador_m3',
    'communication', 'estado_comunicacion', 'communication_status', 'last_update',
    'ultima_lectura', 'current_reading_available',
  ];
  const periodKeys = [
    'period_open_m3', 'period_close_m3', 'period_m3', 'period_delta_m3',
    'period_m3_reliable', 'validated_volume_m3', 'discarded_volume_m3',
    'discarded_totalizer_events', 'discarded_totalizer_event_details',
    'has_discontinuities', 'period_activity', 'period_data_status', 'activity',
    'data_status', 'samples', 'samples_received', 'samples_expected',
    'coverage_percent', 'coverage_status', 'data_reliable', 'active_minutes',
    'flow_active_avg',
  ];

  for (const key of currentKeys) {
    if (next[key] === null || next[key] === undefined || next[key] === '') merged[key] = previous[key];
  }
  for (const key of periodKeys) {
    if (next[key] === null || next[key] === undefined || next[key] === '') merged[key] = previous[key];
  }
  return merged;
}

function uniqueModuleRows(
  dashboard: DashboardData | null,
  module: OperationalModule,
  confirmedSensorIds?: OperationalIdentity[],
): FlexibleRecord[] {
  const rawRows = rawModuleRows(dashboard, module);
  const confirmed = confirmedSensorIds?.length
    ? confirmedSensorIds
    : configuredOperationalItems(module).map(configuredOperationalIdentity);
  const bySensor = new Map<OperationalIdentity, FlexibleRecord>();

  rawRows.forEach((row, index) => {
    const sensorId = resolveOperationalIdentity(row, index, module);
    if (!confirmed.includes(sensorId)) return;
    bySensor.set(sensorId, mergeDuplicateRows(bySensor.get(sensorId), {
      ...row,
      ...(typeof sensorId === 'number' ? { sensor_id: sensorId } : { operational_key: sensorId }),
    }));
  });

  return confirmed.flatMap((sensorId) => {
    const row = bySensor.get(sensorId);
    return row ? [row] : [];
  });
}

export default function OperationalModuleSection({
  module,
  title,
  subtitle,
  route,
  confirmedSensorIds,
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [initialContext] = useState(() => readOperationalNavigationContext(location.search, module));
  const initialRangeFactory = useCallback(() => ({ ...initialContext.range }), [initialContext.range]);
  const controller = useSqlChartDashboard('dashboard', initialRangeFactory, {
    forceRefresh: true,
    includeHistory: false,
    includeEnergyWater: false,
    autoRefresh: true,
  });
  const dashboard = controller.dashboard as DashboardData | null;
  const rows = useMemo(
    () => uniqueModuleRows(dashboard, module, confirmedSensorIds),
    [dashboard, module, confirmedSensorIds],
  );
  const aggregation = initialContext.aggregation;

  useEffect(() => {
    const search = buildOperationalNavigationSearch(controller.range, aggregation, module);
    if (location.search === search) return;
    navigate({ pathname: location.pathname, search }, { replace: true, state: location.state });
  }, [aggregation, controller.range, location.pathname, location.search, location.state, module, navigate]);

  const summaryKey = module === 'well' ? 'wells' : module === 'line' ? 'lines' : 'flows';
  const rawSummary = dashboard?.operational_summary?.[summaryKey];
  const moduleSummary = rawSummary && typeof rawSummary === 'object' && !Array.isArray(rawSummary)
    ? rawSummary as FlexibleRecord
    : {};
  const total = number(moduleSummary.total_m3);
  const active = Number(moduleSummary.active_count || 0);
  const inactive = Number(moduleSummary.inactive_count || 0);
  const currentFlow = Number(moduleSummary.current_flow_count || 0);
  const review = Number(moduleSummary.review_count || 0);
  const noHistory = Number(moduleSummary.no_history_count || 0);
  const hasPartial = Boolean(moduleSummary.has_partial_volume);
  const openDetail = (sensorId: OperationalIdentity) => {
    navigate(buildOperationalDetailPath(route, sensorId, controller.range, aggregation, module), {
      state: { fromOperationalModule: true },
    });
  };

  return (
    <>
      <section className="panel fade-up compact-hero">
        <PanelHeader title={title} subtitle={subtitle} />
        <SqlChartDateControls controller={controller} title="Periodo operativo" />
      </section>

      <section className="cards-grid stagger-grid">
        <KpiCard
          label="Volumen validado del periodo"
          value={total === null ? 'No disponible' : fmt(total)}
          unit={total === null ? '' : 'm³'}
          trend={total === null ? 'No disponible' : hasPartial ? 'Volumen validado parcial' : 'Suma de incrementos validados'}
          accent="cyan"
        />
        <KpiCard label="Con actividad en el periodo" value={String(active)} unit="elementos" trend="Flujo positivo o movimiento validado" accent="teal" />
        <KpiCard label="Con flujo actual" value={String(currentFlow)} unit="elementos" trend="Lectura reciente por encima del umbral" accent="teal" />
        <KpiCard label="Sin actividad" value={String(inactive)} unit="elementos" trend="Muestras válidas sin movimiento" accent="blue" />
        <KpiCard label="Revisión o sin histórico" value={String(review + noHistory)} unit="elementos" trend="No incluidos como cero confiable" accent="brown" />
      </section>

      <section className="panel fade-up">
        <PanelHeader title={`Elementos de ${title.toLowerCase()}`} subtitle="Lectura actual y métricas generales; selecciona una tarjeta para abrir su análisis" />
        {controller.error ? <div className="status-pill alert">{controller.error}</div> : null}

        {/* Single canonical card block. Legacy well cards are intentionally not rendered. */}
        <div className={`operational-card-grid ${module === 'well' ? 'operational-well-grid' : ''}`}>
          {rows.map((row, index) => {
            const sensorId = resolveOperationalIdentity(row, index, module);
            const activity = periodMessage(row);
            const currentState = String(row.current_state || (number(row.current_flow ?? row.flow_lps ?? row.flow) === null ? 'Sin registros' : number(row.current_flow ?? row.flow_lps ?? row.flow)! > 0 ? 'Activo' : 'Apagado con datos'));
            const communication = String(row.communication || row.estado_comunicacion || 'Sin lectura');
            const volume = number(row.period_m3);
            const flow = number(row.current_flow ?? row.flow_lps ?? row.flow);
            const totalizer = number(row.current_totalizer_m3 ?? row.totalizador_m3);
            return (
              <article key={`${module}-${sensorId}`} className="operational-element-card">
                <button
                  type="button"
                  className="operational-card-action"
                  onClick={() => openDetail(sensorId)}
                  aria-label={`Abrir detalle de ${itemName(row, index)}`}
                >
                  <div className="operational-card-main">
                    <div className="operational-card-head">
                      <div>
                        <span>{title}</span>
                        <strong>{itemName(row, index)}</strong>
                      </div>
                      <StatusBadge type={statusType(currentState)}>{currentState}</StatusBadge>
                    </div>
                    <div className="metric-pairs-grid operational-metric-grid">
                      <MetricPair label="Flujo actual" value={flow === null ? 'Sin dato' : fmt(flow)} unit={flow === null ? '' : String(row.flow_unit || 'L/s')} />
                      <MetricPair label="Totalizador actual" value={totalizer === null ? 'Sin totalizador' : fmt(totalizer)} unit={totalizer === null ? '' : 'm³'} />
                      <MetricPair
                        label={row.has_discontinuities ? 'Volumen validado parcial' : 'Volumen del periodo'}
                        value={volume === null ? 'No disponible' : fmt(volume)}
                        unit={volume === null ? '' : 'm³'}
                      />
                      <MetricPair label="Actividad del periodo" value={activity} />
                      <MetricPair label="Tiempo activo" value={number(row.active_minutes) === null ? '—' : fmt(row.active_minutes)} unit={number(row.active_minutes) === null ? '' : 'min'} />
                      <MetricPair label="Cobertura" value={number(row.coverage_percent) === null ? '—' : fmt(row.coverage_percent)} unit={number(row.coverage_percent) === null ? '' : '%'} />
                    </div>
                  </div>
                  <div className="operational-card-footer">
                    <span className={communication.toLowerCase().includes('actual') ? 'online' : 'warning'}><i />{communication}</span>
                    <strong>{formatSqlDate(row.last_update || row.ultima_lectura)}</strong>
                    <span className="open-detail-link">Abrir detalle</span>
                  </div>
                </button>
              </article>
            );
          })}
        </div>
        {!rows.length && !controller.loading ? <ChartEmptyState message="Sin registros para el periodo seleccionado." /> : null}
      </section>

      <ShiftConsumptionPanel group={module} date={String(controller.range.endDate || controller.range.startDate || '')} title={`Cortes por turno · ${title}`} />

      <section className="panel fade-up">
        <PanelHeader title="Tabla operativa" subtitle="La tabla y las tarjetas usan la misma respuesta del periodo" />
        <div className="pozos-table-scroll">
          <table className="pozos-operacion-table">
            <thead>
              <tr><th>Elemento</th><th>Estado actual</th><th>Flujo actual</th><th>Apertura</th><th>Cierre</th><th>Volumen periodo</th><th>Actividad</th><th>Tiempo activo</th><th>Cobertura</th><th>Comunicación</th><th>Última actualización</th></tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const sensorId = resolveOperationalIdentity(row, index, module);
                return (
                  <tr key={`table-${module}-${sensorId}`}>
                    <td>{itemName(row, index)}</td>
                    <td>{String(row.current_state || 'Sin registros')}</td>
                    <td>{number(row.current_flow ?? row.flow_lps) === null ? '—' : `${fmt(row.current_flow ?? row.flow_lps)} ${String(row.flow_unit || 'L/s')}`}</td>
                    <td>{number(row.period_open_m3) === null ? '—' : `${fmt(row.period_open_m3)} m³`}</td>
                    <td>{number(row.period_close_m3) === null ? '—' : `${fmt(row.period_close_m3)} m³`}</td>
                    <td>{number(row.period_m3) === null ? 'No disponible' : row.has_discontinuities ? `Volumen validado parcial: ${fmt(row.period_m3)} m³` : `${fmt(row.period_m3)} m³`}</td>
                    <td>{periodMessage(row)}</td>
                    <td>{number(row.active_minutes) === null ? '—' : `${fmt(row.active_minutes)} min`}</td>
                    <td>{number(row.coverage_percent) === null ? '—' : `${fmt(row.coverage_percent)}% · ${String(row.coverage_status || '')}`}</td>
                    <td>{String(row.communication || row.estado_comunicacion || 'Sin lectura')}</td>
                    <td>{formatSqlDate(row.last_update || row.ultima_lectura)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
