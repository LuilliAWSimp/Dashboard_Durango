import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import KpiCard from '../../../components/KpiCard';
import { defaultTodayRange } from '../dateUtils';
import type { DashboardData, FlexibleRecord } from '../types';
import ChartEmptyState from '../components/ChartEmptyState';
import PanelHeader from '../components/PanelHeader';
import SqlChartDateControls from '../components/SqlChartDateControls';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';

function group(summary: FlexibleRecord, key: string): FlexibleRecord {
  const value = summary[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as FlexibleRecord : {};
}

function fmt(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
}

export default function BalanceSection() {
  const controller = useSqlChartDashboard('dashboard', defaultTodayRange, {
    forceRefresh: true,
    includeHistory: false,
    includeEnergyWater: false,
    autoRefresh: true,
  });
  const dashboard = controller.dashboard as DashboardData | null;
  const summary = (dashboard?.operational_summary || {}) as FlexibleRecord;
  const wells = group(summary, 'wells');
  const lines = group(summary, 'lines');
  const washers = group(summary, 'flows');
  const data = [
    { name: 'Pozos', value: Number(wells.total_m3 || 0), color: '#0ea5e9' },
    { name: 'Líneas', value: Number(lines.total_m3 || 0), color: '#7dd3fc' },
    { name: 'Lavadoras', value: Number(washers.total_m3 || 0), color: '#a855f7' },
  ];
  const coverage = Number(wells.coverage_available || 0) + Number(lines.coverage_available || 0) + Number(washers.coverage_available || 0);
  const total = Number(wells.coverage_total || 2) + Number(lines.coverage_total || 5) + Number(washers.coverage_total || 2);
  const excluded = total - coverage;
  const comparison = Number(wells.total_m3 || 0) - Number(lines.total_m3 || 0) - Number(washers.total_m3 || 0);

  return <>
    <section className="water-balance-hero panel fade-up">
      <div><h2>Comparativo Operativo de Agua</h2><p>Comparación matemática de volúmenes validados; la clasificación hidráulica integral está pendiente de validación.</p></div>
      <div className="water-balance-hero-grid">
        <article><span>Volumen de pozos</span><strong>{fmt(wells.total_m3)} <small>m³</small></strong></article>
        <article><span>Volumen de líneas</span><strong>{fmt(lines.total_m3)} <small>m³</small></strong></article>
        <article><span>Lavadoras</span><strong>{fmt(washers.total_m3)} <small>m³</small></strong></article>
        <article><span>Cobertura</span><strong>{coverage}/{total}</strong></article>
      </div>
    </section>
    <section className="cards-grid water-balance-kpi-grid">
      <KpiCard label="Comparación matemática" value={`${comparison >= 0 ? '+' : ''}${fmt(comparison)}`} unit="m³" trend="Pozos − Líneas − Lavadoras" accent="cyan" />
      <KpiCard label="Elementos excluidos" value={String(excluded)} unit="elementos" trend="Dato en revisión o sin totalizador" accent="brown" />
    </section>
    <section className="panel chart-panel fade-up">
      <PanelHeader title="Volúmenes validados del periodo" subtitle="No se utilizan flujos instantáneos como sustituto de volumen" />
      <SqlChartDateControls controller={controller} title="Fechas del comparativo" />
      {data.some((item) => item.value > 0) ? <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} layout="vertical" margin={{ top: 12, right: 90, bottom: 12, left: 12 }}>
          <CartesianGrid stroke="rgba(56,189,248,.14)" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 'dataMax']} stroke="#b9e7ff" />
          <YAxis type="category" dataKey="name" width={120} stroke="#b9e7ff" />
          <Tooltip cursor={{ fill: 'rgba(56,189,248,.06)' }} formatter={(value) => [`${fmt(value)} m³`, 'Volumen']} contentStyle={{ background: '#031522', border: '1px solid rgba(56,189,248,.28)', borderRadius: 12, color: '#fff' }} />
          <Bar dataKey="value" radius={[0, 10, 10, 0]}>{data.map((item) => <Cell key={item.name} fill={item.color} />)}<LabelList dataKey="value" position="right" formatter={(value) => `${fmt(value)} m³`} fill="#effbff" /></Bar>
        </BarChart>
      </ResponsiveContainer> : <ChartEmptyState message="Sin volúmenes validados para el periodo seleccionado." />}
      <div className="operational-comparison-difference"><span>Nota operativa</span><strong>Comparativo operativo; clasificación hidráulica pendiente de validación.</strong><small>No representa pérdida, fuga, desperdicio ni eficiencia.</small></div>
    </section>
  </>;
}
