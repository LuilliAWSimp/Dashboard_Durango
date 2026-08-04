import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { defaultTodayRange, formatSqlDate } from '../dateUtils';
import type { DashboardData, FlexibleRecord } from '../types';
import ChartEmptyState from './ChartEmptyState';
import DateRangeControls from './DateRangeControls';
import MetricPair from './MetricPair';
import PanelHeader from './PanelHeader';
import StatusBadge from './StatusBadge';
import WaterHistoryChart from './WaterHistoryChart';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';
import useWaterHistory from '../hooks/useWaterHistory';
import type { OperationalModule } from './OperationalModuleSection';

interface Props { module: OperationalModule; sensorId: number; backPath: string; }
function array(value: unknown): FlexibleRecord[] { return Array.isArray(value) ? value as FlexibleRecord[] : []; }
function num(value: unknown): number | null { if (value === null || value === undefined || value === '') return null; const parsed=Number(value); return Number.isFinite(parsed)?parsed:null; }
function fmt(value: unknown): string { const parsed=num(value); return parsed===null?'—':parsed.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function rows(dashboard: DashboardData | null, module: OperationalModule): FlexibleRecord[] { return module==='well'?array(dashboard?.wells):module==='line'?array(dashboard?.production_lines):array(dashboard?.flows); }

export default function OperationalDetailSection({ module, sensorId, backPath }: Props) {
  const navigate=useNavigate();
  const current=useSqlChartDashboard('dashboard', defaultTodayRange, { forceRefresh:true, includeHistory:false, includeEnergyWater:false, autoRefresh:true });
  const dashboard=current.dashboard as DashboardData|null;
  const item=rows(dashboard,module).find((row)=>Number(row.sensor_id||0)===sensorId);
  const history=useWaterHistory({module,sensorId});
  const name=String(item?.name||item?.nombre||`Elemento ${sensorId}`);
  const flowUnit=String(item?.flow_unit||history.data?.flow_unit||'L/s');
  return <>
    <section className="well-detail-hero panel fade-up"><div className="well-detail-main-head"><button type="button" className="back-inline-button" onClick={()=>navigate(backPath)}><ArrowLeft size={16}/> Volver</button><div className="eyebrow">Detalle operativo</div><div className="well-detail-title-row"><h2>{name}</h2><StatusBadge type={String(item?.data_status||'')==='operational'?'normal':'warning'}>{String(item?.activity||'Sin registros')}</StatusBadge></div><p>Lectura actual separada del histórico y del volumen del periodo.</p></div><div className="well-detail-hero-metrics"><article><span>Flujo actual</span><strong>{fmt(item?.current_flow??item?.flow_lps)} <small>{flowUnit}</small></strong></article><article><span>Totalizador actual</span><strong>{fmt(item?.current_totalizer_m3??item?.totalizador_m3)} <small>m³</small></strong></article><article><span>Volumen periodo</span><strong>{num(item?.period_m3)===null?String(item?.activity||'Sin dato'):fmt(item?.period_m3)} <small>{num(item?.period_m3)===null?'':'m³'}</small></strong></article><article><span>Última lectura</span><strong>{formatSqlDate(item?.last_update||item?.ultima_lectura)}</strong></article></div></section>
    <section className="panel chart-panel fade-up"><PanelHeader title="Histórico del elemento" subtitle="Flujo promedio como línea y volumen del intervalo como barras"/><DateRangeControls draftRange={history.draftRange} activeRange={history.range} onDraftChange={history.setDraftRange} onApply={history.apply} onReset={history.reset} status={history.loading ? 'Cargando histórico...' : undefined} aggregation={history.aggregation} onAggregationChange={history.setAggregation}/>{history.error?<div className="status-pill alert">{history.error}</div>:null}{history.data?.points?.length?<WaterHistoryChart points={history.data.points} aggregation={history.aggregation} flowUnit={flowUnit}/>:!history.loading?<ChartEmptyState message="Sin registros guardados para el periodo seleccionado."/>:null}</section>
    <section className="panel fade-up"><PanelHeader title="Estado del periodo" subtitle="Comunicación y actividad se evalúan de forma independiente"/><div className="metric-pairs-grid"><MetricPair label="Apertura" value={fmt(item?.period_open_m3)} unit={num(item?.period_open_m3)===null?'':'m³'}/><MetricPair label="Cierre" value={fmt(item?.period_close_m3)} unit={num(item?.period_close_m3)===null?'':'m³'}/><MetricPair label="Actividad" value={String(item?.activity||'Sin registros')}/><MetricPair label="Comunicación" value={String(item?.communication||item?.estado_comunicacion||'Sin lectura')}/></div></section>
  </>;
}
