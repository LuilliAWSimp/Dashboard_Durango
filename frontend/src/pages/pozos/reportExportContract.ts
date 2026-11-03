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

/** DGO-V07: un mes calendario completo puede exportarse aun si la vista previa expira. */
export function isCompleteCalendarMonth(filters: ReportFilters): boolean {
  const from = filters.startDate || '';
  const to = filters.endDate || '';
  const match = /^(\d{4})-(\d{2})-01$/.exec(from);
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 9999) return false;
  const finalDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return to === `${match[1]}-${match[2]}-${String(finalDay).padStart(2, '0')}`;
}
