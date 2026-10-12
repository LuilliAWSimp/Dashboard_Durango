import type { DateRange, WaterHistoryPoint } from './types';
import type { OperationalIdentity } from './moduleComparison';

export interface DetailHistoryPeriodSummary {
  identity: OperationalIdentity;
  loading: boolean;
  intervalLabel: string;
  flowAverage: number | null;
  volumeM3: number | null;
  error: string;
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function summarizeDetailHistory(points: WaterHistoryPoint[] = []) {
  let weightedFlow = 0;
  let flowWeight = 0;
  let volumeM3 = 0;
  let hasVolume = false;

  points.forEach((point) => {
    if (point.data_status === 'future_interval') return;
    const flow = numeric(point.flow_avg_lps);
    const received = numeric(point.samples_received);
    const samples = numeric(point.samples);
    const weight = received !== null && received > 0
      ? received
      : samples !== null && samples > 0
        ? samples
        : 0;
    if (flow !== null && weight > 0) {
      weightedFlow += flow * weight;
      flowWeight += weight;
    }

    const volume = numeric(point.volume_m3);
    if (volume !== null) {
      volumeM3 += volume;
      hasVolume = true;
    }
  });

  return {
    flowAverage: flowWeight > 0 ? weightedFlow / flowWeight : null,
    volumeM3: hasVolume ? volumeM3 : null,
    flowSamples: flowWeight,
  };
}

function dateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function dateOnly(value: string): string {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function detailHistoryIntervalLabel(points: WaterHistoryPoint[] = [], range?: DateRange): string {
  const available = points
    .filter((point) => point.data_status !== 'future_interval')
    .filter((point) => Number.isFinite(new Date(point.bucket_start).getTime()))
    .sort((left, right) => new Date(left.bucket_start).getTime() - new Date(right.bucket_start).getTime());

  if (available.length) {
    const first = available[0];
    const last = available[available.length - 1];
    return `del ${dateTime(first.bucket_start)} al ${dateTime(last.bucket_end || last.bucket_start)}`;
  }

  const start = String(range?.startDate || '');
  const end = String(range?.endDate || start);
  if (!start) return 'Periodo sin fecha disponible';
  return start === end
    ? `día ${dateOnly(start)}`
    : `del ${dateOnly(start)} al ${dateOnly(end)}`;
}
