import { ClipboardCheck } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import KpiCard from '../../../components/KpiCard';
import { buildWellPeriodRows } from '../chartBuilders';
import { normalizeSqlWell } from '../normalizers';
import type { DashboardData, FlexibleRecord, NormalizedWaterItem } from '../types';
import ChartEmptyState from '../components/ChartEmptyState';
import ChartTooltip from '../components/ChartTooltip';
import PanelHeader from '../components/PanelHeader';
import SqlChartDateControls from '../components/SqlChartDateControls';
import StatusBadge from '../components/StatusBadge';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';

const axisColor = '#b9e7ff';
const gridColor = 'rgba(56,189,248,0.14)';

type PriorityLevel = 'critical' | 'warning' | 'normal';
type PriorityCategory = 'pozos' | 'lineas' | 'flujos' | 'balance' | 'general';

interface PriorityRow {
  target: string;
  type: string;
  description: string;
  metric: string;
  owner: string;
  priority: string;
  level: PriorityLevel;
  category: PriorityCategory;
}

interface DiagnosticRow {
  well: string;
  symptom: string;
  cause: string;
  action: string;
  priority: string;
  level: PriorityLevel;
}

interface ReviewRow {
  name: string;
  score: number;
  reason: string;
  action: string;
}

function toArray(value: unknown): FlexibleRecord[] {
  return Array.isArray(value) ? value as FlexibleRecord[] : [];
}

function asNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function flowValue(row: FlexibleRecord): number {
  return asNumber(row.flow_lps ?? row.flujo_lps ?? row.flow ?? row.flujo_salida ?? row.flujo_entrada ?? 0);
}

function hasReading(row: FlexibleRecord): boolean {
  return [row.flow_lps, row.flujo_lps, row.flow, row.totalizador_m3, row.total_m3].some((value) => value !== null && value !== undefined && value !== '');
}

function formatNumber(value: unknown, decimals = 1): string {
  const number = asNumber(value);
  return number.toLocaleString('es-MX', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

function buildPriorities(dashboard: DashboardData | null): PriorityRow[] {
  const priorities: PriorityRow[] = [];
  const wells = toArray(dashboard?.wells).map(normalizeSqlWell) as NormalizedWaterItem[];
  const lines = toArray(dashboard?.production_lines);
  const flows = toArray(dashboard?.flows);
  const entryExit = toArray(dashboard?.entry_vs_exit);

  wells.forEach((well) => {
    const name = String(well.name || well.nombre || `Pozo ${well.numero || ''}`);
    const flow = asNumber(well.flow ?? well.flujo_salida ?? well.flujo_entrada);
    const amps = well.amps === null || well.amps === undefined ? null : asNumber(well.amps);
    if (String(well.communicationType || '').includes('communication') || String(well.estado_comunicacion || '').toLowerCase().includes('sin')) {
      priorities.push({ target: name, type: 'Pozo sin lectura reciente', description: 'Validar comunicación con BOS/SCADA.', metric: String(well.ultima_lectura || 'Sin lectura'), owner: 'Operación', priority: 'Alta', level: 'warning', category: 'pozos' });
    } else if (amps && amps > 0 && flow <= 0) {
      priorities.push({ target: name, type: 'Pozo encendido sin flujo', description: 'Hay amperaje disponible y flujo instantáneo en 0 L/s.', metric: `${formatNumber(amps, 2)} A · ${formatNumber(flow)} L/s`, owner: 'Operación', priority: 'Crítica', level: 'critical', category: 'pozos' });
    } else if (flow <= 0) {
      priorities.push({ target: name, type: 'Pozo sin flujo', description: 'Última lectura disponible sin flujo actual.', metric: `${formatNumber(flow)} L/s`, owner: 'Operación', priority: 'Media', level: 'warning', category: 'pozos' });
    }
  });

  lines.forEach((line, index) => {
    const name = String(line.nombre || line.name || `Línea ${index + 1}`);
    const flow = flowValue(line);
    const total = asNumber(line.totalizador_m3 ?? line.total_m3);
    if (!hasReading(line)) {
      priorities.push({ target: name, type: 'Línea sin lectura', description: 'No hay flujo ni totalizador disponible.', metric: 'Sin lectura BOS', owner: 'Operación', priority: 'Alta', level: 'warning', category: 'lineas' });
    } else if (flow <= 0 && total > 0) {
      priorities.push({ target: name, type: 'Línea sin flujo', description: 'Totalizador disponible con flujo actual en 0 L/s.', metric: `${formatNumber(total, 0)} m³`, owner: 'Operación', priority: 'Media', level: 'warning', category: 'lineas' });
    }
  });

  flows.forEach((flow, index) => {
    const name = String(flow.nombre || flow.name || `Flujo ${index + 1}`);
    const sensorId = asNumber(flow.sensor_id);
    const value = flowValue(flow);
    const total = asNumber(flow.totalizador_m3 ?? flow.total_m3);
    if (!hasReading(flow)) {
      priorities.push({ target: name, type: 'Sensor sin comunicación', description: 'No hay lectura disponible para este punto.', metric: sensorId ? `Sensor ${sensorId}` : 'Sensor sin ID', owner: 'Operación', priority: 'Alta', level: 'warning', category: 'flujos' });
    } else if (value <= 0 && total > 0) {
      priorities.push({ target: name, type: 'Flujo 0 con totalizador', description: 'El totalizador existe pero el flujo actual es 0 L/s.', metric: `${formatNumber(total, 0)} m³`, owner: 'Operación', priority: 'Media', level: 'warning', category: 'flujos' });
    }
    if (sensorId === 3006) {
      priorities.push({ target: name, type: 'Jarabes pendiente', description: 'Punto reportado como Jarabes; falta confirmar clasificación operativa.', metric: 'Sensor 3006', owner: 'Operación', priority: 'Media', level: 'warning', category: 'flujos' });
    }
  });

  entryExit.forEach((row) => {
    const entrada = asNumber(row.entrada);
    const salida = asNumber(row.salida);
    if (entrada > 0) {
      const diffPct = Math.abs(entrada - salida) / entrada;
      if (diffPct >= 0.25) {
        priorities.push({ target: String(row.label || 'Balance de agua'), type: 'Diferencia relevante', description: 'Entrada y salida no coinciden dentro del margen básico de revisión.', metric: `${formatNumber(entrada - salida, 2)} L/s`, owner: 'Operación', priority: 'Media', level: 'warning', category: 'balance' });
      }
    }
  });

  if (!priorities.length) {
    priorities.push({ target: 'Operación del día', type: 'Sin alertas críticas', description: 'No se detectaron incidencias básicas con los datos disponibles.', metric: 'Lecturas BOS disponibles', owner: 'Operación', priority: 'Normal', level: 'normal', category: 'general' });
  }
  return priorities.slice(0, 8);
}


function priorityBreakdown(priorities: PriorityRow[]): string {
  const counts = priorities.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {} as Record<PriorityCategory, number>);
  const parts = [
    counts.pozos ? `${counts.pozos} pozos` : '',
    counts.lineas ? `${counts.lineas} líneas` : '',
    counts.flujos ? `${counts.flujos} lavadoras/Jarabes` : '',
    counts.balance ? `${counts.balance} balance` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Sin alertas operativas abiertas';
}

function buildDiagnostics(dashboard: DashboardData | null): DiagnosticRow[] {
  const wells = toArray(dashboard?.wells).map(normalizeSqlWell) as NormalizedWaterItem[];
  return wells.map((well) => {
    const name = String(well.name || well.nombre || `Pozo ${well.numero || ''}`);
    const flow = asNumber(well.flow ?? well.flujo_salida ?? well.flujo_entrada);
    const amps = well.amps === null || well.amps === undefined ? null : asNumber(well.amps);
    if (String(well.communicationType || '').includes('communication')) {
      return { well: name, symptom: 'Sin lectura reciente.', cause: 'Fuente BOS/SCADA no entregó lectura válida en el payload actual.', action: 'Revisar comunicación o disponibilidad del sensor.', priority: 'Alta', level: 'warning' as PriorityLevel };
    }
    if (amps && amps > 0 && flow <= 0) {
      return { well: name, symptom: 'Pozo encendido sin flujo.', cause: 'Hay amperaje disponible, pero no flujo instantáneo.', action: 'Validar operación o lectura de flujo.', priority: 'Crítica', level: 'critical' as PriorityLevel };
    }
    if (flow <= 0) {
      return { well: name, symptom: 'Flujo actual en 0 L/s.', cause: 'Dato operativo recibido desde BOS.', action: 'Confirmar si el pozo debe estar operando.', priority: 'Media', level: 'warning' as PriorityLevel };
    }
    return { well: name, symptom: 'Operación normal dentro de datos disponibles.', cause: 'Flujo actual disponible.', action: 'Continuar monitoreo operativo.', priority: 'Normal', level: 'normal' as PriorityLevel };
  });
}

function RevisionDiariaSection() {
  const reviewChart = useSqlChartDashboard('dashboard');
  const dashboard = reviewChart.dashboard as DashboardData | null;
  const priorities = buildPriorities(dashboard);
  const diagnostics = buildDiagnostics(dashboard);
  const criticalCount = priorities.filter((item) => item.level === 'critical').length;
  const highCount = priorities.filter((item) => item.priority === 'Alta' || item.priority === 'Crítica').length;
  const flows = toArray(dashboard?.flows);
  const reportReady = String(dashboard?.source_status || '').startsWith('sqlserver');
  const reviewRows: ReviewRow[] = buildWellPeriodRows(dashboard).map((row) => ({
    name: row.name as string,
    score: asNumber(row.flujo),
    reason: (row.fullName || row.name) as string,
    action: 'Ranking por flujo real; la eficiencia energética queda pendiente de fuente confiable.',
  })).filter((row) => row.score || row.reason);
  const alertBreakdown = priorityBreakdown(priorities);
  const cards = [
    { label: 'Alertas operativas', value: String(priorities.filter((item) => item.level !== 'normal').length), unit: '', trend: alertBreakdown, accent: 'red' },
    { label: 'Pozos revisados', value: String(toArray(dashboard?.wells).length), unit: 'pozos', trend: 'Datos reales BOS', accent: 'cyan' },
    { label: 'Líneas revisadas', value: String(toArray(dashboard?.production_lines).length), unit: 'líneas', trend: 'Datos reales BOS', accent: 'teal' },
    { label: 'Lavadoras/Jarabes', value: String(flows.length), unit: 'puntos', trend: 'Jarabes pendiente si aparece sensor 3006', accent: 'blue' },
  ];

  return (
    <>
      <section className="daily-review-hero panel fade-up">
        <div>
          <h2>Revisión Diaria</h2>
          <p>Prioridades automáticas basadas en datos reales disponibles de Durango. No sustituye validación operativa.</p>
        </div>
        <div className="daily-review-status-card">
          <div className="daily-review-icon"><ClipboardCheck size={24} /></div>
          <div>
            <span>Atención requerida</span>
            <strong>{criticalCount} críticas · {highCount} altas</strong>
          </div>
        </div>
      </section>

      <section className="cards-grid stagger-grid daily-review-kpi-grid">
        {cards.map((card, index) => (
          <KpiCard key={card.label} {...card} style={{ animationDelay: `${index * 60}ms` }} />
        ))}
      </section>

      <section className="content-grid daily-review-main-grid">
        <div className="panel fade-up daily-priority-panel">
          <PanelHeader title="Prioridades del día" subtitle={`Alertas derivadas por tipo de activo: ${alertBreakdown}`} />
          <div className="daily-priority-list">
            {priorities.map((item, index) => (
              <article className={item.level} key={`${item.type}-${item.target}-${index}`}>
                <div className="priority-rank">{index + 1}</div>
                <div className="priority-body">
                  <div className="priority-topline">
                    <strong>{item.target}</strong>
                    <span>{item.type}</span>
                  </div>
                  <p>{item.description}</p>
                  <div className="priority-meta-row">
                    <em>{item.metric}</em>
                    <b>{item.owner}</b>
                  </div>
                </div>
                <StatusBadge type={item.level === 'critical' ? 'critical' : item.level === 'warning' ? 'warning' : 'normal'}>{item.priority}</StatusBadge>
              </article>
            ))}
          </div>
        </div>

        <div className="panel chart-panel fade-up daily-ranking-panel">
          <PanelHeader title="Ranking de suministro/flujo real" subtitle="Ranking operativo sin fuente energética confirmada" />
          <SqlChartDateControls controller={reviewChart} />
          {reviewRows.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={reviewRows} layout="vertical" margin={{ left: 12, right: 24 }}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                <XAxis type="number" stroke={axisColor} />
                <YAxis type="category" dataKey="name" stroke={axisColor} width={86} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
                <Bar dataKey="score" name="Flujo actual (L/s)" radius={[0, 10, 10, 0]}>
                  {reviewRows.map((item) => (
                    <Cell key={item.name} fill={item.score <= 0 ? '#f87171' : item.score < 5 ? '#f59e0b' : '#38bdf8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <ChartEmptyState message="Sin datos de suministro/flujo por pozo para este rango." />}
          <div className="daily-ranking-table-wrap">
            <table className="pozos-table daily-ranking-table">
              <thead>
                <tr>
                  <th>Elemento</th>
                  <th>Motivo</th>
                  <th>Flujo</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {reviewRows.map((item) => (
                  <tr key={item.name}>
                    <td>{item.name}</td>
                    <td>{item.reason}</td>
                    <td>{formatNumber(item.score)} L/s</td>
                    <td>{item.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel fade-up daily-diagnostics-panel">
        <PanelHeader title="Diagnósticos resumidos por pozo" subtitle="Diagnósticos básicos; no se infieren causas mecánicas sin fuente real" />
        <div className="daily-diagnostics-grid">
          {diagnostics.length ? diagnostics.map((item) => (
            <article className={item.level} key={item.well}>
              <div className="diagnostic-card-head">
                <strong>{item.well}</strong>
                <StatusBadge type={item.level}>{item.priority}</StatusBadge>
              </div>
              <div className="diagnostic-mini-row"><span>Síntoma</span><p>{item.symptom}</p></div>
              <div className="diagnostic-mini-row"><span>Lectura</span><p>{item.cause}</p></div>
              <div className="diagnostic-mini-row"><span>Acción sugerida</span><p>{item.action}</p></div>
            </article>
          )) : <ChartEmptyState message="Sin pozos disponibles para diagnóstico." />}
        </div>
      </section>

      <section className="content-grid daily-review-bottom-grid">
        <div className="panel summary-panel fade-up daily-export-panel">
          <PanelHeader title="Resumen diario preparado" subtitle="Checklist operativo sin simulación de validación manual" />
          <div className="daily-export-list">
            <article><div className="export-check-icon"><ClipboardCheck size={15} /></div><div><strong>Datos BOS</strong><span>{reportReady ? 'Reporte disponible con fuente SQL Server/BOS.' : 'Pendiente: fuente BOS no disponible.'}</span></div></article>
            <article><div className="export-check-icon"><ClipboardCheck size={15} /></div><div><strong>Concesión</strong><span>Sin fuente confirmada; no se calcula porcentaje usado.</span></div></article>
            <article><div className="export-check-icon"><ClipboardCheck size={15} /></div><div><strong>Eficiencia energética</strong><span>Pendiente de fuente confiable.</span></div></article>
          </div>
        </div>

        <div className="panel summary-panel fade-up daily-review-note-panel">
          <PanelHeader title="Criterio de priorización" subtitle="Reglas operativas automáticas" />
          <div className="review-rule-stack">
            <article><span>Crítico</span><p>Pozo con amperaje disponible y flujo actual en cero.</p></article>
            <article><span>Revisar</span><p>Sensor sin lectura, línea sin flujo o totalizador sin flujo instantáneo.</p></article>
            <article><span>Pendiente</span><p>Jarabes se muestra como punto operativo pendiente de clasificación.</p></article>
          </div>
        </div>
      </section>
    </>
  );
}

export default RevisionDiariaSection;
