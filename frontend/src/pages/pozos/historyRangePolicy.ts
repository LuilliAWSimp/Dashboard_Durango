import type { HistoryAggregation } from './types';

export const HISTORY_MAX_RANGE_DAYS: Record<HistoryAggregation, number> = {
  minute: 1,
  quarter_hour: 7,
  hourly: 31,
  daily: 366,
};

function utcDayToken(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').slice(0, 10));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const token = Date.UTC(year, month - 1, day);
  const parsed = new Date(token);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return token;
}

export function inclusiveHistoryRangeDays(startDate: string, endDate: string): number {
  const start = utcDayToken(startDate);
  const end = utcDayToken(endDate);
  if (start === null || end === null) return 1;
  return Math.max(1, Math.floor(Math.abs(end - start) / 86400000) + 1);
}

export function isHistoryAggregationSupported(aggregation: HistoryAggregation, startDate: string, endDate: string): boolean {
  return inclusiveHistoryRangeDays(startDate, endDate) <= HISTORY_MAX_RANGE_DAYS[aggregation];
}

export function supportedHistoryAggregation(current: HistoryAggregation, startDate: string, endDate: string): HistoryAggregation {
  const days = inclusiveHistoryRangeDays(startDate, endDate);
  if (days <= HISTORY_MAX_RANGE_DAYS[current]) return current;
  if (days <= HISTORY_MAX_RANGE_DAYS.quarter_hour) return 'quarter_hour';
  if (days <= HISTORY_MAX_RANGE_DAYS.hourly) return 'hourly';
  return 'daily';
}
