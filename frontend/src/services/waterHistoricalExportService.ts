import { runBackgroundReportExport } from './reportExportJobService';

type HistoricalFormat = 'excel' | 'pdf';

export type HistoricalExportOptions = {
  startDate?: string;
  endDate?: string;
};

async function downloadHistorical(format: HistoricalFormat, options: HistoricalExportOptions = {}, onProgress?: (job: any) => void): Promise<void> {
  return runBackgroundReportExport(
    format === 'excel' ? 'historical_excel' : 'historical_pdf',
    { start_date: options.startDate || undefined, end_date: options.endDate || undefined },
    onProgress,
  );
}

export function downloadFullHistoricalExcel(options: HistoricalExportOptions = {}, onProgress?: (job: any) => void): Promise<void> {
  return downloadHistorical('excel', options, onProgress);
}

export function downloadFullHistoricalPdf(options: HistoricalExportOptions = {}, onProgress?: (job: any) => void): Promise<void> {
  return downloadHistorical('pdf', options, onProgress);
}
