import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Clock3,
  FileSpreadsheet,
  FileText,
  History,
  Mail,
  Pause,
  Pencil,
  Play,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  createReportEmailSchedule,
  deleteReportEmailSchedule,
  listReportEmailRuns,
  listReportEmailSchedules,
  runReportEmailScheduleNow,
  updateReportEmailSchedule,
  type ReportEmailRun,
  type ReportEmailSchedule,
  type ScheduledReportFormat,
  type ScheduledReportPeriodMode,
} from '../../../services/reportEmailScheduleService';
import { useNotifications } from './NotificationCenter';
import './styles/scheduled-report-email.css';

const DEFAULT_FORMATS: ScheduledReportFormat[] = ['pdf', 'excel'];
const DEFAULT_24H_TIME = '00:10';
const DEFAULT_12H_FIRST_TIME = '12:10';
const DEFAULT_12H_SECOND_TIME = '00:10';

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  try {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  } catch {
    // fallback below
  }
  return value;
}

function parseRecipients(value: string): string[] {
  return value
    .replace(/;/g, ',')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const candidate = error as { response?: { data?: { detail?: unknown } }; message?: unknown };
    const detail = candidate.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message;
  }
  return fallback;
}

function periodLabel(mode: ScheduledReportPeriodMode): string {
  return mode === 'fixed_12h_blocks' ? '12 h · bloques fijos' : '24 h · día anterior';
}

function scheduleTimesLabel(schedule: ReportEmailSchedule): string {
  if (schedule.period_mode === 'fixed_12h_blocks') {
    return `00:00–12:00 → ${schedule.send_time_local} · 12:00–24:00 → ${schedule.send_time_local_2 || '—'}`;
  }
  return `Horario: ${schedule.send_time_local}`;
}

function runPeriodLabel(run: ReportEmailRun): string {
  const start = formatDateTime(run.period_start);
  const end = formatDateTime(run.period_end);
  return `${start} → ${end}`;
}

type FormState = {
  name: string;
  periodMode: ScheduledReportPeriodMode;
  formats: ScheduledReportFormat[];
  recipients: string;
  cc: string;
  sendTimeLocal: string;
  sendTimeLocal2: string;
};

function defaultFormState(): FormState {
  return {
    name: 'Reporte automático',
    periodMode: 'previous_calendar_day_24h',
    formats: DEFAULT_FORMATS,
    recipients: '',
    cc: '',
    sendTimeLocal: DEFAULT_24H_TIME,
    sendTimeLocal2: DEFAULT_12H_SECOND_TIME,
  };
}

function formStateFromSchedule(schedule: ReportEmailSchedule): FormState {
  return {
    name: schedule.name,
    periodMode: schedule.period_mode,
    formats: [...schedule.formats],
    recipients: schedule.recipients.join(', '),
    cc: schedule.cc.join(', '),
    sendTimeLocal: schedule.send_time_local || (schedule.period_mode === 'fixed_12h_blocks' ? DEFAULT_12H_FIRST_TIME : DEFAULT_24H_TIME),
    sendTimeLocal2: schedule.send_time_local_2 || DEFAULT_12H_SECOND_TIME,
  };
}

function ScheduledReportEmailPanel({ currentUser }: { currentUser?: { role?: string } | null }) {
  const { notify } = useNotifications();
  const role = String(currentUser?.role || '').toLowerCase();
  const canManage = role === 'admin' || role === 'operator';
  const modalThemeClass = typeof window !== 'undefined' && window.localStorage.getItem('arca-durango-theme') === 'light' ? 'theme-light' : 'theme-dark';

  const [schedules, setSchedules] = useState<ReportEmailSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ReportEmailSchedule | null>(null);
  const [form, setForm] = useState<FormState>(defaultFormState());
  const [formError, setFormError] = useState('');
  const [historySchedule, setHistorySchedule] = useState<ReportEmailSchedule | null>(null);
  const [historyRuns, setHistoryRuns] = useState<ReportEmailRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const helperText = useMemo(() => (
    form.periodMode === 'previous_calendar_day_24h'
      ? '24 h: el periodo siempre es el día calendario anterior completo. La hora elegida controla únicamente cuándo se entrega.'
      : '12 h: los periodos siguen siendo 00:00–12:00 y 12:00–24:00. Cada bloque tiene su propia hora de entrega.'
  ), [form.periodMode]);

  const loadSchedules = async () => {
    setLoading(true);
    try {
      setSchedules(await listReportEmailSchedules());
    } catch (error) {
      notify({
        tone: 'error',
        title: 'No se pudieron cargar las programaciones',
        message: errorMessage(error, 'No fue posible consultar el correo programado.'),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) void loadSchedules();
  }, [canManage]);

  useEffect(() => {
    if (!formOpen && !historySchedule) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [formOpen, historySchedule]);

  const openCreate = () => {
    setEditingSchedule(null);
    setForm(defaultFormState());
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (schedule: ReportEmailSchedule) => {
    setEditingSchedule(schedule);
    setForm(formStateFromSchedule(schedule));
    setFormError('');
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditingSchedule(null);
    setFormError('');
  };

  const setPeriodMode = (mode: ScheduledReportPeriodMode) => {
    setForm((current) => ({
      ...current,
      periodMode: mode,
      sendTimeLocal: mode === 'fixed_12h_blocks' ? DEFAULT_12H_FIRST_TIME : DEFAULT_24H_TIME,
      sendTimeLocal2: DEFAULT_12H_SECOND_TIME,
    }));
  };

  const toggleFormat = (format: ScheduledReportFormat) => {
    setForm((current) => ({
      ...current,
      formats: current.formats.includes(format)
        ? current.formats.filter((item) => item !== format)
        : [...current.formats, format],
    }));
  };

  const saveSchedule = async () => {
    const emails = parseRecipients(form.recipients);
    const cc = parseRecipients(form.cc);
    if (!form.name.trim()) {
      setFormError('Captura un nombre para identificar la programación.');
      return;
    }
    if (!emails.length) {
      setFormError('Captura al menos un destinatario.');
      return;
    }
    if (!form.formats.length) {
      setFormError('Selecciona PDF, Excel o ambos.');
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.sendTimeLocal)) {
      setFormError('Captura un horario válido para la entrega.');
      return;
    }
    if (form.periodMode === 'fixed_12h_blocks' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.sendTimeLocal2)) {
      setFormError('Captura un horario válido para el segundo bloque de 12 h.');
      return;
    }

    setSaving(true);
    setFormError('');
    const payload = {
      name: form.name.trim(),
      period_mode: form.periodMode,
      formats: form.formats,
      recipients: emails,
      cc,
      enabled: editingSchedule?.enabled ?? true,
      send_time_local: form.sendTimeLocal,
      send_time_local_2: form.periodMode === 'fixed_12h_blocks' ? form.sendTimeLocal2 : null,
    };

    try {
      if (editingSchedule) {
        await updateReportEmailSchedule(editingSchedule.id, payload);
      } else {
        await createReportEmailSchedule(payload);
      }
      await loadSchedules();
      notify({
        tone: 'success',
        title: editingSchedule ? 'Programación actualizada' : 'Programación guardada',
        message: 'La hora controla la entrega; el periodo hidráulico permanece fijo.',
      });
      setFormOpen(false);
      setEditingSchedule(null);
      setForm(defaultFormState());
    } catch (error) {
      const message = errorMessage(error, 'No fue posible guardar la programación.');
      setFormError(message);
      notify({ tone: 'error', title: 'No se pudo guardar la programación', message });
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (schedule: ReportEmailSchedule) => {
    setBusyId(schedule.id);
    try {
      await updateReportEmailSchedule(schedule.id, { enabled: !schedule.enabled });
      await loadSchedules();
    } catch (error) {
      notify({
        tone: 'error',
        title: 'No se pudo actualizar la programación',
        message: errorMessage(error, 'Intenta nuevamente.'),
      });
    } finally {
      setBusyId(null);
    }
  };

  const removeSchedule = async (schedule: ReportEmailSchedule) => {
    if (!window.confirm(`¿Eliminar la programación “${schedule.name}”?`)) return;
    setBusyId(schedule.id);
    try {
      await deleteReportEmailSchedule(schedule.id);
      await loadSchedules();
      notify({ tone: 'success', title: 'Programación eliminada', message: schedule.name });
    } catch (error) {
      notify({
        tone: 'error',
        title: 'No se pudo eliminar',
        message: errorMessage(error, 'Intenta nuevamente.'),
      });
    } finally {
      setBusyId(null);
    }
  };

  const runNow = async (schedule: ReportEmailSchedule) => {
    setBusyId(schedule.id);
    try {
      const result = await runReportEmailScheduleNow(schedule.id);
      await loadSchedules();
      notify({
        tone: result.status === 'skipped' ? 'warning' : 'success',
        title: result.status === 'skipped' ? 'Periodo ya procesado' : 'Correo programado enviado',
        message: String(result.message || 'Se procesó el último periodo cerrado.'),
      });
    } catch (error) {
      notify({
        tone: 'error',
        title: 'Falló el envío de prueba',
        message: errorMessage(error, 'Revisa SMTP, destinatarios y disponibilidad de datos.'),
      });
      await loadSchedules();
    } finally {
      setBusyId(null);
    }
  };

  const openHistory = async (schedule: ReportEmailSchedule) => {
    setHistorySchedule(schedule);
    setHistoryRuns([]);
    setHistoryLoading(true);
    try {
      setHistoryRuns(await listReportEmailRuns(schedule.id, 20));
    } catch (error) {
      notify({
        tone: 'error',
        title: 'No se pudo cargar el historial',
        message: errorMessage(error, 'Intenta nuevamente.'),
      });
    } finally {
      setHistoryLoading(false);
    }
  };

  if (!canManage) {
    return (
      <section className="panel scheduled-email-panel scheduled-email-locked">
        <div className="scheduled-email-heading">
          <div className="report-card-icon"><Clock3 size={18} /></div>
          <div>
            <span className="section-eyebrow">Automatización</span>
            <h3>Correo programado</h3>
            <p>Tu rol actual no permite administrar programaciones. Esta acción se reserva para admin/operator.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel scheduled-email-panel" aria-label="Programar correo de reportes">
      <div className="scheduled-email-toolbar">
        <div className="scheduled-email-heading">
          <div className="report-card-icon"><Clock3 size={18} /></div>
          <div>
            <span className="section-eyebrow">Automatización</span>
            <h3>Correo programado</h3>
            <p>Elige una hora exacta de entrega sin modificar los periodos hidráulicos de 24 h o 12 h.</p>
          </div>
        </div>
        <button type="button" className="primary-action report-action-button" onClick={openCreate}>
          <Plus size={16} /> Nueva programación
        </button>
      </div>

      <div className="scheduled-email-list-head">
        <div><strong>Programaciones</strong><span>{loading ? 'Actualizando...' : `${schedules.length} configurada${schedules.length === 1 ? '' : 's'}`}</span></div>
      </div>

      <div className="scheduled-email-list">
        {!loading && !schedules.length ? <div className="scheduled-email-empty">Todavía no hay correos programados.</div> : null}
        {schedules.map((schedule) => {
          const isBusy = busyId === schedule.id;
          const last = schedule.last_run;
          return (
            <article className={`scheduled-email-item ${schedule.enabled ? '' : 'is-disabled'}`} key={schedule.id}>
              <div className="scheduled-email-item-main">
                <div className="scheduled-email-item-title">
                  <strong>{schedule.name}</strong>
                  <span className={schedule.enabled ? 'status-chip success' : 'status-chip neutral'}>{schedule.enabled ? 'Activo' : 'Pausado'}</span>
                </div>
                <p>{periodLabel(schedule.period_mode)} · {schedule.formats.map((item) => item.toUpperCase()).join(' + ')} · {schedule.recipients.length} destinatario{schedule.recipients.length === 1 ? '' : 's'}</p>
                <div className="scheduled-email-delivery-time"><Clock3 size={14} /><strong>{scheduleTimesLabel(schedule)}</strong></div>
                <div className="scheduled-email-item-meta">
                  <span>Próximo envío: <strong>{formatDateTime(schedule.next_run_at)}</strong></span>
                  <span>Último estado: <strong>{last?.status || 'Sin ejecuciones'}</strong></span>
                  {last?.error_message ? <span className="scheduled-email-last-error">{last.error_message}</span> : null}
                </div>
              </div>
              <div className="scheduled-email-item-actions">
                <button type="button" className="ghost-action" disabled={isBusy} onClick={() => openEdit(schedule)}><Pencil size={15} /> Editar</button>
                <button type="button" className="ghost-action" disabled={isBusy} onClick={() => void runNow(schedule)} title="Enviar el último periodo cerrado ahora"><Send size={15} /> Enviar ahora</button>
                <button type="button" className="ghost-action" disabled={isBusy} onClick={() => void openHistory(schedule)}><History size={15} /> Historial</button>
                <button type="button" className="ghost-action" disabled={isBusy} onClick={() => void toggleEnabled(schedule)}>{schedule.enabled ? <Pause size={15} /> : <Play size={15} />} {schedule.enabled ? 'Pausar' : 'Activar'}</button>
                <button type="button" className="ghost-action danger-action" disabled={isBusy} onClick={() => void removeSchedule(schedule)}><Trash2 size={15} /> Eliminar</button>
              </div>
            </article>
          );
        })}
      </div>

      {formOpen ? createPortal(
        <div className={`scheduled-email-modal-backdrop ${modalThemeClass}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
          <div className="scheduled-email-modal" role="dialog" aria-modal="true" aria-labelledby="scheduled-email-modal-title">
            <div className="scheduled-email-modal-header">
              <div>
                <span className="section-eyebrow">Correo programado</span>
                <h3 id="scheduled-email-modal-title">{editingSchedule ? 'Editar programación' : 'Nueva programación'}</h3>
              </div>
              <button type="button" className="scheduled-email-modal-close" onClick={closeForm} disabled={saving} aria-label="Cerrar"><X size={19} /></button>
            </div>

            <div className="scheduled-email-modal-body">
              <label className="scheduled-email-field">
                <span>Nombre</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Reporte diario Gerencia" disabled={saving} />
              </label>

              <fieldset className="scheduled-email-period-selector" disabled={saving}>
                <legend>Periodo hidráulico</legend>
                <label className={form.periodMode === 'previous_calendar_day_24h' ? 'is-selected' : ''}>
                  <input type="radio" name="scheduled-period" checked={form.periodMode === 'previous_calendar_day_24h'} onChange={() => setPeriodMode('previous_calendar_day_24h')} />
                  <strong>24 h</strong><span>Día calendario anterior completo</span>
                </label>
                <label className={form.periodMode === 'fixed_12h_blocks' ? 'is-selected' : ''}>
                  <input type="radio" name="scheduled-period" checked={form.periodMode === 'fixed_12h_blocks'} onChange={() => setPeriodMode('fixed_12h_blocks')} />
                  <strong>12 h</strong><span>Bloques fijos 00–12 / 12–24</span>
                </label>
              </fieldset>

              <div className="scheduled-email-time-grid">
                {form.periodMode === 'previous_calendar_day_24h' ? (
                  <label className="scheduled-email-field">
                    <span>Hora exacta de entrega</span>
                    <input type="time" value={form.sendTimeLocal} onChange={(event) => setForm((current) => ({ ...current, sendTimeLocal: event.target.value }))} disabled={saving} />
                  </label>
                ) : (
                  <>
                    <label className="scheduled-email-field">
                      <span>Entrega del bloque 00:00–12:00</span>
                      <input type="time" value={form.sendTimeLocal} onChange={(event) => setForm((current) => ({ ...current, sendTimeLocal: event.target.value }))} disabled={saving} />
                    </label>
                    <label className="scheduled-email-field">
                      <span>Entrega del bloque 12:00–24:00</span>
                      <input type="time" value={form.sendTimeLocal2} onChange={(event) => setForm((current) => ({ ...current, sendTimeLocal2: event.target.value }))} disabled={saving} />
                    </label>
                  </>
                )}
              </div>

              <div className="scheduled-email-helper"><Clock3 size={15} /><span>{helperText}</span></div>

              <label className="scheduled-email-field">
                <span>Destinatarios</span>
                <textarea rows={2} value={form.recipients} onChange={(event) => setForm((current) => ({ ...current, recipients: event.target.value }))} placeholder="gerencia@empresa.com, operacion@empresa.com" disabled={saving} />
              </label>

              <label className="scheduled-email-field">
                <span>CC <small>(opcional)</small></span>
                <textarea rows={2} value={form.cc} onChange={(event) => setForm((current) => ({ ...current, cc: event.target.value }))} placeholder="supervision@empresa.com" disabled={saving} />
              </label>

              <fieldset className="scheduled-email-formats" disabled={saving}>
                <legend>Formatos</legend>
                <label><input type="checkbox" checked={form.formats.includes('pdf')} onChange={() => toggleFormat('pdf')} /> <FileText size={15} /> PDF</label>
                <label><input type="checkbox" checked={form.formats.includes('excel')} onChange={() => toggleFormat('excel')} /> <FileSpreadsheet size={15} /> Excel</label>
              </fieldset>

              {formError ? <div className="report-email-error" role="alert">{formError}</div> : null}
            </div>

            <div className="scheduled-email-modal-footer">
              <small>Zona horaria: America/Mexico_City</small>
              <div>
                <button type="button" className="ghost-action" onClick={closeForm} disabled={saving}>Cancelar</button>
                <button type="button" className="primary-action report-action-button" onClick={() => void saveSchedule()} disabled={saving}>
                  <Mail size={16} /> {saving ? 'Guardando...' : editingSchedule ? 'Guardar cambios' : 'Guardar programación'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {historySchedule ? createPortal(
        <div className={`scheduled-email-modal-backdrop ${modalThemeClass}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistorySchedule(null); }}>
          <div className="scheduled-email-modal scheduled-email-history-modal" role="dialog" aria-modal="true" aria-labelledby="scheduled-email-history-title">
            <div className="scheduled-email-modal-header">
              <div>
                <span className="section-eyebrow">Historial de ejecuciones</span>
                <h3 id="scheduled-email-history-title">{historySchedule.name}</h3>
              </div>
              <button type="button" className="scheduled-email-modal-close" onClick={() => setHistorySchedule(null)} aria-label="Cerrar"><X size={19} /></button>
            </div>
            <div className="scheduled-email-modal-body">
              {historyLoading ? <div className="scheduled-email-empty">Cargando historial...</div> : null}
              {!historyLoading && !historyRuns.length ? <div className="scheduled-email-empty">Todavía no hay ejecuciones registradas.</div> : null}
              <div className="scheduled-email-history-list">
                {historyRuns.map((run) => (
                  <article className="scheduled-email-history-item" key={run.id}>
                    <div><strong>{run.status}</strong><span>Intento {run.attempt}</span></div>
                    <p>{runPeriodLabel(run)}</p>
                    <p>Programado: {formatDateTime(run.due_at)} · Finalizado: {formatDateTime(run.finished_at)}</p>
                    {run.attachments?.length ? <p>Adjuntos: {run.attachments.join(', ')}</p> : null}
                    {run.error_message ? <p className="scheduled-email-last-error">{run.error_message}</p> : null}
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}

export default ScheduledReportEmailPanel;
