import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { AlertTriangle, Droplets, Gauge, Waves } from 'lucide-react';
import KpiCard, { type KpiCardProps } from '../../../components/KpiCard';
import { clearWaterCache, fetchWaterDashboard } from '../../../services/waterService';
import {
  dateRangePeriod,
  defaultTodayRange,
  formatDateRangeStatus,
} from '../dateUtils';
import { normalizeSqlWell } from '../normalizers';
import { buildEntryExitRows, buildWellPeriodRows } from '../chartBuilders';
import ChartTooltip from '../components/ChartTooltip';
import PanelHeader from '../components/PanelHeader';
import StatusBadge from '../components/StatusBadge';
import DateRangeControls from '../components/DateRangeControls';
import ChartPeriodNote from '../components/ChartPeriodNote';
import ChartEmptyState from '../components/ChartEmptyState';
import type { DashboardData, DateRange, FlexibleRecord, NormalizedWaterItem } from '../types';

const axisColor = '#b9e7ff';
const gridColor = 'rgba(56,189,248,0.14)';
const AUTO_REFRESH_MS = 60 * 1000;

interface DashboardCard extends KpiCardProps {
  label: string | number;
}

interface DashboardOverview extends DashboardData {
  cards?: DashboardCard[];
  wells?: FlexibleRecord[];
  production_lines?: FlexibleRecord[];
  flows?: FlexibleRecord[];
  updated_at?: unknown;
  source_status?: unknown;
  source_notes?: unknown;
}

interface DashboardWell extends NormalizedWaterItem {
  name: string;
  status: string;
  statusType: string;
  flow: number;
  amps?: number | null;
  diagnosis: string;
  updated: string;
}

function formatNumber(value: unknown, decimals = 1): string {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('es-MX', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

function formatOptionalDate(value: unknown): string {
  if (!value) return 'Sin hora de actualización';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function toArray(value: unknown): FlexibleRecord[] {
  return Array.isArray(value) ? value as FlexibleRecord[] : [];
}

function hasReading(row: FlexibleRecord): boolean {
  return row.flow_lps !== null || row.flujo_lps !== null || row.flow !== null || row.totalizador_m3 !== null || row.total_m3 !== null;
}

function flowValue(row: FlexibleRecord): number {
  return Number(row.flow_lps ?? row.flujo_lps ?? row.flow ?? row.flujo_salida ?? row.flujo_entrada ?? 0);
}

function buildOperationalAlerts(dashboard: DashboardOverview | null): Array<{ title: string; type: string; detail: string; priority: string; level: 'critical' | 'warning' | 'normal' }> {
  const alerts: Array<{ title: string; type: string; detail: string; priority: string; level: 'critical' | 'warning' | 'normal' }> = [];
  const wells = toArray(dashboard?.wells).map(normalizeSqlWell) as DashboardWell[];
  const lines = toArray(dashboard?.production_lines);
  const flows = toArray(dashboard?.flows);

  wells.forEach((well) => {
    const flow = Number(well.flow ?? well.flujo_salida ?? well.flujo_entrada ?? 0);
    const amps = well.amps === null || well.amps === undefined ? null : Number(well.amps);
    if (well.communicationType === 'communication' || String(well.estado_comunicacion || '').toLowerCase().includes('sin')) {
      alerts.push({ title: well.name, type: 'Pozo sin lectura reciente', detail: 'Validar comunicación con BOS/SCADA.', priority: 'Alta', level: 'warning' });
    } else if ((amps && amps > 0) && flow <= 0) {
      alerts.push({ title: well.name, type: 'Pozo encendido sin flujo', detail: 'Hay amperaje disponible pero el flujo instantáneo es 0 L/s.', priority: 'Alta', level: 'critical' });
    } else if (flow <= 0) {
      alerts.push({ title: well.name, type: 'Pozo sin flujo', detail: 'Última lectura disponible sin flujo instantáneo.', priority: 'Media', level: 'warning' });
    }
  });

  lines.forEach((line, index) => {
    const flow = flowValue(line);
    const total = Number(line.totalizador_m3 ?? line.total_m3 ?? 0);
    const label = String(line.nombre || line.name || `Línea ${index + 1}`);
    if (!hasReading(line)) {
      alerts.push({ title: label, type: 'Línea sin lectura', detail: 'No hay flujo ni totalizador disponible en el payload actual.', priority: 'Alta', level: 'warning' });
    } else if (flow <= 0 && total > 0) {
      alerts.push({ title: label, type: 'Línea sin flujo actual', detail: 'Totalizador disponible, pero flujo instantáneo en 0 L/s.', priority: 'Media', level: 'warning' });
    }
  });

  flows.forEach((flow, index) => {
    const value = flowValue(flow);
    const total = Number(flow.totalizador_m3 ?? flow.total_m3 ?? 0);
    const label = String(flow.nombre || flow.name || `Flujo ${index + 1}`);
    const sensorId = Number(flow.sensor_id || 0);
    if (!hasReading(flow)) {
      alerts.push({ title: label, type: 'Sensor sin comunicación', detail: `Sensor ${sensorId || 'sin ID'} sin lectura disponible.`, priority: 'Alta', level: 'warning' });
    } else if (value <= 0 && total > 0) {
      alerts.push({ title: label, type: 'Flujo 0 con totalizador', detail: 'El totalizador existe pero el flujo actual está en 0 L/s.', priority: 'Media', level: 'warning' });
    }
    if (sensorId === 3006) {
      alerts.push({ title: label, type: 'Jarabes pendiente de validar', detail: 'Punto operativo pendiente de clasificar; se muestra sin reclasificar.', priority: 'Media', level: 'warning' });
    }
  });

  if (!alerts.length) {
    alerts.push({ title: 'Operación sin alertas críticas', type: 'Revisión automática', detail: 'No se detectaron inconsistencias básicas con los datos disponibles.', priority: 'Normal', level: 'normal' });
  }
  return alerts.slice(0, 5);
}

function buildFlowSummary(dashboard: DashboardOverview | null) {
  return toArray(dashboard?.flows).map((item, index) => ({
    name: String(item.nombre || item.name || `Flujo ${index + 1}`),
    sensorId: item.sensor_id,
    flow: flowValue(item),
    total: Number(item.totalizador_m3 ?? item.total_m3 ?? 0),
    status: String(item.status || (flowValue(item) > 0 ? 'Operando' : 'Sin flujo')),
    statusType: String(item.statusType || (flowValue(item) > 0 ? 'normal' : 'idle')),
    note: Number(item.sensor_id || 0) === 3006 ? 'Pendiente de clasificar' : String(item.category || ''),
  }));
}

export default function DashboardBaseSection() {
  const [sqlDashboard, setSqlDashboard] = useState<DashboardOverview | null>(null);
  const [sqlError, setSqlError] = useState('');
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [lastRefresh, setLastRefresh] = useState('');
  const [chartDraftRange, setChartDraftRange] = useState<DateRange>(defaultTodayRange);
  const [chartRange, setChartRange] = useState<DateRange>(defaultTodayRange);
  const [chartDashboard, setChartDashboard] = useState<DashboardData | null>(null);
  const [chartError, setChartError] = useState('');

  const loadFastDashboard = useCallback((forceRefresh = false) => {
    setSqlError('');
    return fetchWaterDashboard('dashboard', { force_refresh: forceRefresh, include_history: false, include_energy_water: false })
      .then((data) => {
        setSqlDashboard(data as DashboardOverview);
        setLastRefresh(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
      })
      .catch((error) => {
        setSqlError(error?.message || 'No se pudo leer SQL Server');
      })
      .finally(() => setLoadingInitial(false));
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = (forceRefresh = false) => {
      if (!mounted) return;
      loadFastDashboard(forceRefresh);
    };
    run(false);
    const interval = window.setInterval(() => run(true), AUTO_REFRESH_MS);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [loadFastDashboard]);

  useEffect(() => {
    let mounted = true;
    setChartError('');
    fetchWaterDashboard('dashboard', { ...chartRange, period: dateRangePeriod(chartRange), include_history: false, include_energy_water: false })
      .then((data) => { if (mounted) setChartDashboard(data as DashboardData); })
      .catch((error) => {
        if (mounted) {
          setChartError(error?.message || 'No se pudo leer la gráfica desde SQL Server');
          setChartDashboard(null);
        }
      });
    return () => { mounted = false; };
  }, [chartRange.startDate, chartRange.endDate, chartRange.refreshKey]);

  const dashboardCards = sqlDashboard?.cards?.length ? sqlDashboard.cards : [];
  const dashboardWells = sqlDashboard?.wells?.length ? sqlDashboard.wells.map(normalizeSqlWell) as DashboardWell[] : [];
  const productionRows = buildWellPeriodRows(chartDashboard || sqlDashboard).map((row) => ({ ...row, flujo: Number(row.flujo || 0) }));
  const entryExitRows = buildEntryExitRows(sqlDashboard);
  const alertRows = buildOperationalAlerts(sqlDashboard);
  const flowSummary = buildFlowSummary(sqlDashboard);
  const sqlStatus = sqlError
    ? `Error al actualizar: ${sqlError}. Se conservan los últimos datos válidos.`
    : String(sqlDashboard?.source_status || '').startsWith('sqlserver')
      ? 'Datos actuales de Durango desde BOS'
      : (loadingInitial ? 'Cargando datos operativos...' : 'Sin datos disponibles');
  const chartStatus = chartError || formatDateRangeStatus(chartRange, 'Última lectura disponible');

  return (
    <>
      <section className="resumen-hero-panel panel fade-up compact-hero">
        <div>
          <h2>Resumen operativo de agua</h2>
          <p>Estado general de pozos, líneas, lavadoras y Jarabes con lecturas reales disponibles de Durango.</p>
        </div>
        <div className="resumen-hero-status">
          <div className="resumen-hero-icon"><Droplets size={24} /></div>
          <div>
            <span>Estado general</span>
            <strong>{sqlStatus}</strong>
            <small>{lastRefresh ? `Actualizado ${lastRefresh} · refresco cada 60 s` : 'Refresco automático cada 60 s'}</small>
          </div>
        </div>
      </section>

      <section className="cards-grid stagger-grid resumen-kpi-grid">
        {dashboardCards.length ? dashboardCards.map((card, index) => (
          <KpiCard key={card.label} {...card} style={{ animationDelay: `${index * 60}ms` }} />
        )) : <div className="panel"><ChartEmptyState message={loadingInitial ? 'Cargando KPIs desde BOS...' : 'Sin KPIs operativos disponibles.'} /></div>}
      </section>

      <section className="content-grid resumen-top-grid">
        <div className="panel chart-panel fade-up resumen-primary-chart">
          <PanelHeader
            title="Volumen y flujo por pozo"
            subtitle="Comparativo real de pozos para el periodo seleccionado con datos BOS disponibles."
          />
          <DateRangeControls
            className="chart-date-range-panel"
            title="Fechas de la gráfica"
            subtitle="No cambia los estados ni las lecturas actuales; solo recalcula el periodo de esta gráfica."
            draftRange={chartDraftRange}
            activeRange={chartRange}
            onDraftChange={setChartDraftRange}
            onApply={() => {
              clearWaterCache();
              setChartRange((previous) => ({ ...chartDraftRange, refreshKey: (previous.refreshKey || 0) + 1 }));
            }}
            onReset={() => {
              clearWaterCache();
              const next = defaultTodayRange();
              setChartDraftRange(next);
              setChartRange((previous) => ({ ...next, refreshKey: (previous.refreshKey || 0) + 1 }));
            }}
            status={chartStatus}
          />
          <ChartPeriodNote range={chartRange} source="Volumen del periodo desde deltas BOS cuando el totalizador está disponible" />
          {productionRows.length ? (
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={productionRows} margin={{ top: 10, right: 18, bottom: 8, left: 4 }}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke={axisColor} />
                <YAxis yAxisId="left" stroke={axisColor} />
                <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
                <Legend />
                <Bar yAxisId="left" dataKey="agua" name="Volumen periodo (m³)" fill="#0ea5e9" radius={[10, 10, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="flujo" name="Flujo actual (L/s)" stroke="#f59e0b" strokeWidth={2.8} dot={{ r: 3, stroke: '#f59e0b', fill: '#f59e0b' }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <ChartEmptyState message="Sin datos reales de pozos para el rango seleccionado." />}
        </div>

        <div className="panel summary-panel fade-up resumen-alert-panel">
          <PanelHeader title="Alertas y prioridades" subtitle="Reglas simples derivadas de datos reales disponibles" />
          <div className="priority-list">
            {alertRows.map((item) => (
              <article className="priority-item" key={`${item.title}-${item.type}`}>
                <div className="priority-icon"><AlertTriangle size={16} /></div>
                <div className="priority-copy">
                  <div className="priority-head">
                    <strong>{item.title}</strong>
                    <span>{item.priority}</span>
                  </div>
                  <div className="priority-type">{item.type}</div>
                  <p>{item.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel table-wrapper fade-up resumen-wells-panel">
        <PanelHeader
          title="Pozos reales de Durango"
          subtitle="Flujo, totalizador, amperaje disponible y diagnóstico básico desde BOS"
        />
        <div className="resumen-table-scroll">
          <table className="resumen-wells-table">
            <thead>
              <tr>
                <th>Pozo</th>
                <th>Estado</th>
                <th>Flujo actual</th>
                <th>Amperaje</th>
                <th>Totalizador</th>
                <th>Diagnóstico básico</th>
                <th>Última actualización</th>
              </tr>
            </thead>
            <tbody>
              {dashboardWells.length ? dashboardWells.map((well) => (
                <tr key={String(well.id || well.name)}>
                  <td>
                    <div className="well-name-cell">
                      <span className="well-dot" />
                      {well.name}
                    </div>
                  </td>
                  <td><StatusBadge type={well.statusType}>{well.status}</StatusBadge></td>
                  <td>{formatNumber(well.flow)} L/s</td>
                  <td>{well.amps === null || well.amps === undefined ? '—' : `${formatNumber(well.amps, 2)} A`}</td>
                  <td>{formatNumber(well.totalizador_m3, 0)} m³</td>
                  <td>{well.diagnosis}</td>
                  <td>{well.updated}</td>
                </tr>
              )) : (
                <tr><td colSpan={7}>Sin pozos reales disponibles en la respuesta actual.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="content-grid resumen-bottom-grid">
        <div className="panel summary-panel fade-up resumen-tanks-panel">
          <PanelHeader title="Lavadoras y Jarabes" subtitle="Puntos auxiliares reales; Jarabes queda pendiente de clasificación" />
          <div className="tank-summary-grid">
            {flowSummary.length ? flowSummary.map((item) => (
              <article className="tank-summary-card" key={`${item.sensorId}-${item.name}`}>
                <div className="tank-summary-head">
                  <strong>{item.name}</strong>
                  <StatusBadge type={item.statusType}>{item.status}</StatusBadge>
                </div>
                <div className="tank-summary-foot">
                  <span>{formatNumber(item.flow)} L/s</span>
                  <span>{formatNumber(item.total, 0)} m³</span>
                </div>
                <p>{item.sensorId ? `Sensor ${item.sensorId}` : 'Sensor no disponible'}{item.note ? ` · ${item.note}` : ''}</p>
              </article>
            )) : <ChartEmptyState message="Sin lecturas de lavadoras/Jarabes disponibles." />}
          </div>
        </div>

        <div className="panel summary-panel fade-up resumen-balance-panel">
          <PanelHeader title="Mini balance de agua" subtitle="Comparativo rápido con datos disponibles del payload actual" />
          <div className="balance-mini-grid">
            {entryExitRows.length ? entryExitRows.slice(0, 3).map((item, index) => (
              <article className="balance-mini-card" key={String(item.label || index)}>
                <div className="balance-mini-icon">{index === 0 ? <Waves size={18} /> : index === 1 ? <Gauge size={18} /> : <Droplets size={18} />}</div>
                <div>
                  <span>{String(item.label || 'Balance')}</span>
                  <strong>{formatNumber(item.diferencia, 2)} <small>L/s</small></strong>
                  <p>Entrada {formatNumber(item.entrada, 2)} · salida {formatNumber(item.salida, 2)}</p>
                </div>
              </article>
            )) : <ChartEmptyState message="Sin balance operativo disponible." />}
          </div>
        </div>
      </section>
    </>
  );
}
