import api from './api';
function params(filters = {}) { return { date: filters.date, start_date: filters.startDate, end_date: filters.endDate }; }
export async function fetchDailyWaterReport(filters = {}) { const { data } = await api.get('/water/reports/daily', { params: params(filters), timeout: 30000 }); return data; }
export async function downloadDailyWaterReportPdf(filters = {}) { const response = await api.get('/water/reports/daily/pdf', { params: params(filters), responseType: 'blob', timeout: 30000 }); download(response.data, dispositionFilename(response.headers['content-disposition']) || 'reporte-diario-control-hidrico-durango.pdf'); }
export async function downloadDailyWaterReportExcel(filters = {}) { const response = await api.get('/water/reports/daily/excel', { params: params(filters), responseType: 'blob', timeout: 30000 }); download(response.data, dispositionFilename(response.headers['content-disposition']) || 'reporte-diario-control-hidrico-durango.xlsx'); }
export async function sendDailyWaterReportEmail(payload) { const { data } = await api.post('/water/reports/daily/email', payload, { timeout: 45000 }); return data; }
function dispositionFilename(value) { const match=String(value||'').match(/filename="?([^";]+)"?/i); return match?.[1]; }
function download(blob, filename) { const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
