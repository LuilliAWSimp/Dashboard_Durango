import api from './api';

export type ScheduledReportPeriodMode = 'previous_calendar_day_24h' | 'fixed_12h_blocks';
export type ScheduledReportFormat = 'pdf' | 'excel';

export interface ReportEmailRun {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  attempt: number;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
  message_id?: string | null;
  attachments?: string[];
}

export interface ReportEmailSchedule {
  id: string;
  name: string;
  enabled: boolean;
  period_mode: ScheduledReportPeriodMode;
  formats: ScheduledReportFormat[];
  recipients: string[];
  cc: string[];
  timezone: string;
  send_delay_minutes: number;
  subject?: string | null;
  message?: string | null;
  created_at: string;
  updated_at: string;
  next_run_at?: string | null;
  last_run?: ReportEmailRun | null;
}

export interface ReportEmailSchedulePayload {
  name: string;
  enabled?: boolean;
  period_mode: ScheduledReportPeriodMode;
  formats: ScheduledReportFormat[];
  recipients: string[];
  cc?: string[];
  send_delay_minutes?: number;
  subject?: string;
  message?: string;
}

export async function listReportEmailSchedules(): Promise<ReportEmailSchedule[]> {
  const { data } = await api.get<ReportEmailSchedule[]>('/report-email-schedules');
  return data;
}

export async function createReportEmailSchedule(payload: ReportEmailSchedulePayload): Promise<ReportEmailSchedule> {
  const { data } = await api.post<ReportEmailSchedule>('/report-email-schedules', payload);
  return data;
}

export async function updateReportEmailSchedule(id: string, payload: Partial<ReportEmailSchedulePayload>): Promise<ReportEmailSchedule> {
  const { data } = await api.patch<ReportEmailSchedule>(`/report-email-schedules/${id}`, payload);
  return data;
}

export async function deleteReportEmailSchedule(id: string): Promise<void> {
  await api.delete(`/report-email-schedules/${id}`);
}

export async function runReportEmailScheduleNow(id: string): Promise<Record<string, unknown>> {
  const { data } = await api.post<Record<string, unknown>>(`/report-email-schedules/${id}/run-now`);
  return data;
}
