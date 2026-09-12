import api from './api';

export interface ModuleHistoryPdfSeries {
  key: string;
  name: string;
  metric: 'flow' | 'totalizer';
  unit: string;
  color: string;
}

export interface ModuleHistoryPdfPayload {
  module_label: string;
  metric_label: string;
  aggregation_label: string;
  start_date: string;
  end_date: string;
  selected_names: string[];
  rows: Record<string, unknown>[];
  series: ModuleHistoryPdfSeries[];
}

function downloadBlobResponse(response: { data: Blob; headers?: Record<string, unknown> }, fallbackFilename: string): void {
  const blob = new Blob([response.data], { type: 'application/pdf' });
  const contentDisposition = String(response.headers?.['content-disposition'] || '');
  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  const filename = filenameMatch?.[1] || fallbackFilename;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function token(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function downloadWaterModuleHistoryPdf(payload: ModuleHistoryPdfPayload): Promise<void> {
  const response = await api.post<Blob>('/water/history/module/pdf', payload, {
    responseType: 'blob',
    timeout: 30_000,
  });
  const fallback = [
    'historico-operativo-durango',
    token(payload.module_label),
    token(payload.metric_label),
    payload.start_date,
    payload.end_date,
    token(payload.aggregation_label),
  ].filter(Boolean).join('_');
  downloadBlobResponse(response, `${fallback}.pdf`);
}
