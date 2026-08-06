import api from './api';
import type { ID } from '../types';
import type { HistoryAggregation, WaterHistoryResponse, WaterModuleHistoryResponse, WellsMinuteFlowResponse, WaterShiftsResponse } from '../pages/pozos/types';

const PLANT_CACHE_KEY = 'durango';
const cache = new Map<string, { ts: number; ttl: number; data: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();

const CURRENT_TTL_MS = 25 * 1000;
const TODAY_TTL_MS = 60 * 1000;
const HISTORY_TTL_MS = 10 * 60 * 1000;
const MONTHLY_TTL_MS = 30 * 60 * 1000;

interface WaterRequestOptions {
  startDate?: string;
  start_date?: string;
  endDate?: string;
  end_date?: string;
  period?: string;
  includeHistory?: boolean;
  include_history?: boolean;
  includeEnergyWater?: boolean;
  include_energy_water?: boolean;
  forceRefresh?: boolean;
  force_refresh?: boolean;
  [key: string]: unknown;
}

interface WaterRequestParams {
  start_date?: string;
  end_date?: string;
  period?: string;
  include_history?: boolean;
  include_energy_water?: boolean;
  force_refresh?: boolean;
}

function optionBoolean(primary: unknown, fallback: unknown, defaultValue: boolean): boolean {
  if (typeof primary === 'boolean') return primary;
  if (typeof fallback === 'boolean') return fallback;
  return defaultValue;
}

function localToday(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function rangeIncludesToday(start?: string, end?: string): boolean {
  if (!start && !end) return false;
  const today = localToday();
  const first = start || end || '';
  const last = end || start || '';
  return first <= today && today <= last;
}

function buildParams(options: WaterRequestOptions = {}): WaterRequestParams {
  const params: WaterRequestParams = {};
  if (options.startDate || options.start_date) params.start_date = String(options.startDate || options.start_date);
  if (options.endDate || options.end_date) params.end_date = String(options.endDate || options.end_date);
  if (options.period) params.period = String(options.period);
  params.include_history = optionBoolean(options.includeHistory, options.include_history, true);
  params.include_energy_water = optionBoolean(options.includeEnergyWater, options.include_energy_water, false);
  const force = optionBoolean(options.forceRefresh, options.force_refresh, false);
  if (force) params.force_refresh = true;
  return params;
}

function cacheTtl(params: WaterRequestParams): number {
  if (params.include_history === false && !params.start_date && !params.end_date) return CURRENT_TTL_MS;
  if (String(params.period || '').toLowerCase() === 'monthly') return MONTHLY_TTL_MS;
  if (rangeIncludesToday(params.start_date, params.end_date)) return TODAY_TTL_MS;
  return HISTORY_TTL_MS;
}

function cacheKey(section: string, options: WaterRequestOptions = {}): string {
  const params = buildParams(options);
  return [
    PLANT_CACHE_KEY,
    section,
    params.start_date || '',
    params.end_date || '',
    params.period || '',
    params.include_history === false ? 'current' : 'history',
    params.include_energy_water ? 'energy' : 'no-energy',
  ].join(':');
}

async function cachedRequest<T>(
  key: string,
  ttl: number,
  forceRefresh: boolean | undefined,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key);
  if (!forceRefresh && cached && now - cached.ts < cached.ttl) return cached.data as T;
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;
  if (forceRefresh) cache.delete(key);
  const request = loader()
    .then((data) => {
      cache.set(key, { ts: Date.now(), ttl, data });
      return data;
    })
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}

export function clearWaterCache(): void {
  cache.clear();
}

export async function fetchWaterDashboard(section = 'dashboard', options: WaterRequestOptions = {}): Promise<unknown> {
  const params = buildParams(options);
  const key = cacheKey(section, options);
  const ttl = cacheTtl(params);
  return cachedRequest(key, ttl, params.force_refresh, async () => {
    const { data } = await api.get<unknown>(`/water/dashboard/${section}`, { params, timeout: 12_000 });
    return data;
  });
}

export interface WaterHistoryRequestOptions {
  module: 'well' | 'line' | 'flow';
  sensorId: number | string;
  startDate: string;
  endDate: string;
  aggregation: HistoryAggregation;
  forceRefresh?: boolean;
}

function historyCacheKey(options: WaterHistoryRequestOptions): string {
  return [PLANT_CACHE_KEY, 'history', options.module, String(options.sensorId), options.startDate, options.endDate, options.aggregation].join(':');
}

export async function fetchWaterHistory(options: WaterHistoryRequestOptions): Promise<WaterHistoryResponse> {
  const key = historyCacheKey(options);
  const ttl = rangeIncludesToday(options.startDate, options.endDate) ? TODAY_TTL_MS : HISTORY_TTL_MS;
  return cachedRequest(key, ttl, options.forceRefresh, async () => {
    const params = {
      module: options.module,
      sensor_id: options.sensorId,
      start_date: options.startDate,
      end_date: options.endDate,
      aggregation: options.aggregation,
      force_refresh: Boolean(options.forceRefresh),
    };
    const { data } = await api.get<WaterHistoryResponse>('/water/history', { params, timeout: 30_000 });
    return data;
  });
}

export interface WaterModuleHistoryRequestOptions {
  module: 'well' | 'line' | 'flow';
  startDate: string;
  endDate: string;
  aggregation: HistoryAggregation;
  forceRefresh?: boolean;
}

export async function fetchWaterModuleHistory(options: WaterModuleHistoryRequestOptions): Promise<WaterModuleHistoryResponse> {
  const key = [PLANT_CACHE_KEY, 'history-module', options.module, options.startDate, options.endDate, options.aggregation].join(':');
  const ttl = rangeIncludesToday(options.startDate, options.endDate) ? TODAY_TTL_MS : HISTORY_TTL_MS;
  return cachedRequest(key, ttl, options.forceRefresh, async () => {
    const params = { module: options.module, start_date: options.startDate, end_date: options.endDate, aggregation: options.aggregation, force_refresh: Boolean(options.forceRefresh) };
    const { data } = await api.get<WaterModuleHistoryResponse>('/water/history/module', { params, timeout: 30_000 });
    return data;
  });
}

export interface WellsMinuteFlowRequestOptions { startDateTime: string; endDateTime: string; forceRefresh?: boolean; }
export async function fetchWellsMinuteFlow(options: WellsMinuteFlowRequestOptions): Promise<WellsMinuteFlowResponse> {
  const key = [PLANT_CACHE_KEY, 'wells-minute', options.startDateTime, options.endDateTime].join(':');
  const ttl = rangeIncludesToday(options.startDateTime.slice(0, 10), options.endDateTime.slice(0, 10)) ? TODAY_TTL_MS : HISTORY_TTL_MS;
  return cachedRequest(key, ttl, options.forceRefresh, async () => {
    const params = { start_datetime: options.startDateTime, end_datetime: options.endDateTime, force_refresh: Boolean(options.forceRefresh) };
    const { data } = await api.get<WellsMinuteFlowResponse>('/water/wells/minute-flow', { params, timeout: 30_000 });
    return data;
  });
}

export interface WaterShiftRequestOptions {
  date: string;
  shift?: 'all' | 'shift_1' | 'shift_2' | 'shift_3';
  forceRefresh?: boolean;
}

export async function fetchWaterShifts(options: WaterShiftRequestOptions): Promise<WaterShiftsResponse> {
  const key = [PLANT_CACHE_KEY, 'shifts', options.date, options.shift || 'all'].join(':');
  const ttl = options.date === localToday() ? TODAY_TTL_MS : HISTORY_TTL_MS;
  return cachedRequest(key, ttl, options.forceRefresh, async () => {
    const params = { date: options.date, shift: options.shift || 'all', force_refresh: Boolean(options.forceRefresh) };
    const { data } = await api.get<WaterShiftsResponse>('/water/shifts', { params, timeout: 30_000 });
    return data;
  });
}

export async function fetchWaterReportCatalog(options: WaterRequestOptions = {}): Promise<unknown> {
  const { data } = await api.get<unknown>('/water/reports/catalog', { params: buildParams(options) });
  return data;
}

export async function fetchWaterSources(): Promise<unknown> {
  const { data } = await api.get<unknown>('/water/sources');
  return data;
}

export async function validateWaterSource(file: Blob): Promise<unknown> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<unknown>('/water/sources/validate', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
}

export async function uploadWaterSource(file: Blob, activate = true): Promise<unknown> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<unknown>(`/water/sources/upload?activate=${activate}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  clearWaterCache();
  return data;
}

export async function activateWaterSource(sourceId: ID): Promise<unknown> {
  const { data } = await api.post<unknown>(`/water/sources/${sourceId}/activate`);
  clearWaterCache();
  return data;
}
