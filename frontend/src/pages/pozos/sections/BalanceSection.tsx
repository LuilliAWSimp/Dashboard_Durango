import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import KpiCard from '../../../components/KpiCard';
import { buildEntryExitRows, buildWellPeriodRows } from '../chartBuilders';
import type { DashboardData, FlexibleRecord } from '../types';
import ChartEmptyState from '../components/ChartEmptyState';
import ChartPeriodNote from '../components/ChartPeriodNote';
import ChartTooltip from '../components/ChartTooltip';
import PanelHeader from '../components/PanelHeader';
import SqlChartDateControls from '../components/SqlChartDateControls';
import StatusBadge from '../components/StatusBadge';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';
import { defaultTodayRange } from '../dateUtils';

const axisColor = '#b9e7ff';
const gridColor = 'rgba(56,189,248,0.14)';

function formatNumber(value: unknown, decimals = 2): string {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString('es-MX', { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) : '—';
}

function toArray(value: unknown): FlexibleRecord[] {
  return Array.isArray(value) ? value as FlexibleRecord[] : [];
}

function flowValue(row: FlexibleRecord): number {
  return Number(row.flow_lps ?? row.flujo_lps ?? row.flow ?? row.flujo_salida ?? row.flujo_entrada ?? 0);
}

function statusForFlowPoint(row: FlexibleRecord): { label: string; type: string } {
  const explicitLabel = String(row.status || '').trim();
  const explicitType = String(row.statusType || '').trim();
  if (explicitLabel) return { label: explicitLabel, type: explicitType || 'idle' };
  const flow = flowValue(row);
  const period = Number(row.volumen_periodo_m3 ?? row.period_m3 ?? row.period_delta_m3 ?? 0);
  if (flow > 0) return { label: 'Operando', type: 'normal' };
  if (Boolean(row.period_data_available) && period > 0) return { label: 'Totalizador activo', type: 'normal' };
  return { label: 'Sin flujo instantáneo', type: 'idle' };
}

function BalanceSection() {
  const balanceChart = useSqlChartDashboard('dashboard', defaultTodayRange, { forceRefresh: true, includeHistory: false, includeEnergyWater: false });
  const dashboard = balanceChart.dashboard as DashboardData | null;
  const entryExitRows = buildEntryExitRows(dashboard);
  const wellRows = buildWellPeriodRows(dashboard).map((row) => ({ ...row, flujo: Number(row.flujo || 0) }));
  const flows = toArray(dashboard?.flows);
  const lines = toArray(dashboard?.production_lines);
  const totalEntrada = entryExitRows.reduce((sum, item) => sum + Number(item.entrada || 0), 0);
  const totalSalida = entryExitRows.reduce((sum, item) => sum + Number(item.salida || 0), 0);
  const difference = totalEntrada - totalSalida;
  const differencePct = totalEntrada ? (difference / totalEntrada) * 100 : 0;
  const flowTotal = flows.reduce((sum, item) => sum + flowValue(item), 0);
  const lineTotal = lines.reduce((sum, item) => sum + flowValue(item), 0);
  const cards = [
    { label: 'Entrada medida', value: formatNumber(totalEntrada, 2), unit: 'L/s', trend: 'Suma de entradas disponibles', accent: 'blue' },
    { label: 'Salida medida', value: formatNumber(totalSalida, 2), unit: 'L/s', trend: 'Líneas y puntos BOS', accent: 'cyan' },
    { label: 'Diferencia', value: `${difference >= 0 ? '+' : ''}${formatNumber(difference, 2)}`, unit: 'L/s', trend: 'No compara contra energía ni concesión', accent: Math.abs(differencePct) > 25 ? 'red' : 'teal' },
    { label: 'Lavadoras/Jarabes', value: formatNumber(flowTotal, 2), unit: 'L/s', trend: 'Flujos independientes BOS', accent: 'indigo' },
  ];

  return (
    <>
      <section className="water-balance-hero panel fade-up">
        <div>
          <h2>Balance de Agua</h2>
          <p>Comparativo operativo de entradas y salidas con datos reales disponibles de Durango.</p>
        </div>
        <div className="water-balance-hero-grid">
          <article><span>Entrada medida</span><strong>{formatNumber(totalEntrada, 2)} <small>L/s</small></strong></article>
          <article><span>Salida medida</span><strong>{formatNumber(totalSalida, 2)} <small>L/s</small></strong></article>
          <article className={Math.abs(differencePct) > 25 ? 'warning' : 'positive'}><span>Diferencia</span><strong>{difference >= 0 ? '+' : ''}{formatNumber(difference, 2)} <small>L/s</small></strong></article>
          <article><span>Variación</span><strong>{differencePct >= 0 ? '+' : ''}{formatNumber(differencePct, 1)}<small>%</small></strong></article>
        </div>
      </section>

      <section className="cards-grid water-balance-kpi-grid">
        {cards.map((card, index) => <KpiCard key={card.label} {...card} style={{ animationDelay: `${index * 60}ms` }} />)}
      </section>

      <section className="content-grid water-balance-main-grid">
        <div className="panel chart-panel fade-up">
          <PanelHeader title="Volumen por pozo" subtitle="Volumen del periodo y flujo actual con fuente energética pendiente de confirmar." />
          <SqlChartDateControls controller={balanceChart} />
          <ChartPeriodNote range={balanceChart.range} source="Volumen del periodo desde totalizadores BOS cuando existe lectura inicial/final" />
          {wellRows.length ? (
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={wellRows} margin={{ top: 10, right: 18, bottom: 8, left: 4 }}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke={axisColor} />
                <YAxis yAxisId="left" stroke={axisColor} />
                <YAxis yAxisId="right" orientation="right" stroke="#7dd3fc" />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
                <Legend />
                <Bar yAxisId="left" dataKey="agua" name="Volumen periodo (m³)" fill="#0ea5e9" radius={[10, 10, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="flujo" name="Flujo actual (L/s)" stroke="#7dd3fc" strokeWidth={2.7} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <ChartEmptyState message="Sin datos de pozos para el rango seleccionado." />}
        </div>

        <div className="panel summary-panel fade-up water-balance-summary-panel">
          <PanelHeader title="Resumen del día" subtitle="Lectura ejecutiva sin datos mock" />
          <div className="water-balance-summary-stack">
            <article><span>Estado del balance</span><strong>{entryExitRows.length ? 'Datos BOS disponibles' : 'Sin balance disponible'}</strong><p>El balance se calcula solo con campos presentes en el payload actual.</p></article>
            <article><span>Lavadoras/Jarabes</span><strong>{formatNumber(flowTotal, 2)} L/s</strong><p>Incluye Lavadora Ciel, Jarabes y Lavadora de Vidrio.</p></article>
            <article><span>Líneas</span><strong>{formatNumber(lineTotal, 2)} L/s</strong><p>Solo se muestran líneas que BOS reporta como configuradas.</p></article>
          </div>
        </div>
      </section>

      <section className="panel fade-up water-type-panel">
        <PanelHeader title="Puntos operativos de consumo" subtitle="Lavadoras y Jarabes con datos reales disponibles" />
        <div className="water-type-grid">
          {flows.length ? flows.map((item, index) => {
            const sensorId = Number(item.sensor_id || 0);
            const flow = flowValue(item);
            const status = statusForFlowPoint(item);
            return (
              <article className={`water-type-card ${status.type}`} key={`${sensorId}-${index}`}>
                <div className="water-type-head">
                  <div><span>{sensorId ? `Sensor ${sensorId}` : 'Sensor'}</span><strong>{String(item.nombre || item.name || `Punto ${index + 1}`)}</strong></div>
                  <StatusBadge type={status.type}>{status.label}</StatusBadge>
                </div>
                <div className="water-type-foot">
                  <span>Flujo actual</span>
                  <strong>{formatNumber(flow, 2)} L/s</strong>
                  <p>{sensorId === 3004 ? 'Jarabes pendiente de validación operativa.' : 'Dato real de flujo BOS.'}</p>
                </div>
              </article>
            );
          }) : <ChartEmptyState message="Sin flujos independientes disponibles." />}
        </div>
      </section>

      <section className="panel chart-panel fade-up">
        <PanelHeader title="Entradas vs salidas" subtitle="Comparativo SQL del periodo seleccionado" />
        <SqlChartDateControls controller={balanceChart} title="Fechas de entradas/salidas" />
        {entryExitRows.length ? (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={entryExitRows}>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke={axisColor} />
              <YAxis stroke={axisColor} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
              <Legend />
              <Bar dataKey="entrada" name="Entrada" fill="#0ea5e9" radius={[10, 10, 0, 0]} />
              <Bar dataKey="salida" name="Salida" fill="#7dd3fc" radius={[10, 10, 0, 0]} />
              <Line type="monotone" dataKey="diferencia" name="Diferencia" stroke="#38bdf8" strokeWidth={2.2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : <ChartEmptyState message="Sin datos de entradas/salidas para graficar en este rango." />}
      </section>
    </>
  );
}

export default BalanceSection;
