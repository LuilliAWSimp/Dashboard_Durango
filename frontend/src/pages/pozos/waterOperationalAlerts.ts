import { DURANGO_CAPABILITIES } from '../../config/plantCapabilities.ts';
import { defaultTodayRange, recommendedHistoryAggregation } from './dateUtils.ts';
import {
  buildOperationalDetailPath,
  configuredOperationalItems,
  resolveOperationalIdentity,
  type OperationalIdentity,
  type OperationalModule,
} from './operationalNavigation.ts';
import { routeBaseForOperationalIdentity } from './operationalSectionConfig.ts';
import type { DashboardData, DateRange, FlexibleRecord, HistoryAggregation } from './types.ts';

export type WaterOperationalAlertSeverity = 'critical' | 'warning';
export type WaterOperationalAlertCode = 'no_communication' | 'stale_reading' | 'volume_not_validable';
export type WaterOperationalAlertModule = OperationalModule | 'plant';

export interface WaterOperationalAlert {
  id: string;
  code: WaterOperationalAlertCode;
  severity: WaterOperationalAlertSeverity;
  module: WaterOperationalAlertModule;
  identity: OperationalIdentity | 'plant';
  name: string;
  title: string;
  message: string;
  route: string;
  detectedAt: string;
  lastUpdate?: string | null;
  readingAgeMinutes?: number | null;
}

export interface WaterAlertRouteContext {
  range?: DateRange;
  aggregation?: HistoryAggregation;
}

const MODULE_ROUTES: Record<OperationalModule, string> = {
  well: '/pozos/pozos',
  line: '/pozos/lineas',
  flow: '/pozos/flujos',
};

function rows(value: unknown): FlexibleRecord[] {
  return Array.isArray(value) ? value as FlexibleRecord[] : [];
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: unknown): boolean {
  return value === true || lower(value) === 'true' || value === 1 || lower(value) === '1';
}

function isFalse(value: unknown): boolean {
  return value === false || lower(value) === 'false' || value === 0 || lower(value) === '0';
}

function stableIdentity(identity: OperationalIdentity | 'plant'): string {
  return String(identity).replace(/\s+/g, '_').toLowerCase();
}

function configuredName(module: OperationalModule, identity: OperationalIdentity, fallback: string): string {
  const items = configuredOperationalItems(module);
  const match = items.find((item) => item.sensorId === identity || item.operationalKey === identity);
  return match?.name || fallback;
}

function itemName(row: FlexibleRecord, index: number, module: OperationalModule, identity: OperationalIdentity): string {
  const fallback = `${module === 'well' ? 'Pozo' : module === 'line' ? 'Línea' : 'Flujo'} ${index + 1}`;
  return configuredName(module, identity, text(row.name || row.nombre || row.alias || fallback));
}

function routeFor(module: WaterOperationalAlertModule, identity: OperationalIdentity | 'plant', operationalKey?: string | null) {
  if (module === 'plant') return '/pozos/dashboard';
  const routeBase = routeBaseForOperationalIdentity(module, identity, operationalKey);
  return `${routeBase}/${encodeURIComponent(String(identity))}`;
}

export function buildWaterAlertRoute(alert: WaterOperationalAlert, context: WaterAlertRouteContext = {}): string {
  if (alert.module === 'plant' || alert.identity === 'plant') return '/pozos/dashboard';
  const range = context.range || defaultTodayRange();
  const aggregation = context.aggregation || recommendedHistoryAggregation(range);
  return buildOperationalDetailPath(routeBaseForOperationalIdentity(alert.module, alert.identity), alert.identity, range, aggregation, alert.module);
}

function communicationTokens(row: FlexibleRecord): string[] {
  return [
    row.communication_status,
    row.communicationType,
    row.communication_type,
    row.estado_comunicacion,
    row.communication,
    row.source_status,
    row.data_status,
  ].map(lower).filter(Boolean);
}

function readingStatusTokens(row: FlexibleRecord): string[] {
  return [
    ...communicationTokens(row),
    row.current_state,
    row.current_state_status,
    row.status,
    row.statusType,
  ].map(lower).filter(Boolean);
}

function hasNoCommunication(row: FlexibleRecord): boolean {
  if (isFalse(row.current_reading_available) || isFalse(row.has_current_reading)) return true;
  return communicationTokens(row).some((token) => (
    token === 'offline'
    || token === 'no_data'
    || token === 'nodata'
    || token === 'no data'
    || token.includes('sin comunicación')
    || token.includes('sin comunicacion')
    || token.includes('sin lectura')
    || token.includes('sin datos')
    || token.includes('no disponible')
  ));
}

function hasStaleReading(row: FlexibleRecord): boolean {
  if (bool(row.reading_stale) || bool(row.stale_reading)) return true;
  const communicationState = [row.communication_status, row.communicationType, row.communication_type, row.estado_comunicacion, row.communication].map(lower);
  if (communicationState.some((token) => token === 'stale' || token === 'warning')) return true;
  return readingStatusTokens(row).some((token) => (
    token.includes('atrasada')
    || token.includes('antigua')
    || token.includes('no reciente')
    || token.includes('revisar comunicación')
    || token.includes('revisar comunicacion')
  ));
}

function explicitNotValidable(row: FlexibleRecord): boolean {
  const validated = number(row.validated_volume_m3 ?? row.period_m3 ?? row.period_delta_m3);
  if (validated !== null) return false;
  const tokens = [row.data_status, row.validation_status, row.volume_validation_status, row.volume_status].map(lower);
  const explicitFlag = bool(row.volume_not_validable)
    || bool(row.volume_not_usable)
    || bool(row.no_usable_volume)
    || bool(row.totalizer_invalid)
    || bool(row.invalid_totalizer);
  const explicitStatus = tokens.some((token) => token === 'invalid_totalizer' || token === 'not_validable' || token === 'volume_not_validable');
  return explicitFlag || explicitStatus;
}

function readingAge(row: FlexibleRecord): number | null {
  return number(row.reading_age_minutes ?? row.last_reading_age_minutes ?? row.age_minutes);
}

function lastUpdate(row: FlexibleRecord): string | null {
  const value = row.last_update || row.ultima_lectura || row.updated || row.timestamp;
  return value ? String(value) : null;
}

function makeAlert(
  module: OperationalModule,
  identity: OperationalIdentity,
  name: string,
  code: WaterOperationalAlertCode,
  severity: WaterOperationalAlertSeverity,
  title: string,
  message: string,
  row: FlexibleRecord,
): WaterOperationalAlert {
  const id = `${module}:${stableIdentity(identity)}:${code}`;
  return {
    id,
    code,
    severity,
    module,
    identity,
    name,
    title,
    message,
    route: routeFor(module, identity, row.operational_key as string | null),
    detectedAt: new Date().toISOString(),
    lastUpdate: lastUpdate(row),
    readingAgeMinutes: readingAge(row),
  };
}

function evaluateItem(row: FlexibleRecord, index: number, module: OperationalModule): WaterOperationalAlert | null {
  const identity = resolveOperationalIdentity(row, index, module);
  const name = itemName(row, index, module, identity);

  if (hasNoCommunication(row)) {
    return makeAlert(
      module,
      identity,
      name,
      'no_communication',
      'critical',
      'Sin comunicación',
      'No se dispone de una lectura actual del elemento.',
      row,
    );
  }

  if (hasStaleReading(row)) {
    const age = readingAge(row);
    return makeAlert(
      module,
      identity,
      name,
      'stale_reading',
      'warning',
      'Lectura no reciente',
      age === null
        ? 'La última lectura disponible no está actualizada.'
        : `La última lectura disponible tiene ${Math.round(age)} minutos de antigüedad.`,
      row,
    );
  }

  if (explicitNotValidable(row)) {
    return makeAlert(
      module,
      identity,
      name,
      'volume_not_validable',
      'warning',
      'Volumen no validable',
      'Las lecturas actuales están disponibles, pero no fue posible validar un volumen para el periodo.',
      row,
    );
  }

  return null;
}

export function evaluateDurangoWaterAlerts(dashboard: DashboardData | null | undefined): WaterOperationalAlert[] {
  if (!dashboard) return [];
  const alerts = [
    ...rows(dashboard.wells).map((item, index) => evaluateItem(item, index, 'well')),
    ...rows(dashboard.production_lines).map((item, index) => evaluateItem(item, index, 'line')),
    ...rows(dashboard.flows).map((item, index) => evaluateItem(item, index, 'flow')),
  ].filter((alert): alert is WaterOperationalAlert => Boolean(alert));

  const configuredOrder = new Map<string, number>();
  DURANGO_CAPABILITIES.wells.forEach((item, index) => configuredOrder.set(`well:${stableIdentity(item.sensorId ?? item.operationalKey)}`, index));
  DURANGO_CAPABILITIES.lines.forEach((item, index) => configuredOrder.set(`line:${stableIdentity(item.sensorId ?? item.operationalKey)}`, 100 + index));
  DURANGO_CAPABILITIES.flows.forEach((item, index) => configuredOrder.set(`flow:${stableIdentity(item.sensorId ?? item.operationalKey)}`, 200 + index));

  const severityOrder: Record<WaterOperationalAlertSeverity, number> = { critical: 0, warning: 1 };
  return alerts.sort((a, b) => {
    const severity = severityOrder[a.severity] - severityOrder[b.severity];
    if (severity) return severity;
    const aOrder = configuredOrder.get(`${a.module}:${stableIdentity(a.identity)}`) ?? 999;
    const bOrder = configuredOrder.get(`${b.module}:${stableIdentity(b.identity)}`) ?? 999;
    return aOrder - bOrder;
  });
}

export interface OperationalAlertToastTracker {
  next: (alerts: WaterOperationalAlert[]) => WaterOperationalAlert[];
  activeIds: () => string[];
}

export function createOperationalAlertToastTracker(): OperationalAlertToastTracker {
  let active = new Set<string>();
  return {
    next(alerts) {
      const current = new Set(alerts.map((alert) => alert.id));
      const newlyActive = alerts.filter((alert) => !active.has(alert.id));
      active = current;
      return newlyActive;
    },
    activeIds: () => [...active],
  };
}
