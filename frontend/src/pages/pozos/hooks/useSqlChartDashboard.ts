import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { clearWaterCache, fetchWaterDashboard } from '../../../services/waterService';
import { dateRangePeriod, defaultTodayRange } from '../dateUtils';
import type { DateRange } from '../types';

function errorMessage(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}

export interface UseSqlChartDashboardOptions {
  includeHistory?: boolean;
  includeEnergyWater?: boolean;
  forceRefresh?: boolean;
}

export interface UseSqlChartDashboardResult {
  draftRange: DateRange;
  setDraftRange: Dispatch<SetStateAction<DateRange>>;
  range: DateRange;
  setRange: Dispatch<SetStateAction<DateRange>>;
  dashboard: unknown | null;
  error: string;
  loading: boolean;
  apply: () => void;
  reset: () => void;
}

export default function useSqlChartDashboard(
  section = 'dashboard',
  initialRangeFactory: () => DateRange = defaultTodayRange,
  options: UseSqlChartDashboardOptions = {},
): UseSqlChartDashboardResult {
  const [draftRange, setDraftRange] = useState(initialRangeFactory);
  const [range, setRange] = useState(initialRangeFactory);
  const [dashboard, setDashboard] = useState<unknown | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    fetchWaterDashboard(section, {
      ...range,
      period: dateRangePeriod(range),
      include_history: Boolean(options.includeHistory),
      include_energy_water: Boolean(options.includeEnergyWater),
      force_refresh: Boolean(options.forceRefresh && range.refreshKey),
    })
      .then((data) => { if (mounted) setDashboard(data); })
      .catch((fetchError: unknown) => {
        if (mounted) {
          setError(errorMessage(fetchError) || 'No se pudo leer la información operativa');
          setDashboard(null);
        }
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [section, range.startDate, range.endDate, range.refreshKey, options.includeHistory, options.includeEnergyWater, options.forceRefresh]);

  const apply = () => {
    clearWaterCache();
    setRange((previous) => ({ ...draftRange, refreshKey: (previous.refreshKey || 0) + 1 }));
  };
  const reset = () => {
    clearWaterCache();
    const next = defaultTodayRange();
    setDraftRange(next);
    setRange((previous) => ({ ...next, refreshKey: (previous.refreshKey || 0) + 1 }));
  };

  return { draftRange, setDraftRange, range, setRange, dashboard, error, loading, apply, reset };
}
