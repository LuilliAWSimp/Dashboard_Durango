import { runBackgroundReportExport } from './reportExportJobService';
import api from './api';
function params(filters = {}, options = {}) { return { date: filters.date, start_date: filters.startDate, end_date: filters.endDate, include_history: options.includeHistory, include_shifts: options.includeShifts }; }
export async function fetchDailyWaterReport(filters = {}, options = {}) { const { data } = await api.get('/water/reports/daily', { params: params(filters, options), timeout: 120000 }); return data; }
export async function fetchDailyWaterReportPreview(filters = {}) { return fetchDailyWaterReport(filters, { includeHistory: false, includeShifts: false }); }
export async function downloadDailyWaterReportPdf(filters = {}, onProgress) { return runBackgroundReportExport('daily_pdf', params(filters), onProgress); }
export async function downloadDailyWaterReportExcel(filters = {}, onProgress) { return runBackgroundReportExport('daily_excel', params(filters), onProgress); }
export async function sendDailyWaterReportEmail(payload) { const { data } = await api.post('/water/reports/daily/email', payload, { timeout: 180000 }); return data; }
