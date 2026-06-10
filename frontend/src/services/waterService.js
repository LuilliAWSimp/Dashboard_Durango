import api from './api';

const cache = new Map();
const TTL_MS = 30 * 1000;

function buildParams(options = {}) {
  const params = {};
  if (options.startDate || options.start_date) params.start_date = options.startDate || options.start_date;
  if (options.endDate || options.end_date) params.end_date = options.endDate || options.end_date;
  if (options.period) params.period = String(options.period);
  if (options.include_history !== undefined) params.include_history = Boolean(options.include_history);
  if (options.includeHistory !== undefined) params.include_history = Boolean(options.includeHistory);
  if (options.include_energy_water !== undefined) params.include_energy_water = Boolean(options.include_energy_water);
  if (options.includeEnergyWater !== undefined) params.include_energy_water = Boolean(options.includeEnergyWater);
  if (options.force_refresh !== undefined) params.force_refresh = Boolean(options.force_refresh);
  if (options.forceRefresh !== undefined) params.force_refresh = Boolean(options.forceRefresh);
  return params;
}

function cacheKey(section, options = {}) {
  const params = buildParams(options);
  return `${section}:${params.start_date || ''}:${params.end_date || ''}:${params.period || ''}:${params.include_history ? 'history' : 'current'}:${params.include_energy_water ? 'energy' : 'noenergy'}`;
}

export function clearWaterCache() {
  cache.clear();
}

export async function fetchWaterDashboard(section = 'dashboard', options = {}) {
  const key = cacheKey(section, options);
  const now = Date.now();
  const params = buildParams(options);
  const forceRefresh = Boolean(params.force_refresh);
  const cached = cache.get(key);
  if (!forceRefresh && cached && now - cached.ts < TTL_MS) return cached.data;
  const { data } = await api.get(`/water/dashboard/${section}`, { params });
  cache.set(key, { ts: now, data });
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
