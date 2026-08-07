import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import useAutoRefresh from '../../../hooks/useAutoRefresh';
import { fetchWaterHistory } from '../../../services/waterService';
import { defaultTodayRange, rangeIncludesToday, recommendedHistoryAggregation } from '../dateUtils';
import type { DateRange, HistoryAggregation, WaterHistoryResponse } from '../types';

interface UseWaterHistoryOptions {
  module: 'well' | 'line' | 'flow';
  sensorId?: number | string | null;
  initialRangeFactory?: () => DateRange;
  initialAggregation?: HistoryAggregation;
}
export interface UseWaterHistoryResult { draftRange: DateRange; setDraftRange: Dispatch<SetStateAction<DateRange>>; range: DateRange; aggregation: HistoryAggregation; setAggregation: (value: HistoryAggregation) => void; data: WaterHistoryResponse | null; error: string; loading: boolean; refreshing: boolean; apply: () => void; reset: () => void; }
function detailFromError(error: unknown): string { if (error && typeof error === 'object') { const candidate = error as { message?: unknown; code?: unknown; response?: { data?: { detail?: unknown }; status?: number } }; if (candidate.response?.status === 504 || candidate.code === 'ECONNABORTED' || String(candidate.message || '').toLowerCase().includes('timeout')) return 'La consulta tardó demasiado. Reduce el rango o utiliza agrupación diaria.'; const detail = candidate.response?.data?.detail; if (typeof detail === 'string' && detail.trim()) return detail; if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message; } return 'No fue posible consultar el histórico de planta.'; }

export default function useWaterHistory({
  module,
  sensorId,
  initialRangeFactory = defaultTodayRange,
  initialAggregation,
}: UseWaterHistoryOptions): UseWaterHistoryResult {
  const initialRange = useMemo(() => initialRangeFactory(), [initialRangeFactory]);
  const [draftRange, setDraftRange] = useState<DateRange>(initialRange);
  const [range, setRange] = useState<DateRange>(initialRange);
  const [aggregation, setAggregationState] = useState<HistoryAggregation>(
    () => initialAggregation || recommendedHistoryAggregation(initialRange),
  );
  const [data, setData] = useState<WaterHistoryResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const manualAggregation = useRef(Boolean(initialAggregation));
  const dataRef = useRef<WaterHistoryResponse | null>(null);
  const requestIdRef = useRef(0);
  const inFlightIdentityRef = useRef('');
  const lastSensorIdentityRef = useRef('');

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => {
    const identity = `${module}:${sensorId || ''}`;
    if (lastSensorIdentityRef.current && lastSensorIdentityRef.current !== identity) {
      setData(null);
      dataRef.current = null;
    }
    lastSensorIdentityRef.current = identity;
  }, [module, sensorId]);
  useEffect(() => { if (!manualAggregation.current) setAggregationState(recommendedHistoryAggregation(draftRange)); }, [draftRange.startDate, draftRange.endDate]);

  const load = useCallback(async (forceRefresh = false, background = false) => {
    if (!sensorId || !range.startDate || !range.endDate) return;
    const identity = `${module}:${sensorId}:${range.startDate}:${range.endDate}:${aggregation}`;
    if (inFlightIdentityRef.current === identity) return;
    inFlightIdentityRef.current = identity;
    const requestId = ++requestIdRef.current;
    if (!dataRef.current) setLoading(true); else if (background) setRefreshing(true);
    if (!background) setError('');
    try {
      const response = await fetchWaterHistory({ module, sensorId, startDate: range.startDate, endDate: range.endDate, aggregation, forceRefresh });
      if (requestId !== requestIdRef.current) return;
      setData(response); setError('');
    } catch (fetchError: unknown) {
      if (requestId !== requestIdRef.current) return;
      setError(detailFromError(fetchError));
    } finally {
      if (requestId === requestIdRef.current) { setLoading(false); setRefreshing(false); }
      if (inFlightIdentityRef.current === identity) inFlightIdentityRef.current = '';
    }
  }, [module, sensorId, range.startDate, range.endDate, aggregation]);

  useEffect(() => { load(Boolean(range.refreshKey), false); }, [load, range.refreshKey]);
  useAutoRefresh(Boolean(sensorId && rangeIncludesToday(range)), () => load(true, true));

  const setAggregation = (value: HistoryAggregation) => { manualAggregation.current = true; setAggregationState(value); };
  const apply = () => setRange((previous) => ({ ...draftRange, refreshKey: Number(previous.refreshKey || 0) + 1 }));
  const reset = () => { const next = initialRangeFactory(); manualAggregation.current = Boolean(initialAggregation); setDraftRange(next); setAggregationState(initialAggregation || recommendedHistoryAggregation(next)); setRange((previous) => ({ ...next, refreshKey: Number(previous.refreshKey || 0) + 1 })); };
  return { draftRange, setDraftRange, range, aggregation, setAggregation, data, error, loading, refreshing, apply, reset };
}
