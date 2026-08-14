import DateRangeControls from './DateRangeControls';
import ChartEmptyState from './ChartEmptyState';
import PanelHeader from './PanelHeader';
import WaterHistoryChart from './WaterHistoryChart';
import useWaterHistory from '../hooks/useWaterHistory';
import type { OperationalModule } from './OperationalModuleSection';
interface Props { module: OperationalModule; sensorId: number | string | null; name: string; flowUnit?: string; }
export default function ElementHistoryPanel({ module, sensorId, name, flowUnit = 'L/s' }: Props) { const history = useWaterHistory({ module, sensorId }); return <section className="panel chart-panel fade-up"><PanelHeader title={`Histórico · ${name}`} subtitle="Flujo promedio como línea y volumen del intervalo como barras"/><DateRangeControls draftRange={history.draftRange} activeRange={history.range} onDraftChange={history.setDraftRange} onApply={history.apply} onReset={history.reset} status={history.loading ? 'Cargando histórico...' : undefined} aggregation={history.aggregation} onAggregationChange={history.setAggregation}/>{history.error ? <div className="status-pill alert">{history.error}</div> : null}{history.data?.points?.length ? <WaterHistoryChart points={history.data.points} aggregation={history.aggregation} flowUnit={flowUnit}/> : !history.loading ? <ChartEmptyState message="Sin histórico para el periodo seleccionado."/> : null}</section>; }
