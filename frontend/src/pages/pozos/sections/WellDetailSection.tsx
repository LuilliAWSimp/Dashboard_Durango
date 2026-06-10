import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
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
import { getDailyWaterReport } from '../../../services/waterReportService';
import { defaultTodayRange } from '../dateUtils';
import { normalizeSqlWell } from '../normalizers';
import { buildWellTimeline } from '../chartBuilders';
import type { DashboardData, FlexibleRecord } from '../types';
import ChartTooltip from '../components/ChartTooltip';
import ChartPeriodNote from '../components/ChartPeriodNote';
import PanelHeader from '../components/PanelHeader';
import SqlChartDateControls from '../components/SqlChartDateControls';
import StatusBadge from '../components/StatusBadge';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';

const axisColor = '#b9e7ff';
const gridColor = 'rgba(56,189,248,0.14)';

interface WellDetailSectionProps {
  wellId?: string;
  backPath?: string;
  backLabel?: string;
}

interface WellDetailItem extends FlexibleRecord {
  id: string;
  numero: number;
  name: string;
  nombre: string;
  ubicacion: string;
  status: string;
  statusType: string;
  estado_comunicacion: string;
  communicationType: string;
  flow: number;
  flujo_entrada: number;
  flujo_salida: number;
  totalizador_m3: number;
  kwh: number;
  dailyKwh: number | null;
  amps: number | null;
  efficiency: number | null;
  loadFactor: number | null;
  updated: string;
  ultima_lectura: string;
  diagnosis: string;
  period_m3?: number;
  period_kwh?: number;
  entry_m3?: number;
  kwh_por_m3?: number | null;
}

interface WellDetailProfile {
  diagnostic: {
    symptom: string;
    cause: string;
    priority: string;
  };
  averageEfficiency: number | null;
  loadFactorTarget: string;
  nominalAmps: number | null;
  pumpType: string;
  line: string;
  tank: string;
}

interface WellTimelinePoint extends FlexibleRecord {
  time: string;
  flow: number;
  energia?: number;
  amps?: number | null;
  efficiency?: number | null;
  loadFactor?: number | null;
  flowAvg?: number;
}

type NumericValue = number | string | null | undefined;

interface DailyWaterReportEntryRow extends FlexibleRecord {
  equipo?: string;
  ubicacion?: string;
  numero?: NumericValue;
  pozo?: NumericValue;
  well_id?: NumericValue;
  id?: NumericValue;
  suministro_m3?: NumericValue;
  kwh?: NumericValue;
}

interface DailyWaterReport {
  water_entry?: {
    rows?: DailyWaterReportEntryRow[];
  };
}

interface WellDetailResult {
  well: WellDetailItem;
  profile: WellDetailProfile;
  timeline: WellTimelinePoint[];
}

function formatNumber(value: NumericValue, decimals = 1): string {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(String(value).replace(',', '').trim());
  if (Number.isNaN(number)) return '—';
  return number.toLocaleString('es-MX', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function toNullableNumber(value: NumericValue): number | null {
  if (value === null || value === undefined || value === '') return null;
  const sanitized = String(value)
    .replace(/,/g, '')
    .replace(/[^0-9.-]/g, '')
    .trim();
  if (!sanitized) return null;
  const number = Number(sanitized);
  return Number.isNaN(number) ? null : number;
}

function extractNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const direct = Number(String(value).replace(/[^0-9.-]/g, ''));
  if (!Number.isNaN(direct) && direct > 0) return direct;
  const match = String(value).match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function normalizeMatchText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function findReportEntryForWell(report: DailyWaterReport | null, well: WellDetailItem): DailyWaterReportEntryRow | null {
  const rows = report?.water_entry?.rows || [];
  if (!rows.length) return null;

  const wellNumber = Number(well.numero || 0);
  const expectedEquipment = wellNumber ? normalizeMatchText(`Pozo #${wellNumber}`) : '';
  const wellLabels = [well.name, well.nombre, well.ubicacion]
    .map(normalizeMatchText)
    .filter(Boolean);

  return rows.find((row) => {
    const equipment = normalizeMatchText(row.equipo);
    const location = normalizeMatchText(row.ubicacion);
    const rowNumber = extractNumber(row.numero ?? row.pozo ?? row.well_id ?? row.id ?? row.equipo);

    if (wellNumber && rowNumber === wellNumber) return true;
    if (expectedEquipment && equipment === expectedEquipment) return true;

    return wellLabels.some((label) => (
      Boolean(label)
      && Boolean(location)
      && (location === label || location.includes(label) || label.includes(location))
    ));
  }) || null;
}

function getReportDailySupplyM3(reportEntry: DailyWaterReportEntryRow | null): number | null {
  // Debe coincidir con Reporte Diario > Entrada de Agua > Suministro m³.
  // No usar kWh, energía, totalizador acumulado ni última lectura como sustituto.
  return reportEntry ? toNullableNumber(reportEntry.suministro_m3) : null;
}

function reportParamsFromRange(range: FlexibleRecord): { date?: string; startDate?: string; endDate?: string } {
  const startDate = typeof range.startDate === 'string' ? range.startDate : undefined;
  const endDate = typeof range.endDate === 'string' ? range.endDate : undefined;
  if (startDate && endDate && startDate === endDate) return { date: startDate };
  return { startDate, endDate };
}

function getWellDetail(wellId: string | undefined, sqlDashboard: DashboardData | null): WellDetailResult {
  const sqlWells = (sqlDashboard?.wells?.map(normalizeSqlWell) || []) as WellDetailItem[];
  const well = sqlWells.find((item) => item.id === wellId) || sqlWells[0] || {
    id: wellId || 'pozo-1',
    numero: 1,
    name: 'Sin datos SQL Server',
    nombre: 'Sin datos SQL Server',
    ubicacion: 'ARCA',
    status: 'Sin datos',
    statusType: 'idle',
    estado_comunicacion: 'Sin datos',
    communicationType: 'communication',
    flow: 0,
    flujo_entrada: 0,
    flujo_salida: 0,
    totalizador_m3: 0,
    kwh: 0,
    dailyKwh: 0,
    amps: null,
    efficiency: null,
    loadFactor: null,
    updated: 'Sin datos',
    ultima_lectura: 'Sin datos',
    diagnosis: 'No hay registros disponibles para el rango seleccionado.',
  };
  const profile = {
    diagnostic: {
      symptom: well.flow > 0 ? 'Flujo instantáneo disponible.' : 'Sin flujo instantáneo en el último registro del rango.',
      cause: 'Lectura desde sistema de monitoreo.',
      priority: well.flow > 0 ? 'Baja' : 'Revisar si aplica',
    },
    averageEfficiency: null,
    loadFactorTarget: 'No disponible',
    nominalAmps: null,
    pumpType: 'No disponible',
    line: 'No disponible',
    tank: 'No disponible',
  };
  const timeline = [{
    time: well.ultima_lectura || well.updated || 'Último registro',
    flow: well.flow || 0,
    amps: well.amps ?? null,
    efficiency: null,
    loadFactor: null,
  }];
  return { well, profile, timeline };
}

export default function WellDetailSection({ wellId, backPath = '/pozos/pozos', backLabel = 'Volver a Pozos' }: WellDetailSectionProps) {
  const navigate = useNavigate();
  const [sqlDashboard, setSqlDashboard] = useState<DashboardData | null>(null);
  const [sqlError, setSqlError] = useState('');
  const [dailyReport, setDailyReport] = useState<DailyWaterReport | null>(null);
  const [dailyReportError, setDailyReportError] = useState('');
  const detailChart = useSqlChartDashboard('dashboard', defaultTodayRange, { includeHistory: true });

  useEffect(() => {
    let mounted = true;
    fetchWaterDashboard('dashboard')
      .then((data) => { if (mounted) setSqlDashboard(data as DashboardData); })
      .catch((error) => { if (mounted) setSqlError((error as { message?: string })?.message || 'No se pudo leer SQL Server'); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    setDailyReportError('');
    getDailyWaterReport(reportParamsFromRange(detailChart.range))
      .then((report) => { if (mounted) setDailyReport(report as DailyWaterReport); })
      .catch((error) => {
        if (mounted) {
          setDailyReport(null);
          setDailyReportError((error as { message?: string })?.message || 'No se pudo leer el reporte diario');
        }
      });
    return () => { mounted = false; };
  }, [detailChart.range.startDate, detailChart.range.endDate, detailChart.range.refreshKey]);

  const dashboardForDetail = (detailChart.dashboard || sqlDashboard) as DashboardData | null;
  const { well, profile } = getWellDetail(wellId, dashboardForDetail);
  const reportEntry = findReportEntryForWell(dailyReport, well);
  const supplyM3 = getReportDailySupplyM3(reportEntry);
  const timeline = buildWellTimeline(dashboardForDetail, wellId ? well : null) as WellTimelinePoint[];
  const efficiencyGap = null;
  const historicalRows = timeline.slice(-5).reverse();

  return (
    <>
      <section className={`well-detail-hero panel fade-up ${well.statusType}`}>
        <div className="well-detail-main-head">
          <button type="button" className="back-inline-button" onClick={() => navigate(backPath)}>
            <ArrowLeft size={16} /> {backLabel}
          </button>
          <div className="eyebrow">Detalle técnico · Monitoreo de pozo</div>
          <div className="well-detail-title-row">
            <h2>{well.name}</h2>
            <StatusBadge type={well.statusType}>{well.status}</StatusBadge>
          </div>
          <p>{well.diagnosis}</p>
        </div>
        <div className="well-detail-hero-metrics">
          <article>
            <span>Última actualización</span>
            <strong>{well.updated}</strong>
          </article>
          <article>
            <span>Flujo actual</span>
            <strong>{formatNumber(well.flow)} <small>L/s</small></strong>
          </article>
          <article>
            <span>Amperaje actual</span>
            <strong>{well.amps === null || well.amps === undefined ? '—' : formatNumber(well.amps, 2)} <small>{well.amps === null || well.amps === undefined ? '' : 'A'}</small></strong>
          </article>
          <article>
            <span>Suministro diario</span>
            <strong>{supplyM3 === null ? '—' : formatNumber(supplyM3, 2)} <small>{supplyM3 === null ? '' : 'm³'}</small></strong>
          </article>
          <article>
            <span>Energía periodo</span>
            <strong>Pendiente <small>sin fuente confiable</small></strong>
          </article>
        </div>
      </section>

      <section className="content-grid well-detail-grid-main">
        <div className="panel chart-panel fade-up well-detail-flow-chart">
          <PanelHeader
            title="Agua por periodo"
            subtitle="Histórico filtrable del pozo seleccionado; energía no confirmada para Durango"
          />
          <SqlChartDateControls controller={detailChart} />
          <ChartPeriodNote range={detailChart.range} source="Un día: puntos por hora · varios días: puntos por día" />
          <ResponsiveContainer width="100%" height={430}>
            <ComposedChart data={timeline} margin={{ top: 10, right: 18, bottom: 8, left: 4 }}>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
              <XAxis dataKey="time" stroke={axisColor} />
              <YAxis yAxisId="flow" stroke={axisColor} />
              <YAxis yAxisId="amps" orientation="right" stroke="#f59e0b" />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
              <Legend />
              <Line yAxisId="flow" type="monotone" dataKey="flow" name="Agua periodo / flujo (m³ o L/s)" stroke="#14b8ff" strokeWidth={2.8} dot={{ r: 3 }} connectNulls={false} />
              <Line yAxisId="amps" type="monotone" dataKey="amps" name="Amperaje (A)" stroke="#f59e0b" strokeWidth={2.6} dot={{ r: 3 }} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="content-grid well-detail-secondary-grid">
        <div className="panel summary-panel fade-up">
          <PanelHeader title="Eficiencia energética" subtitle="Pendiente: Durango no tiene fuente kWh/m³ confirmada" />
          <div className="well-efficiency-card">
            <div>
              <span>Actual</span>
              <strong>Sin fuente <small>kWh/m³</small></strong>
            </div>
            <div>
              <span>Promedio referencia</span>
              <strong>— <small>pendiente</small></strong>
            </div>
            <div className={efficiencyGap && efficiencyGap > 0.12 ? 'efficiency-gap warning' : 'efficiency-gap'}>
              <span>Diferencia</span>
              <strong>{efficiencyGap === null ? '—' : `${efficiencyGap > 0 ? '+' : ''}${efficiencyGap.toFixed(2)}`}</strong>
            </div>
          </div>
          <div className="load-factor-box">
            <p>Se omite kWh/m³ para no mostrar valores inventados. La gráfica principal usa agua/flujo y amperaje cuando BOS lo entrega.</p>
          </div>
        </div>

        <div className="panel summary-panel fade-up">
          <PanelHeader title="Factor de carga" subtitle="Carga actual contra banda operativa" />
          <div className="load-factor-box">
            <div className="load-factor-value">
              <span>Actual</span>
              <strong>{well.loadFactor === null || well.loadFactor === undefined ? '—' : `${well.loadFactor}%`}</strong>
            </div>
            <div className="load-factor-track">
              <span style={{ width: `${well.loadFactor || 0}%` }} />
            </div>
            <p>Banda esperada: {profile.loadFactorTarget || '—'}</p>
          </div>
        </div>

        <div className="panel summary-panel fade-up">
          <PanelHeader title="Metadata técnica" subtitle="Base temporal para futura lectura desde SQL Server" />
          <div className="metadata-list">
            <div><span>Amperaje nominal</span><strong>{profile.nominalAmps || '—'} A</strong></div>
            <div><span>Tipo de bomba</span><strong>{profile.pumpType || '—'}</strong></div>
            <div><span>Línea asociada</span><strong>{profile.line || '—'}</strong></div>
            <div><span>Tanque asociado</span><strong>{profile.tank || '—'}</strong></div>
          </div>
        </div>
      </section>

      <section className="panel table-wrapper fade-up well-history-panel">
        <PanelHeader title="Histórico corto" subtitle="Periodo filtrado seleccionado" />
        <div className="pozos-table-scroll">
          <table className="pozos-operacion-table well-history-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Agua periodo</th>
                <th>Amperaje prom.</th>
                <th>Flujo promedio</th>
              </tr>
            </thead>
            <tbody>
              {historicalRows.map((row) => (
                <tr key={row.time}>
                  <td>{row.time}</td>
                  <td>{formatNumber(row.flow, 2)} m³</td>
                  <td>{row.amps === null || row.amps === undefined ? '—' : `${formatNumber(row.amps, 2)} A`}</td>
                  <td>{row.flowAvg ? `${formatNumber(row.flowAvg, 2)} L/s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
