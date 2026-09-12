import api from './api';

type HistoricalFormat = 'excel' | 'pdf';

export type HistoricalExportOptions = {
  startDate?: string;
  endDate?: string;
};

function filenameFromDisposition(disposition: string | undefined, fallback: string): string {
  if (!disposition) return fallback;
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) return decodeURIComponent(utf8[1].replace(/["']/g, ''));
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  return plain?.[1] || fallback;
}

async function downloadHistorical(format: HistoricalFormat, options: HistoricalExportOptions = {}): Promise<void> {
  const response = await api.get<Blob>(`/water/reports/historical/${format}`, {
    params: {
      start_date: options.startDate || undefined,
      end_date: options.endDate || undefined,
    },
    responseType: 'blob',
  });
  const extension = format === 'excel' ? 'xlsx' : 'pdf';
  const fallback = `Historico_Completo_Durango.${extension}`;
  const filename = filenameFromDisposition(response.headers?.['content-disposition'], fallback);
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadFullHistoricalExcel(options: HistoricalExportOptions = {}): Promise<void> {
  return downloadHistorical('excel', options);
}

export function downloadFullHistoricalPdf(options: HistoricalExportOptions = {}): Promise<void> {
  return downloadHistorical('pdf', options);
}
