import api from './api';
import type { ID } from '../types';
import type { HistoryAggregation, WaterHistoryResponse, WaterShiftsResponse } from '../pages/pozos/types';

const cache = new Map<string, { ts: number; ttl: number; data: unknown }>();

const CURRENT_TTL_MS = 25 * 1000;
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
  if (params.include_history === false) return CURRENT_TTL_MS;
  if (String(params.period || '').toLowerCase() === 'monthly') return MONTHLY_TTL_MS;
  return HISTORY_TTL_MS;
}

function cacheKey(section: string, options: WaterRequestOptions = {}): string {
  const params = buildParams(options);
  return [
    section,
    params.start_date || '',
    params.end_date || '',
    params.period || '',
    params.include_history === false ? 'current' : 'history',
    params.include_energy_water ? 'energy' : 'no-energy',
  ].join(':');
}

export function clearWaterCache(): void {
  cache.clear();
}

export async function fetchWaterDashboard(section = 'dashboard', options: WaterRequestOptions = {}): Promise<unknown> {
  const params = buildParams(options);
  const key = cacheKey(section, options);
  const now = Date.now();
  const ttl = cacheTtl(params);
  const force = params.force_refresh === true;
  const cached = cache.get(key);
  if (!force && cached && now - cached.ts < cached.ttl) return cached.data;
  const { data } = await api.get<unknown>(`/water/dashboard/${section}`, { params, timeout: 12_000 });
  cache.set(key, { ts: now, ttl, data });
  return data;
}


export interface WaterHistoryRequestOptions {
  module: 'well' | 'line' | 'flow';
  sensorId: number;
  startDate: string;
  endDate: string;
  aggregation: HistoryAggregation;
  forceRefresh?: boolean;
}

function historyCacheKey(options: WaterHistoryRequestOptions): string {
  return [
    'history',
    options.module,
    String(options.sensorId),
    options.startDate,
    options.endDate,
    options.aggregation,
  ].join(':');
}

export async function fetchWaterHistory(options: WaterHistoryRequestOptions): Promise<WaterHistoryResponse> {
  const key = historyCacheKey(options);
  const now = Date.now();
  const cached = cache.get(key);
  if (!options.forceRefresh && cached && now - cached.ts < HISTORY_TTL_MS) {
    return cached.data as WaterHistoryResponse;
  }
  const params = {
    module: options.module,
    sensor_id: options.sensorId,
    start_date: options.startDate,
    end_date: options.endDate,
    aggregation: options.aggregation,
    force_refresh: Boolean(options.forceRefresh),
  };
  const { data } = await api.get<WaterHistoryResponse>('/water/history', { params, timeout: 30_000 });
  cache.set(key, { ts: now, ttl: HISTORY_TTL_MS, data });
  return data;
}

export interface WaterShiftRequestOptions {
  date: string;
  shift?: 'all' | 'shift_1' | 'shift_2' | 'shift_3';
  forceRefresh?: boolean;
}

export async function fetchWaterShifts(options: WaterShiftRequestOptions): Promise<WaterShiftsResponse> {
  const key = ['shifts', options.date, options.shift || 'all'].join(':');
  const now = Date.now();
  const cached = cache.get(key);
  const today = new Date().toLocaleDateString('en-CA');
  const ttl = options.date === today ? CURRENT_TTL_MS : HISTORY_TTL_MS;
  if (!options.forceRefresh && cached && now - cached.ts < ttl) {
    return cached.data as WaterShiftsResponse;
  }
  const params = {
    date: options.date,
    shift: options.shift || 'all',
    force_refresh: Boolean(options.forceRefresh),
  };
  const { data } = await api.get<WaterShiftsResponse>('/water/shifts', { params, timeout: 30_000 });
  cache.set(key, { ts: now, ttl, data });
  return data;
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
  const { data } = await api.post<unknown>('/water/sources/validate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function uploadWaterSource(file: Blob, activate = true): Promise<unknown> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<unknown>(`/water/sources/upload?activate=${activate}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  clearWaterCache();
  return data;
}

export async function activateWaterSource(sourceId: ID): Promise<unknown> {
  const { data } = await api.post<unknown>(`/water/sources/${sourceId}/activate`);
  clearWaterCache();
  return data;
}
