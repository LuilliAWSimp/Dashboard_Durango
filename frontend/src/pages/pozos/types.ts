export type Period = 'hourly' | 'daily' | 'monthly';

export type FlexibleRecord = Record<string, unknown>;

export interface DateRange extends FlexibleRecord {
  startDate?: string;
  endDate?: string;
  refreshKey?: number;
}

export interface StatusFromFlowResult {
  status: string;
  statusType: string;
}

export interface DashboardData extends FlexibleRecord {
  aggregation?: string;
  date_range?: FlexibleRecord;
  energy_water_rows?: FlexibleRecord[];
  wells?: FlexibleRecord[];
  well_flow_history?: FlexibleRecord[];
  entry_vs_exit?: FlexibleRecord[];
  tank_inputs?: FlexibleRecord[];
  tank_level_readings?: FlexibleRecord[];
  tank_level_history?: FlexibleRecord[];
  tank_level_columns?: FlexibleRecord[];
  production_lines?: FlexibleRecord[];
  production_line_history?: FlexibleRecord[];
  flows?: FlexibleRecord[];
  flow_history?: FlexibleRecord[];
  water_consumption?: FlexibleRecord[];
  distribution_flows?: FlexibleRecord[];
}

export interface ChartDataPoint extends FlexibleRecord {
  bucket?: unknown;
  hour?: unknown;
  time?: unknown;
  name?: unknown;
  fullName?: unknown;
  label?: unknown;
  agua?: number;
  energia?: number;
  entrada?: number;
  salida?: number;
  diferencia?: number;
  flujo?: number;
  flow?: number;
  flowAvg?: number;
  amps?: number | null;
  efficiency?: number | null | unknown;
  loadFactor?: null;
  volumen?: number;
  total?: number;
  totalizador?: number;
  value?: number;
}

export interface NormalizedWaterItem extends FlexibleRecord {
  id?: unknown;
  numero?: unknown;
  nombre?: unknown;
  name?: unknown;
  ubicacion?: unknown;
  status?: unknown;
  statusType?: unknown;
  estado_comunicacion?: unknown;
  communicationType?: unknown;
  flujo_salida?: number;
  flujo_entrada?: number;
  flow?: number;
  kwh?: number | null;
  dailyKwh?: number | null;
  totalizador_m3?: number;
  period_m3?: number;
  period_kwh?: number;
  period_delta_m3?: number;
  entry_m3?: number;
  amps?: number | null;
  efficiency?: unknown;
  loadFactor?: unknown;
  updated?: string;
  ultima_lectura?: string;
  diagnosis?: unknown;
}
