import { useEffect, useMemo, useState } from 'react';
import { Clock3, FileSpreadsheet, FileText, Mail, Pause, Play, Send, Trash2 } from 'lucide-react';
import {
  createReportEmailSchedule,
  deleteReportEmailSchedule,
  listReportEmailSchedules,
  runReportEmailScheduleNow,
  updateReportEmailSchedule,
  type ReportEmailSchedule,
  type ScheduledReportFormat,
  type ScheduledReportPeriodMode,
} from '../../../services/reportEmailScheduleService';
import { useNotifications } from './NotificationCenter';

const DEFAULT_FORMATS: ScheduledReportFormat[] = ['pdf', 'excel'];

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

function ScheduledReportEmailPanel({ currentUser }: { currentUser?: { role?: string } | null }) {
  const { notify } = useNotifications();
  const role = String(currentUser?.role || '').toLowerCase();
  const canManage = role === 'admin' || role === 'operator';

  const [schedules, setSchedules] = useState<ReportEmailSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState('Reporte automático');
  const [periodMode, setPeriodMode] = useState<ScheduledReportPeriodMode>('previous_calendar_day_24h');
  const [formats, setFormats] = useState<ScheduledReportFormat[]>(DEFAULT_FORMATS);
  const [recipients, setRecipients] = useState('');
  const [formError, setFormError] = useState('');

  const helperText = useMemo(() => (
    periodMode === 'previous_calendar_day_24h'
      ? '24 h: envía el día siguiente el reporte completo del día anterior. Ejemplo: el día 5 se recibe el reporte del día 4.'
      : '12 h: envía dos bloques fijos: 00:00–12:00 y 12:00–24:00, con 10 minutos de retraso para cerrar las últimas muestras.'
  ), [periodMode]);

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

  const toggleFormat = (format: ScheduledReportFormat) => {
    setFormats((current) => current.includes(format)
      ? current.filter((item) => item !== format)
      : [...current, format]);
  };

  const saveSchedule = async () => {
    const emails = parseRecipients(recipients);
    if (!name.trim()) {
      setFormError('Captura un nombre para identificar la programación.');
      return;
    }
    if (!emails.length) {
      setFormError('Captura al menos un destinatario.');
      return;
    }
    if (!formats.length) {
      setFormError('Selecciona PDF, Excel o ambos.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await createReportEmailSchedule({
        name: name.trim(),
        period_mode: periodMode,
        formats,
        recipients: emails,
        enabled: true,
      });
      setRecipients('');
      setName('Reporte automático');
      setPeriodMode('previous_calendar_day_24h');
      setFormats(DEFAULT_FORMATS);
      await loadSchedules();
      notify({
        tone: 'success',
        title: 'Programación guardada',
        message: 'El backend conservará la programación aunque cierres el navegador.',
      });
    } catch (error) {
      const message = errorMessage(error, 'No fue posible guardar la programación.');
      setFormError(message);
      notify({ tone: 'error', title: 'No se pudo programar el correo', message });
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

  if (!canManage) {
    return (
      <section className="panel scheduled-email-panel scheduled-email-locked">
        <div className="scheduled-email-heading">
          <div className="report-card-icon"><Clock3 size={18} /></div>
          <div>
            <span className="section-eyebrow">Automatización</span>
            <h3>Programar correo</h3>
            <p>Tu rol actual no permite crear programaciones de correo. Esta acción se reserva para admin/operator.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel scheduled-email-panel" aria-label="Programar correo de reportes">
      <div className="scheduled-email-heading">
        <div className="report-card-icon"><Clock3 size={18} /></div>
        <div>
          <span className="section-eyebrow">Automatización</span>
          <h3>Programar correo</h3>
          <p>Guarda una programación persistente en el backend para enviar reportes automáticamente.</p>
        </div>
      </div>

      <div className="scheduled-email-form-grid">
        <label className="scheduled-email-field scheduled-email-name">
          <span>Nombre</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Reporte diario Gerencia" disabled={saving} />
        </label>
        <label className="scheduled-email-field">
          <span>Periodo</span>
          <select value={periodMode} onChange={(event) => setPeriodMode(event.target.value as ScheduledReportPeriodMode)} disabled={saving}>
            <option value="previous_calendar_day_24h">24 h · día anterior completo</option>
            <option value="fixed_12h_blocks">12 h · dos bloques diarios</option>
          </select>
        </label>
        <label className="scheduled-email-field scheduled-email-recipients">
          <span>Destinatarios</span>
          <textarea rows={2} value={recipients} onChange={(event) => setRecipients(event.target.value)} placeholder="gerencia@empresa.com, operacion@empresa.com" disabled={saving} />
        </label>
        <fieldset className="scheduled-email-formats" disabled={saving}>
          <legend>Formatos</legend>
          <label><input type="checkbox" checked={formats.includes('pdf')} onChange={() => toggleFormat('pdf')} /> <FileText size={15} /> PDF</label>
          <label><input type="checkbox" checked={formats.includes('excel')} onChange={() => toggleFormat('excel')} /> <FileSpreadsheet size={15} /> Excel</label>
        </fieldset>
      </div>

      <div className="scheduled-email-helper"><Clock3 size={15} /><span>{helperText}</span></div>
      {formError ? <div className="report-email-error" role="alert">{formError}</div> : null}
      <div className="scheduled-email-save-row">
        <small>Retraso de cierre predeterminado: 10 min · Zona horaria: America/Mexico_City</small>
        <button type="button" className="primary-action report-action-button" onClick={() => void saveSchedule()} disabled={saving}>
          <Mail size={16} /> {saving ? 'Guardando...' : 'Guardar programación'}
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
                <div className="scheduled-email-item-meta">
                  <span>Próximo envío: <strong>{formatDateTime(schedule.next_run_at)}</strong></span>
                  <span>Último estado: <strong>{last?.status || 'Sin ejecuciones'}</strong></span>
                  {last?.error_message ? <span className="scheduled-email-last-error">{last.error_message}</span> : null}
                </div>
              </div>
              <div className="scheduled-email-item-actions">
                <button type="button" className="ghost-action" disabled={isBusy} onClick={() => void runNow(schedule)} title="Enviar el último periodo cerrado ahora">
                  <Send size={15} /> Enviar ahora
                </button>
                <button type="button" className="ghost-action" disabled={isBusy} onClick={() => void toggleEnabled(schedule)}>
                  {schedule.enabled ? <Pause size={15} /> : <Play size={15} />} {schedule.enabled ? 'Pausar' : 'Activar'}
                </button>
                <button type="button" className="ghost-action danger-action" disabled={isBusy} onClick={() => void removeSchedule(schedule)}>
                  <Trash2 size={15} /> Eliminar
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default ScheduledReportEmailPanel;
