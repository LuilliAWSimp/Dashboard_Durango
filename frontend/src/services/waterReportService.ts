import api from './api';

export interface DailyReportFilters { date?: string; startDate?: string; endDate?: string; }
function params(filters: DailyReportFilters = {}) { return { date: filters.date, start_date: filters.startDate, end_date: filters.endDate }; }
export async function fetchDailyWaterReport(filters: DailyReportFilters = {}) { const { data } = await api.get('/water/reports/daily', { params: params(filters), timeout: 30_000 }); return data; }
export async function downloadDailyWaterReportPdf(filters: DailyReportFilters = {}) { const response = await api.get('/water/reports/daily/pdf', { params: params(filters), responseType: 'blob', timeout: 30_000 }); download(response.data, dispositionFilename(response.headers['content-disposition']) || 'reporte-diario-control-hidrico-durango.pdf'); }
export async function downloadDailyWaterReportExcel(filters: DailyReportFilters = {}) { const response = await api.get('/water/reports/daily/excel', { params: params(filters), responseType: 'blob', timeout: 30_000 }); download(response.data, dispositionFilename(response.headers['content-disposition']) || 'reporte-diario-control-hidrico-durango.xlsx'); }
export async function sendDailyWaterReportEmail(payload: Record<string, unknown>) { const { data } = await api.post('/water/reports/daily/email', payload, { timeout: 45_000 }); return data; }
function dispositionFilename(value?: string) { const match=String(value||'').match(/filename="?([^";]+)"?/i); return match?.[1]; }
function download(blob: Blob, filename: string) { const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
