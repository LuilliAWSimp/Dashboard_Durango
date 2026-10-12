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
