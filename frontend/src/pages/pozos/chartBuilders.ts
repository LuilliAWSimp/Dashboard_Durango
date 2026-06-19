import { bucketLabel, dashboardPeriod } from './dateUtils';
import { normalizeSqlLine, normalizeSqlWell } from './normalizers';
import type { ChartDataPoint, DashboardData, DateRange, FlexibleRecord, NormalizedWaterItem } from './types';

export function buildEnergyWaterSeries(dashboard?: DashboardData | null, fallbackRange: DateRange = {}): ChartDataPoint[] {
  const rows = Array.isArray(dashboard?.energy_water_rows) ? dashboard.energy_water_rows : [];
  const period = dashboardPeriod(dashboard, fallbackRange);
  const buckets = new Map<unknown, ChartDataPoint>();
  rows.forEach((row) => {
    const key = row.bucket || row.period || row.fecha || row.date || row.time_stamp || row.timestamp || 'Periodo';
    const item = buckets.get(key) || { bucket: key, hour: bucketLabel(key, period), agua: 0, energia: 0 };
    item.agua += Number(row.m3_value ?? row.water_m3 ?? row.m3 ?? 0);
    item.energia += Number(row.kwh_value ?? row.kwh ?? row.energy_kwh ?? 0);
    buckets.set(key, item);
  });
  return Array.from(buckets.values()).sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)));
}

export function buildWellPeriodRows(dashboard?: DashboardData | null): ChartDataPoint[] {
  const wells = dashboard?.wells?.length ? dashboard.wells.map(normalizeSqlWell) : [];
  return wells.map((well) => ({
    name: `P${String(well.numero || '').padStart(2, '0')}`,
    fullName: well.nombre || well.name,
    agua: Number(well.period_m3 ?? well.entry_m3 ?? 0),
    energia: Number(well.period_kwh ?? 0),
    flujo: Number(well.flow ?? 0),
  })).filter((row) => row.agua || row.energia || row.flujo);
}

export function buildWellHistoryProductionSeries(dashboard?: DashboardData | null, fallbackRange: DateRange = {}): ChartDataPoint[] {
  const rows = Array.isArray(dashboard?.well_flow_history) ? dashboard.well_flow_history : [];
  const period = dashboardPeriod(dashboard, fallbackRange);
  const buckets = new Map<unknown, ChartDataPoint>();
  rows.forEach((row) => {
    const key = row.bucket || row.timestamp || row.time_stamp || 'Periodo';
    const item = buckets.get(key) || { bucket: key, hour: bucketLabel(key, period), agua: 0, energia: 0 };
    item.agua += Number(row.period_m3 ?? row.m3_value ?? 0);
    item.energia += Number(row.energy_delta_kwh ?? row.kwh_value ?? 0);
    buckets.set(key, item);
  });
  return Array.from(buckets.values())
    .filter((row) => row.agua || row.energia)
    .sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)));
}

export function buildProductionSeries(dashboard?: DashboardData | null, fallbackRange: DateRange = {}): ChartDataPoint[] {
  const hasEnergyWaterRows = Array.isArray(dashboard?.energy_water_rows) && dashboard.energy_water_rows.length > 0;
  const energyRows = buildEnergyWaterSeries(dashboard, fallbackRange);
  if (hasEnergyWaterRows) return energyRows;

  const hasWellFlowHistory = Array.isArray(dashboard?.well_flow_history) && dashboard.well_flow_history.length > 0;
  const historyRows = buildWellHistoryProductionSeries(dashboard, fallbackRange);
  if (hasWellFlowHistory) return historyRows;

  return buildWellPeriodRows(dashboard).map((row) => ({ hour: row.name, agua: row.agua, energia: row.energia }));
}

export function buildEntryExitRows(dashboard?: DashboardData | null): ChartDataPoint[] {
  const direct = Array.isArray(dashboard?.entry_vs_exit) ? dashboard.entry_vs_exit : [];
  if (direct.length) {
    return direct.map((row) => ({
      label: row.label || row.name || 'Periodo',
      entrada: Number(row.entrada ?? row.input ?? 0),
      salida: Number(row.salida ?? row.output ?? 0),
      diferencia: Number(row.entrada ?? row.input ?? 0) - Number(row.salida ?? row.output ?? 0),
    }));
  }
  const wells = dashboard?.wells?.length ? dashboard.wells.map(normalizeSqlWell) : [];
  if (!wells.length) return [];
  const entrada = wells.reduce((sum, item) => sum + Number(item.period_m3 ?? item.entry_m3 ?? 0), 0);
  return [{ label: 'Pozos', entrada, salida: 0, diferencia: entrada }];
}


export function buildTankLevelRows(dashboard?: DashboardData | null): ChartDataPoint[] {
  const rows = dashboard?.tank_level_readings || [];
  return rows
    .map((item, index) => ({
      name: item.name || item.label || `Tanque ${index + 1}`,
      label: item.label || item.display_name || item.name || `Tanque ${index + 1}`,
      displayName: item.display_name || item.label || item.name || `Tanque ${index + 1}`,
      shortName: item.short_name || item.source_column || item.level_key || '',
      type: item.type || 'Nivel operativo',
      kind: item.kind || 'tanque',
      nivel: Number(item.level_value ?? item.height_m ?? item.fill_pct ?? 0),
      metros: Number(item.height_m ?? item.level_value ?? 0),
      maxHeight: Number(item.max_height_m ?? 0),
      m3: Number(item.volume_m3 ?? 0),
      capacidad: Number(item.capacity_m3 ?? 0),
      llenado: Number(item.fill_pct ?? item.level_value ?? 0),
      sourceColumn: item.source_column || item.level_key || '',
      volumeSource: item.volume_source || 'estimated',
      volumeSourceColumn: item.volume_source_column || '',
      diagnosis: item.diagnosis || '',
      status: item.status || 'Sin lectura',
      statusType: item.statusType || 'communication',
      updated: item.updated || item.ultima_lectura || '',
    }))
    .filter((row) => row.nivel !== 0 || row.llenado !== 0 || row.sourceColumn);
}

export function buildTankLevelHistoryRows(dashboard?: DashboardData | null): ChartDataPoint[] {
  const rows = dashboard?.tank_level_history || [];
  return rows
    .map((item) => ({
      ...item,
      time: bucketLabel(item.bucket || item.timestamp, dashboardPeriod(dashboard)),
    }))
    .filter((row) => Object.keys(row).some((key) => key.startsWith('nivel_') && Number(row[key] ?? 0) !== 0));
}

export function buildTankLineRows(dashboard?: DashboardData | null): ChartDataPoint[] {
  const rows: ChartDataPoint[] = [];
  (dashboard?.tank_inputs || []).forEach((item, index) => {
    rows.push({ name: item.name || item.label || `Tanque ${index + 1}`, entrada: Number(item.flow_lps || 0), total: Number(item.total_m3 || 0) });
  });
  (dashboard?.production_lines || []).forEach((item, index) => {
    rows.push({ name: item.sensor_name || item.name || `Línea ${index + 1}`, entrada: Number(item.flow_lps || 0), total: Number(item.total_m3 || 0) });
  });
  return rows.filter((row) => row.entrada || row.total);
}

export function buildDistributionRows(dashboard?: DashboardData | null): ChartDataPoint[] {
  const rows = dashboard?.water_consumption || dashboard?.distribution_flows || [];
  return rows.map((item) => ({
    name: item.name || item.label || 'Consumo',
    value: Number(item.value ?? item.flow_lps ?? item.total_m3 ?? 0),
  })).filter((row) => row.value);
}

export function buildWellTimeline(dashboard?: DashboardData | null, well?: NormalizedWaterItem | FlexibleRecord | null): ChartDataPoint[] {
  const wellId = Number(well?.well_id || 0);
  const wellNumber = Number(well?.numero || 0);
  const period = dashboardPeriod(dashboard);

  const flowRows = Array.isArray(dashboard?.well_flow_history) ? dashboard.well_flow_history : [];
  const ampsByBucket = new Map<string, number>();
  flowRows
    .filter((row) => {
      const rowWellId = Number(row.well_id || 0);
      const rowNumber = Number(row.numero || 0);
      return (!wellId || rowWellId === wellId) && (!wellNumber || rowNumber === wellNumber);
    })
    .forEach((row) => {
      const bucket = row.bucket || row.timestamp || row.time_stamp;
      const amps = Number(row.amps ?? row.amperaje ?? 0);
      if (bucket && amps) ampsByBucket.set(String(bucket), amps);
    });

  const energyRows = Array.isArray(dashboard?.energy_water_rows) ? dashboard.energy_water_rows : [];
  const energyMapped = energyRows
    .filter((row) => !wellId || Number(row.well_id || 0) === wellId)
    .map((row) => {
      const bucket = row.bucket || row.period || row.fecha || row.date;
      const agua = Number(row.m3_value ?? row.water_m3 ?? 0);
      const energia = Number(row.kwh_value ?? row.kwh ?? 0);
      return {
        time: bucketLabel(bucket, period),
        flow: agua,
        energia,
        amps: ampsByBucket.get(String(bucket)) ?? (Number(well?.amps ?? well?.amperaje ?? 0) || null),
        efficiency: agua ? energia / agua : null,
        loadFactor: null,
      };
    })
    .filter((row) => row.flow || row.energia);
  if (energyMapped.length) return energyMapped;

  const flowMapped = flowRows
    .filter((row) => {
      const rowWellId = Number(row.well_id || 0);
      const rowNumber = Number(row.numero || 0);
      return (!wellId || rowWellId === wellId) && (!wellNumber || rowNumber === wellNumber);
    })
    .map((row) => {
      const agua = Number(row.period_m3 ?? row.m3_value ?? 0);
      const energia = Number(row.energy_delta_kwh ?? row.kwh_value ?? 0);
      const flowAvg = Number(row.flow_lps ?? row.flow ?? row.flow_out_lps ?? row.flow_in_lps ?? 0);
      return {
        time: bucketLabel(row.timestamp || row.time_stamp || row.bucket, row.aggregation || period),
        flow: agua || flowAvg,
        flowAvg,
        energia,
        amps: Number(row.amps ?? row.amperaje ?? 0) || null,
        efficiency: agua && energia ? energia / agua : null,
        loadFactor: null,
      };
    })
    .filter((row) => row.flow || row.energia || row.flowAvg);
  if (flowMapped.length) return flowMapped;

  return [{
    time: well?.ultima_lectura || well?.updated || 'Último registro',
    flow: Number(well?.period_m3 || well?.flow || 0),
    flowAvg: Number(well?.flow || 0),
    energia: Number(well?.period_kwh || well?.dailyKwh || well?.kwh || 0),
    amps: Number(well?.amps ?? well?.amperaje ?? 0) || null,
    efficiency: well?.kwh_por_m3 || null,
    loadFactor: null,
  }];
}

export function buildLineTimeline(dashboard?: DashboardData | null, line?: NormalizedWaterItem | FlexibleRecord | null): ChartDataPoint[] {
  const lineNumber = Number(line?.numero || 0);
  const period = dashboardPeriod(dashboard);
  const history = Array.isArray(dashboard?.production_line_history) ? dashboard.production_line_history : [];
  const mapped = history
    .filter((row) => !lineNumber || Number(row.numero || 0) === lineNumber || row.id === line?.id)
    .map((row) => ({
      time: bucketLabel(row.timestamp || row.time_stamp || row.bucket, row.aggregation || period),
      flow: Number(row.flow_lps ?? 0),
      volumen: Number(row.period_m3 ?? row.m3_value ?? 0),
      totalizador: Number(row.total_m3 ?? row.totalizador_m3 ?? 0),
    }))
    .filter((row) => row.flow || row.volumen || row.totalizador);
  if (mapped.length) return mapped;
  return [{
    time: line?.ultima_lectura || line?.updated || 'Último registro',
    flow: Number(line?.flow || line?.flujo_salida || line?.flujo_entrada || 0),
    volumen: Number(line?.period_m3 || 0),
    totalizador: Number(line?.totalizador_m3 || 0),
  }];
}
