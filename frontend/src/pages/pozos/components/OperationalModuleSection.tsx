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
import type { OperationalSectionConfig, OperationalSectionItem } from '../operationalSectionConfig';
import { displayOperationalState, isNormalCommunication } from '../operationalDisplay';
import ChartEmptyState from './ChartEmptyState';
import MetricPair from './MetricPair';
import ModuleHistoryPanel from './ModuleHistoryPanel';
import PanelHeader from './PanelHeader';
import ShiftConsumptionPanel from './ShiftConsumptionPanel';
import SqlChartDateControls from './SqlChartDateControls';
import StatusBadge from './StatusBadge';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';

export type { OperationalIdentity, OperationalModule } from '../operationalNavigation';

type ConfiguredItem = ReturnType<typeof configuredOperationalItems>[number] | OperationalSectionItem;

interface Props {
  module: OperationalModule;
  title: string;
  subtitle: string;
  route: string;
  confirmedSensorIds?: OperationalIdentity[];
  filterItems?: (item: ReturnType<typeof configuredOperationalItems>[number]) => boolean;
  sectionConfig?: OperationalSectionConfig;
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
  if (text.includes('apagado') || text.includes('sin flujo') || text.includes('detenido')) return 'idle';
  if (text.includes('activo') || text.includes('operando')) return 'normal';
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

function itemIdentity(item: ConfiguredItem): OperationalIdentity {
  return item.sensorId ?? item.operationalKey;
}

function operationalKey(row: FlexibleRecord): string {
  return String(row.operational_key || row.operationalKey || '').trim();
}

function rowMatchesAllowedItems(
  row: FlexibleRecord,
  index: number,
  module: OperationalModule,
  allowedItems?: ConfiguredItem[],
): boolean {
  if (!allowedItems?.length) return true;
  const allowedKeys = new Set(allowedItems.map((item) => item.operationalKey));
  const key = operationalKey(row);
  if (key) return allowedKeys.has(key);
  const allowedIdentities = new Set(allowedItems.map((item) => String(itemIdentity(item))));
  return allowedIdentities.has(String(resolveOperationalIdentity(row, index, module)));
}

function uniqueModuleRows(
  dashboard: DashboardData | null,
  module: OperationalModule,
  confirmedSensorIds?: OperationalIdentity[],
  allowedItems?: ConfiguredItem[],
): FlexibleRecord[] {
  const rawRows = rawModuleRows(dashboard, module);
  const confirmed = allowedItems?.length
    ? allowedItems.map(itemIdentity)
    : confirmedSensorIds?.length
      ? confirmedSensorIds
      : configuredOperationalItems(module).map(configuredOperationalIdentity);
  const byIdentity = new Map<string, FlexibleRecord>();

  rawRows.forEach((row, index) => {
    if (!rowMatchesAllowedItems(row, index, module, allowedItems)) return;
    const identity = resolveOperationalIdentity(row, index, module);
    if (!confirmed.map(String).includes(String(identity))) return;
    const key = String(identity);
    byIdentity.set(key, mergeDuplicateRows(byIdentity.get(key), {
      ...row,
      ...(typeof identity === 'number' ? { sensor_id: identity } : { operational_key: identity }),
    }));
  });

  return confirmed.flatMap((identity) => {
    const row = byIdentity.get(String(identity));
    return row ? [row] : [];
  });
}

function currentFlow(row: FlexibleRecord): number | null {
  return number(row.current_flow ?? row.flow_lps ?? row.flow);
}

function isOperating(row: FlexibleRecord): boolean {
  const flow = currentFlow(row);
  const state = String(row.current_state || row.status || '').toLowerCase();
  return (flow !== null && flow > 0) || state.includes('operando') || state.includes('activo');
}

function isNoFlow(row: FlexibleRecord): boolean {
  const flow = currentFlow(row);
  const state = String(row.current_state || row.period_activity || row.activity || '').toLowerCase();
  return (flow !== null && flow <= 0) || state.includes('sin flujo') || state.includes('apagado') || state.includes('sin actividad');
}

function isNoHistory(row: FlexibleRecord): boolean {
  const status = String(row.period_data_status || row.data_status || '').toLowerCase();
  return status === 'no_history' || status === 'no_data' || status.includes('sin histórico') || status.includes('sin registros');
}

function isReview(row: FlexibleRecord): boolean {
  const tokens = [row.period_data_status, row.data_status, row.validation, row.activity, row.period_activity]
    .map((value) => String(value || '').toLowerCase());
  return Boolean(row.has_discontinuities)
    || tokens.some((token) => token.includes('revisión') || token.includes('revision') || token.includes('parcial') || token.includes('invalid'));
}

function rowsWithReading(rows: FlexibleRecord[]): number {
  return rows.filter((row) => (
    row.current_reading_available !== false
    && (currentFlow(row) !== null || number(row.current_totalizer_m3 ?? row.totalizador_m3) !== null || Boolean(row.last_update || row.ultima_lectura))
  )).length;
}

function reliableVolume(row: FlexibleRecord): number | null {
  const value = number(row.validated_volume_m3 ?? row.period_m3 ?? row.period_delta_m3);
  if (value === null) return null;
  if (row.period_m3_reliable === false || row.volume_reliable === false) return null;
  return value;
}

function filteredSummary(rows: FlexibleRecord[]) {
  const volumes = rows.map(reliableVolume).filter((value): value is number => value !== null);
  return {
    totalM3: volumes.length ? volumes.reduce((total, value) => total + value, 0) : null,
    operating: rows.filter(isOperating).length,
    noFlow: rows.filter(isNoFlow).length,
    noHistory: rows.filter(isNoHistory).length,
    review: rows.filter(isReview).length,
    readings: rowsWithReading(rows),
  };
}

export default function OperationalModuleSection({
  module,
  title,
  subtitle,
  route,
  confirmedSensorIds,
  filterItems,
  sectionConfig,
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [initialContext] = useState(() => readOperationalNavigationContext(location.search, module));
  const [aggregation, setAggregation] = useState(initialContext.aggregation);
  const initialRangeFactory = useCallback(() => ({ ...initialContext.range }), [initialContext.range]);
  const controller = useSqlChartDashboard('dashboard', initialRangeFactory, {
    forceRefresh: true,
    includeHistory: false,
    includeEnergyWater: false,
    autoRefresh: true,
  });
  const dashboard = controller.dashboard as DashboardData | null;
  const configuredItems = useMemo<ConfiguredItem[] | undefined>(() => {
    if (sectionConfig) return sectionConfig.items;
    if (!filterItems) return undefined;
    return configuredOperationalItems(module).filter(filterItems);
  }, [filterItems, module, sectionConfig]);

  const rows = useMemo(() => uniqueModuleRows(
    dashboard,
    module,
    confirmedSensorIds,
    configuredItems,
  ), [dashboard, module, confirmedSensorIds, configuredItems]);

  useEffect(() => {
    const search = buildOperationalNavigationSearch(controller.range, aggregation, module);
    if (location.search === search) return;
    navigate({ pathname: location.pathname, search }, { replace: true, state: location.state });
  }, [aggregation, controller.range, location.pathname, location.search, location.state, module, navigate]);

  const rawSummary = filteredSummary(rows);
  const expectedCount = configuredItems?.length || rows.length;
  const openDetail = (identity: OperationalIdentity) => {
    navigate(buildOperationalDetailPath(route, identity, controller.range, aggregation, module), {
      state: { fromOperationalModule: true },
    });
  };
  const labels = sectionConfig?.labels;

  return (
    <>
      <section className="operational-module-heading fade-up">
        <PanelHeader title={title} subtitle={subtitle} />
      </section>

      <SqlChartDateControls
        controller={{ ...controller, aggregation, setAggregation }}
        title="Periodo de análisis"
        subtitle="El rango y la agrupación se conservan al abrir el detalle de un elemento."
      />

      {sectionConfig ? (
        <section className="cards-grid stagger-grid">
          <KpiCard label={labels?.totalKpi || 'Elementos monitoreados'} value={String(rows.length)} unit={sectionConfig.plural} trend={`${rows.length}/${expectedCount} identidades permitidas`} accent="cyan" />
          <KpiCard label={labels?.operatingKpi || 'Elementos operando'} value={String(rawSummary.operating)} unit={sectionConfig.plural} trend="Flujo actual positivo o estado operativo" accent="teal" />
          <KpiCard label={labels?.noFlowKpi || 'Elementos sin flujo'} value={String(rawSummary.noFlow)} unit={sectionConfig.plural} trend="Cero válido o estado sin actividad" accent="blue" />
          <KpiCard label={labels?.readingsKpi || 'Lecturas'} value={`${rawSummary.readings}/${expectedCount}`} unit="lecturas" trend="Lectura actual disponible dentro de la sección" accent="teal" />
          <KpiCard label={labels?.reviewKpi || 'Lecturas en revisión'} value={String(rawSummary.review + rawSummary.noHistory)} unit="elementos" trend="Sin histórico o validación parcial del periodo" accent="brown" />
        </section>
      ) : (
        <section className="cards-grid stagger-grid">
          <KpiCard
            label="Volumen validado del periodo"
            value={rawSummary.totalM3 === null ? 'No disponible' : fmt(rawSummary.totalM3)}
            unit={rawSummary.totalM3 === null ? '' : 'm³'}
            trend={rawSummary.totalM3 === null ? 'No disponible' : 'Suma de incrementos validados'}
            accent="cyan"
          />
          <KpiCard label="Con actividad en el periodo" value={String(rawSummary.operating)} unit="elementos" trend="Flujo positivo o movimiento validado" accent="teal" />
          <KpiCard label="Con flujo actual" value={String(rawSummary.operating)} unit="elementos" trend="Lectura reciente por encima del umbral" accent="teal" />
          <KpiCard label="Sin actividad" value={String(rawSummary.noFlow)} unit="elementos" trend="Muestras válidas sin movimiento" accent="blue" />
          <KpiCard label="Validación parcial o sin histórico" value={String(rawSummary.review + rawSummary.noHistory)} unit="elementos" trend="Se presentan separados de la actividad" accent="brown" />
        </section>
      )}

      <section className="panel fade-up">
        <PanelHeader title={labels?.cardTitle || `Elementos de ${title.toLowerCase()}`} subtitle="Lectura actual y datos principales; selecciona una tarjeta para abrir su análisis" />
        {controller.error ? <div className="status-pill alert">{controller.error}</div> : null}

        <div className={`operational-card-grid ${module === 'well' ? 'operational-well-grid' : ''}`}>
          {rows.map((row, index) => {
            const identity = resolveOperationalIdentity(row, index, module);
            const activity = periodMessage(row);
            const rawState = String(row.current_state || (currentFlow(row) === null ? 'Sin registros' : currentFlow(row)! > 0 ? 'Activo' : 'Sin flujo'));
            const state = displayOperationalState(rawState);
            const communication = String(row.communication || row.estado_comunicacion || 'Sin lectura');
            const communicationNeedsAttention = !isNormalCommunication(communication);
            const volume = number(row.period_m3);
            const flow = currentFlow(row);
            const totalizer = number(row.current_totalizer_m3 ?? row.totalizador_m3);
            return (
              <article key={`${module}-${identity}`} className="operational-element-card">
                <button
                  type="button"
                  className="operational-card-action"
                  onClick={() => openDetail(identity)}
                  aria-label={`Abrir detalle de ${itemName(row, index)}`}
                >
                  <div className="operational-card-main">
                    <div className="operational-card-head">
                      <div>
                        <span>{title}</span>
                        <strong>{itemName(row, index)}</strong>
                      </div>
                      <StatusBadge type={statusType(rawState)}>{state}</StatusBadge>
                    </div>
                    <div className="metric-pairs-grid operational-metric-grid">
                      <MetricPair label="Flujo actual" value={flow === null ? 'Sin dato' : fmt(flow)} unit={flow === null ? '' : String(row.flow_unit || 'L/s')} />
                      <MetricPair label="Totalizador actual" value={totalizer === null ? 'Sin totalizador' : fmt(totalizer)} unit={totalizer === null ? '' : 'm³'} />
                      <MetricPair
                        label="Volumen del periodo"
                        value={volume === null ? 'No disponible' : fmt(volume)}
                        unit={volume === null ? '' : 'm³'}
                      />
                      <MetricPair label="Actividad del periodo" value={activity} />
                    </div>
                  </div>
                  <div className="operational-card-footer">
                    {communicationNeedsAttention
                      ? <span className="warning"><i />{communication}</span>
                      : <span className="last-reading-label">Última lectura</span>}
                    <strong>{formatSqlDate(row.last_update || row.ultima_lectura)}</strong>
                    <span className="open-detail-link">Abrir detalle</span>
                  </div>
                </button>
              </article>
            );
          })}
        </div>
        {!rows.length && !controller.loading ? <ChartEmptyState message={labels?.emptyState || 'Sin registros para el periodo seleccionado.'} /> : null}
      </section>

      <ModuleHistoryPanel
        range={controller.range}
        fixedModule={module}
        aggregation={aggregation}
        onAggregationChange={setAggregation}
        items={configuredItems}
        panelTitle={labels?.historyTitle}
        panelSubtitle={labels?.historySubtitle}
      />

      <ShiftConsumptionPanel
        group={module}
        date={String(controller.range.endDate || controller.range.startDate || '')}
        title={labels?.shiftsTitle || `Cortes por turno · ${title}`}
        items={configuredItems}
        emptyMessage={labels?.emptyState}
      />

      <section className="panel fade-up">
        <PanelHeader title={labels?.tableTitle || 'Tabla operativa'} subtitle={labels?.tableSubtitle || 'La tabla y las tarjetas usan la misma respuesta del periodo'} />
        <div className="pozos-table-scroll">
          <table className="pozos-operacion-table">
            <thead>
              <tr><th>Elemento</th><th>Estado actual</th><th>Flujo actual</th><th>Totalizador inicial</th><th>Totalizador final</th><th>Volumen periodo</th><th>Actividad</th><th>Tiempo activo</th><th>Cobertura</th><th>Comunicación</th><th>Última actualización</th></tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const identity = resolveOperationalIdentity(row, index, module);
                return (
                  <tr key={`table-${module}-${identity}`}>
                    <td>{itemName(row, index)}</td>
                    <td>{displayOperationalState(row.current_state || 'Sin registros')}</td>
                    <td>{currentFlow(row) === null ? '—' : `${fmt(currentFlow(row))} ${String(row.flow_unit || 'L/s')}`}</td>
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
        {!rows.length ? <ChartEmptyState message={labels?.emptyState || 'Sin registros para el periodo seleccionado.'} /> : null}
      </section>
    </>
  );
}
