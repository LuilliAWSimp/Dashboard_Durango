import api from './api';

const cache = new Map();

const CURRENT_TTL_MS = 25 * 1000;
const HISTORY_TTL_MS = 10 * 60 * 1000;
const MONTHLY_TTL_MS = 30 * 60 * 1000;

function optionBoolean(primary, fallback, defaultValue) {
  if (typeof primary === 'boolean') return primary;
  if (typeof fallback === 'boolean') return fallback;
  return defaultValue;
}

function buildParams(options = {}) {
  const params = {};
  if (options.startDate || options.start_date) params.start_date = String(options.startDate || options.start_date);
  if (options.endDate || options.end_date) params.end_date = String(options.endDate || options.end_date);
  if (options.period) params.period = String(options.period);
  params.include_history = optionBoolean(options.includeHistory, options.include_history, true);
  params.include_energy_water = optionBoolean(options.includeEnergyWater, options.include_energy_water, false);
  const force = optionBoolean(options.forceRefresh, options.force_refresh, false);
  if (force) params.force_refresh = true;
  return params;
}

function cacheTtl(params) {
  if (params.include_history === false) return CURRENT_TTL_MS;
  if (String(params.period || '').toLowerCase() === 'monthly') return MONTHLY_TTL_MS;
  return HISTORY_TTL_MS;
}

function cacheKey(section, options = {}) {
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

export function clearWaterCache() {
  cache.clear();
}

export async function fetchWaterDashboard(section = 'dashboard', options = {}) {
  const params = buildParams(options);
  const key = cacheKey(section, options);
  const now = Date.now();
  const ttl = cacheTtl(params);
  const force = params.force_refresh === true;
  const cached = cache.get(key);
  if (!force && cached && now - cached.ts < cached.ttl) return cached.data;
  const { data } = await api.get(`/water/dashboard/${section}`, { params, timeout: 12000 });
  cache.set(key, { ts: now, ttl, data });
  return data;
}


function historyCacheKey(options) {
  return [
    'history',
    options.module,
    String(options.sensorId),
    options.startDate,
    options.endDate,
    options.aggregation,
  ].join(':');
}

export async function fetchWaterHistory(options) {
  const key = historyCacheKey(options);
  const now = Date.now();
  const cached = cache.get(key);
  if (!options.forceRefresh && cached && now - cached.ts < HISTORY_TTL_MS) return cached.data;
  const params = {
    module: options.module,
    sensor_id: options.sensorId,
    start_date: options.startDate,
    end_date: options.endDate,
    aggregation: options.aggregation,
    force_refresh: Boolean(options.forceRefresh),
  };
  const { data } = await api.get('/water/history', { params, timeout: 30000 });
  cache.set(key, { ts: now, ttl: HISTORY_TTL_MS, data });
  return data;
}

export async function fetchWaterShifts(options) {
  const key = ['shifts', options.date, options.shift || 'all'].join(':');
  const now = Date.now();
  const cached = cache.get(key);
  const today = new Date().toLocaleDateString('en-CA');
  const ttl = options.date === today ? CURRENT_TTL_MS : HISTORY_TTL_MS;
  if (!options.forceRefresh && cached && now - cached.ts < ttl) return cached.data;
  const params = {
    date: options.date,
    shift: options.shift || 'all',
    force_refresh: Boolean(options.forceRefresh),
  };
  const { data } = await api.get('/water/shifts', { params, timeout: 30000 });
  cache.set(key, { ts: now, ttl, data });
  return data;
}


export async function fetchWaterReportCatalog(options = {}) {
  const { data } = await api.get('/water/reports/catalog', { params: buildParams(options) });
  return data;
}

export async function fetchWaterSources() {
  const { data } = await api.get('/water/sources');
  return data;
}

export async function validateWaterSource(file) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/water/sources/validate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function uploadWaterSource(file, activate = true) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post(`/water/sources/upload?activate=${activate}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  clearWaterCache();
  return data;
}

export async function activateWaterSource(sourceId) {
  const { data } = await api.post(`/water/sources/${sourceId}/activate`);
  clearWaterCache();
  return data;
}
