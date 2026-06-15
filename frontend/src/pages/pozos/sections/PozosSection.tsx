import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWaterDashboard } from '../../../services/waterService';
import { bucketLabel, dashboardPeriod, defaultTodayRange, formatDateRangeStatus } from '../dateUtils';
import { normalizeSqlLine, normalizeSqlWell } from '../normalizers';
import type { DashboardData, FlexibleRecord } from '../types';
import FlowChartOptions, { type FlowChartHistoryRow, type FlowChartRow } from '../components/FlowChartOptions';
import ChartEmptyState from '../components/ChartEmptyState';
import MetricPair from '../components/MetricPair';
import PanelHeader from '../components/PanelHeader';
import SqlChartDateControls from '../components/SqlChartDateControls';
import StatusBadge from '../components/StatusBadge';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';

type PozosSectionMode = 'pozos' | 'lineas';

interface PozosSectionProps {
  mode?: PozosSectionMode;
}


interface WaterListItem extends FlexibleRecord {
  id: string;
  numero: string | number;
  nombre: string;
  ubicacion: string;
  status: string;
  statusType: string;
  estado_comunicacion: string;
  communicationType: string;
  kwh?: number | null;
  totalizador_m3?: number | null;
  flujo_entrada?: number | null;
  flujo_salida?: number | null;
  flow?: number | null;
  amps?: number | null;
  amperaje?: number | null;
  period_m3?: number;
  period_kwh?: number;
  period_delta_m3?: number;
  updated?: string;
  ultima_lectura?: string;
}

function errorMessage(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}

function formatNumber(value: unknown, decimals = 1): string {
  const number = Number(value || 0);
  return number.toLocaleString('es-MX', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

function formatOptionalNumber(value: unknown, decimals = 2): string {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (Number.isNaN(number)) return '—';
  return number.toLocaleString('es-MX', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

function isLineItem(item: WaterListItem): boolean {
  return String(item?.id || '').startsWith('linea-') || Boolean(item?.sensor_name) || Boolean(item?.sensor_id);
}

function simplifyComparableText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(pozo|linea)\s*0+/g, '$1')
    .replace(/[^a-z0-9]/g, '');
}

function isTechnicalText(value: unknown): boolean {
  const text = String(value || '').trim();
  return /dbo\.|sensorsbos|tanque_flow|nivel[0-9a-z_]*|source/i.test(text);
}

function itemDisplayName(item: WaterListItem, label: string): string {
  const fallback = `${label} ${String(item.numero).padStart(2, '0')}`;
  const name = String(item.nombre || '').trim();
  return name && !isTechnicalText(name) ? name : fallback;
}

function itemSecondaryText(item: WaterListItem, primary: string): string {
  const location = String(item.ubicacion || '').trim();
  if (!location || isTechnicalText(location)) return '';
  return simplifyComparableText(location) === simplifyComparableText(primary) ? '' : location;
}

function periodVolumeValue(item: WaterListItem): number {
  const value = Number(item?.period_m3 ?? item?.period_delta_m3 ?? 0);
  if (value > 0) return value;
  return Number(item?.totalizador_m3 ?? 0);
}

function flowValue(item: WaterListItem): number {
  const entrada = Number(item?.flujo_entrada ?? 0);
  const salida = Number(item?.flujo_salida ?? 0);
  const flow = Number(item?.flow ?? 0);
  return flow || Math.max(entrada, salida);
}

function normalizeLines(source: DashboardData): WaterListItem[] {
  return (source.production_lines || []).map((line, index) => normalizeSqlLine(line, index) as WaterListItem);
}

function normalizeWells(source: DashboardData): WaterListItem[] {
  return (source.wells || []).map((well, index) => normalizeSqlWell(well, index) as WaterListItem);
}

export default function PozosSection({ mode = 'pozos' }: PozosSectionProps = {}) {
  const navigate = useNavigate();
  const isLineasMode = mode === 'lineas';
  const sectionRoute = isLineasMode ? '/pozos/lineas' : '/pozos/pozos';
  const viewName = isLineasMode ? 'Líneas' : 'Pozos';
  const sectionTitle = isLineasMode ? 'Líneas' : 'Estado operativo de pozos';
  const sectionDescription = isLineasMode
    ? 'Revisa el flujo, totalizador y volumen registrado por las líneas reales de Durango.'
    : 'Consulta el estado actual, flujo, totalizador y última lectura de los pozos reales de Durango.';
  const itemSingular = isLineasMode ? 'Línea' : 'Pozo';
  const itemPluralLower = isLineasMode ? 'líneas' : 'pozos';
  const itemSingularLower = isLineasMode ? 'línea' : 'pozo';
  const [sqlDashboard, setSqlDashboard] = useState<DashboardData | null>(null);
  const [sqlError, setSqlError] = useState('');
  const [sqlLoading, setSqlLoading] = useState(true);
  const tableController = useSqlChartDashboard('dashboard', defaultTodayRange, { includeHistory: true });

  useEffect(() => {
    let mounted = true;
    setSqlLoading(true);
    setSqlError('');
    fetchWaterDashboard('dashboard', { force_refresh: true, include_history: false, include_energy_water: false })
      .then((data) => { if (mounted) setSqlDashboard(data as DashboardData); })
      .catch((error) => {
        if (mounted) {
          setSqlDashboard(null);
          setSqlError(errorMessage(error) || 'No se pudo leer SQL Server');
        }
      })
      .finally(() => { if (mounted) setSqlLoading(false); });
    return () => { mounted = false; };
  }, []);

  const baseItemsForView = useMemo(() => {
    if (isLineasMode && sqlDashboard?.production_lines?.length) {
      return normalizeLines(sqlDashboard);
    }
    if (!isLineasMode && sqlDashboard?.wells?.length) {
      return normalizeWells(sqlDashboard);
    }
    return [];
  }, [isLineasMode, sqlDashboard]);

  const wellsForView = useMemo(() => baseItemsForView, [baseItemsForView]);

  const activeDashboard = useMemo(() => (tableController.dashboard || sqlDashboard) as DashboardData | null, [tableController.dashboard, sqlDashboard]);
  const activePeriod = useMemo(() => dashboardPeriod(activeDashboard, tableController.range), [activeDashboard, tableController.range]);

  const tableItemsForView = useMemo(() => {
    const source = activeDashboard;
    if (isLineasMode && source?.production_lines?.length) {
      return normalizeLines(source);
    }
    if (!isLineasMode && source?.wells?.length) {
      return normalizeWells(source);
    }
    return [];
  }, [activeDashboard, isLineasMode]);

  const filteredWells = tableItemsForView;
  const pozosFlowRows = useMemo<FlowChartRow[]>(() => {
    if (isLineasMode) return [];
    return filteredWells
      .map((well) => {
        const pozoLabel = `${itemSingular} ${String(well.numero).padStart(2, '0')}`;
        return {
          name: pozoLabel,
          ubicacion: well.ubicacion,
          nombre: well.nombre,
          label: [pozoLabel, well.ubicacion || well.nombre].filter(Boolean).join(' · '),
          flujo: flowValue(well),
        };
      })
      .filter((row) => row.flujo > 0);
  }, [filteredWells, isLineasMode, itemSingular]);
  const pozosFlowHistoryRows = useMemo<FlowChartHistoryRow[]>(() => {
    if (isLineasMode) return [];
    const history = Array.isArray(activeDashboard?.well_flow_history) ? activeDashboard.well_flow_history : [];
    if (!history.length) return [];

    const wellsByNumber = new Map<number, WaterListItem>();
    filteredWells.forEach((well) => {
      const number = Number(well.numero || 0);
      if (number) wellsByNumber.set(number, well);
    });

    return history
      .map((row, index) => {
        const bucket = String(row.bucket || row.timestamp || row.time_stamp || '').trim();
        const rawFlow = row.flow_lps ?? row.flow ?? row.flow_out_lps ?? row.flow_in_lps ?? row.flujo ?? null;
        const flujo = Number(rawFlow);
        if (!bucket || rawFlow === null || rawFlow === undefined || Number.isNaN(flujo)) return null;

        const numero = Number(row.numero ?? row.well_number ?? row.pozo ?? 0);
        const safeNumber = numero || index + 1;
        const well = wellsByNumber.get(numero);
        const pozoLabel = `${itemSingular} ${String(safeNumber).padStart(2, '0')}`;
        const location = String(well?.ubicacion || well?.nombre || row.ubicacion || row.nombre || '').trim();
        const fullLabel = [pozoLabel, location].filter(Boolean).join(' · ');
        const rawKey = numero ? `pozo_${numero}` : `pozo_${String(row.well_id || safeNumber).replace(/[^a-zA-Z0-9_]/g, '_')}`;

        return {
          bucket,
          sortKey: bucket,
          label: bucketLabel(bucket, row.aggregation || activePeriod),
          wellKey: rawKey,
          wellLabel: pozoLabel,
          wellFullLabel: fullLabel,
          flujo,
        };
      })
      .filter((row): row is FlowChartHistoryRow => row !== null);
  }, [activeDashboard, activePeriod, filteredWells, isLineasMode, itemSingular]);
  const showEnergyColumn = false;
  const tableRangeStatus = tableController.error || (tableController.loading ? 'Cargando SQL Server...' : formatDateRangeStatus(tableController.range, 'Hoy'));
  const cardSourceStatus = String(sqlDashboard?.source_status || '');
  const tableSourceStatus = String(activeDashboard?.source_status || '');
  const hasCardSqlConnectionError = Boolean(sqlError) || cardSourceStatus === 'sqlserver_error';
  const hasTableSqlConnectionError = Boolean(tableController.error) || tableSourceStatus === 'sqlserver_error';
  const cardStateMessage = sqlLoading
    ? `Cargando ${itemPluralLower} desde SQL Server...`
    : hasCardSqlConnectionError
      ? `Sin conexión a SQL Server. No fue posible leer ${itemPluralLower}.`
      : `Sin registros de ${itemPluralLower} para el rango seleccionado.`;
  const tableStateMessage = tableController.loading && !activeDashboard
    ? `Cargando ${itemPluralLower} desde SQL Server...`
    : hasTableSqlConnectionError
      ? `Sin conexión a SQL Server. No fue posible leer ${itemPluralLower}.`
      : `Sin registros de ${itemPluralLower} para el rango seleccionado.`;

  const summary = useMemo(() => {
    const encendidos = wellsForView.filter((well) => ['normal', 'warning', 'critical'].includes(well.statusType)).length;
    const apagados = wellsForView.filter((well) => well.statusType === 'idle').length;
    const inactivos = wellsForView.filter((well) => well.statusType === 'inactive').length;
    const sinComunicacion = wellsForView.filter((well) => well.statusType === 'communication').length;
    return { encendidos, apagados, inactivos, sinComunicacion, total: wellsForView.length };
  }, [wellsForView]);


  return (
    <>
      <section className="pozos-operacion-hero panel fade-up compact-hero">
        <div>
          <h2>{sectionTitle}</h2>
          <p>{sectionDescription}</p>
        </div>
        <div className="pozos-operacion-summary">
          <article><span>Encendidos</span><strong>{summary.encendidos}/{summary.total}</strong></article>
          <article><span>Apagados</span><strong>{summary.apagados}</strong></article>
          <article><span>Inactivos</span><strong>{summary.inactivos}</strong></article>
          <article><span>Sin comunicación</span><strong>{summary.sinComunicacion}</strong></article>
        </div>
      </section>

      <section className="pozos-cards-grid scada-well-grid fade-up">
        {wellsForView.length ? wellsForView.map((well) => {
          const showKwhMetric = false;
          const primaryName = itemDisplayName(well, itemSingular);
          const secondaryText = itemSecondaryText(well, primaryName);
          return (
          <article
            key={well.id}
            className={`pozo-mini-card scada-well-card ${well.statusType}`}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`${sectionRoute}/${well.id}`)}
            onKeyDown={(event: KeyboardEvent<HTMLElement>) => { if (event.key === 'Enter' || event.key === ' ') navigate(`${sectionRoute}/${well.id}`); }}
            title={`Abrir detalle técnico de ${itemSingularLower}`}
          >
            <div className="pozo-mini-head scada-well-head">
              <div>
                <strong>{primaryName}</strong>
                {secondaryText ? <small>{secondaryText}</small> : null}
              </div>
              <StatusBadge type={well.statusType}>{well.status}</StatusBadge>
            </div>

            <div className="scada-meter-grid">
              {showKwhMetric ? <MetricPair label="kWh" value={well.kwh === null || well.kwh === undefined ? '—' : well.kwh.toLocaleString('es-MX')} /> : null}
              {showKwhMetric ? <MetricPair label="Amperaje" value={formatOptionalNumber(well.amps ?? well.amperaje, 2)} unit={(well.amps ?? well.amperaje) === null || (well.amps ?? well.amperaje) === undefined ? '' : 'A'} /> : null}
              <MetricPair label="Totalizador" value={well.totalizador_m3 === null || well.totalizador_m3 === undefined ? '—' : well.totalizador_m3.toLocaleString('es-MX')} unit="m³" emphasis />
              <MetricPair label="Entrada" value={formatNumber(well.flujo_entrada)} unit="L/s" />
              <MetricPair label="Salida" value={formatNumber(well.flujo_salida)} unit="L/s" />
            </div>

            <div className="scada-card-footer">
              <span className={`communication-chip ${well.communicationType}`}>{well.estado_comunicacion}</span>
              <span>{well.ultima_lectura}</span>
            </div>
          </article>
          );
        }) : <div className="panel"><ChartEmptyState message={cardStateMessage} /></div>}
      </section>

      {!isLineasMode ? (
        <section className="panel chart-panel fade-up">
          <PanelHeader title="Flujo actual" subtitle="Lectura en litros por segundo del periodo seleccionado." />
          <SqlChartDateControls
            controller={tableController}
            title="Fechas de la gráfica y tabla de pozos"
            subtitle="Por default muestra hoy; al seleccionar otro rango recalcula la gráfica y la tabla sin afectar las tarjetas actuales."
          />
          <div className="date-range-status table-range-status">{tableRangeStatus}</div>
          <FlowChartOptions rows={pozosFlowRows} historyRows={pozosFlowHistoryRows} historyPeriod={activePeriod} />
        </section>
      ) : null}

      <section className="panel table-wrapper fade-up pozos-operacion-table-panel">
        <PanelHeader title="Vista comparativa" subtitle={isLineasMode ? 'Flujo y volumen del periodo con datos BOS disponibles.' : 'Valores reales disponibles de BOS para la estructura confirmada de Durango.'} />
        {isLineasMode ? (
          <>
            <SqlChartDateControls
              controller={tableController}
              title={`Fechas de la tabla de ${viewName.toLowerCase()}`}
              subtitle="Por default muestra hoy; al seleccionar otro rango recalcula la tabla sin afectar las tarjetas actuales."
            />
            <div className="date-range-status table-range-status">{tableRangeStatus}</div>
          </>
        ) : null}
        <div className="pozos-table-scroll">
          <table className="pozos-operacion-table scada-pozos-table">
            <thead>
              <tr>
                <th>{itemSingular}</th><th>Ubicación</th><th>Estado</th><th>Comunicación</th>{showEnergyColumn ? <th>kWh periodo</th> : null}{showEnergyColumn ? <th>Amperaje</th> : null}<th>Volumen periodo m³</th><th>Entrada L/s</th><th>Salida L/s</th><th>Última lectura</th>
              </tr>
            </thead>
            <tbody>
              {filteredWells.length ? filteredWells.map((well) => (
                <tr key={well.id} className={`pozo-row ${well.statusType}`} onClick={() => navigate(`${sectionRoute}/${well.id}`)} title={`Abrir detalle técnico de ${itemSingularLower}`}>
                  <td><div className="well-name-cell"><span className={`well-dot ${well.statusType}`} /><span>{itemDisplayName(well, itemSingular)}</span></div></td>
                  <td>{itemSecondaryText(well, itemDisplayName(well, itemSingular)) || '—'}</td>
                  <td><StatusBadge type={well.statusType}>{well.status}</StatusBadge></td>
                  <td><span className={`communication-chip ${well.communicationType}`}>{well.estado_comunicacion}</span></td>
                  {showEnergyColumn ? <td className="metric-strong">{well.kwh === null || well.kwh === undefined ? '—' : `${well.kwh.toLocaleString('es-MX')} kWh`}</td> : null}
                  {showEnergyColumn ? <td className="metric-strong">{`${formatOptionalNumber(well.amps ?? well.amperaje, 2)}${(well.amps ?? well.amperaje) === null || (well.amps ?? well.amperaje) === undefined ? '' : ' A'}`}</td> : null}
                  <td className="metric-strong">{`${periodVolumeValue(well).toLocaleString('es-MX')} m³`}</td>
                  <td>{formatNumber(well.flujo_entrada)} L/s</td>
                  <td>{formatNumber(well.flujo_salida)} L/s</td>
                  <td>{well.ultima_lectura}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={showEnergyColumn ? 10 : 8}>{tableStateMessage}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </>
  );
}
