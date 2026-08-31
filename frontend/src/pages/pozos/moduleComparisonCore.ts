export type ComparisonMetric = 'flow' | 'totalizer' | 'both';
export type OperationalIdentity = number | string;

export interface ComparisonRow extends Record<string, unknown> {
  timestamp: number;
  bucketStart: string;
  bucketEnd: string;
  tooltipAnchor: number;
}

interface ComparisonPoint {
  bucket_start: string;
  bucket_end: string;
  data_status?: string;
  flow_avg_lps?: number | null;
  flow_active_avg_lps?: number | null;
  flow_min_lps?: number | null;
  flow_max_lps?: number | null;
  totalizer_close_m3?: number | null;
  active_minutes?: number;
  samples?: number;
  samples_expected?: number;
  coverage_percent?: number;
  coverage_status?: string;
  interval_state?: string;
  validation?: string;
  validation_status?: string;
  discarded_totalizer_events?: number;
  discarded_volume_m3?: number;
  has_discontinuities?: boolean;
}

interface ComparisonSeries {
  sensor_id?: number | null;
  operational_key?: string;
  points: ComparisonPoint[];
}

interface ComparisonResponse { series?: ComparisonSeries[]; }

function seriesIdentity(item: ComparisonSeries): OperationalIdentity {
  return item.sensor_id ?? String(item.operational_key || '');
}

export function buildComparisonRows(data: ComparisonResponse | null, now = Date.now()): ComparisonRow[] {
  if (!data?.series?.length) return [];
  const byTime = new Map<string, ComparisonRow>();
  data.series.forEach((series) => series.points.forEach((point) => {
    const timestamp = new Date(point.bucket_start).getTime();
    if (point.data_status === 'future_interval' || !Number.isFinite(timestamp) || timestamp > now) return;
    const key = point.bucket_start;
    const row = byTime.get(key) || { timestamp, bucketStart: point.bucket_start, bucketEnd: point.bucket_end, tooltipAnchor: 0 };
    const identity = seriesIdentity(series);
    row[`flow_${identity}`] = point.flow_avg_lps;
    row[`totalizer_${identity}`] = point.totalizer_close_m3;
    row[`meta_${identity}`] = {
      flowActiveAvg: point.flow_active_avg_lps,
      flowMin: point.flow_min_lps,
      flowMax: point.flow_max_lps,
      totalizer: point.totalizer_close_m3,
      activeMinutes: point.active_minutes,
      samples: point.samples,
      samplesExpected: point.samples_expected,
      coveragePercent: point.coverage_percent,
      coverageStatus: point.coverage_status,
      intervalState: point.interval_state,
      validation: point.validation,
      validationStatus: point.validation_status,
      status: point.data_status,
      discardedEvents: point.discarded_totalizer_events || 0,
      discardedVolume: point.discarded_volume_m3 || 0,
      hasDiscontinuities: Boolean(point.has_discontinuities),
    };
    byTime.set(key, row);
  }));
  const rows = [...byTime.values()].sort((left, right) => left.timestamp - right.timestamp);
  data.series.forEach((series) => {
    const identity = seriesIdentity(series);
    let baseline: number | null = null;
    rows.forEach((row) => {
      const absolute = row[`totalizer_${identity}`];
      const numeric = absolute === null || absolute === undefined || absolute === '' ? null : Number(absolute);
      if (numeric !== null && Number.isFinite(numeric) && baseline === null) baseline = numeric;
      row[`totalizer_delta_${identity}`] = numeric !== null && Number.isFinite(numeric) && baseline !== null
        ? numeric - baseline
        : null;
    });
  });
  return rows;
}

export function comparisonAxis(metric: ComparisonMetric) {
  return {
    showFlow: metric === 'flow' || metric === 'both',
    showTotalizer: metric === 'totalizer' || metric === 'both',
    independentAxes: metric === 'both',
  };
}

export function toggleComparisonSelection(current: OperationalIdentity[], identity: OperationalIdentity): OperationalIdentity[] {
  return current.includes(identity) ? current.filter((value) => value !== identity) : [...current, identity];
}
