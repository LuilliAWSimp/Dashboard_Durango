import { useMemo } from 'react';
import KpiCard from '../../../components/KpiCard';
import PanelHeader from '../components/PanelHeader';
import ShiftConsumptionPanel from '../components/ShiftConsumptionPanel';
import SqlChartDateControls from '../components/SqlChartDateControls';
import StatusBadge from '../components/StatusBadge';
import { defaultTodayRange, formatSqlDate } from '../dateUtils';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';
import type { DashboardData, FlexibleRecord } from '../types';

function array(value: unknown): FlexibleRecord[] { return Array.isArray(value) ? value as FlexibleRecord[] : []; }
function num(value: unknown): number | null { if (value === null || value === undefined || value === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function fmt(value: unknown): string { const n = num(value); return n === null ? '—' : n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function statusType(value: unknown): string { const t = String(value || '').toLowerCase(); if (t.includes('revisión') || t.includes('atrasada')) return 'warning'; if (t.includes('sin registro') || t.includes('sin lectura')) return 'communication'; return t.includes('con actividad') ? 'normal' : 'idle'; }
function group(summary: FlexibleRecord, key: string): FlexibleRecord { const value = summary[key]; return value && typeof value === 'object' && !Array.isArray(value) ? value as FlexibleRecord : {}; }

export default function RevisionDiariaSection() {
  const controller = useSqlChartDashboard('dashboard', defaultTodayRange, { forceRefresh: true, includeHistory: false, includeEnergyWater: false, autoRefresh: true });
  const dashboard = controller.dashboard as DashboardData | null;
  const rows = useMemo<Array<FlexibleRecord & { group: string }>>(() => [
    ...array(dashboard?.wells).map((item): FlexibleRecord & { group: string } => ({ ...item, group: 'Pozo' })),
    ...array(dashboard?.production_lines).map((item): FlexibleRecord & { group: string } => ({ ...item, group: 'Línea' })),
    ...array(dashboard?.flows).map((item): FlexibleRecord & { group: string } => ({ ...item, group: 'Flujo' })),
  ], [dashboard]);
  const summary = (dashboard?.operational_summary || {}) as FlexibleRecord;
  const wells = group(summary, 'wells');
  const lines = group(summary, 'lines');
  const flows = group(summary, 'flows');
  const totals = [wells.total_m3, lines.total_m3, flows.total_m3].map(num).filter((value): value is number => value !== null);
  const total = totals.length ? totals.reduce((sum, value) => sum + value, 0) : null;
  const active = Number(wells.active_count || 0) + Number(lines.active_count || 0) + Number(flows.active_count || 0);
  const inactive = Number(wells.inactive_count || 0) + Number(lines.inactive_count || 0) + Number(flows.inactive_count || 0);
  const currentFlow = Number(wells.current_flow_count || 0) + Number(lines.current_flow_count || 0) + Number(flows.current_flow_count || 0);
  const review = Number(wells.review_count || 0) + Number(lines.review_count || 0) + Number(flows.review_count || 0);
  const selectedDate = controller.range.startDate || '';

  return <>
    <section className="panel fade-up"><PanelHeader title="Revisión diaria" subtitle="Cierres, volúmenes y estado de cada elemento por fecha" /><SqlChartDateControls controller={controller} title="Fecha de revisión" /></section>
    <section className="cards-grid stagger-grid">
      <KpiCard label="Volumen validado" value={total === null ? 'No disponible' : fmt(total)} unit={total === null ? '' : 'm³'} trend="Incluye incrementos validados parciales" accent="cyan" />
      <KpiCard label="Con actividad en el periodo" value={String(active)} unit="elementos" trend="Movimiento validado" accent="teal" />
      <KpiCard label="Con flujo actual" value={String(currentFlow)} unit="elementos" trend="Lectura reciente por encima del umbral" accent="teal" />
      <KpiCard label="Sin actividad" value={String(inactive)} unit="elementos" trend="Cero confirmado" accent="blue" />
      <KpiCard label="Validación parcial" value={String(review)} unit="elementos" trend="Con volumen utilizable y eventos descartados" accent="brown" />
    </section>
    <section className="panel fade-up"><PanelHeader title="Detalle del día" subtitle="Estado actual, actividad, validación, cobertura y valor operativo se muestran por separado" /><div className="pozos-table-scroll"><table className="pozos-operacion-table"><thead><tr><th>Grupo</th><th>Elemento</th><th>Estado actual</th><th>Flujo de cierre</th><th>Apertura</th><th>Totalizador de cierre</th><th>Volumen del día</th><th>Actividad</th><th>Validación</th><th>Tiempo activo</th><th>Cobertura</th><th>Comunicación</th><th>Última actualización</th></tr></thead><tbody>{rows.map((item, index) => { const validated = num(item.validated_volume_m3); const volumeText = validated === null ? 'Sin volumen validado' : `${fmt(validated)} m³`; const validation = String(item.validation || (validated === null ? 'Sin volumen validado' : item.has_discontinuities ? 'Validación parcial' : 'Validado')); return <tr key={`${item.group}-${item.sensor_id || index}`}><td>{String(item.group)}</td><td>{String(item.name || item.nombre || `Elemento ${index + 1}`)}</td><td>{String(item.current_state || 'Sin registros')}</td><td>{num(item.current_flow ?? item.flow_lps) === null ? '—' : `${fmt(item.current_flow ?? item.flow_lps)} ${String(item.flow_unit || 'L/s')}`}</td><td>{num(item.period_open_m3) === null ? '—' : `${fmt(item.period_open_m3)} m³`}</td><td>{num(item.period_close_m3 ?? item.current_totalizer_m3) === null ? '—' : `${fmt(item.period_close_m3 ?? item.current_totalizer_m3)} m³`}</td><td>{volumeText}</td><td><StatusBadge type={statusType(item.activity)}>{String(item.activity || 'Sin registros')}</StatusBadge></td><td><StatusBadge type={statusType(validation)}>{validation}</StatusBadge></td><td>{num(item.active_minutes) === null ? '—' : `${fmt(item.active_minutes)} min`}</td><td>{num(item.coverage_percent) === null ? '—' : `${fmt(item.coverage_percent)}% · ${String(item.coverage_status || '')}`}</td><td>{String(item.communication || item.estado_comunicacion || 'Sin lectura')}</td><td>{formatSqlDate(item.last_update || item.ultima_lectura)}</td></tr>; })}</tbody></table></div></section>
    <ShiftConsumptionPanel group="all" date={selectedDate} showDateControls={false} reviewMode title="Cortes por turno del día seleccionado" />
  </>;
}
