import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import KpiCard from '../../../components/KpiCard';
import { defaultTodayRange, formatOperationalDateRange } from '../dateUtils';
import type { DashboardData, FlexibleRecord } from '../types';
import ChartEmptyState from '../components/ChartEmptyState';
import PanelHeader from '../components/PanelHeader';
import SqlChartDateControls from '../components/SqlChartDateControls';
import StatusBadge from '../components/StatusBadge';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';

function record(value: unknown): FlexibleRecord {
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

function fmt(value: unknown): string {
  const parsed = number(value);
  return parsed === null
    ? '—'
    : parsed.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataStateText(group: FlexibleRecord): string {
  const available = Number(group.coverage_available || 0);
  const total = Number(group.coverage_total || 0);
  if (!total || !available) return 'Sin datos';
  if (available === total && group.has_partial_volume !== true) return 'Datos completos';
  return `Datos parciales · ${available}/${total}`;
}

const BAR_COLORS = ['#0ea5e9', '#7dd3fc', '#a855f7', '#f59e0b'];

export default function BalanceSection() {
  const controller = useSqlChartDashboard('balance', defaultTodayRange, {
    includeHistory: false,
    includeEnergyWater: false,
    autoRefresh: true,
  });
  const dashboard = controller.dashboard as DashboardData | null;
  const balance = record(dashboard?.balance);
  const contract = record(balance.contract);
  const source = record(balance.source_candidate);
  const consumptions = array(balance.consumption_candidates);
  const questions = Array.isArray(contract.pending_questions) ? contract.pending_questions.map(String) : [];
  const official = balance.is_official === true;
  const observedGroups = [source, ...consumptions];
  const observedRows = observedGroups.map((item, index) => ({
    name: String(item.label || `Grupo ${index + 1}`),
    value: number(item.validated_volume_m3),
    state: dataStateText(item),
    color: BAR_COLORS[index % BAR_COLORS.length],
  }));
  const chartRows = observedRows.filter((item) => item.value !== null);
  const rangeLabel = formatOperationalDateRange(controller.range, 'Periodo operativo actual');

  return <div className="water-balance-page">
    <section className="water-balance-hero panel fade-up">
      <div className="water-balance-hero-copy">
        <div className="water-balance-title-row">
          <div>
            <span className="eyebrow">Validación hidráulica</span>
            <h2>Balance de Agua</h2>
          </div>
          <StatusBadge type={official ? 'success' : 'warning'}>
            {official ? 'Balance oficial' : 'En validación física'}
          </StatusBadge>
        </div>
        <p>{String(balance.message || 'La fuente base y los consumos finales del balance todavía requieren confirmación física en Durango.')}</p>
        <small className="water-balance-period">{rangeLabel}</small>
      </div>
      <div className="water-balance-hero-grid">
        {observedRows.map((item) => <article key={item.name}>
          <span>{item.name}</span>
          <strong>{fmt(item.value)} <small>{item.value === null ? '' : 'm³'}</small></strong>
          <small>{item.state}</small>
        </article>)}
      </div>
    </section>

    <section className="cards-grid water-balance-kpi-grid">
      <KpiCard
        label="Fuente base"
        value={contract.source_base_confirmed === true ? 'Confirmada' : 'Pendiente'}
        unit=""
        trend="Los pozos monitoreados no se asumen como fuente oficial sin validación física"
        accent="blue"
      />
      <KpiCard
        label="Consumos finales aditivos"
        value={contract.final_consumptions_confirmed === true ? 'Confirmados' : 'Pendientes'}
        unit=""
        trend="Líneas, Lavadoras y Jarabes permanecen separados hasta confirmar su relación hidráulica"
        accent="cyan"
      />
      <KpiCard
        label="Doble conteo"
        value={contract.double_counting_reviewed === true ? 'Revisado' : 'Pendiente'}
        unit=""
        trend="Debe descartarse que existan medidores en serie antes de sumar consumos"
        accent="indigo"
      />
      <KpiCard
        label="Diferencia no conciliada"
        value={contract.official_difference_enabled === true ? 'Habilitada' : 'Bloqueada'}
        unit=""
        trend="No se calcula hasta confirmar fuente, consumos aditivos, reúso y alcance"
        accent="brown"
      />
    </section>

    <section className="panel chart-panel balance-chart-panel fade-up">
      <PanelHeader
        title="Volúmenes observados por grupo"
        subtitle="Referencia para validar el alcance físico; los grupos no se suman ni restan entre sí mientras el contrato permanezca pendiente."
      />
      <SqlChartDateControls controller={controller} title="Periodo del comparativo" />
      {controller.error ? <div className="water-balance-inline-warning">{controller.error}</div> : null}
      {chartRows.length ? <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartRows} layout="vertical" margin={{ top: 12, right: 100, bottom: 12, left: 12 }}>
          <CartesianGrid stroke="rgba(56,189,248,.14)" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 'dataMax']} stroke="#b9e7ff" />
          <YAxis type="category" dataKey="name" width={150} stroke="#b9e7ff" />
          <Tooltip
            cursor={{ fill: 'rgba(56,189,248,.06)' }}
            formatter={(value) => [`${fmt(value)} m³`, 'Volumen observado']}
            labelFormatter={(label, payload) => {
              const state = payload?.[0]?.payload?.state;
              return state ? `${label} · ${state}` : label;
            }}
            allowEscapeViewBox={{ x: true, y: true }}
            wrapperStyle={{ zIndex: 140, pointerEvents: 'none' }}
            contentStyle={{ background: '#031522', border: '1px solid rgba(56,189,248,.28)', borderRadius: 12, color: '#effbff', boxShadow: '0 18px 44px rgba(0,0,0,.36)' }}
            labelStyle={{ color: '#ffffff', fontWeight: 800 }}
            itemStyle={{ color: '#e0f7ff' }}
          />
          <Bar dataKey="value" radius={[0, 10, 10, 0]}>
            {chartRows.map((item) => <Cell key={item.name} fill={item.color} />)}
            <LabelList dataKey="value" position="right" formatter={(value) => `${fmt(value)} m³`} fill="#effbff" />
          </Bar>
        </BarChart>
      </ResponsiveContainer> : <ChartEmptyState message="Sin volúmenes disponibles para el periodo seleccionado." />}
      <div className="operational-comparison-difference">
        <span>Sin cálculo de balance</span>
        <strong>No se publica una resta entre grupos mientras el contrato físico esté pendiente.</strong>
        <small>Esto evita interpretar como pérdida, fuga, eficiencia o diferencia no conciliada una relación hidráulica que todavía no está confirmada.</small>
      </div>
    </section>

    <section className="panel water-balance-contract-panel fade-up">
      <PanelHeader
        title="Validaciones físicas pendientes"
        subtitle="Estas respuestas son necesarias antes de habilitar un Balance de Agua oficial."
      />
      <div className="water-balance-contract-grid">
        {questions.map((question, index) => <article key={question}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <p>{question}</p>
        </article>)}
      </div>
      <div className="water-balance-contract-note">
        <strong>Estado actual</strong>
        <p>El dashboard conserva los volúmenes observados por grupo, pero no asigna relaciones de fuente, consumo final o diferencia hasta contar con evidencia física suficiente.</p>
      </div>
    </section>
  </div>;
}
