import api from './api';

interface DailyWaterReportFilters {
  date?: string;
  startDate?: string;
  endDate?: string;
}

export async function getDailyWaterReport({ date, startDate, endDate }: DailyWaterReportFilters = {}): Promise<unknown> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const { data } = await api.get<unknown>(`/water/reports/daily${suffix}`);
  return data;
}
