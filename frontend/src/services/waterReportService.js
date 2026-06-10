
import api from './api';

export async function getDailyWaterReport({ date, startDate, endDate } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const { data } = await api.get(`/water/reports/daily${suffix}`);
  return data;
}
