import { DURANGO_CAPABILITIES } from '../../config/plantCapabilities.ts';
import { defaultTodayRange, recommendedHistoryAggregation } from './dateUtils.ts';
import type { DateRange, FlexibleRecord, HistoryAggregation } from './types.ts';

export type OperationalModule = 'well' | 'line' | 'flow';
export type OperationalIdentity = number | string;

const HISTORY_AGGREGATIONS: HistoryAggregation[] = ['minute', 'quarter_hour', 'hourly', 'daily'];

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numericIdentity(value: unknown): number | null {
  const direct = number(value);
  if (direct !== null) return Math.trunc(direct);
  const digits = String(value || '').match(/\d+/g)?.join('');
  return digits ? Number(digits) : null;
}

function validDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function configuredOperationalItems(module: OperationalModule) {
  if (module === 'well') return DURANGO_CAPABILITIES.wells;
  if (module === 'line') return DURANGO_CAPABILITIES.lines;
  return DURANGO_CAPABILITIES.flows;
}

export function configuredOperationalIdentity(item: { sensorId: number | null; operationalKey: string }): OperationalIdentity {
  return item.sensorId ?? item.operationalKey;
}

export function resolveOperationalIdentity(
  row: FlexibleRecord,
  index: number,
  module: OperationalModule,
): OperationalIdentity {
  for (const key of ['sensor_id', 'water_sensor_id', 'flow_out_sensor_id']) {
    const candidate = numericIdentity(row[key]);
    if (candidate) return candidate;
  }
  const operationalKey = String(row.operational_key || '').trim();
  if (operationalKey) return operationalKey;

  const items = configuredOperationalItems(module);
  const wellPosition = numericIdentity(row.well_id ?? row.numero ?? row.id);
  if (module === 'well' && wellPosition) {
    const match = items[wellPosition - 1];
    if (match) return configuredOperationalIdentity(match);
  }

  const configured = items[index];
  return configured
    ? configuredOperationalIdentity(configured)
    : numericIdentity(row.id) || String(row.id || `elemento_${index + 1}`);
}


export interface OperationalReturnState {
  returnTo?: string;
  fromOperationalModule?: boolean;
  [key: string]: unknown;
}

export function buildOperationalReturnState(
  pathname: string,
  search = '',
  existingState?: unknown,
): OperationalReturnState {
  const base = existingState && typeof existingState === 'object' && !Array.isArray(existingState)
    ? existingState as Record<string, unknown>
    : {};
  return { ...base, returnTo: `${pathname}${search}`, fromOperationalModule: true };
}

export function resolveOperationalReturnTarget(state: unknown, fallback: string): string {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return fallback;
  const candidate = String((state as Record<string, unknown>).returnTo || '').trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return fallback;
  return candidate;
}

export function operationalReturnLabel(target: string): string {
  const pathname = String(target || '').split('?')[0].replace(/\/+$/, '') || '/';
  if (pathname === '/pozos/dashboard') return 'Volver al Resumen';
  if (pathname === '/pozos/pozos') return 'Volver a Pozos';
  if (pathname === '/pozos/lineas') return 'Volver a Líneas';
  if (pathname === '/pozos/flujos') return 'Volver a Lavadoras';
  if (pathname === '/pozos/jarabes') return 'Volver a Jarabes';
  return 'Volver';
}

export function clearOperationalReturnState(state: unknown): Record<string, unknown> | undefined {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return undefined;
  const cleaned = { ...(state as Record<string, unknown>) };
  delete cleaned.returnTo;
  delete cleaned.fromOperationalModule;
  return Object.keys(cleaned).length ? cleaned : undefined;
}

export function buildOperationalSiblingPath(
  backPath: string,
  identity: OperationalIdentity,
  search = '',
): string {
  const route = String(backPath || '').replace(/\/+$/, '');
  const query = search ? (search.startsWith('?') ? search : `?${search}`) : '';
  return `${route}/${encodeURIComponent(String(identity))}${query}`;
}

export interface OperationalNavigationContext {
  range: DateRange;
  aggregation: HistoryAggregation;
  source: OperationalModule;
}

export function readOperationalNavigationContext(
  search: string,
  module: OperationalModule,
): OperationalNavigationContext {
  const params = new URLSearchParams(search);
  const fallback = defaultTodayRange();
  const requestedStart = params.get('start');
  const requestedEnd = params.get('end');
  let startDate = validDate(requestedStart) ? requestedStart : String(fallback.startDate || '');
  let endDate = validDate(requestedEnd) ? requestedEnd : String(fallback.endDate || '');
  if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
  const requestedAggregation = params.get('aggregation') as HistoryAggregation | null;
  const range = { startDate, endDate, refreshKey: 0 };
  const aggregation = requestedAggregation && HISTORY_AGGREGATIONS.includes(requestedAggregation)
    ? requestedAggregation
    : recommendedHistoryAggregation(range);
  return { range, aggregation, source: module };
}

export function buildOperationalNavigationSearch(
  range: DateRange,
  aggregation: HistoryAggregation,
  module: OperationalModule,
): string {
  const params = new URLSearchParams();
  if (range.startDate) params.set('start', String(range.startDate));
  if (range.endDate) params.set('end', String(range.endDate));
  params.set('aggregation', aggregation);
  params.set('source', module);
  return `?${params.toString()}`;
}

export function buildOperationalDetailPath(
  route: string,
  identity: OperationalIdentity,
  range: DateRange,
  aggregation: HistoryAggregation,
  module: OperationalModule,
): string {
  return `${route}/${encodeURIComponent(String(identity))}${buildOperationalNavigationSearch(range, aggregation, module)}`;
}
