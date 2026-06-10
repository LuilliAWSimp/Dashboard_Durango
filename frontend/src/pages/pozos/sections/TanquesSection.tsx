import { AlertTriangle } from 'lucide-react';
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
import { buildTankLevelHistoryRows, buildTankLevelRows } from '../chartBuilders';
import type { ChartDataPoint, DashboardData } from '../types';
import ChartEmptyState from '../components/ChartEmptyState';
import ChartTooltip from '../components/ChartTooltip';
import PanelHeader from '../components/PanelHeader';
import SqlChartDateControls from '../components/SqlChartDateControls';
import StatusBadge from '../components/StatusBadge';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';

const axisColor = '#b9e7ff';
const gridColor = 'rgba(56,189,248,0.14)';
const levelColors = ['#38bdf8', '#a855f7', '#22c55e', '#f472b6', '#818cf8', '#14b8a6'];

interface TankCardView {
  name: string;
  displayName: string;
  shortName: string;
  type: string;
  kind: string;
  metros: number;
  maxHeight: number;
  m3: number;
  capacidad: number;
  llenado: number;
  fillPctExact: number;
  tendencia: string;
  estado: string;
  statusType: string;
  riesgo: string;
  sourceColumn?: string;
  updated?: string;
  isSqlLevel?: boolean;
  volumeSource?: string;
  volumeSourceColumn?: string;
}

interface TankAlertView {
  tank: string;
  type: string;
  detail: string;
  priority: string;
  statusType?: string;
}

function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('es-MX', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function tankStatus(fillPct: number, hasReading: boolean): { estado: string; statusType: string; riesgo: string } {
  if (!hasReading) {
    return {
      estado: 'Sin lectura',
      statusType: 'communication',
      riesgo: 'Validar comunicación o instrumentación del nivel.',
    };
  }
  if (fillPct <= 0) {
    return {
      estado: 'Sin nivel',
      statusType: 'warning',
      riesgo: 'Tanque o cisterna vacío. Revisar suministro de inmediato.',
    };
  }
  if (fillPct < 20) {
    return {
      estado: 'Nivel muy bajo',
      statusType: 'critical',
      riesgo: 'Reserva crítica. Priorizar recuperación del nivel.',
    };
  }
  if (fillPct < 40) {
    return {
      estado: 'Nivel bajo',
      statusType: 'warning',
      riesgo: 'Monitorear consumo y programar recuperación.',
    };
  }
  if (fillPct >= 85) {
    return {
      estado: 'Nivel alto',
      statusType: 'normal',
      riesgo: 'Sin riesgo operativo inmediato.',
    };
  }
  return {
    estado: 'Normal',
    statusType: 'normal',
    riesgo: 'Nivel dentro del rango operativo esperado.',
  };
}

function tankCardFromLevel(row: ChartDataPoint): TankCardView {
  const levelValue = asNumber(row.metros ?? row.nivel ?? row.value ?? 0);
  const maxHeight = asNumber(row.maxHeight ?? 0);
  const fillPctExact = maxHeight > 0
    ? Math.max(0, Math.min(100, asNumber(row.llenado ?? (levelValue / maxHeight) * 100)))
    : Math.max(0, Math.min(100, asNumber(row.llenado ?? row.nivel ?? 0)));
  const hasReading = levelValue > 0 || fillPctExact > 0 || asNumber(row.m3 ?? 0) > 0;
  const status = tankStatus(fillPctExact, hasReading);

  return {
    name: String(row.name || row.label || 'Tanque'),
    displayName: String(row.displayName || row.label || row.name || 'Tanque'),
    shortName: String(row.shortName || row.sourceColumn || row.name || ''),
    type: String(row.type || 'Tanque'),
    kind: String(row.kind || 'tanque'),
    metros: levelValue,
    maxHeight,
    m3: asNumber(row.m3 ?? 0),
    capacidad: asNumber(row.capacidad ?? 0),
    llenado: clampPercent(fillPctExact),
    fillPctExact,
    tendencia: row.updated ? `Actualizado ${String(row.updated)}` : 'Última lectura disponible',
    estado: status.estado,
    statusType: status.statusType,
    riesgo: status.riesgo,
    sourceColumn: String(row.sourceColumn || ''),
    updated: String(row.updated || ''),
    isSqlLevel: true,
    volumeSource: String(row.volumeSource || 'estimated'),
    volumeSourceColumn: String(row.volumeSourceColumn || ''),
  };
}

function levelLabel(key: string, dashboard?: DashboardData | null): string {
  const metadata = dashboard?.tank_level_columns?.find((item) => String(item.key || '') === key);
  if (metadata?.name) return String(metadata.name);
  const fallbackLabels: Record<string, string> = {
    tratadaNorte: 'Tanque tratada norte',
    suaveProceso: 'Tanque suave proceso',
    crudaReserva: 'Tanque cruda reserva',
    recuperada: 'Cisterna Agua Recuperada',
  };
  return fallbackLabels[key] || key.replace(/_/g, ' ');
}

function volumeSourceLabel(tank: TankCardView): string {
  if (tank.volumeSource === 'scada') {
    return 'Volumen medido';
  }
  return 'Volumen estimado';
}

function isTechnicalTankText(value: unknown): boolean {
  const text = String(value || '').trim();
  return /dbo\.|sensorsbos|tanque_flow|^nivel[0-9a-z_]*$/i.test(text);
}

function TanquesSection() {
  const tanquesChart = useSqlChartDashboard('tanques');
  const dashboard = tanquesChart.dashboard as DashboardData | null;
  const sqlTankLevelRows = buildTankLevelRows(dashboard);
  const usesSqlLevels = sqlTankLevelRows.length > 0;
  const sourceStatus = String(dashboard?.source_status || '');
  const hasSqlConnectionError = Boolean(tanquesChart.error) || sourceStatus === 'sqlserver_error';
  const isLoadingSql = tanquesChart.loading && !dashboard;
  const tankCards: TankCardView[] = usesSqlLevels ? sqlTankLevelRows.map(tankCardFromLevel) : [];

  const levelChartRows = sqlTankLevelRows;
  const sqlHistoryRows = buildTankLevelHistoryRows(dashboard);
  const levelHistoryRows = sqlHistoryRows;
  const levelHistoryKeys = Object.keys(levelHistoryRows[0] || {}).filter((key) => key.startsWith('nivel_'));
  const tanksAtRisk = tankCards.filter((tank) => ['warning', 'critical', 'communication'].includes(tank.statusType)).length;
  const averageLevel = Math.round(tankCards.reduce((sum, tank) => sum + tank.llenado, 0) / Math.max(tankCards.length, 1));
  const totalVolume = tankCards.reduce((sum, tank) => sum + tank.m3, 0);
  const totalCapacity = tankCards.reduce((sum, tank) => sum + tank.capacidad, 0);
  const alertRows: TankAlertView[] = tankCards
    .filter((tank) => ['warning', 'critical', 'communication'].includes(tank.statusType))
    .map((tank) => ({
      tank: tank.displayName,
      type: tank.estado,
      detail: `Altura ${formatNumber(tank.metros)} / ${formatNumber(tank.maxHeight)} m · ${formatNumber(tank.m3)} m³`,
      priority: tank.statusType === 'critical' ? 'Alta' : tank.statusType === 'communication' ? 'Validar' : 'Media',
      statusType: tank.statusType,
    }));
  const tankStateMessage = isLoadingSql
    ? 'Cargando niveles de tanques desde SQL Server...'
    : hasSqlConnectionError
      ? 'Sin conexión a SQL Server. No fue posible leer niveles de tanques.'
      : 'Sin sensores de nivel instalados. Esta planta no tiene sensores de nivel de tanques/cisternas configurados actualmente.';
  const tankHistoryMessage = isLoadingSql
    ? 'Cargando histórico de tanques desde SQL Server...'
    : hasSqlConnectionError
      ? 'Sin conexión a SQL Server. No fue posible leer el histórico de tanques.'
      : 'Sin histórico de niveles disponible porque esta planta no tiene sensores de nivel de tanques/cisternas configurados actualmente.';

  return (
    <>
      <section className="tanques-hero panel fade-up compact-hero">
        <div>
          <h2>Tanques y cisternas</h2>
          <p>Consulta el nivel disponible y el estado de almacenamiento.</p>
        </div>
        <div className="tanques-hero-metrics">
          <article>
            <span>Nivel promedio</span>
            <strong>{averageLevel}%</strong>
          </article>
          <article>
            <span>Volumen total</span>
            <strong>{formatNumber(totalVolume, 0)} <small>m³</small></strong>
          </article>
          <article>
            <span>Capacidad total</span>
            <strong>{formatNumber(totalCapacity, 0)} <small>m³</small></strong>
          </article>
          <article>
            <span>Alertas</span>
            <strong>{tanksAtRisk}</strong>
          </article>
        </div>
      </section>

      <section className="tanques-card-grid fade-up">
        {tankCards.length ? tankCards.map((tank) => (
          <article className={`panel tanque-card ${tank.statusType || 'normal'} ${tank.kind || 'tanque'}`} key={tank.name}>
            <div className="tanque-card-head">
              <div className="tanque-card-heading">
                <strong>{tank.displayName}</strong>
                {tank.shortName && !isTechnicalTankText(tank.shortName) ? <small>{tank.shortName}</small> : null}
              </div>
              <div className="tanque-card-meta">
                <StatusBadge type={tank.statusType}>{tank.estado}</StatusBadge>
                {tank.updated ? <em>{tank.updated}</em> : null}
              </div>
            </div>

            <div className="tanque-card-body">
              <div className={`tank-visual-shell ${tank.kind || 'tanque'}`}>
                <div className="tank-visual-neck" />
                <div className="tank-visual-body">
                  <div className="tank-visual-fill" style={{ height: `${tank.fillPctExact}%` }}>
                    <div className="tank-wave tank-wave-back" />
                    <div className="tank-wave tank-wave-front" />
                    <div className="tank-wave tank-wave-sheen" />
                  </div>
                  <div className="tank-percent-overlay">{tank.llenado}%</div>
                </div>
              </div>

              <div className="tanque-info-panel">
                <div className={`tanque-source-chip ${tank.volumeSource === 'scada' ? 'scada' : 'estimated'}`}>
                  {volumeSourceLabel(tank)}
                </div>
                <div className="tanque-kpi-grid">
                  <article className="tanque-kpi emphasis">
                    <span>Nivel</span>
                    <strong>{formatNumber(tank.fillPctExact)}%</strong>
                  </article>
                  <article className="tanque-kpi emphasis">
                    <span>Volumen</span>
                    <strong>{formatNumber(tank.m3)} <small>m³</small></strong>
                  </article>
                  <article className="tanque-kpi">
                    <span>Altura actual</span>
                    <strong>{formatNumber(tank.metros)} m</strong>
                  </article>
                  <article className="tanque-kpi">
                    <span>Altura máxima</span>
                    <strong>{formatNumber(tank.maxHeight)} m</strong>
                  </article>
                  <article className="tanque-kpi">
                    <span>Capacidad</span>
                    <strong>{formatNumber(tank.capacidad, 0)} m³</strong>
                  </article>
                  <article className="tanque-kpi">
                    <span>Origen nivel</span>
                    <strong>{tank.sourceColumn ? 'Sistema de monitoreo' : 'No disponible'}</strong>
                  </article>
                </div>
              </div>
            </div>

            <div className="tanque-card-footer">
              <div>
                <span>Lectura</span>
                <strong>{tank.tendencia}</strong>
              </div>
              <div>
                <span>Riesgo</span>
                <strong>{tank.riesgo}</strong>
              </div>
            </div>
          </article>
        )) : <div className="panel"><ChartEmptyState message={tankStateMessage} /></div>}
      </section>

      <section className="content-grid tanques-main-grid">
        <div className="panel chart-panel fade-up">
          <PanelHeader title="Niveles" subtitle="Altura actual y porcentaje de llenado disponibles para operación." />
          <SqlChartDateControls controller={tanquesChart} />
          {levelChartRows.length ? (
            <ResponsiveContainer width="100%" height={330}>
              <ComposedChart data={levelChartRows}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                <XAxis dataKey="shortName" stroke={axisColor} interval={0} />
                <YAxis yAxisId="left" stroke={axisColor} />
                <YAxis yAxisId="right" orientation="right" stroke="#22d3ee" domain={[0, 100]} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
                <Legend />
                <Bar yAxisId="left" dataKey="metros" name="Altura actual (m)" fill="#0ea5e9" radius={[10, 10, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="llenado" name="Llenado (%)" stroke="#7dd3fc" strokeWidth={2.8} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <ChartEmptyState message={tankStateMessage} />}
        </div>

        <div className="panel summary-panel fade-up tanques-alert-panel">
          <PanelHeader title="Alertas" subtitle="Prioridades visuales para revisión operativa" />
          <div className="priority-list compact-priority-list">
            {alertRows.length ? alertRows.map((alert) => (
              <article className="priority-item" key={`${alert.tank}-${alert.type}`}>
                <div className={`priority-icon ${alert.statusType || 'normal'}`}><AlertTriangle size={16} /></div>
                <div className="priority-copy">
                  <div className="priority-head">
                    <strong>{alert.tank}</strong>
                    <span>{alert.priority}</span>
                  </div>
                  <div className="priority-type">{alert.type}</div>
                  <p>{alert.detail}</p>
                </div>
              </article>
            )) : <ChartEmptyState message="Sin alertas de nivel para el periodo seleccionado." />}
          </div>
        </div>
      </section>

      <section className="panel chart-panel fade-up">
        <PanelHeader title="Histórico" subtitle="Comportamiento de niveles en el rango seleccionado." />
        <SqlChartDateControls controller={tanquesChart} title="Fechas de histórico de tanques" />
        {levelHistoryRows.length && levelHistoryKeys.length ? (
          <ResponsiveContainer width="100%" height={330}>
            <ComposedChart data={levelHistoryRows}>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
              <XAxis dataKey="time" stroke={axisColor} />
              <YAxis stroke={axisColor} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              {levelHistoryKeys.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={levelLabel(key, dashboard)}
                  stroke={levelColors[index % levelColors.length]}
                  strokeWidth={2.4}
                  dot={{ r: 3 }}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        ) : <ChartEmptyState message={tankHistoryMessage} />}
      </section>
    </>
  );
}

export default TanquesSection;
