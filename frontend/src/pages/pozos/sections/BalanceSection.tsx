import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import KpiCard from '../../../components/KpiCard';
import { DURANGO_CAPABILITIES } from '../../../config/plantCapabilities';
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

function array(value: unknown): FlexibleRecord[] {
  return Array.isArray(value) ? value as FlexibleRecord[] : [];
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const LAVADORA_KEYS: ReadonlySet<string> = new Set([
  'lavadora_linea_2',
  'lavadora_vidrio',
  'lavadora_ref_pet',
]);
const JARABES_KEYS: ReadonlySet<string> = new Set(['jarabes']);

function keyOf(item: FlexibleRecord): string {
  return String(item.operational_key || item.operationalKey || '').toLowerCase();
}

function isLavadora(item: FlexibleRecord): boolean {
  return LAVADORA_KEYS.has(keyOf(item));
}

function isJarabes(item: FlexibleRecord): boolean {
  return JARABES_KEYS.has(keyOf(item));
}

function validatedVolume(item: FlexibleRecord): number | null {
  const explicit = number(item.validated_volume_m3);
  if (explicit !== null) return Math.max(explicit, 0);
  if (item.period_m3_reliable === false || item.volume_reliable === false) return null;
  const period = number(item.period_m3 ?? item.volume_m3);
  return period === null ? null : Math.max(period, 0);
}

function flowGroupSummary(items: FlexibleRecord[], fallbackTotal: number): FlexibleRecord {
  const volumes = items.map(validatedVolume).filter((value): value is number => value !== null);
  return {
    total_m3: volumes.length ? volumes.reduce((sum, value) => sum + value, 0) : null,
    coverage_available: volumes.length,
    coverage_total: items.length || fallbackTotal,
  };
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
  const flowRows = array(dashboard?.flows);
  const lavadoras = flowGroupSummary(flowRows.filter(isLavadora), LAVADORA_KEYS.size);
  const jarabes = flowGroupSummary(flowRows.filter(isJarabes), JARABES_KEYS.size);
  const data = [
    { name: 'Pozos', value: Number(wells.total_m3 || 0), color: '#0ea5e9' },
    { name: 'Líneas', value: Number(lines.total_m3 || 0), color: '#7dd3fc' },
    { name: 'Lavadoras', value: Number(lavadoras.total_m3 || 0), color: '#a855f7' },
    { name: 'Jarabes', value: Number(jarabes.total_m3 || 0), color: '#f59e0b' },
  ];
  const coverage = Number(wells.coverage_available || 0) + Number(lines.coverage_available || 0) + Number(lavadoras.coverage_available || 0) + Number(jarabes.coverage_available || 0);
  const total = Number(wells.coverage_total || DURANGO_CAPABILITIES.wells.length)
    + Number(lines.coverage_total || DURANGO_CAPABILITIES.lines.length)
    + Number(lavadoras.coverage_total || LAVADORA_KEYS.size)
    + Number(jarabes.coverage_total || JARABES_KEYS.size);
  const excluded = total - coverage;
  const comparison = Number(wells.total_m3 || 0) - Number(lines.total_m3 || 0) - Number(lavadoras.total_m3 || 0) - Number(jarabes.total_m3 || 0);

  return <>
    <section className="water-balance-hero panel fade-up">
      <div><h2>Balance de Agua</h2><p>Referencia operativa de los volúmenes registrados durante el periodo seleccionado.</p></div>
      <div className="water-balance-hero-grid">
        <article><span>Volumen de pozos</span><strong>{fmt(wells.total_m3)} <small>m³</small></strong></article>
        <article><span>Volumen de líneas</span><strong>{fmt(lines.total_m3)} <small>m³</small></strong></article>
        <article><span>Lavadoras</span><strong>{fmt(lavadoras.total_m3)} <small>m³</small></strong></article>
        <article><span>Jarabes</span><strong>{fmt(jarabes.total_m3)} <small>m³</small></strong></article>
        <article><span>Cobertura</span><strong>{coverage}/{total}</strong></article>
      </div>
    </section>
    <section className="cards-grid water-balance-kpi-grid">
      <KpiCard label="Balance del periodo" value={`${comparison >= 0 ? '+' : ''}${fmt(comparison)}`} unit="m³" trend="Pozos − Líneas − Lavadoras − Jarabes" accent="cyan" />
      <KpiCard label="Elementos sin volumen validado" value={String(excluded)} unit="elementos" trend={excluded === 0 ? 'Todos cuentan con información utilizable' : 'Sin volumen validado para el periodo'} accent="brown" />
    </section>
    <section className="panel chart-panel balance-chart-panel fade-up">
      <PanelHeader title="Volúmenes validados del periodo" subtitle="No se utilizan flujos instantáneos como sustituto de volumen" />
      <SqlChartDateControls controller={controller} title="Fechas del comparativo" />
      {data.some((item) => item.value > 0) ? <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} layout="vertical" margin={{ top: 12, right: 90, bottom: 12, left: 12 }}>
          <CartesianGrid stroke="rgba(56,189,248,.14)" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 'dataMax']} stroke="#b9e7ff" />
          <YAxis type="category" dataKey="name" width={120} stroke="#b9e7ff" />
          <Tooltip cursor={{ fill: 'rgba(56,189,248,.06)' }} formatter={(value) => [`${fmt(value)} m³`, 'Volumen']} allowEscapeViewBox={{ x: true, y: true }} wrapperStyle={{ zIndex: 140, pointerEvents: 'none' }} contentStyle={{ background: '#031522', border: '1px solid rgba(56,189,248,.28)', borderRadius: 12, color: '#effbff', boxShadow: '0 18px 44px rgba(0,0,0,.36)' }} labelStyle={{ color: '#ffffff', fontWeight: 800 }} itemStyle={{ color: '#e0f7ff' }} />
          <Bar dataKey="value" radius={[0, 10, 10, 0]}>{data.map((item) => <Cell key={item.name} fill={item.color} />)}<LabelList dataKey="value" position="right" formatter={(value) => `${fmt(value)} m³`} fill="#effbff" /></Bar>
        </BarChart>
      </ResponsiveContainer> : <ChartEmptyState message="Sin volúmenes validados para el periodo seleccionado." />}
      <div className="operational-comparison-difference"><span>Referencia operativa</span><strong>La diferencia compara los volúmenes registrados en Pozos − Líneas − Lavadoras − Jarabes.</strong><small>No representa por sí misma pérdida, fuga, desperdicio ni eficiencia.</small></div>
    </section>
  </>;
}
