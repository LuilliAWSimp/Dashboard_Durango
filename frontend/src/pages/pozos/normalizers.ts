import { formatSqlDate } from './dateUtils';
import type { FlexibleRecord, NormalizedWaterItem, StatusFromFlowResult } from './types';

export function statusFromFlow(flow: unknown, explicitActive: unknown): StatusFromFlowResult {
  if (explicitActive === false && Number(flow || 0) <= 0) {
    return { status: 'Apagado', statusType: 'idle' };
  }
  if (Number(flow || 0) > 0 || explicitActive === true) {
    return { status: 'Encendido', statusType: 'normal' };
  }
  return { status: 'Apagado', statusType: 'idle' };
}

export function normalizeSqlWell(well: FlexibleRecord, index: number): NormalizedWaterItem {
  const flowOut = Number(well.flujo_salida ?? well.flow_out ?? 0);
  const flowIn = Number(well.flujo_entrada ?? well.flow_in ?? 0);
  const providedFlow = well.flow ?? null;
  const flow = Number(providedFlow !== null ? providedFlow : Math.max(flowOut, flowIn));
  const state = statusFromFlow(flow, well.active);
  const isFlowing = flow > 0;
  const name = well.nombre || well.name || `Pozo ${index + 1}`;
  const updated = formatSqlDate(well.updated || well.ultima_lectura);
  const rawAmps = well.amps ?? well.amperaje ?? null;
  const amps = rawAmps === null || rawAmps === undefined || rawAmps === '' ? null : Number(rawAmps);
  const backendStatus = String(well.status || state.status);
  const backendStatusType = String(well.statusType || state.statusType);
  const backendCommunication = String(well.estado_comunicacion || (isFlowing ? 'Normal' : 'Normal'));
  const backendCommunicationType = String(well.communicationType || 'normal');
  const hasCommunicationWarning = ['communication', 'warning', 'offline'].includes(backendCommunicationType);
  return {
    ...well,
    id: well.id || `pozo-${index + 1}`,
    numero: well.numero || index + 1,
    nombre: name,
    name,
    ubicacion: well.ubicacion || well.location || name,
    status: hasCommunicationWarning ? backendStatus : (isFlowing ? 'Encendido' : backendStatus),
    statusType: hasCommunicationWarning ? backendStatusType : (isFlowing ? 'normal' : backendStatusType),
    estado_comunicacion: backendCommunication,
    communicationType: backendCommunicationType,
    flujo_salida: flowOut,
    flujo_entrada: flowIn,
    flow,
    kwh: Number(well.kwh ?? well.dailyKwh ?? 0),
    dailyKwh: Number(well.dailyKwh ?? well.kwh ?? 0),
    totalizador_m3: Number(well.totalizador_m3 ?? 0),
    period_m3: Number(well.period_m3 ?? well.entry_m3 ?? well.period_delta_m3 ?? 0),
    period_kwh: Number(well.period_kwh ?? well.period_delta_kwh ?? 0),
    entry_m3: Number(well.entry_m3 ?? well.period_m3 ?? well.period_delta_m3 ?? 0),
    amps: amps === null || Number.isNaN(amps) ? null : amps,
    efficiency: well.efficiency ?? null,
    loadFactor: well.loadFactor ?? null,
    updated,
    ultima_lectura: updated,
    diagnosis: well.diagnosis || 'Lectura directa desde SQL Server ARCA.',
  };
}

export function normalizeSqlLine(line: FlexibleRecord, index: number): NormalizedWaterItem {
  const flow = Number(line.flow_lps || line.flujo_salida || 0);
  const state = statusFromFlow(flow, line.active);
  const name = line.nombre || line.name || `Línea ${index + 1}`;
  const updated = formatSqlDate(line.updated || line.ultima_lectura || line.timestamp);
  const backendStatus = String(line.status || state.status);
  const backendStatusType = String(line.statusType || state.statusType);
  const backendCommunication = String(line.estado_comunicacion || 'Normal');
  const backendCommunicationType = String(line.communicationType || 'normal');
  return {
    id: line.id || `linea-${index + 1}`,
    numero: line.numero || index + 1,
    nombre: name,
    name,
    ubicacion: line.ubicacion || 'Líneas de producción',
    status: backendStatus,
    statusType: backendStatusType,
    estado_comunicacion: backendCommunication,
    communicationType: backendCommunicationType,
    kwh: null,
    dailyKwh: null,
    totalizador_m3: Number(line.total_m3 || line.totalizador_m3 || 0),
    period_m3: Number(line.period_m3 ?? line.period_delta_m3 ?? 0),
    period_delta_m3: Number(line.period_delta_m3 ?? line.period_m3 ?? 0),
    flujo_entrada: flow,
    flujo_salida: flow,
    flow,
    updated,
    ultima_lectura: updated,
    sensor_id: line.sensor_id,
    sensor_name: line.sensor_name,
    diagnosis: `Sensor ${line.sensor_id || ''} · ${line.sensor_name || 'Lectura de línea'}`,
  };
}
