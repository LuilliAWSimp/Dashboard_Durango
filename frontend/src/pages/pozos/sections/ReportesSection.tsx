import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Eye, FileDown, FileSpreadsheet, Mail, RefreshCw, RotateCcw } from 'lucide-react';
import {
  fetchDailyWaterReport,
  fetchDailyWaterReportPreview,
  downloadDailyWaterReportExcel,
  downloadDailyWaterReportPdf,
  sendDailyWaterReportEmail,
} from '../../../services/waterReportService';
import { exportDailyWaterReportHtml } from '../../../services/dailyWaterReportExportService';
import { todayInputDate } from '../dateUtils';
import useAutoRefresh from '../../../hooks/useAutoRefresh';
import ChartEmptyState from '../components/ChartEmptyState';
import PanelHeader from '../components/PanelHeader';
import StatusBadge from '../components/StatusBadge';
import { useNotifications } from '../components/NotificationCenter';

type ReportMode = 'day' | 'range';
type ReportSectionKey = 'wells' | 'production_lines' | 'washers' | 'jarabes';
type ReportFilters = { date?: string; startDate?: string; endDate?: string };
type ExportAction = 'pdf' | 'xlsx' | 'html' | null;

const REPORT_SECTIONS: Array<{ key: ReportSectionKey; label: string }> = [
  { key: 'wells', label: 'Pozos' },
  { key: 'production_lines', label: 'Líneas' },
  { key: 'washers', label: 'Lavadoras' },
  { key: 'jarabes', label: 'Jarabes' },
];

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'No disponible';
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(value);
}

function fmtVolume(value: unknown): string {
  return value === null || value === undefined || value === '' ? 'No disponible' : `${fmt(value)} m³`;
}

function fmtLocalDate(value: unknown): string {
  if (!value) return 'Sin lectura';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function statusType(value: unknown): string {
  const text = String(value || '').toLowerCase();
  if (text.includes('parcial') || text.includes('atrasada')) return 'warning';
  if (text.includes('sin registros')) return 'nodata';
  if (text.includes('sin actividad')) return 'idle';
  if (text.includes('sin')) return 'idle';
  return 'normal';
}

function validationStatusType(item: any): string {
  const status = String(item?.validation_status || '').toLowerCase();
  if (status === 'partial') return 'warning';
  if (status === 'unavailable') return 'idle';
  return statusType(validationLabel(item));
}

function reportRows(report: any, key: ReportSectionKey): any[] {
  return report?.[key]?.rows || [];
}

function validationLabel(item: any): string {
  if (item?.validated_volume_m3 !== null && item?.validated_volume_m3 !== undefined) return 'Validado';
  if (item?.validation && String(item.validation) !== 'Validación parcial') return String(item.validation);
  return 'Sin volumen validado';
}

function ReportSkeleton() {
  return (
    <div className="report-preview-skeleton" aria-label="Cargando vista previa del reporte">
      <section className="report-summary-grid" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => <div className="report-skeleton-card" key={index}><i /><b /></div>)}
      </section>
      <section className="panel report-data-panel report-skeleton-preview" aria-hidden="true">
        <div className="report-skeleton-heading"><i /><b /></div>
        {REPORT_SECTIONS.map((section) => (
          <div className="report-skeleton-section" key={section.key}>
            <span>{section.label}</span>
            <i /><i /><i />
          </div>
        ))}
      </section>
    </div>
  );
}

function ReportPreviewTable({ rows, sectionKey }: { rows: any[]; sectionKey: ReportSectionKey }) {
  if (!rows.length) {
    return <div className="report-preview-empty">Sin elementos disponibles para este grupo.</div>;
  }

  return (
    <div className="pozos-table-scroll">
      <table className="pozos-operacion-table report-data-table">
        <thead>
          <tr>
            <th>Elemento</th>
            <th>Flujo actual</th>
            <th>Apertura</th>
            <th>Cierre</th>
            <th>Volumen</th>
            <th>Actividad</th>
            <th>Validación</th>
            <th>Comunicación</th>
            <th>Última actualización</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item: any, index: number) => (
            <tr key={`${sectionKey}-${index}`}>
              <td>{item.name}</td>
              <td>{item.flow == null ? 'No disponible' : `${fmt(item.flow)} ${item.flow_unit || 'L/s'}`}</td>
              <td>{item.opening_m3 == null ? 'No disponible' : `${fmt(item.opening_m3)} m³`}</td>
              <td>{item.closing_m3 == null ? 'No disponible' : `${fmt(item.closing_m3)} m³`}</td>
              <td>{item.validated_volume_m3 == null ? 'Sin volumen validado' : `${fmt(item.validated_volume_m3)} m³`}</td>
              <td><StatusBadge type={statusType(item.activity)}>{item.activity}</StatusBadge></td>
              <td><StatusBadge type={validationStatusType(item)}>{validationLabel(item)}</StatusBadge></td>
              <td>{item.communication}</td>
              <td>{fmtLocalDate(item.last_update)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportPreviewSection({ report, section }: { report: any; section: { key: ReportSectionKey; label: string } }) {
  const rows = reportRows(report, section.key);
  const headingId = `report-preview-${section.key}`;

  return (
    <section className="report-preview-section" aria-labelledby={headingId}>
      <div className="report-preview-section-heading">
        <div>
          <h4 id={headingId}>{section.label}</h4>
          <p>Periodo {report.period_label}</p>
        </div>
        <span>{rows.length.toLocaleString('es-MX')} elementos</span>
      </div>
      <ReportPreviewTable rows={rows} sectionKey={section.key} />
    </section>
  );
}

export default function ReportesSection({ user }: { user?: { role?: string } } = {}) {
  const today = todayInputDate();
  const { notify } = useNotifications();
  const canEmail = user?.role === 'admin' || user?.role === 'operator';
  const [mode, setMode] = useState<ReportMode>('day');
  const [date, setDate] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exportAction, setExportAction] = useState<ExportAction>(null);
  const inFlightRef = useRef(false);
  const [error, setError] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState('');
  const [formats, setFormats] = useState({ pdf: true, xlsx: true });
  const [form, setForm] = useState({
    to: '',
    cc: '',
    subject: `Reporte Diario de Control Hídrico Durango - ${today}`,
    message: 'Se adjunta el Reporte Diario de Control Hídrico Durango.',
  });

  const filters = useMemo<ReportFilters>(
    () => (mode === 'day' ? { date } : { startDate, endDate }),
    [mode, date, startDate, endDate],
  );

  const load = async (nextFilters: ReportFilters = filters, background = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (background && report) setRefreshing(true);
    else setLoading(true);
    if (!background) setError('');
    try {
      // Preview intentionally excludes historical series and administrative shifts.
      setReport(await fetchDailyWaterReportPreview(nextFilters));
      setError('');
    } catch (caught) {
      const candidate = caught as { response?: { data?: { detail?: string } }; message?: string };
      setError(candidate.response?.data?.detail || candidate.message || 'No fue posible consultar el reporte.');
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  };

  const reset = () => {
    const initial = { date: today };
    setMode('day');
    setDate(today);
    setStartDate(today);
    setEndDate(today);
    setForm((current) => ({ ...current, subject: `Reporte Diario de Control Hídrico Durango - ${today}` }));
    void load(initial);
  };

  useEffect(() => { void load({ date: today }); }, []);

  const includesToday = mode === 'day'
    ? date === today
    : [startDate, endDate].sort()[0] <= today && today <= [startDate, endDate].sort()[1];
  useAutoRefresh(includesToday, () => { void load(filters, true); });

  const runExport = async (action: Exclude<ExportAction, null>) => {
    if (exportAction) return;
    setExportAction(action);
    setError('');
    try {
      if (action === 'pdf') await downloadDailyWaterReportPdf(filters);
      if (action === 'xlsx') await downloadDailyWaterReportExcel(filters);
      if (action === 'html') {
        const fullReport = await fetchDailyWaterReport(filters, { includeHistory: true, includeShifts: false });
        exportDailyWaterReportHtml(fullReport);
      }
    } catch (caught) {
      const candidate = caught as { response?: { data?: { detail?: string } }; message?: string };
      setError(candidate.response?.data?.detail || candidate.message || 'No fue posible generar el formato solicitado.');
    } finally {
      setExportAction(null);
    }
  };

  const send = async () => {
    const selectedFormats = [formats.pdf ? 'pdf' : null, formats.xlsx ? 'xlsx' : null].filter(Boolean);
    if (!selectedFormats.length) {
      setEmailStatus('Selecciona al menos un formato para adjuntar.');
      return;
    }
    setSending(true);
    setEmailStatus('');
    try {
      await sendDailyWaterReportEmail({
        to: form.to,
        cc: form.cc || undefined,
        subject: form.subject,
        message: form.message,
        date: mode === 'day' ? date : undefined,
        start_date: mode === 'range' ? startDate : undefined,
        end_date: mode === 'range' ? endDate : undefined,
        formats: selectedFormats,
      });
      setEmailOpen(false);
      setEmailStatus('');
      notify({
        tone: 'success',
        title: 'Correo enviado correctamente',
        message: `${selectedFormats.map((format) => String(format).toUpperCase()).join(' y ')} enviados a ${form.to.trim()}.`,
      });
    } catch {
      notify({
        tone: 'error',
        title: 'No se pudo enviar el correo',
        message: 'Conservamos el formulario abierto para que revises los datos e intentes nuevamente.',
        ariaLive: 'assertive',
      });
    } finally {
      setSending(false);
    }
  };

  const summary = report?.summary || {};
  const summaryCards = [
    { label: 'Volumen validado de pozos', value: summary.well_validated_volume_m3 ?? summary.well_volume_m3 },
    { label: 'Volumen validado de líneas', value: summary.line_validated_volume_m3 ?? summary.line_volume_m3 },
    { label: 'Volumen validado de lavadoras', value: summary.washer_validated_volume_m3 },
    { label: 'Volumen validado de Jarabes', value: summary.jarabes_validated_volume_m3 },
    { label: 'Total validado operativo', value: summary.total_validated_operational_m3 ?? summary.total_operational_m3 },
  ];
  const isBusy = exportAction !== null;

  return (
    <div className="reportes-page durango-report-page">
      <section className="panel report-hero-panel fade-up">
        <div className="report-center-heading">
          <span>Centro de reportes</span>
          <PanelHeader title="Reportes" subtitle="Control hídrico · Planta Durango" />
          <p>Genera, consulta y envía reportes del periodo seleccionado.</p>
        </div>

        <div className="report-workflow-panel">
          <div className="report-workflow-intro">
            <strong>Periodo del reporte</strong>
            <span>Configura el periodo y genera el formato necesario.</span>
          </div>

          <div className="report-workflow-body">
            <div className="report-controls-block" aria-label="Periodo del reporte">
              <div className="report-field report-mode-field">
                <span className="report-field-label">Tipo</span>
                <div className="report-mode-toggle" role="group" aria-label="Tipo de periodo">
                  <button type="button" className={mode === 'day' ? 'active' : ''} aria-pressed={mode === 'day'} onClick={() => setMode('day')}>Fecha</button>
                  <button type="button" className={mode === 'range' ? 'active' : ''} aria-pressed={mode === 'range'} onClick={() => setMode('range')}>Periodo</button>
                </div>
              </div>

              {mode === 'day' ? (
                <label className="report-field"><span className="report-field-label">Fecha</span><div className="date-input-with-icon report-date-input"><CalendarDays size={16} /><input type="date" value={date} onChange={(event) => { setDate(event.target.value); setForm((current) => ({ ...current, subject: `Reporte Diario de Control Hídrico Durango - ${event.target.value}` })); }} /></div></label>
              ) : <><label className="report-field"><span className="report-field-label">Desde</span><div className="date-input-with-icon report-date-input"><CalendarDays size={16} /><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div></label><label className="report-field"><span className="report-field-label">Hasta</span><div className="date-input-with-icon report-date-input"><CalendarDays size={16} /><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div></label></>}

              <div className="report-period-buttons">
                <button type="button" className="date-range-apply" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> {loading ? 'Actualizando...' : 'Actualizar'}</button>
                <button type="button" className="date-range-reset" onClick={reset} disabled={loading}><RotateCcw size={15} /> Restablecer</button>
              </div>
            </div>

            <div className="report-actions-block">
              <span className="report-field-label">Acciones</span>
              <div className="report-actions" aria-label="Acciones del reporte">
                <button type="button" className="report-action-button primary-action" disabled={isBusy} onClick={() => void runExport('pdf')}><FileDown size={17} /> {exportAction === 'pdf' ? 'Generando PDF...' : 'Generar PDF'}</button>
                <button type="button" className="report-action-button" disabled={isBusy} onClick={() => void runExport('xlsx')}><FileSpreadsheet size={17} /> {exportAction === 'xlsx' ? 'Generando Excel...' : 'Exportar Excel'}</button>
                <button type="button" className="report-action-button" disabled={isBusy} onClick={() => void runExport('html')}><Eye size={17} /> {exportAction === 'html' ? 'Generando vista...' : 'Vista HTML'}</button>
                {canEmail ? <button type="button" className="report-action-button" disabled={sending} onClick={() => setEmailOpen(true)}><Mail size={17} /> Enviar por correo</button> : null}
              </div>
            </div>
          </div>
        </div>
        {refreshing ? <div className="status-pill auto-refresh-status">Actualizando datos de la vista previa…</div> : null}
        {error ? <div className="status-pill alert">{error}</div> : null}
      </section>

      {loading && !report ? <ReportSkeleton /> : null}

      {report ? <>
        <section className="report-summary-grid fade-up" aria-label="Resumen ejecutivo del reporte">
          {summaryCards.map((card) => <article className="report-summary-card" key={card.label}><span>{card.label}</span><strong>{fmtVolume(card.value)}</strong></article>)}
          <article className="report-summary-card review"><span>Volúmenes validados</span><strong>{Number(summary.validated_items_count ?? 0).toLocaleString('es-MX')} <small>elementos</small></strong><small>Datos aceptados para operación.</small></article>
        </section>
        <p className="report-summary-note">{summary.note}</p>
        {report.legacy_notice ? <div className="status-pill alert">{report.legacy_notice}</div> : null}

        <section className="panel fade-up report-data-panel report-preview-panel">
          <div className="report-preview-heading"><div><span>Vista previa ligera</span><h3>Vista previa del reporte</h3><p>Pozos, Líneas, Lavadoras y Jarabes · Periodo {report.period_label}</p></div></div>
          <div className="report-preview-sections">
            {REPORT_SECTIONS.map((section) => <ReportPreviewSection key={section.key} report={report} section={section} />)}
          </div>
        </section>
      </> : !loading ? <ChartEmptyState message="Sin reporte cargado." /> : null}

      {emailOpen && canEmail ? <div className="modal-backdrop" onClick={() => setEmailOpen(false)}><div className="email-report-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Enviar Reporte Diario de Control Hídrico Durango</h3>
        <label>Para<input value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} placeholder="correo@dominio.com" /></label>
        <label>CC<input value={form.cc} onChange={(event) => setForm({ ...form, cc: event.target.value })} placeholder="Opcional" /></label>
        <label>Asunto<input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></label>
        <label>Mensaje<textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></label>
        <fieldset className="email-format-selector"><legend>Formatos a adjuntar</legend><label><input type="checkbox" checked={formats.pdf} onChange={(event) => setFormats((current) => ({ ...current, pdf: event.target.checked }))} /> PDF</label><label><input type="checkbox" checked={formats.xlsx} onChange={(event) => setFormats((current) => ({ ...current, xlsx: event.target.checked }))} /> Excel</label></fieldset>
        {emailStatus ? <div className="status-pill">{emailStatus}</div> : null}
        <div className="modal-actions"><button type="button" className="date-range-reset" onClick={() => setEmailOpen(false)}>Cerrar</button><button type="button" className="date-range-apply" disabled={sending || !form.to.trim() || (!formats.pdf && !formats.xlsx)} onClick={() => void send()}>{sending ? 'Enviando...' : 'Enviar'}</button></div>
      </div></div> : null}
    </div>
  );
}
