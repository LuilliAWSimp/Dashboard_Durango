import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import KpiCard from '../../../components/KpiCard';
import { defaultTodayRange, formatSqlDate } from '../dateUtils';
import type { DashboardData, FlexibleRecord } from '../types';
import ChartEmptyState from './ChartEmptyState';
import MetricPair from './MetricPair';
import PanelHeader from './PanelHeader';
import ShiftConsumptionPanel from './ShiftConsumptionPanel';
import SqlChartDateControls from './SqlChartDateControls';
import StatusBadge from './StatusBadge';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';

export type OperationalModule = 'well' | 'line' | 'flow';

interface Props {
  module: OperationalModule;
  title: string;
  subtitle: string;
  route: string;
}

function array(value: unknown): FlexibleRecord[] { return Array.isArray(value) ? value as FlexibleRecord[] : []; }
function number(value: unknown): number | null { if (value === null || value === undefined || value === '') return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function fmt(value: unknown): string { const parsed = number(value); return parsed === null ? '—' : parsed.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function id(row: FlexibleRecord, index: number): number { return Number(row.sensor_id || row.id || index + 1); }
function name(row: FlexibleRecord, index: number): string { return String(row.name || row.nombre || `Elemento ${index + 1}`); }
function statusType(value: unknown): string { const text = String(value || '').toLowerCase(); if (text.includes('revisión') || text.includes('atrasada')) return 'warning'; if (text.includes('sin registro') || text.includes('sin lectura')) return 'communication'; if (text.includes('actividad')) return text.includes('sin actividad') ? 'idle' : 'normal'; return 'idle'; }

function moduleRows(dashboard: DashboardData | null, module: OperationalModule): FlexibleRecord[] {
  if (module === 'well') return array(dashboard?.wells);
  if (module === 'line') return array(dashboard?.production_lines);
  return array(dashboard?.flows);
}

export default function OperationalModuleSection({ module, title, subtitle, route }: Props) {
  const navigate = useNavigate();
  const controller = useSqlChartDashboard('dashboard', defaultTodayRange, { forceRefresh: true, includeHistory: false, includeEnergyWater: false });
  const dashboard = controller.dashboard as DashboardData | null;
  const rows = useMemo(() => moduleRows(dashboard, module), [dashboard, module]);
  const reliable = rows.filter((row) => Boolean(row.period_m3_reliable) && number(row.period_m3) !== null);
  const total = reliable.reduce((sum, row) => sum + Number(row.period_m3 || 0), 0);
  const active = reliable.filter((row) => Number(row.period_m3 || 0) > 0).length;
  const inactive = reliable.filter((row) => Number(row.period_m3 || 0) === 0).length;
  const review = rows.filter((row) => ['invalid_totalizer', 'no_totalizer'].includes(String(row.data_status || ''))).length;

  return <>
    <section className="panel fade-up compact-hero"><PanelHeader title={title} subtitle={subtitle} /><SqlChartDateControls controller={controller} title="Periodo operativo" /></section>
    <section className="cards-grid stagger-grid">
      <KpiCard label="Volumen confiable del periodo" value={fmt(total)} unit="m³" trend="Suma de diferencias confiables" accent="cyan" />
      <KpiCard label="Con actividad" value={String(active)} unit="elementos" trend="Movimiento válido del totalizador" accent="teal" />
      <KpiCard label="Sin actividad" value={String(inactive)} unit="elementos" trend="Muestras válidas sin movimiento" accent="blue" />
      <KpiCard label="Datos en revisión" value={String(review)} unit="elementos" trend="Excluidos del total" accent="brown" />
    </section>
    <section className="panel fade-up">
      <PanelHeader title={`Detalle de ${title.toLowerCase()}`} subtitle="Lectura actual y métricas del periodo seleccionado" />
      {controller.error ? <div className="status-pill alert">{controller.error}</div> : null}
      <div className="scada-well-grid">
        {rows.map((row, index) => {
          const sensorId = id(row, index);
          const itemName = name(row, index);
          const activity = String(row.activity || row.activity_status || 'Sin registros guardados');
          const communication = String(row.communication || row.estado_comunicacion || 'Sin lectura');
          const volume = number(row.period_m3);
          const flow = number(row.current_flow ?? row.flow_lps ?? row.flow);
          const totalizer = number(row.current_totalizer_m3 ?? row.totalizador_m3);
          return <article key={`${module}-${sensorId}`} className="scada-well-card" role="button" tabIndex={0} onClick={() => navigate(`${route}/sensor-${sensorId}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') navigate(`${route}/sensor-${sensorId}`); }}>
            <div className="scada-well-head"><div><span>{title}</span><strong>{itemName}</strong></div><StatusBadge type={statusType(activity)}>{activity}</StatusBadge></div>
            <div className="metric-pairs-grid"><MetricPair label="Flujo actual" value={flow === null ? 'Sin dato' : fmt(flow)} unit={flow === null ? '' : String(row.flow_unit || 'L/s')} /><MetricPair label="Totalizador actual" value={totalizer === null ? 'Sin totalizador' : fmt(totalizer)} unit={totalizer === null ? '' : 'm³'} /><MetricPair label="Volumen del periodo" value={volume === null ? String(row.activity || 'Sin dato') : fmt(volume)} unit={volume === null ? '' : 'm³'} /><MetricPair label="Muestras" value={String(row.samples ?? '—')} /></div>
            <div className="well-card-footer"><span>{communication}</span><strong>{formatSqlDate(row.last_update || row.ultima_lectura)}</strong></div>
          </article>;
        })}
      </div>
      {!rows.length && !controller.loading ? <ChartEmptyState message="Sin registros para el periodo seleccionado." /> : null}
    </section>
    <ShiftConsumptionPanel group={module} title={`Cortes por turno · ${title}`} />
    <section className="panel fade-up"><PanelHeader title="Tabla operativa" subtitle="La tabla y las tarjetas usan la misma respuesta del periodo" /><div className="pozos-table-scroll"><table className="pozos-operacion-table"><thead><tr><th>Elemento</th><th>Flujo actual</th><th>Apertura</th><th>Cierre</th><th>Volumen periodo</th><th>Actividad</th><th>Comunicación</th><th>Última actualización</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`table-${id(row,index)}`}><td>{name(row,index)}</td><td>{number(row.current_flow ?? row.flow_lps) === null ? '—' : `${fmt(row.current_flow ?? row.flow_lps)} ${String(row.flow_unit || 'L/s')}`}</td><td>{number(row.period_open_m3) === null ? '—' : `${fmt(row.period_open_m3)} m³`}</td><td>{number(row.period_close_m3 ?? row.current_totalizer_m3) === null ? '—' : `${fmt(row.period_close_m3 ?? row.current_totalizer_m3)} m³`}</td><td>{number(row.period_m3) === null ? String(row.activity || 'Dato en revisión') : `${fmt(row.period_m3)} m³`}</td><td>{String(row.activity || 'Sin registros')}</td><td>{String(row.communication || row.estado_comunicacion || 'Sin lectura')}</td><td>{formatSqlDate(row.last_update || row.ultima_lectura)}</td></tr>)}</tbody></table></div></section>
  </>;
}
