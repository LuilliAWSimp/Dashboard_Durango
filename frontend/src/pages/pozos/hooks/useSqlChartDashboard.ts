import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { fetchWaterDashboard } from '../../../services/waterService';
import { dateRangePeriod, defaultTodayRange, todayInputDate } from '../dateUtils';
import type { DateRange } from '../types';

const AUTO_REFRESH_MS = 60_000;

function errorMessage(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}

function includesToday(range: DateRange): boolean {
  const today = todayInputDate();
  const start = String(range.startDate || range.endDate || '');
  const end = String(range.endDate || range.startDate || '');
  return Boolean(start && end && start <= today && today <= end);
}

export interface UseSqlChartDashboardOptions {
  includeHistory?: boolean;
  includeEnergyWater?: boolean;
  forceRefresh?: boolean;
  autoRefresh?: boolean;
}

export interface UseSqlChartDashboardResult {
  draftRange: DateRange;
  setDraftRange: Dispatch<SetStateAction<DateRange>>;
  range: DateRange;
  setRange: Dispatch<SetStateAction<DateRange>>;
  dashboard: unknown | null;
  error: string;
  loading: boolean;
  refreshing: boolean;
  lastRefreshAt: number | null;
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
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const inFlightIdentityRef = useRef('');
  const requestIdRef = useRef(0);
  const dashboardRef = useRef<unknown | null>(null);

  useEffect(() => {
    dashboardRef.current = dashboard;
  }, [dashboard]);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const load = useCallback(async (kind: 'initial' | 'manual' | 'auto' = 'initial') => {
    const identity = [section, range.startDate || '', range.endDate || '', dateRangePeriod(range)].join(':');
    if (inFlightIdentityRef.current === identity) return;
    inFlightIdentityRef.current = identity;
    const requestId = ++requestIdRef.current;
    const hasData = dashboardRef.current !== null;
    if (!hasData) setLoading(true);
    else setRefreshing(true);
    if (kind !== 'auto') setError('');
    try {
      const data = await fetchWaterDashboard(section, {
        ...range,
        period: dateRangePeriod(range),
        include_history: Boolean(options.includeHistory),
        include_energy_water: Boolean(options.includeEnergyWater),
        force_refresh: kind === 'manual',
      });
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setDashboard(data);
      setError('');
      setLastRefreshAt(Date.now());
    } catch (fetchError: unknown) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError(errorMessage(fetchError) || 'No se pudo leer la información operativa');
      // Conservar la última respuesta válida. Nunca vaciar tarjetas o gráficas
      // por una falla temporal de actualización.
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      if (inFlightIdentityRef.current === identity) inFlightIdentityRef.current = '';
    }
  }, [section, range.startDate, range.endDate, range.refreshKey, options.includeHistory, options.includeEnergyWater]);

  useEffect(() => {
    load(Number(range.refreshKey || 0) > 0 ? 'manual' : 'initial');
  }, [load]);

  useEffect(() => {
    if (!options.autoRefresh || !includesToday(range)) return undefined;
    const refreshIfVisible = () => {
      if (!document.hidden) load('auto');
    };
    const interval = window.setInterval(refreshIfVisible, AUTO_REFRESH_MS);
    const onVisibility = () => {
      if (!document.hidden) load('manual');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load, range.startDate, range.endDate, options.autoRefresh]);

  const apply = () => {
    setRange((previous) => ({ ...draftRange, refreshKey: Number(previous.refreshKey || 0) + 1 }));
  };
  const reset = () => {
    const next = defaultTodayRange();
    setDraftRange(next);
    setRange((previous) => ({ ...next, refreshKey: Number(previous.refreshKey || 0) + 1 }));
  };

  return { draftRange, setDraftRange, range, setRange, dashboard, error, loading, refreshing, lastRefreshAt, apply, reset };
}
