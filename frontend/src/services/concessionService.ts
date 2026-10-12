import api from './api';

export type ConcessionRecord = {
  plant_key: string;
  well_key: string;
  well_name: string;
  sensor_id: number;
  title_number: string;
  annual_volume_m3: number;
  valid_from: string | null;
  valid_to: string | null;
  notes: string;
  provenance: string;
  review_state: string;
  document_name: string | null;
  has_document: boolean;
  updated_by: string;
  updated_at: string;
  version: number;
  extracted_year_m3: number | null;
  remaining_m3: number | null;
  usage_percent: number | null;
  measurement_status: string;
};

export type ConcessionPayload = {
  title_number: string;
  annual_volume_m3: number;
  valid_from: string | null;
  valid_to: string | null;
  notes: string;
};

export type PdfPreview = {
  pages: number;
  text_detected: boolean;
  title_candidates: string[];
  number_candidates: string[];
  excerpt: string;
  notice: string;
};

export async function fetchConcessions(): Promise<{ records: ConcessionRecord[]; reference_total_m3: number; message: string }> {
  const { data } = await api.get('/concessions');
  return data;
}

export async function updateConcession(key: string, data: ConcessionPayload): Promise<ConcessionRecord> {
  const result = await api.patch(`/concessions/${encodeURIComponent(key)}`, data);
  return result.data;
}

export async function previewConcessionPdf(file: File): Promise<PdfPreview> {
  const data = new FormData();
  data.append('file', file);
  const result = await api.post('/concessions/preview-pdf', data);
  return result.data;
}

export async function saveConcessionPdf(key: string, values: ConcessionPayload, file: File): Promise<ConcessionRecord> {
  const data = new FormData();
  data.append('file', file);
  data.append('title_number', values.title_number);
  data.append('annual_volume_m3', String(values.annual_volume_m3));
  data.append('valid_from', values.valid_from || '');
  data.append('valid_to', values.valid_to || '');
  data.append('notes', values.notes);
  const response = await api.post(`/concessions/${encodeURIComponent(key)}/document`, data);
  return response.data;
}

export async function downloadConcessionPdf(key: string, filename?: string | null) {
  const response = await api.get(`/concessions/${encodeURIComponent(key)}/document`, { responseType: 'blob' });
  const blob = new Blob([response.data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'concesion.pdf';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function fetchConcessionAudit(key: string): Promise<Array<{ action: string; actor: string; created_at: string; details: Record<string, unknown> }>> {
  const response = await api.get(`/concessions/${encodeURIComponent(key)}/audit`);
  return response.data;
}

export type ConcessionMonthlyBucket = {
  month: number;
  volume_m3: number | null;
  days_with_volume: number;
  days_without_data: number;
  days_excluded: number;
  coverage_percent: number | null;
  status: 'available' | 'partial' | 'no_data' | 'outside_window';
};

/** Diagnóstico elaborado de filas diarias persistidas, sin llamar a BOS desde la pantalla. */
export type ConcessionCoverage = {
  period_year: number;
  expected_days: number;
  processed_days: number;
  days_with_volume: number;
  days_without_data: number;
  days_excluded: number;
  days_pending: number;
  samples_received: number;
  samples_expected: number;
  sample_coverage_percent: number | null;
  first_valid_day: string | null;
  last_valid_day: string | null;
  first_totalizer_m3: number | null;
  last_totalizer_m3: number | null;
  discarded_totalizer_events: number;
  historical_snapshots_incomplete: boolean;
};

export type ConcessionOperationalWell = {
  well_key: string;
  well_name: string;
  sensor_id: number;
  months: ConcessionMonthlyBucket[];
  operational_total_m3: number | null;
  months_with_data: number;
  has_partial_coverage: boolean;
  coverage?: ConcessionCoverage;
};

export type ConcessionSyncState = {
  state: 'updating' | 'error' | 'backfilling' | 'up_to_date';
  processed_days: number;
  expected_days: number;
  progress_percent: number;
  last_success_at: string | null;
  last_period_date: string | null;
  last_error: string | null;
  running: boolean;
  initial_load_complete: boolean;
  refresh_minutes: number;
  manual_rebuild_pending: boolean;
  persisted_locally?: boolean;
  source_queries_on_page_load?: boolean;
};

export type ConcessionMonthlyHistory = {
  year: number;
  period_start: string;
  period_end: string;
  source: string;
  legal_period_verified: false;
  historical_scope_notice: string;
  sync: ConcessionSyncState;
  wells: ConcessionOperationalWell[];
};

export async function fetchConcessionMonthlyHistory(year: number): Promise<ConcessionMonthlyHistory> {
  const response = await api.get('/concessions/history/monthly', { params: { year } });
  return response.data;
}

export async function queueConcessionHistoryRebuild(startDate: string, endDate: string): Promise<{queued: boolean}> {
  const response = await api.post('/concessions/history/rebuild', {start_date: startDate, end_date: endDate});
  return response.data;
}
