export type ReportMode = 'day' | 'range';

export interface ReportFilters {
  date?: string;
  startDate?: string;
  endDate?: string;
}

function orderedRange(startDate: string, endDate: string): [string, string] {
  return startDate && endDate && startDate > endDate ? [endDate, startDate] : [startDate, endDate];
}

export function normalizeReportFilters(mode: ReportMode, date: string, startDate: string, endDate: string): ReportFilters {
  if (mode === 'day') return { date };
  const [from, to] = orderedRange(startDate, endDate);
  return { startDate: from, endDate: to };
}

export function reportFiltersKey(filters: ReportFilters): string {
  if (filters.date) return `day:${filters.date}`;
  return `range:${filters.startDate || ''}:${filters.endDate || ''}`;
}

export function sameReportFilters(left: ReportFilters, right: ReportFilters): boolean {
  return reportFiltersKey(left) === reportFiltersKey(right);
}

export function reportFiltersIncludeDate(filters: ReportFilters, date: string): boolean {
  if (filters.date) return filters.date === date;
  const from = filters.startDate || '';
  const to = filters.endDate || from;
  return Boolean(from && to && from <= date && date <= to);
}
