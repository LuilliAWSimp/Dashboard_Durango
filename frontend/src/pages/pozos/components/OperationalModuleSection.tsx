import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import KpiCard from '../../../components/KpiCard';
import { DURANGO_CAPABILITIES } from '../../../config/plantCapabilities';
import { defaultTodayRange, formatSqlDate } from '../dateUtils';
import type { DashboardData, FlexibleRecord } from '../types';
import ChartEmptyState from './ChartEmptyState';
import ElementHistoryPanel from './ElementHistoryPanel';
import MetricPair from './MetricPair';
import PanelHeader from './PanelHeader';
import ShiftConsumptionPanel from './ShiftConsumptionPanel';
import SqlChartDateControls from './SqlChartDateControls';
import StatusBadge from './StatusBadge';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';

export type OperationalModule = 'well' | 'line' | 'flow';

interface Props {
  module: OperationalModule;
  title: string;
  subtitle: string;
  route: string;
  confirmedSensorIds?: number[];
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

function numericIdentity(value: unknown): number | null {
  const direct = number(value);
  if (direct !== null) return Math.trunc(direct);
  const digits = String(value || '').match(/\d+/g)?.join('');
  return digits ? Number(digits) : null;
}

function configuredItems(module: OperationalModule) {
  if (module === 'well') return DURANGO_CAPABILITIES.wells;
  if (module === 'line') return DURANGO_CAPABILITIES.lines;
  return DURANGO_CAPABILITIES.flows;
}

function resolveSensorId(row: FlexibleRecord, index: number, module: OperationalModule): number {
  for (const key of ['sensor_id', 'water_sensor_id', 'flow_out_sensor_id']) {
    const candidate = numericIdentity(row[key]);
    if (candidate) return candidate;
  }

  const items = configuredItems(module);
  const wellPosition = numericIdentity(row.well_id ?? row.numero ?? row.id);
  if (module === 'well' && wellPosition) {
    const match = items[wellPosition - 1];
    if (match) return match.sensorId;
  }

  return items[index]?.sensorId || numericIdentity(row.id) || index + 1;
}

function itemName(row: FlexibleRecord, index: number): string {
  return String(row.name || row.nombre || `Elemento ${index + 1}`);
}

function statusType(value: unknown): string {
  const text = String(value || '').toLowerCase();
  if (text.includes('revisión') || text.includes('atrasada') || text.includes('parcial')) return 'warning';
  if (text.includes('sin histórico') || text.includes('sin registro') || text.includes('sin lectura')) return 'communication';
  if (text.includes('actividad')) return text.includes('sin actividad') ? 'idle' : 'normal';
  return 'idle';
}

function rawModuleRows(dashboard: DashboardData | null, module: OperationalModule): FlexibleRecord[] {
  if (module === 'well') return array(dashboard?.wells);
  if (module === 'line') return array(dashboard?.production_lines);
  return array(dashboard?.flows);
}

function periodMessage(row: FlexibleRecord): string {
  const status = String(row.period_data_status || row.data_status || '');
  if (status === 'no_history' || status === 'no_data') {
    return row.current_reading_available
      ? 'Sin histórico para el periodo · Lectura actual disponible'
      : 'Sin registros guardados';
  }
  return String(row.period_activity || row.activity || 'Sin histórico para el periodo');
}

function mergeDuplicateRows(previous: FlexibleRecord | undefined, next: FlexibleRecord): FlexibleRecord {
  if (!previous) return { ...next };
  const merged: FlexibleRecord = { ...previous, ...next };
  const currentKeys = [
    'current_flow', 'flow_lps', 'flow', 'current_totalizer_m3', 'totalizador_m3',
    'communication', 'estado_comunicacion', 'communication_status', 'last_update',
    'ultima_lectura', 'current_reading_available',
  ];
  const periodKeys = [
    'period_open_m3', 'period_close_m3', 'period_m3', 'period_delta_m3',
    'period_m3_reliable', 'validated_volume_m3', 'discarded_volume_m3',
    'discarded_totalizer_events', 'discarded_totalizer_event_details',
    'has_discontinuities', 'period_activity', 'period_data_status', 'activity',
    'data_status', 'samples',
  ];

  for (const key of currentKeys) {
    if (next[key] === null || next[key] === undefined || next[key] === '') merged[key] = previous[key];
  }
  for (const key of periodKeys) {
    if (next[key] === null || next[key] === undefined || next[key] === '') merged[key] = previous[key];
  }
  return merged;
}

function uniqueModuleRows(
  dashboard: DashboardData | null,
  module: OperationalModule,
  confirmedSensorIds?: number[],
): FlexibleRecord[] {
  const rawRows = rawModuleRows(dashboard, module);
  const confirmed = confirmedSensorIds?.length
    ? confirmedSensorIds
    : configuredItems(module).map((item) => item.sensorId);
  const bySensor = new Map<number, FlexibleRecord>();

  rawRows.forEach((row, index) => {
    const sensorId = resolveSensorId(row, index, module);
    if (!confirmed.includes(sensorId)) return;
    bySensor.set(sensorId, mergeDuplicateRows(bySensor.get(sensorId), { ...row, sensor_id: sensorId }));
  });

  return confirmed.flatMap((sensorId) => {
    const row = bySensor.get(sensorId);
    return row ? [row] : [];
  });
}

export default function OperationalModuleSection({
  module,
  title,
  subtitle,
  route,
  confirmedSensorIds,
}: Props) {
  const navigate = useNavigate();
  const controller = useSqlChartDashboard('dashboard', defaultTodayRange, {
    forceRefresh: true,
    includeHistory: false,
    includeEnergyWater: false,
  });
  const dashboard = controller.dashboard as DashboardData | null;
  const rows = useMemo(
    () => uniqueModuleRows(dashboard, module, confirmedSensorIds),
    [dashboard, module, confirmedSensorIds],
  );
  const [selectedSensor, setSelectedSensor] = useState<number | null>(null);

  useEffect(() => {
    if (rows.length && !rows.some((row, index) => resolveSensorId(row, index, module) === selectedSensor)) {
      setSelectedSensor(resolveSensorId(rows[0], 0, module));
    }
  }, [module, rows, selectedSensor]);

  const reliable = rows.filter((row) => Boolean(row.period_m3_reliable) && number(row.period_m3) !== null);
  const total = reliable.length
    ? reliable.reduce((sum, row) => sum + Number(row.period_m3 || 0), 0)
    : null;
  const active = reliable.filter((row) => Number(row.period_m3 || 0) > 0).length;
  const inactive = reliable.filter((row) => Number(row.period_m3 || 0) === 0).length;
  const review = rows.filter((row) => ['invalid_totalizer', 'no_totalizer'].includes(String(row.period_data_status || row.data_status || ''))).length;
  const noHistory = rows.filter((row) => ['no_history', 'no_data'].includes(String(row.period_data_status || row.data_status || ''))).length;
  const selected = rows.find((row, index) => resolveSensorId(row, index, module) === selectedSensor);

  return (
    <>
      <section className="panel fade-up compact-hero">
        <PanelHeader title={title} subtitle={subtitle} />
        <SqlChartDateControls controller={controller} title="Periodo operativo" />
      </section>

      <section className="cards-grid stagger-grid">
        <KpiCard
          label="Volumen confiable del periodo"
          value={total === null ? 'No disponible' : fmt(total)}
          unit={total === null ? '' : 'm³'}
          trend={total === null ? 'Sin histórico del periodo' : 'Suma de diferencias confiables'}
          accent="cyan"
        />
        <KpiCard label="Con actividad" value={String(active)} unit="elementos" trend="Movimiento válido del totalizador" accent="teal" />
        <KpiCard label="Sin actividad" value={String(inactive)} unit="elementos" trend="Muestras válidas sin movimiento" accent="blue" />
        <KpiCard label="Revisión o sin histórico" value={String(review + noHistory)} unit="elementos" trend="No incluidos como cero confiable" accent="brown" />
      </section>

      <section className="panel fade-up">
        <PanelHeader title={`Detalle de ${title.toLowerCase()}`} subtitle="Lectura actual y métricas del periodo seleccionado" />
        {controller.error ? <div className="status-pill alert">{controller.error}</div> : null}

        {/* Single canonical card block. Legacy well cards are intentionally not rendered. */}
        <div className={`operational-card-grid ${module === 'well' ? 'operational-well-grid' : ''}`}>
          {rows.map((row, index) => {
            const sensorId = resolveSensorId(row, index, module);
            const activity = periodMessage(row);
            const communication = String(row.communication || row.estado_comunicacion || 'Sin lectura');
            const volume = number(row.period_m3);
            const flow = number(row.current_flow ?? row.flow_lps ?? row.flow);
            const totalizer = number(row.current_totalizer_m3 ?? row.totalizador_m3);
            const isSelected = sensorId === selectedSensor;
            return (
              <article key={`${module}-${sensorId}`} className={`operational-element-card ${isSelected ? 'selected' : ''}`}>
                <button
                  type="button"
                  className="operational-card-main"
                  onClick={() => setSelectedSensor(sensorId)}
                  aria-pressed={isSelected}
                >
                  <div className="operational-card-head">
                    <div>
                      <span>{title}</span>
                      <strong>{itemName(row, index)}</strong>
                    </div>
                    <StatusBadge type={statusType(activity)}>{activity}</StatusBadge>
                  </div>
                  <div className="metric-pairs-grid operational-metric-grid">
                    <MetricPair label="Flujo actual" value={flow === null ? 'Sin dato' : fmt(flow)} unit={flow === null ? '' : String(row.flow_unit || 'L/s')} />
                    <MetricPair label="Totalizador actual" value={totalizer === null ? 'Sin totalizador' : fmt(totalizer)} unit={totalizer === null ? '' : 'm³'} />
                    <MetricPair
                      label={row.has_discontinuities ? 'Volumen validado parcial' : 'Volumen del periodo'}
                      value={volume === null ? 'No disponible' : fmt(volume)}
                      unit={volume === null ? '' : 'm³'}
                    />
                    <MetricPair label="Muestras del periodo" value={row.samples == null || Number(row.samples) === 0 ? '—' : String(row.samples)} />
                  </div>
                </button>
                <div className="operational-card-footer">
                  <span className={communication.toLowerCase().includes('actual') ? 'online' : 'warning'}><i />{communication}</span>
                  <strong>{formatSqlDate(row.last_update || row.ultima_lectura)}</strong>
                  <button type="button" className="open-detail-link" onClick={() => navigate(`${route}/sensor-${sensorId}`)}>Abrir detalle</button>
                </div>
              </article>
            );
          })}
        </div>
        {!rows.length && !controller.loading ? <ChartEmptyState message="Sin registros para el periodo seleccionado." /> : null}
      </section>

      {selectedSensor ? (
        <ElementHistoryPanel
          module={module}
          sensorId={selectedSensor}
          name={String(selected?.name || selected?.nombre || `Elemento ${selectedSensor}`)}
          flowUnit={String(selected?.flow_unit || 'L/s')}
        />
      ) : null}

      <ShiftConsumptionPanel group={module} title={`Cortes por turno · ${title}`} />

      <section className="panel fade-up">
        <PanelHeader title="Tabla operativa" subtitle="La tabla y las tarjetas usan la misma respuesta del periodo" />
        <div className="pozos-table-scroll">
          <table className="pozos-operacion-table">
            <thead>
              <tr><th>Elemento</th><th>Flujo actual</th><th>Apertura</th><th>Cierre</th><th>Volumen periodo</th><th>Actividad</th><th>Comunicación</th><th>Última actualización</th></tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const sensorId = resolveSensorId(row, index, module);
                return (
                  <tr key={`table-${module}-${sensorId}`}>
                    <td>{itemName(row, index)}</td>
                    <td>{number(row.current_flow ?? row.flow_lps) === null ? '—' : `${fmt(row.current_flow ?? row.flow_lps)} ${String(row.flow_unit || 'L/s')}`}</td>
                    <td>{number(row.period_open_m3) === null ? '—' : `${fmt(row.period_open_m3)} m³`}</td>
                    <td>{number(row.period_close_m3) === null ? '—' : `${fmt(row.period_close_m3)} m³`}</td>
                    <td>{number(row.period_m3) === null ? 'No disponible' : row.has_discontinuities ? `Volumen validado parcial: ${fmt(row.period_m3)} m³` : `${fmt(row.period_m3)} m³`}</td>
                    <td>{periodMessage(row)}</td>
                    <td>{String(row.communication || row.estado_comunicacion || 'Sin lectura')}</td>
                    <td>{formatSqlDate(row.last_update || row.ultima_lectura)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
