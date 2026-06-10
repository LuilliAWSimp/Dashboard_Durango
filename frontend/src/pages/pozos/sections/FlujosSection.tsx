import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchWaterDashboard } from '../../../services/waterService';
import { bucketLabel, dashboardPeriod, defaultTodayRange, formatDateRangeStatus } from '../dateUtils';
import type { ChartDataPoint, DashboardData, FlexibleRecord } from '../types';
import ChartEmptyState from '../components/ChartEmptyState';
import ChartPeriodNote from '../components/ChartPeriodNote';
import ChartTooltip from '../components/ChartTooltip';
import MetricPair from '../components/MetricPair';
import PanelHeader from '../components/PanelHeader';
import SqlChartDateControls from '../components/SqlChartDateControls';
import StatusBadge from '../components/StatusBadge';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';

const axisColor = '#b9e7ff';
const gridColor = 'rgba(56,189,248,0.14)';

interface FlujoItem {
  id: string;
  numero: number;
  nombre: string;
  ubicacion: string;
  sensor_id: number;
  status: string;
  statusType: string;
  estado_comunicacion: string;
  communicationType: string;
  flujo_lps: number | null;
  volumen_periodo_m3: number | null;
  totalizador_m3: number | null;
  ultima_lectura: string;
  updated: string;
  descripcion: string;
  hasData: boolean;
}

interface FlujoTimelinePoint extends ChartDataPoint {
  time: string;
  bucket: unknown;
  flow: number;
  volumen: number;
  totalizador: number;
}

interface FlujosSectionProps {
  itemId?: string;
}

const flowSensorConfig = [
  { sensor_id: 3002, nombre: 'Lavadora Ciel' },
  { sensor_id: 3004, nombre: 'Lavadora de Vidrio' },
  { sensor_id: 3006, nombre: 'Jarabes' },
];

function errorMessage(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}

function asText(value: unknown, fallback = ''): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function simplifyComparableText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function isTechnicalFlowText(value: unknown): boolean {
  const text = String(value || '').trim();
  return /dbo\.|sensorsbos|tanque_flow|source/i.test(text);
}

function flowSecondaryText(flujo: FlujoItem): string {
  const location = String(flujo.ubicacion || '').trim();
  if (!location || isTechnicalFlowText(location)) return '';
  return simplifyComparableText(location) === simplifyComparableText(flujo.nombre) ? '' : location;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

function formatNumber(value: unknown, decimals = 1): string {
  const number = numberOrNull(value);
  if (number === null) return '—';
  return number.toLocaleString('es-MX', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

function fallbackFlow(index: number): FlujoItem {
  const config = flowSensorConfig[index] || flowSensorConfig[0];
  return {
    id: `flujo-${String(index + 1).padStart(2, '0')}`,
    numero: index + 1,
    nombre: config.nombre,
    ubicacion: 'Lectura desde sistema de monitoreo',
    sensor_id: config.sensor_id,
    status: 'Sin datos',
    statusType: 'communication',
    estado_comunicacion: 'Sin comunicación',
    communicationType: 'offline',
    flujo_lps: null,
    volumen_periodo_m3: null,
    totalizador_m3: null,
    ultima_lectura: 'Sin datos',
    updated: 'Sin datos',
    descripcion: 'Sin lectura disponible para este flujo.',
    hasData: false,
  };
}

function normalizeFlow(row: FlexibleRecord | undefined, index: number): FlujoItem {
  const fallback = fallbackFlow(index);
  if (!row) return fallback;

  const flow = numberOrNull(row.flujo_lps ?? row.flow_lps ?? row.flow);
  const total = numberOrNull(row.totalizador_m3 ?? row.total_m3);
  const hasData = flow !== null || total !== null;
  const volumen = hasData ? numberOrNull(row.volumen_periodo_m3 ?? row.period_m3 ?? row.period_delta_m3) ?? 0 : null;

  return {
    ...fallback,
    id: asText(row.id, fallback.id),
    numero: numberOrNull(row.numero) ?? fallback.numero,
    nombre: asText(row.nombre ?? row.name, fallback.nombre),
    ubicacion: asText(row.ubicacion ?? row.location, fallback.ubicacion),
    sensor_id: numberOrNull(row.sensor_id) ?? fallback.sensor_id,
    status: asText(row.status, hasData ? (Number(flow || 0) > 0 ? 'Operando' : 'Sin flujo') : 'Sin datos'),
    statusType: asText(row.statusType, hasData ? (Number(flow || 0) > 0 ? 'normal' : 'idle') : 'communication'),
    estado_comunicacion: asText(row.estado_comunicacion, hasData ? 'En línea' : 'Sin comunicación'),
    communicationType: asText(row.communicationType, hasData ? 'online' : 'offline'),
    flujo_lps: flow,
    volumen_periodo_m3: volumen,
    totalizador_m3: total,
    ultima_lectura: asText(row.ultima_lectura, fallback.ultima_lectura),
    updated: asText(row.updated, fallback.updated),
    descripcion: asText(row.diagnosis ?? row.descripcion, fallback.descripcion),
    hasData,
  };
}

function getFlowItems(dashboard: DashboardData | null): FlujoItem[] {
  const rows = Array.isArray(dashboard?.flows) ? dashboard.flows : [];

  // Flujos debe reflejar la configuración real de BOS.
  // No se completa con sensores heredados 3008-3018 si SQL no los reporta.
  return rows.map((row, index) => normalizeFlow(row, index));
}

function buildFlowTimeline(dashboard: DashboardData | null, flujo: FlujoItem): FlujoTimelinePoint[] {
  const rows = Array.isArray(dashboard?.flow_history) ? dashboard.flow_history : [];
  const period = dashboardPeriod(dashboard);

  return rows
    .filter((row) => {
      const rowSensorId = numberOrNull(row.sensor_id);
      return row.id === flujo.id || rowSensorId === flujo.sensor_id;
    })
    .map((row) => {
      const flow = numberOrNull(row.flujo_lps ?? row.flow_lps ?? row.flow);
      if (flow === null) return null;
      const bucket = row.bucket || row.timestamp || row.time_stamp;
      return {
        time: bucketLabel(bucket, asText(row.aggregation, period)),
        bucket,
        flow,
        volumen: numberOrNull(row.volumen_periodo_m3 ?? row.period_m3) ?? 0,
        totalizador: numberOrNull(row.totalizador_m3 ?? row.total_m3) ?? 0,
      };
    })
    .filter((row): row is FlujoTimelinePoint => row !== null);
}

function FlujoDetailSection({ flujo, dashboard, sqlError }: { flujo: FlujoItem; dashboard: DashboardData | null; sqlError: string }) {
  const navigate = useNavigate();
  const chartController = useSqlChartDashboard('flujos', defaultTodayRange, { includeHistory: true });
  const activeDashboard = (chartController.dashboard as DashboardData | null) || dashboard;
  const timeline = buildFlowTimeline(activeDashboard, flujo);
  const historicalRows = timeline.slice(-8).reverse();
  const rangeStatus = chartController.error || (chartController.loading ? 'Cargando SQL Server...' : formatDateRangeStatus(chartController.range, 'Hoy'));

  return (
    <>
      <section className={`well-detail-hero panel fade-up ${flujo.statusType}`}>
        <div className="well-detail-main-head">
          <button type="button" className="back-inline-button" onClick={() => navigate('/pozos/flujos')}>
            <ArrowLeft size={16} /> Volver a Flujos
          </button>
          <div className="eyebrow">Detalle operativo</div>
          <div className="well-detail-title-row">
            <h2>{flujo.nombre}</h2>
            <StatusBadge type={flujo.statusType}>{flujo.status}</StatusBadge>
          </div>
          <p>{flujo.descripcion || sqlError || 'Lectura del flujo seleccionado desde BOS. Jarabes queda pendiente de clasificar si corresponde.'}</p>
        </div>
        <div className="well-detail-hero-metrics">
          <article>
            <span>Última actualización</span>
            <strong>{flujo.updated}</strong>
          </article>
          <article>
            <span>Flujo actual</span>
            <strong>{formatNumber(flujo.flujo_lps)} <small>L/s</small></strong>
          </article>
          <article>
            <span>Volumen periodo</span>
            <strong>{formatNumber(flujo.volumen_periodo_m3, 2)} <small>m³</small></strong>
          </article>
          <article>
            <span>Sensor</span>
            <strong>{flujo.sensor_id}</strong>
          </article>
        </div>
      </section>

      <section className="content-grid well-detail-grid-main">
        <div className="panel chart-panel fade-up well-detail-flow-chart">
          <PanelHeader
            title="Histórico de flujo"
            subtitle="Histórico bajo demanda del flujo seleccionado en el rango de fechas."
          />
          <SqlChartDateControls controller={chartController} title="Fechas del histórico" />
          <div className="date-range-status table-range-status">{rangeStatus}</div>
          <ChartPeriodNote range={chartController.range} source="Un día: promedio por hora · varios días: promedio por día" />
          {timeline.length ? (
            <ResponsiveContainer width="100%" height={430}>
              <ComposedChart data={timeline} margin={{ top: 10, right: 18, bottom: 8, left: 4 }}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke={axisColor} />
                <YAxis yAxisId="flow" stroke={axisColor} />
                <YAxis yAxisId="total" orientation="right" stroke="#a855f7" />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
                <Legend />
                <Line yAxisId="flow" type="monotone" dataKey="flow" name="Flujo (L/s)" stroke="#14b8ff" strokeWidth={2.6} dot={{ r: 3 }} connectNulls={false} />
                <Line yAxisId="total" type="monotone" dataKey="volumen" name="Volumen periodo (m³)" stroke="#a855f7" strokeWidth={2.4} dot={{ r: 3 }} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <ChartEmptyState message="Sin histórico disponible para este flujo en el rango seleccionado." />}
        </div>

        <div className="panel summary-panel fade-up well-diagnostic-panel">
          <PanelHeader title="Estado operativo" subtitle="Vista independiente de Líneas" />
          <div className="diagnostic-stack">
            <article>
              <div>
                <span>Comunicación</span>
                <strong>{flujo.estado_comunicacion}</strong>
              </div>
            </article>
            <article>
              <div>
                <span>Última lectura</span>
                <strong>{flujo.ultima_lectura}</strong>
              </div>
            </article>
            <article>
              <div>
                <span>Ubicación / referencia</span>
                <strong>{flujo.ubicacion}</strong>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="panel table-wrapper fade-up well-history-panel">
        <PanelHeader title="Histórico corto" subtitle="Flujo, volumen y totalizador del flujo seleccionado" />
        <div className="pozos-table-scroll">
          <table className="pozos-operacion-table well-history-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Flujo</th>
                <th>Volumen periodo</th>
                <th>Totalizador</th>
              </tr>
            </thead>
            <tbody>
              {historicalRows.length ? historicalRows.map((row) => (
                <tr key={`${row.time}-${row.totalizador}`}>
                  <td>{row.time}</td>
                  <td>{formatNumber(row.flow)} L/s</td>
                  <td>{formatNumber(row.volumen, 2)} m³</td>
                  <td>{formatNumber(row.totalizador, 0)} m³</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4}>Sin histórico disponible para este rango.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default function FlujosSection({ itemId }: FlujosSectionProps) {
  const navigate = useNavigate();
  const [sqlDashboard, setSqlDashboard] = useState<DashboardData | null>(null);
  const [sqlError, setSqlError] = useState('');
  const [sqlLoading, setSqlLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setSqlLoading(true);
    setSqlError('');
    fetchWaterDashboard('flujos')
      .then((data) => { if (mounted) setSqlDashboard(data as DashboardData); })
      .catch((error) => {
        if (mounted) {
          setSqlError(errorMessage(error) || 'No se pudo leer SQL Server');
          setSqlDashboard(null);
        }
      })
      .finally(() => { if (mounted) setSqlLoading(false); });
    return () => { mounted = false; };
  }, []);

  const flujos = useMemo(() => (sqlDashboard ? getFlowItems(sqlDashboard) : []), [sqlDashboard]);
  const selectedFlujo = useMemo(() => {
    return flujos.find((flujo) => flujo.id === itemId || String(flujo.sensor_id) === itemId) || flujos[0];
  }, [flujos, itemId]);

  if (itemId) {
    if (!selectedFlujo) {
      return (
        <section className="panel fade-up">
          <PanelHeader title="Detalle de flujo" subtitle="Lectura del flujo seleccionado." />
          <ChartEmptyState message={sqlLoading ? 'Cargando flujo...' : (sqlError || 'Sin datos disponibles para este flujo.')} />
        </section>
      );
    }
    return <FlujoDetailSection flujo={selectedFlujo} dashboard={sqlDashboard} sqlError={sqlError} />;
  }

  const summary = {
    operando: flujos.filter((flujo) => ['normal', 'warning', 'critical'].includes(flujo.statusType)).length,
    sinFlujo: flujos.filter((flujo) => flujo.statusType === 'idle').length,
    sinComunicacion: flujos.filter((flujo) => flujo.statusType === 'communication').length,
    total: flujos.length,
  };
  return (
    <>
      <section className="pozos-operacion-hero panel fade-up">
        <div>
          <h2>Flujos</h2>
          <p>Monitorea los flujos disponibles en esta planta.</p>
        </div>
        <div className="pozos-operacion-summary">
          <article><span>Operando</span><strong>{summary.operando}/{summary.total}</strong></article>
          <article><span>Sin flujo</span><strong>{summary.sinFlujo}</strong></article>
          <article><span>Sin comunicación</span><strong>{summary.sinComunicacion}</strong></article>
          <article><span>Total</span><strong>{summary.total}</strong></article>
        </div>
      </section>

      {sqlLoading ? (
        <section className="panel fade-up">
          <ChartEmptyState message="Cargando flujos..." />
        </section>
      ) : null}

      {!sqlLoading && !flujos.length ? (
        <section className="panel fade-up">
          <ChartEmptyState message={sqlError || 'Sin datos disponibles para Flujos.'} />
        </section>
      ) : null}

      {!sqlLoading && flujos.length ? (
      <section className="pozos-cards-grid scada-well-grid fade-up">
        {flujos.map((flujo) => (
          <article
            key={flujo.id}
            className={`pozo-mini-card scada-well-card ${flujo.statusType}`}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/pozos/flujos/${flujo.id}`)}
            onKeyDown={(event: KeyboardEvent<HTMLElement>) => { if (event.key === 'Enter' || event.key === ' ') navigate(`/pozos/flujos/${flujo.id}`); }}
            title="Abrir detalle de flujo"
          >
            <div className="pozo-mini-head scada-well-head">
              <div>
                <strong>{flujo.nombre}</strong>
                {flowSecondaryText(flujo) ? <small>{flowSecondaryText(flujo)}</small> : null}
              </div>
              <StatusBadge type={flujo.statusType}>{flujo.status}</StatusBadge>
            </div>

            <div className="scada-meter-grid">
              <MetricPair label="Flujo" value={formatNumber(flujo.flujo_lps)} unit="L/s" emphasis />
              <MetricPair label="Volumen periodo" value={formatNumber(flujo.volumen_periodo_m3, 2)} unit="m³" />
              <MetricPair label="Totalizador" value={formatNumber(flujo.totalizador_m3, 0)} unit="m³" />
              <MetricPair label="Sensor" value={flujo.sensor_id} />
            </div>

            <div className="scada-card-footer">
              <span className={`communication-chip ${flujo.communicationType}`}>{flujo.estado_comunicacion}</span>
              <span>{flujo.ultima_lectura}</span>
            </div>
          </article>
        ))}
      </section>
      ) : null}

      {!sqlLoading && flujos.length ? (
      <section className="panel table-wrapper fade-up pozos-operacion-table-panel">
        <PanelHeader title="Vista comparativa" subtitle="Lecturas actuales disponibles por flujo." />
        <div className="pozos-table-scroll">
          <table className="pozos-operacion-table scada-pozos-table">
            <thead>
              <tr>
                <th>Flujo</th><th>Ubicación</th><th>Sensor</th><th>Estado</th><th>Comunicación</th><th>Flujo L/s</th><th>Volumen periodo m³</th><th>Totalizador m³</th><th>Última lectura</th>
              </tr>
            </thead>
            <tbody>
              {flujos.map((flujo) => (
                <tr key={flujo.id} className={`pozo-row ${flujo.statusType}`} onClick={() => navigate(`/pozos/flujos/${flujo.id}`)} title="Abrir detalle de flujo">
                  <td><div className="well-name-cell"><span className={`well-dot ${flujo.statusType}`} /><span>{flujo.nombre}</span></div></td>
                  <td>{flowSecondaryText(flujo) || '—'}</td>
                  <td>{flujo.sensor_id}</td>
                  <td><StatusBadge type={flujo.statusType}>{flujo.status}</StatusBadge></td>
                  <td><span className={`communication-chip ${flujo.communicationType}`}>{flujo.estado_comunicacion}</span></td>
                  <td>{formatNumber(flujo.flujo_lps)} L/s</td>
                  <td>{formatNumber(flujo.volumen_periodo_m3, 2)} m³</td>
                  <td>{formatNumber(flujo.totalizador_m3, 0)} m³</td>
                  <td>{flujo.ultima_lectura}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}
    </>
  );
}
