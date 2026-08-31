import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatSqlDate } from '../dateUtils';
import {
  buildOperationalNavigationSearch,
  configuredOperationalIdentity,
  configuredOperationalItems,
  readOperationalNavigationContext,
  resolveOperationalIdentity,
} from '../operationalNavigation';
import type { OperationalIdentity, OperationalModule } from '../operationalNavigation';
import type { DashboardData, DateRange, FlexibleRecord, HistoryAggregation } from '../types';
import type { OperationalSectionConfig, OperationalSectionItem } from '../operationalSectionConfig';
import DateRangeControls from './DateRangeControls';
import FiveMinuteExcelExportButton from './FiveMinuteExcelExportButton';
import MetricPair from './MetricPair';
import PanelHeader from './PanelHeader';
import ModuleHistoryPanel from './ModuleHistoryPanel';
import ShiftConsumptionPanel from './ShiftConsumptionPanel';
import StatusBadge from './StatusBadge';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';

interface Props {
  module: OperationalModule;
  sensorId: OperationalIdentity;
  backPath: string;
  sectionConfig?: OperationalSectionConfig;
}

type ConfiguredItem = ReturnType<typeof configuredOperationalItems>[number] | OperationalSectionItem;

function array(value: unknown): FlexibleRecord[] {
  return Array.isArray(value) ? value as FlexibleRecord[] : [];
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmt(value: unknown): string {
  const parsed = num(value);
  return parsed === null
    ? '—'
    : parsed.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function moduleRows(dashboard: DashboardData | null, module: OperationalModule): FlexibleRecord[] {
  if (module === 'well') return array(dashboard?.wells);
  if (module === 'line') return array(dashboard?.production_lines);
  return array(dashboard?.flows);
}

function statusType(item?: FlexibleRecord): string {
  const currentState = String(item?.current_state || '').toLowerCase();
  if (currentState.includes('revisión') || currentState.includes('atrasada') || currentState.includes('comunicación') || currentState.includes('comunicacion')) return 'warning';
  if (currentState.includes('sin registro') || currentState.includes('sin lectura') || currentState.includes('sin datos')) return 'communication';
  if (currentState.includes('apagado') || currentState.includes('sin flujo')) return 'idle';
  if (currentState.includes('activo') || currentState.includes('operando')) return 'normal';
  const status = String(item?.period_data_status || item?.data_status || '').toLowerCase();
  const activity = String(item?.period_activity || item?.activity || '').toLowerCase();
  if (status.includes('review') || activity.includes('revisión') || activity.includes('parcial')) return 'warning';
  if (status.includes('no_') || activity.includes('sin registro') || activity.includes('sin histórico')) return 'communication';
  if (activity.includes('sin actividad')) return 'idle';
  return 'normal';
}

function itemIdentity(item: ConfiguredItem): OperationalIdentity {
  return item.sensorId ?? item.operationalKey;
}

function rowOperationalKey(row: FlexibleRecord): string {
  return String(row.operational_key || row.operationalKey || '').trim();
}

function rowMatchesItems(row: FlexibleRecord, index: number, module: OperationalModule, items?: ConfiguredItem[]) {
  if (!items?.length) return true;
  const key = rowOperationalKey(row);
  const allowedKeys = new Set(items.map((item) => item.operationalKey));
  if (key) return allowedKeys.has(key);
  const allowedIdentities = new Set(items.map((item) => String(itemIdentity(item))));
  return allowedIdentities.has(String(resolveOperationalIdentity(row, index, module)));
}

export default function OperationalDetailSection({ module, sensorId, backPath, sectionConfig }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [initialContext] = useState(() => readOperationalNavigationContext(location.search, module));
  const initialRangeFactory = useCallback(() => ({ ...initialContext.range }), [initialContext.range]);
  const current = useSqlChartDashboard('dashboard', initialRangeFactory, {
    forceRefresh: true,
    includeHistory: false,
    includeEnergyWater: false,
    autoRefresh: true,
  });
  const [historyAggregation, setHistoryAggregation] = useState<HistoryAggregation>(initialContext.aggregation);
  const dashboard = current.dashboard as DashboardData | null;
  const allowedItems = sectionConfig?.items;
  const rows = moduleRows(dashboard, module).filter((row, index) => rowMatchesItems(row, index, module, allowedItems));
  const item = rows.find(
    (row, index) => String(resolveOperationalIdentity(row, index, module)) === String(sensorId),
  );
  const navigationItems = useMemo(
    () => (allowedItems?.length ? allowedItems : configuredOperationalItems(module)).map((configured) => ({
      identity: allowedItems?.length ? itemIdentity(configured) : configuredOperationalIdentity(configured),
      name: configured.name,
    })),
    [allowedItems, module],
  );
  const configuredItems = allowedItems?.length ? allowedItems : configuredOperationalItems(module);
  const configuredHistoryItem = configuredItems.find((configured) => (
    String(allowedItems?.length ? itemIdentity(configured as ConfiguredItem) : configuredOperationalIdentity(configured as ReturnType<typeof configuredOperationalItems>[number])) === String(sensorId)
  ));
  const currentIndex = navigationItems.findIndex((configured) => String(configured.identity) === String(sensorId));
  const previous = currentIndex > 0 ? navigationItems[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < navigationItems.length - 1
    ? navigationItems[currentIndex + 1]
    : null;
  const configuredName = currentIndex >= 0 ? navigationItems[currentIndex]?.name : null;
  const name = String(item?.name || item?.nombre || configuredName || `Elemento ${sensorId}`);
  const flowUnit = String(item?.flow_unit || configuredHistoryItem?.flowUnit || 'L/s');
  const activity = String(item?.period_activity || item?.activity || 'Sin registros');
  const currentState = String(item?.current_state || (num(item?.current_flow ?? item?.flow_lps) === null ? 'Sin registros' : Number(item?.current_flow ?? item?.flow_lps) > 0 ? 'Activo' : 'Sin flujo'));
  const communication = String(item?.communication || item?.estado_comunicacion || 'Sin lectura');
  const detailOpen = item?.reconciled_open_m3 ?? item?.period_open_m3;
  const detailClose = item?.reconciled_close_m3 ?? item?.period_close_m3;
  const detailVolume = item?.reconciled_validated_volume_m3 ?? item?.validated_volume_m3 ?? item?.period_m3;
  const reconciledReliable = item?.reconciled_volume_reliable;
  const detailVolumeReliable = typeof reconciledReliable === 'boolean'
    ? reconciledReliable
    : Boolean(item?.quality_volume_reliable ?? item?.volume_reliable);
  const qualityLabel = String(item?.quality_label || item?.validation || item?.coverage_status || activity);
  const qualityReason = String(item?.quality_reason || '').trim();
  const labels = sectionConfig?.labels;
  const navigationLabel = labels?.navigationLabel || (module === 'well' ? 'pozos' : module === 'line' ? 'líneas' : 'flujos');
  const historyItems = useMemo(() => [{
    sensorId: configuredHistoryItem?.sensorId ?? (typeof sensorId === 'number' ? sensorId : null),
    operationalKey: String(configuredHistoryItem?.operationalKey || rowOperationalKey(item || {}) || sensorId),
    name,
    flowUnit,
  }], [configuredHistoryItem, flowUnit, item, name, sensorId]);
  const exportElementId = configuredHistoryItem
    ? (configuredHistoryItem.sensorId ?? configuredHistoryItem.operationalKey)
    : sensorId;

  useEffect(() => {
    const search = buildOperationalNavigationSearch(current.range, historyAggregation, module);
    if (location.search === search) return;
    navigate({ pathname: location.pathname, search }, { replace: true, state: location.state });
  }, [current.range, historyAggregation, location.pathname, location.search, location.state, module, navigate]);

  const updateDraftRange = (range: DateRange) => {
    current.setDraftRange(range);
  };

  const applyRange = () => {
    current.apply();
  };

  const resetRange = () => {
    const nextRange = { ...initialContext.range };
    current.setDraftRange(nextRange);
    current.setRange((previousRange) => ({
      ...nextRange,
      refreshKey: Number(previousRange.refreshKey || 0) + 1,
    }));
    setHistoryAggregation(initialContext.aggregation);
  };

  const activeSearch = buildOperationalNavigationSearch(current.range, historyAggregation, module);
  const navigateToSibling = (identity: OperationalIdentity) => {
    navigate(`${backPath}/${encodeURIComponent(String(identity))}${activeSearch}`, {
      replace: true,
      state: location.state,
    });
  };
  const goBack = () => {
    navigate(`${backPath}${activeSearch}`);
  };

  return (
    <>
      <section className="well-detail-hero panel fade-up">
        <div className="well-detail-main-head">
          <button type="button" className="back-inline-button" onClick={goBack}>
            <ArrowLeft size={16} /> Volver
          </button>
          <nav className="operational-sibling-navigation" aria-label={`Navegación entre ${navigationLabel}`}>
            {previous ? (
              <button type="button" onClick={() => navigateToSibling(previous.identity)}>
                <ChevronLeft size={15} /> {previous.name}
              </button>
            ) : <span />}
            <strong>{name}</strong>
            {next ? (
              <button type="button" onClick={() => navigateToSibling(next.identity)}>
                {next.name} <ChevronRight size={15} />
              </button>
            ) : <span />}
          </nav>
          <div className="eyebrow">Detalle operativo</div>
          <div className="well-detail-title-row">
            <h2>{name}</h2>
            <StatusBadge type={statusType({ ...item, current_state: currentState })}>{currentState}</StatusBadge>
          </div>
          <p>{labels?.detailSubtitle || 'Análisis individual del elemento para el periodo seleccionado.'}</p>
        </div>
        <div className="well-detail-hero-metrics">
          <article><span>Flujo actual</span><strong>{fmt(item?.current_flow ?? item?.flow_lps)} <small>{flowUnit}</small></strong></article>
          <article><span>Totalizador actual</span><strong>{fmt(item?.current_totalizer_m3 ?? item?.totalizador_m3)} <small>m³</small></strong></article>
          <article><span>Volumen del periodo</span><strong>{detailVolumeReliable && num(detailVolume) !== null ? fmt(detailVolume) : qualityLabel} <small>{detailVolumeReliable && num(detailVolume) !== null ? 'm³' : ''}</small></strong>{!detailVolumeReliable && qualityReason ? <small className="quality-reason-inline">{qualityReason}</small> : null}</article>
          <article><span>Actividad del periodo</span><strong>{activity}</strong></article>
          <article><span>Tiempo activo</span><strong>{fmt(item?.active_minutes)} <small>{num(item?.active_minutes) === null ? '' : 'min'}</small></strong></article>
          <article><span>Cobertura</span><strong>{fmt(item?.coverage_percent)} <small>{num(item?.coverage_percent) === null ? '' : '%'}</small></strong></article>
          <article><span>Comunicación</span><strong>{communication}</strong></article>
          <article><span>Última lectura</span><strong>{formatSqlDate(item?.last_update || item?.ultima_lectura)}</strong></article>
        </div>
      </section>

      <DateRangeControls
        draftRange={current.draftRange}
        activeRange={current.range}
        onDraftChange={updateDraftRange}
        onApply={applyRange}
        onReset={resetRange}
        status={current.loading ? 'Actualizando periodo...' : undefined}
        title="Rango del detalle"
        subtitle="El rango actualiza indicadores, histórico y exportación conciliada de 5 minutos."
        extraAction={(
          <FiveMinuteExcelExportButton
            module={module}
            elementId={exportElementId}
            range={current.range}
          />
        )}
      />
      {current.error ? <div className="status-pill alert">{current.error}</div> : null}

      <ModuleHistoryPanel
        range={current.range}
        fixedModule={module}
        aggregation={historyAggregation}
        onAggregationChange={setHistoryAggregation}
        items={historyItems}
        panelTitle={`Histórico operativo · ${name}`}
        panelSubtitle="Flujo y totalizador usan la misma fuente histórica común del módulo; los huecos permanecen como ausencia de registro."
      />

      <section className="panel fade-up">
        <PanelHeader title="Estado del periodo" subtitle="Comunicación y actividad se evalúan de forma independiente" />
        <div className="metric-pairs-grid">
          <MetricPair label="Apertura conciliada" value={fmt(detailOpen)} unit={num(detailOpen) === null ? '' : 'm³'} />
          <MetricPair label="Cierre conciliado" value={fmt(detailClose)} unit={num(detailClose) === null ? '' : 'm³'} />
          <MetricPair label="Actividad" value={activity} />
          <MetricPair label="Estado actual" value={currentState} />
          <MetricPair label="Promedio durante actividad" value={fmt(item?.flow_active_avg)} unit={num(item?.flow_active_avg) === null ? '' : flowUnit} />
          <MetricPair label="Muestras" value={`${Number(item?.samples_received || item?.samples || 0).toLocaleString('es-MX')}/${Number(item?.samples_expected || 0).toLocaleString('es-MX')}`} />
          <MetricPair label="Cobertura" value={num(item?.coverage_percent) === null ? '—' : `${fmt(item?.coverage_percent)}% · ${String(item?.coverage_status || '')}`} />
          <MetricPair label="Calidad" value={qualityLabel} />
          <MetricPair label="Comunicación" value={communication} />
        </div>
      </section>

      <ShiftConsumptionPanel
        group={module}
        itemIdentity={sensorId}
        date={String(current.range.endDate || current.range.startDate || '')}
        title={`Cortes por turno · ${name}`}
        items={allowedItems}
        emptyMessage={labels?.emptyState}
      />
    </>
  );
}
