import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import KpiCard from '../../../components/KpiCard';
import { defaultTodayRange, formatSqlDate } from '../dateUtils';
import type { DashboardData, FlexibleRecord } from '../types';
import ChartEmptyState from '../components/ChartEmptyState';
import PanelHeader from '../components/PanelHeader';
import SqlChartDateControls from '../components/SqlChartDateControls';
import StatusBadge from '../components/StatusBadge';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';

function rows(value: unknown): FlexibleRecord[] { return Array.isArray(value) ? value as FlexibleRecord[] : []; }
function number(value: unknown): number | null { if(value===null||value===undefined||value==='')return null; const n=Number(value); return Number.isFinite(n)?n:null; }
function fmt(value: unknown): string { const n=number(value); return n===null?'—':n.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function summaryGroup(summary: FlexibleRecord, key: string): FlexibleRecord { const value=summary[key]; return value&&typeof value==='object'&&!Array.isArray(value)?value as FlexibleRecord:{}; }

export default function DashboardBaseSection() {
  const navigate=useNavigate();
  const controller=useSqlChartDashboard('dashboard', defaultTodayRange, { forceRefresh:true, includeHistory:false, includeEnergyWater:false });
  const dashboard=controller.dashboard as DashboardData|null;
  const summary=(dashboard?.operational_summary||{}) as FlexibleRecord;
  const wells=summaryGroup(summary,'wells'); const lines=summaryGroup(summary,'lines'); const flows=summaryGroup(summary,'flows');
  const all=useMemo(()=>[...rows(dashboard?.wells),...rows(dashboard?.production_lines),...rows(dashboard?.flows)],[dashboard]);
  const latest=all.map(item=>String(item.last_update||item.ultima_lectura||'')).filter(Boolean).sort().at(-1);
  const review=Number(wells.review_count||0)+Number(lines.review_count||0)+Number(flows.review_count||0);
  return <>
    <section className="panel fade-up compact-hero"><PanelHeader title="Resumen hídrico de Durango" subtitle="Lectura actual y acumulados confiables del periodo seleccionado"/><SqlChartDateControls controller={controller} title="Periodo del resumen"/></section>
    <section className="cards-grid stagger-grid">
      <KpiCard label="Volumen de pozos" value={fmt(wells.total_m3)} unit="m³" trend={`${wells.active_count||0}/2 con actividad`} accent="blue" />
      <KpiCard label="Volumen de líneas" value={fmt(lines.total_m3)} unit="m³" trend={`${lines.active_count||0}/5 con actividad`} accent="cyan" />
      <KpiCard label="Flujos auxiliares" value={fmt(flows.total_m3)} unit="m³" trend={`${flows.active_count||0}/3 con actividad`} accent="indigo" />
      <KpiCard label="Datos en revisión" value={String(review)} unit="elementos" trend="Excluidos de totales confiables" accent="brown" />
      <KpiCard label="Última actualización" value={latest?formatSqlDate(latest):'Sin lectura'} unit="" trend="Información operativa" accent="teal" />
    </section>
    <section className="panel fade-up"><PanelHeader title="Accesos operativos" subtitle="Módulos confirmados y pendientes de validación"/><div className="water-type-grid">{[
      ['Pozos','Dos pozos confirmados','/pozos/pozos','normal'],['Líneas','Cinco líneas confirmadas','/pozos/lineas','normal'],['Flujos auxiliares','Lavadoras y Jarabes','/pozos/flujos','normal'],['Revisión diaria','Cierres por fecha y turnos','/pozos/revision','normal'],['Reportes','PDF, Excel, HTML y correo','/pozos/reportes','normal'],['Tanques','Pendiente de validación','/pozos/tanques','warning']
    ].map(([title,detail,path,type])=><article key={title} className={`water-type-card ${type}`} role="button" tabIndex={0} onClick={()=>navigate(path)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' ')navigate(path)}}><div className="water-type-head"><div><span>Dashboard ARCA</span><strong>{title}</strong></div><StatusBadge type={type}>{type==='warning'?'Pendiente':'Disponible'}</StatusBadge></div><div className="water-type-foot"><p>{detail}</p></div></article>)}</div></section>
    {controller.error?<div className="status-pill alert">{controller.error}</div>:null}
    {!dashboard&&!controller.loading?<ChartEmptyState message="No fue posible consultar la información de planta."/>:null}
  </>;
}
