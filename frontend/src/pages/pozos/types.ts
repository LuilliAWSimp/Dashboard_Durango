export type Period = 'quarter_hour' | 'hourly' | 'daily' | 'monthly';
export type HistoryAggregation = 'quarter_hour' | 'hourly' | 'daily';
export type FlexibleRecord = Record<string, unknown>;

export interface StatusFromFlowResult {
  status: string;
  statusType: string;
}

export interface DateRange extends FlexibleRecord {
  startDate?: string;
  endDate?: string;
  refreshKey?: number;
}

export interface WaterHistoryPoint extends FlexibleRecord {
  sensor_id: number;
  bucket_start: string;
  bucket_end: string;
  aggregation: HistoryAggregation;
  samples: number;
  flow_avg_lps: number | null;
  flow_min_lps: number | null;
  flow_max_lps: number | null;
  totalizer_open_m3: number | null;
  totalizer_close_m3: number | null;
  volume_m3: number | null;
  validated_volume_m3?: number | null;
  discarded_volume_m3?: number;
  discarded_totalizer_events?: number;
  discarded_totalizer_event_details?: FlexibleRecord[];
  has_discontinuities?: boolean;
  volume_reliable: boolean;
  data_status: 'operational' | 'zero_consumption' | 'no_data' | 'invalid_totalizer' | 'stale_data' | 'no_history';
}

export interface WaterHistoryResponse extends FlexibleRecord {
  module: 'well' | 'line' | 'flow';
  sensor_id: number;
  name: string;
  flow_unit?: string;
  start_date: string;
  end_date: string;
  aggregation: HistoryAggregation;
  source_status: string;
  has_data: boolean;
  points: WaterHistoryPoint[];
}

export interface DashboardData extends FlexibleRecord {
  aggregation?: string;
  date_range?: FlexibleRecord;
  wells?: FlexibleRecord[];
  production_lines?: FlexibleRecord[];
  flows?: FlexibleRecord[];
  tank_inputs?: FlexibleRecord[];
  entry_vs_exit?: FlexibleRecord[];
  operational_summary?: FlexibleRecord;
  period_data?: FlexibleRecord;
  updated_at?: unknown;
  source_status?: unknown;
}

export interface NormalizedWaterItem extends FlexibleRecord {
  sensor_id?: number;
  id?: unknown;
  numero?: unknown;
  nombre?: unknown;
  name?: unknown;
  ubicacion?: unknown;
  status?: unknown;
  statusType?: unknown;
  estado_comunicacion?: unknown;
  communicationType?: unknown;
  flow_unit?: string;
  current_flow?: number | null;
  flow_lps?: number | null;
  totalizador_m3?: number | null;
  current_totalizer_m3?: number | null;
  previous_close_m3?: number | null;
  period_open_m3?: number | null;
  period_close_m3?: number | null;
  period_m3?: number | null;
  period_delta_m3?: number | null;
  period_m3_reliable?: boolean;
  validated_volume_m3?: number | null;
  discarded_volume_m3?: number;
  discarded_totalizer_events?: number;
  discarded_totalizer_event_details?: FlexibleRecord[];
  has_discontinuities?: boolean;
  volume_reliable?: boolean;
  volume_display_label?: string;
  today_accumulated_m3?: number | null;
  activity?: string;
  activity_status?: string;
  data_status?: string;
  communication?: string;
  last_update?: string | null;
  ultima_lectura?: string | null;
}

export interface ChartDataPoint extends FlexibleRecord {
  bucket?: unknown;
  timestamp?: number;
  label?: unknown;
  flujo?: number | null;
  flow?: number | null;
  volumen?: number | null;
  volume?: number | null;
}

export interface ShiftElement extends FlexibleRecord {
  sensor_id: number;
  name: string;
  module: 'well' | 'line' | 'flow';
  flow_unit?: string;
  period_open_m3: number | null;
  period_close_m3: number | null;
  period_m3: number | null;
  period_m3_reliable: boolean;
  validated_volume_m3?: number | null;
  discarded_volume_m3?: number;
  discarded_totalizer_events?: number;
  has_discontinuities?: boolean;
  flow_avg: number | null;
  flow_min: number | null;
  flow_max: number | null;
  samples: number;
  activity: string;
  data_status: string;
  communication: string;
  last_update: string | null;
}

export interface ShiftSummary extends FlexibleRecord {
  total_m3: number | null;
  active_count: number;
  inactive_count: number;
  review_count: number;
  coverage_available: number;
  coverage_total: number;
}

export interface WaterShift extends FlexibleRecord {
  id: 'shift_1' | 'shift_2' | 'shift_3';
  name: string;
  label: string;
  schedule: string;
  start_at: string;
  end_at: string;
  effective_end_at?: string;
  cut_status: 'Cierre definitivo' | 'Corte parcial' | 'Pendiente';
  wells: ShiftElement[];
  lines: ShiftElement[];
  flows: ShiftElement[];
  summary: {
    wells: ShiftSummary;
    lines: ShiftSummary;
    flows: ShiftSummary;
    total_operational_m3: number | null;
  };
}

export interface WaterShiftsResponse extends FlexibleRecord {
  plant: string;
  date: string;
  generated_at: string;
  source_status: string;
  selected_shift?: string;
  shifts: WaterShift[];
}

export interface WaterModuleHistorySeries extends FlexibleRecord {
  sensor_id: number;
  name: string;
  flow_unit?: string;
  source_status: string;
  has_data: boolean;
  points: WaterHistoryPoint[];
}

export interface WaterModuleHistoryResponse extends FlexibleRecord {
  module: 'well' | 'line' | 'flow';
  start_date: string;
  end_date: string;
  aggregation: HistoryAggregation;
  source_status: string;
  series: WaterModuleHistorySeries[];
}

export interface WellMinuteFlowPoint extends FlexibleRecord {
  timestamp: string;
  flow_value: number | null;
  samples: number;
  data_status: 'operational' | 'no_data';
}

export interface WellMinuteFlowSeries extends FlexibleRecord {
  sensor_id: number;
  name: string;
  flow_unit?: string;
  source_status: string;
  has_data: boolean;
  points: WellMinuteFlowPoint[];
}

export interface WellsMinuteFlowResponse extends FlexibleRecord {
  start_datetime: string;
  end_datetime: string;
  source_status: string;
  series: WellMinuteFlowSeries[];
}
