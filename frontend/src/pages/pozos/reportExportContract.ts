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


/** DGO-V07A: los archivos se generan con la seleccion visible, no con la ultima vista previa. */
function parseIsoDate(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 2000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? timestamp : null;
}

export function isValidReportFilters(filters: ReportFilters): boolean {
  if (filters.date !== undefined) {
    return parseIsoDate(filters.date) !== null && !filters.startDate && !filters.endDate;
  }
  const from = parseIsoDate(filters.startDate);
  const to = parseIsoDate(filters.endDate);
  return from !== null && to !== null && from <= to;
}

export function isExtendedReportRange(filters: ReportFilters): boolean {
  if (!isValidReportFilters(filters) || filters.date) return false;
  const from = parseIsoDate(filters.startDate)!;
  const to = parseIsoDate(filters.endDate)!;
  return (to - from) / 86400000 + 1 > 7;
}

export function reportFiltersLabel(filters: ReportFilters): string {
  const formatted = (value: string) => {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  };
  if (!isValidReportFilters(filters)) return 'Selecciona un periodo válido';
  if (filters.date) return formatted(filters.date);
  return `${formatted(filters.startDate!)} al ${formatted(filters.endDate!)}`;
}
