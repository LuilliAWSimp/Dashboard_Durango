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
import type { DashboardData, DateRange, FlexibleRecord } from '../types';
import ChartEmptyState from './ChartEmptyState';
import DateRangeControls from './DateRangeControls';
import MetricPair from './MetricPair';
import PanelHeader from './PanelHeader';
import ShiftConsumptionPanel from './ShiftConsumptionPanel';
import StatusBadge from './StatusBadge';
import WaterHistoryChart from './WaterHistoryChart';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';
import useWaterHistory from '../hooks/useWaterHistory';

interface Props {
  module: OperationalModule;
  sensorId: OperationalIdentity;
  backPath: string;
}

interface DetailLocationState {
  fromOperationalModule?: boolean;
}

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
  const status = String(item?.period_data_status || item?.data_status || '').toLowerCase();
  const activity = String(item?.period_activity || item?.activity || '').toLowerCase();
  if (status.includes('review') || activity.includes('revisión') || activity.includes('parcial')) return 'warning';
  if (status.includes('no_') || activity.includes('sin registro') || activity.includes('sin histórico')) return 'communication';
  if (activity.includes('sin actividad')) return 'idle';
  return 'normal';
}

export default function OperationalDetailSection({ module, sensorId, backPath }: Props) {
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
  const history = useWaterHistory({
    module,
    sensorId,
    initialRangeFactory,
    initialAggregation: initialContext.aggregation,
  });
  const dashboard = current.dashboard as DashboardData | null;
  const item = moduleRows(dashboard, module).find(
    (row, index) => String(resolveOperationalIdentity(row, index, module)) === String(sensorId),
  );
  const navigationItems = useMemo(
    () => configuredOperationalItems(module).map((configured) => ({
      identity: configuredOperationalIdentity(configured),
      name: configured.name,
    })),
    [module],
  );
  const currentIndex = navigationItems.findIndex((configured) => String(configured.identity) === String(sensorId));
  const previous = currentIndex > 0 ? navigationItems[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < navigationItems.length - 1
    ? navigationItems[currentIndex + 1]
    : null;
  const configuredName = currentIndex >= 0 ? navigationItems[currentIndex]?.name : null;
  const name = String(item?.name || item?.nombre || configuredName || `Elemento ${sensorId}`);
  const flowUnit = String(item?.flow_unit || history.data?.flow_unit || 'L/s');
  const activity = String(item?.period_activity || item?.activity || 'Sin registros');
  const communication = String(item?.communication || item?.estado_comunicacion || 'Sin lectura');

  useEffect(() => {
    const search = buildOperationalNavigationSearch(history.range, history.aggregation, module);
    if (location.search === search) return;
    navigate({ pathname: location.pathname, search }, { replace: true, state: location.state });
  }, [history.aggregation, history.range, location.pathname, location.search, location.state, module, navigate]);

  const updateDraftRange = (range: DateRange) => {
    history.setDraftRange(range);
    current.setDraftRange(range);
  };

  const applyRange = () => {
    const nextRange = { ...history.draftRange };
    history.apply();
    current.setDraftRange(nextRange);
    current.setRange((previousRange) => ({
      ...nextRange,
      refreshKey: Number(previousRange.refreshKey || 0) + 1,
    }));
  };

  const resetRange = () => {
    const nextRange = { ...initialContext.range };
    history.reset();
    current.setDraftRange(nextRange);
    current.setRange((previousRange) => ({
      ...nextRange,
      refreshKey: Number(previousRange.refreshKey || 0) + 1,
    }));
  };

  const activeSearch = buildOperationalNavigationSearch(history.range, history.aggregation, module);
  const navigateToSibling = (identity: OperationalIdentity) => {
    navigate(`${backPath}/${encodeURIComponent(String(identity))}${activeSearch}`, {
      replace: true,
      state: location.state,
    });
  };
  const goBack = () => {
    const state = location.state as DetailLocationState | null;
    if (state?.fromOperationalModule) {
      navigate(-1);
      return;
    }
    navigate(`${backPath}${activeSearch}`);
  };

  return (
    <>
      <section className="well-detail-hero panel fade-up">
        <div className="well-detail-main-head">
          <button type="button" className="back-inline-button" onClick={goBack}>
            <ArrowLeft size={16} /> Volver
          </button>
          <nav className="operational-sibling-navigation" aria-label={`Navegación entre ${module === 'well' ? 'pozos' : module === 'line' ? 'líneas' : 'lavadoras'}`}>
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
            <StatusBadge type={statusType(item)}>{activity}</StatusBadge>
          </div>
          <p>Análisis individual del elemento para el periodo seleccionado.</p>
        </div>
        <div className="well-detail-hero-metrics">
          <article><span>Flujo actual</span><strong>{fmt(item?.current_flow ?? item?.flow_lps)} <small>{flowUnit}</small></strong></article>
          <article><span>Totalizador actual</span><strong>{fmt(item?.current_totalizer_m3 ?? item?.totalizador_m3)} <small>m³</small></strong></article>
          <article><span>Volumen del periodo</span><strong>{num(item?.period_m3) === null ? activity : fmt(item?.period_m3)} <small>{num(item?.period_m3) === null ? '' : 'm³'}</small></strong></article>
          <article><span>Comunicación</span><strong>{communication}</strong></article>
          <article><span>Última lectura</span><strong>{formatSqlDate(item?.last_update || item?.ultima_lectura)}</strong></article>
        </div>
      </section>

      <section className="panel chart-panel fade-up">
        <PanelHeader title="Histórico del elemento" subtitle="Flujo promedio como línea y volumen del intervalo como barras" />
        <DateRangeControls
          draftRange={history.draftRange}
          activeRange={history.range}
          onDraftChange={updateDraftRange}
          onApply={applyRange}
          onReset={resetRange}
          status={history.loading ? 'Cargando histórico...' : undefined}
          aggregation={history.aggregation}
          onAggregationChange={history.setAggregation}
        />
        {history.error ? <div className="status-pill alert">{history.error}</div> : null}
        {history.data?.points?.length
          ? <WaterHistoryChart points={history.data.points} aggregation={history.aggregation} flowUnit={flowUnit} />
          : !history.loading ? <ChartEmptyState message="Sin registros guardados para el periodo seleccionado." /> : null}
      </section>

      <section className="panel fade-up">
        <PanelHeader title="Estado del periodo" subtitle="Comunicación y actividad se evalúan de forma independiente" />
        <div className="metric-pairs-grid">
          <MetricPair label="Apertura" value={fmt(item?.period_open_m3)} unit={num(item?.period_open_m3) === null ? '' : 'm³'} />
          <MetricPair label="Cierre" value={fmt(item?.period_close_m3)} unit={num(item?.period_close_m3) === null ? '' : 'm³'} />
          <MetricPair label="Actividad" value={activity} />
          <MetricPair label="Comunicación" value={communication} />
        </div>
      </section>

      <ShiftConsumptionPanel
        group={module}
        itemIdentity={sensorId}
        date={String(history.range.startDate || '')}
        title={`Cortes por turno · ${name}`}
      />
    </>
  );
}
