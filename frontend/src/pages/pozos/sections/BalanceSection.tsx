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

function coverageText(group: FlexibleRecord): string {
  const available = Number(group.coverage_available || 0);
  const total = Number(group.coverage_total || 0);
  if (!total) return 'Sin cobertura confirmada';
  return `${available}/${total} · ${String(group.coverage_status || 'Cobertura por revisar')}`;
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
  const sourceVolume = number(source.validated_volume_m3);
  const candidateConsumptionTotal = number(balance.candidate_consumption_total_m3);
  const operationalComparison = number(balance.operational_comparison_m3);
  const unreconciledDifference = number(balance.unreconciled_difference_m3);
  const official = balance.is_official === true;

  const observedRows = [source, ...consumptions].map((item, index) => ({
    name: String(item.label || `Grupo ${index + 1}`),
    value: number(item.validated_volume_m3),
    role: String(item.role || ''),
    coverage: coverageText(item),
    color: BAR_COLORS[index % BAR_COLORS.length],
  }));
  const chartRows = observedRows.filter((item) => item.value !== null);
  const coverageAvailable = observedRows.reduce((sum, item) => {
    const match = item.coverage.match(/^(\d+)\//);
    return sum + (match ? Number(match[1]) : 0);
  }, 0);
  const coverageTotal = [source, ...consumptions].reduce((sum, item) => sum + Number(item.coverage_total || 0), 0);
  const rangeLabel = formatOperationalDateRange(controller.range, 'Periodo operativo actual');
  const comparisonPartial = String(balance.operational_comparison_status || '').includes('partial');

  return <div className="water-balance-page">
    <section className="water-balance-hero panel fade-up">
      <div className="water-balance-hero-copy">
        <div className="water-balance-title-row">
          <div>
            <span className="eyebrow">Contrato hidráulico</span>
            <h2>Balance de Agua</h2>
          </div>
          <StatusBadge type={official ? 'success' : 'warning'}>
            {official ? 'Balance oficial' : 'Pendiente de validación física'}
          </StatusBadge>
        </div>
        <p>{String(balance.message || 'La fuente base física del balance todavía está pendiente de validación para Durango.')}</p>
        <small className="water-balance-period">{rangeLabel}</small>
      </div>
      <div className="water-balance-hero-grid">
        <article>
          <span>Volumen observado en pozos</span>
          <strong>{fmt(sourceVolume)} <small>m³</small></strong>
          <small>{coverageText(source)}</small>
        </article>
        <article>
          <span>Consumos candidatos medidos</span>
          <strong>{fmt(candidateConsumptionTotal)} <small>m³</small></strong>
          <small>Líneas + Lavadoras + Jarabes · clasificación física pendiente</small>
        </article>
        <article>
          <span>Cobertura utilizable</span>
          <strong>{coverageAvailable}/{coverageTotal || 0}</strong>
          <small>Elementos con volumen validado disponible</small>
        </article>
        <article className="warning">
          <span>Diferencia no conciliada oficial</span>
          <strong>{fmt(unreconciledDifference)}</strong>
          <small>No se publica hasta cerrar el contrato físico</small>
        </article>
      </div>
    </section>

    <section className="cards-grid water-balance-kpi-grid">
      <KpiCard
        label="Fuente base oficial"
        value={contract.source_base_confirmed === true ? 'Confirmada' : 'Pendiente'}
        unit=""
        trend="No se asume que la suma de pozos sea la fuente oficial sin validación física"
        accent="blue"
      />
      <KpiCard
        label="Consumos finales aditivos"
        value={contract.final_consumptions_confirmed === true ? 'Confirmados' : 'Pendientes'}
        unit=""
        trend="Líneas, Lavadoras y Jarabes se muestran como candidatos, no como suma oficial"
        accent="cyan"
      />
      <KpiCard
        label="Comparativo operativo observado"
        value={fmt(operationalComparison)}
        unit={operationalComparison === null ? '' : 'm³'}
        trend={operationalComparison === null
          ? 'Sin datos suficientes para comparar los grupos observados'
          : `${comparisonPartial ? 'Cobertura parcial · ' : ''}Pozos − Líneas − Lavadoras − Jarabes · no es balance oficial`}
        accent="indigo"
      />
      <KpiCard
        label="Diferencia no conciliada"
        value={official ? fmt(unreconciledDifference) : '—'}
        unit={official && unreconciledDifference !== null ? 'm³' : ''}
        trend={official ? 'Contrato físico confirmado' : 'Bloqueada hasta confirmar fuente, alcance y doble conteo'}
        accent="brown"
      />
    </section>

    <section className="panel chart-panel balance-chart-panel fade-up">
      <PanelHeader
        title="Volúmenes observados para validar el contrato"
        subtitle="Los grupos se presentan por separado; no se interpretan automáticamente como fuente y consumos finales."
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
            formatter={(value) => [`${fmt(value)} m³`, 'Volumen validado observado']}
            labelFormatter={(label, payload) => {
              const coverage = payload?.[0]?.payload?.coverage;
              return coverage ? `${label} · ${coverage}` : label;
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
      </ResponsiveContainer> : <ChartEmptyState message="Sin volúmenes validados para el periodo seleccionado." />}
      <div className="operational-comparison-difference">
        <span>Comparativo operativo · no oficial</span>
        <strong>{operationalComparison === null ? 'No hay datos suficientes para calcular el comparativo observado.' : `${fmt(operationalComparison)} m³ · Pozos − Líneas − Lavadoras − Jarabes`}</strong>
        <small>No representa diferencia no conciliada, pérdida, fuga, desperdicio ni eficiencia mientras el contrato físico permanezca pendiente.</small>
      </div>
    </section>

    <section className="panel water-balance-contract-panel fade-up">
      <PanelHeader
        title="Validaciones físicas pendientes"
        subtitle="Estas respuestas son necesarias antes de habilitar una diferencia no conciliada oficial."
      />
      <div className="water-balance-contract-grid">
        {questions.map((question, index) => <article key={question}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <p>{question}</p>
        </article>)}
      </div>
      <div className="water-balance-contract-note">
        <strong>Estado actual</strong>
        <p>El dashboard conserva los volúmenes medidos y su cobertura, pero evita convertir una semejanza visual entre medidores en una afirmación hidráulica no confirmada.</p>
      </div>
    </section>
  </div>;
}
