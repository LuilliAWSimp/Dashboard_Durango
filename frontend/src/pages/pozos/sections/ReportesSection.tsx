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
import ScheduledReportEmailPanel from '../components/ScheduledReportEmailPanel';
import { downloadFullHistoricalExcel, downloadFullHistoricalPdf } from '../../../services/waterHistoricalExportService';
import { operationalVolumeLabel } from '../operationalTerminology';
import { normalizeReportFilters, reportFiltersIncludeDate, sameReportFilters, type ReportFilters, type ReportMode } from '../reportExportContract';

type ReportSectionKey = 'wells' | 'production_lines' | 'washers' | 'jarabes';
type ExportAction = 'pdf' | 'xlsx' | 'html' | 'historical-excel' | 'historical-pdf' | null;

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

function friendlyReportError(caught: unknown, fallback: string): string {
  const candidate = caught as { response?: { data?: { detail?: string } }; message?: string };
  const detail = String(candidate.response?.data?.detail || candidate.message || '').trim();
  if (!detail) return fallback;
  if (/sql|odbc|pyodbc|database|query|sensor|bos|connection string/i.test(detail)) return fallback;
  return detail;
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
  const status = String(item?.quality_status || item?.validation_status || '').toLowerCase();
  if (status === 'partial' || status === 'partial_coverage' || status === 'review') return 'warning';
  if (status === 'unavailable' || status === 'no_data') return 'idle';
  return statusType(validationLabel(item));
}

function reportRows(report: any, key: ReportSectionKey): any[] {
  return report?.[key]?.rows || [];
}

function validationLabel(item: any): string {
  const status = String(item?.quality_status || item?.validation_status || '').toLowerCase();
  const sourceLabel = String(item?.quality_label || item?.validation || '').toLowerCase();
  const samples = Number(item?.samples_received ?? item?.samples ?? 0);
  if (status === 'partial' || status === 'partial_coverage' || status === 'review' || sourceLabel.includes('parcial') || sourceLabel.includes('revisi')) return 'Datos parciales';
  if (status === 'unavailable' || status === 'no_data') return samples > 0 ? 'Datos parciales' : 'Sin datos';
  if (item?.validated_volume_m3 !== null && item?.validated_volume_m3 !== undefined) return 'Datos completos';
  return samples > 0 ? 'Datos parciales' : 'Sin datos';
}

function reportVolumeDisplay(item: any): string {
  if (item?.validated_volume_m3 !== null && item?.validated_volume_m3 !== undefined) return `${fmt(item.validated_volume_m3)} m³`;
  return Number(item?.samples_received ?? item?.samples ?? 0) > 0 ? 'Sin volumen disponible' : 'Sin datos';
}

function ReportSkeleton() {
  return (
    <div className="report-preview-skeleton" aria-label="Cargando vista previa del reporte">
      <section className="report-summary-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => <div className="report-skeleton-card" key={index}><i /><b /></div>)}
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

function reportSectionVolumeLabel(sectionKey: ReportSectionKey): string {
  if (sectionKey === 'wells') return operationalVolumeLabel('well');
  if (sectionKey === 'production_lines') return operationalVolumeLabel('line');
  return operationalVolumeLabel('flow');
}

function reportSectionItemLabel(sectionKey: ReportSectionKey): string {
  if (sectionKey === 'wells') return 'Pozo';
  if (sectionKey === 'production_lines') return 'Línea';
  if (sectionKey === 'washers') return 'Lavadora';
  return 'Jarabes';
}

function explicitDateLabel(value: string): string {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function explicitRangeLabel(start: string, end: string): string {
  const [from, to] = start && end && start > end ? [end, start] : [start, end];
  const startLabel = explicitDateLabel(from);
  const endLabel = explicitDateLabel(to);
  return from === to ? startLabel : `${startLabel} → ${endLabel}`;
}

function reportSubject(mode: ReportMode, date: string, startDate: string, endDate: string): string {
  const period = mode === 'day' ? explicitDateLabel(date) : explicitRangeLabel(startDate, endDate);
  return `Reporte de Control Hídrico Durango · ${period}`;
}

function ReportPreviewTable({ rows, sectionKey, periodDateLabel }: { rows: any[]; sectionKey: ReportSectionKey; periodDateLabel: string }) {
  if (!rows.length) {
    return <div className="report-preview-empty">Sin elementos disponibles para este grupo.</div>;
  }

  return (
    <div className="pozos-table-scroll">
      <table className="pozos-operacion-table report-data-table">
        <thead>
          <tr>
            <th>{reportSectionItemLabel(sectionKey)}</th>
            <th>Flujo actual</th>
            <th>Totalizador apertura</th>
            <th>Totalizador al cierre</th>
            <th>{reportSectionVolumeLabel(sectionKey)} · {periodDateLabel}</th>
            <th>Actividad</th>
            <th>Estado de datos</th>
            <th>Comunicación</th>
            <th>Última lectura</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item: any, index: number) => (
            <tr key={`${sectionKey}-${index}`}>
              <td>{item.name}</td>
              <td>{item.flow == null ? 'No disponible' : `${fmt(item.flow)} ${item.flow_unit || 'L/s'}`}</td>
              <td>{item.opening_m3 == null ? 'No disponible' : `${fmt(item.opening_m3)} m³`}</td>
              <td>{item.closing_m3 == null ? 'No disponible' : `${fmt(item.closing_m3)} m³`}</td>
              <td>{reportVolumeDisplay(item)}</td>
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
      <ReportPreviewTable rows={rows} sectionKey={section.key} periodDateLabel={report.period_date_label || explicitRangeLabel(report.start_date, report.end_date)} />
    </section>
  );
}

export default function ReportesSection({ currentUser }: { currentUser?: { role?: string } | null }) {
  const today = todayInputDate();
  const { notify } = useNotifications();
  const canEmail = currentUser?.role === 'admin' || currentUser?.role === 'operator';
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
    subject: reportSubject('day', today, today, today),
    message: 'Se adjunta el Reporte de Control Hídrico Durango del periodo seleccionado.',
  });

  const draftFilters = useMemo<ReportFilters>(
    () => normalizeReportFilters(mode, date, startDate, endDate),
    [mode, date, startDate, endDate],
  );
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>({ date: today });

  const load = async (nextFilters: ReportFilters = draftFilters, background = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (background && report) setRefreshing(true);
    else setLoading(true);
    if (!background) setError('');
    try {
      // Preview intentionally excludes historical series and administrative shifts.
      const nextReport = await fetchDailyWaterReportPreview(nextFilters);
      setReport(nextReport);
      if (!background) {
        setAppliedFilters(nextFilters);
        const nextSubject = nextFilters.date
          ? reportSubject('day', nextFilters.date, nextFilters.date, nextFilters.date)
          : reportSubject('range', date, nextFilters.startDate || '', nextFilters.endDate || '');
        setForm((current) => ({ ...current, subject: nextSubject }));
      }
      setError('');
    } catch (caught) {
      setError(friendlyReportError(caught, 'No fue posible consultar el reporte. Intenta nuevamente.'));
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
    void load(initial);
  };

  useEffect(() => { void load({ date: today }); }, []);

  const includesToday = reportFiltersIncludeDate(appliedFilters, today);
  useAutoRefresh(includesToday, () => { void load(appliedFilters, true); });
  const hasPendingPeriodChanges = !sameReportFilters(draftFilters, appliedFilters);

  const runExport = async (action: Exclude<ExportAction, null>) => {
    if (exportAction) return;
    setExportAction(action);
    setError('');
    try {
      if (action === 'pdf') await downloadDailyWaterReportPdf(appliedFilters);
      if (action === 'xlsx') await downloadDailyWaterReportExcel(appliedFilters);
      if (action === 'html') {
        const fullReport = await fetchDailyWaterReport(appliedFilters, { includeHistory: true, includeShifts: true });
        exportDailyWaterReportHtml(fullReport);
      }
    } catch (caught) {
      setError(friendlyReportError(caught, 'No fue posible generar el formato solicitado. Intenta nuevamente.'));
    } finally {
      setExportAction(null);
    }
  };

  const runHistoricalExport = async (format: 'excel' | 'pdf') => {
    if (exportAction) return;
    const action: ExportAction = format === 'excel' ? 'historical-excel' : 'historical-pdf';
    setExportAction(action);
    setError('');
    try {
      if (format === 'excel') await downloadFullHistoricalExcel();
      else await downloadFullHistoricalPdf();
    } catch (caught) {
      const message = friendlyReportError(caught, 'No fue posible generar el histórico completo de planta. Intenta nuevamente.');
      setError(message);
      notify({
        tone: 'error',
        title: 'No se pudo generar el histórico completo',
        message,
      });
    } finally {
      setExportAction(null);
    }
  };

  const send = async () => {
    if (!canEmail) {
      notify({ tone: 'error', title: 'Acción no permitida', message: 'Su rol no permite enviar reportes por correo.' });
      return;
    }
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
        date: appliedFilters.date,
        start_date: appliedFilters.startDate,
        end_date: appliedFilters.endDate,
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
  const monitoredItems = Number(summary.monitored_items_count ?? 0);
  const fallbackSummaryCards = [
    { key: 'wells_volume', label: `${operationalVolumeLabel('well')} de pozos`, kind: 'volume', value: summary.well_validated_volume_m3 ?? summary.well_volume_m3 },
    { key: 'lines_volume', label: `${operationalVolumeLabel('line')} de líneas`, kind: 'volume', value: summary.line_validated_volume_m3 ?? summary.line_volume_m3 },
    { key: 'washers_volume', label: `${operationalVolumeLabel('flow')} de lavadoras`, kind: 'volume', value: summary.washer_validated_volume_m3 },
    { key: 'jarabes_volume', label: `${operationalVolumeLabel('flow')} de Jarabes`, kind: 'volume', value: summary.jarabes_validated_volume_m3 },
    { key: 'active_items', label: 'Con actividad', kind: 'ratio', value: Number(summary.wells_active ?? 0) + Number(summary.lines_active ?? 0) + Number(summary.washers_active ?? 0) + Number(summary.jarabes_active ?? 0), total: monitoredItems },
    { key: 'attention_items', label: 'Con atención', kind: 'ratio', value: Number(summary.review_count ?? 0) + Number(summary.no_data_count ?? 0), total: monitoredItems, detail: `${Number(summary.review_count ?? 0)} parciales · ${Number(summary.no_data_count ?? 0)} sin datos` },
  ];
  const summaryCards = report?.presentation?.summary_cards?.length ? report.presentation.summary_cards : fallbackSummaryCards;
  const comparativeRows = report?.comparatives?.rows || [];
  const comparativeHeaders = report?.comparatives?.headers || {};
  const summaryCardValue = (card: any) => card.kind === 'volume'
    ? fmtVolume(card.value)
    : `${Number(card.value ?? 0).toLocaleString('es-MX')}/${Number(card.total ?? 0).toLocaleString('es-MX')}`;
  const isBusy = exportAction !== null;
  const exportReady = Boolean(report) && !loading;

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
                <label className="report-field"><span className="report-field-label">Fecha</span><div className="date-input-with-icon report-date-input"><CalendarDays size={16} /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div></label>
              ) : <><label className="report-field"><span className="report-field-label">Desde</span><div className="date-input-with-icon report-date-input"><CalendarDays size={16} /><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div></label><label className="report-field"><span className="report-field-label">Hasta</span><div className="date-input-with-icon report-date-input"><CalendarDays size={16} /><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div></label></>}

              <div className="report-period-buttons">
                <button type="button" className="date-range-apply" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> {loading ? 'Actualizando...' : 'Actualizar'}</button>
                <button type="button" className="date-range-reset" onClick={reset} disabled={loading}><RotateCcw size={15} /> Restablecer</button>
              </div>
            </div>

            <div className="report-actions-block">
              <span className="report-field-label">Acciones</span>
              <div className="report-actions" aria-label="Acciones del reporte">
                <button type="button" className="report-action-button export-pdf-button" disabled={isBusy || !exportReady} onClick={() => void runExport('pdf')}><FileDown size={17} /> {exportAction === 'pdf' ? 'Generando PDF...' : 'Generar PDF'}</button>
                <button type="button" className="report-action-button export-excel-button" disabled={isBusy || !exportReady} onClick={() => void runExport('xlsx')}><FileSpreadsheet size={17} /> {exportAction === 'xlsx' ? 'Generando Excel...' : 'Exportar Excel'}</button>
                <button type="button" className="report-action-button" disabled={isBusy || !exportReady} onClick={() => void runExport('html')}><Eye size={17} /> {exportAction === 'html' ? 'Generando vista...' : 'Vista HTML'}</button>
                {canEmail ? <button type="button" className="report-action-button" disabled={sending || !exportReady} onClick={() => setEmailOpen(true)}><Mail size={17} /> Enviar por correo</button> : null}
              </div>
            </div>
          </div>
        </div>
        {hasPendingPeriodChanges && report ? <div className="status-pill">Cambios de periodo pendientes. Pulsa Actualizar para aplicarlos a la vista y a las exportaciones.</div> : null}
        {refreshing ? <div className="status-pill auto-refresh-status">Actualizando datos de la vista previa…</div> : null}
        {error ? <div className="status-pill alert">{error}</div> : null}
      </section>

      <ScheduledReportEmailPanel currentUser={currentUser} />

      <section className="panel historical-export-panel fade-up" aria-label="Histórico completo de planta">
        <div className="historical-export-copy">
          <span className="report-field-label">Exportaciones históricas</span>
          <h3>Histórico completo de planta</h3>
          <p>
            Excel conserva el detalle minuto a minuto. PDF presenta un resumen visual de los datos disponibles y los intervalos sin información.
          </p>
          <small>Incluye Pozos, Líneas, Lavadoras y Jarabes respetando la configuración histórica de cada elemento.</small>
        </div>
        <div className="historical-export-actions">
          <button
            type="button"
            className="report-action-button historical-excel-button export-excel-button"
            disabled={isBusy}
            onClick={() => void runHistoricalExport('excel')}
          >
            <FileSpreadsheet size={17} /> {exportAction === 'historical-excel' ? 'Generando histórico...' : 'Excel histórico completo'}
          </button>
          <button
            type="button"
            className="report-action-button historical-pdf-button export-pdf-button"
            disabled={isBusy}
            onClick={() => void runHistoricalExport('pdf')}
          >
            <FileDown size={17} /> {exportAction === 'historical-pdf' ? 'Generando resumen...' : 'PDF histórico'}
          </button>
        </div>
      </section>

      {loading && !report ? <ReportSkeleton /> : null}

      {report ? <>
        <section className="report-summary-grid fade-up" aria-label="Resumen ejecutivo del reporte">
          {summaryCards.map((card: any) => (
            <article className={`report-summary-card ${card.key === 'attention_items' && Number(card.value ?? 0) > 0 ? 'review' : ''}`} key={card.key || card.label}>
              <span>{card.label}</span>
              <strong>{summaryCardValue(card)}</strong>
              {card.detail ? <small>{card.detail}</small> : null}
            </article>
          ))}
        </section>
        <p className="report-summary-note">Los valores corresponden al periodo seleccionado. Cuando un elemento no cuenta con información suficiente se muestra como “No disponible”.</p>
        {report.legacy_notice ? <div className="status-pill alert">{report.legacy_notice}</div> : null}

        {comparativeRows.length ? <section className="panel fade-up report-data-panel report-comparative-panel" aria-label="Comparativo de volumen por módulo">
          <div className="report-preview-section-heading"><div><h4>Comparativo de volumen por módulo</h4><p>Cada columna indica la fecha o rango exacto utilizado.</p></div></div>
          <div className="pozos-table-scroll"><table className="pozos-operacion-table report-data-table"><thead><tr>
            <th>Proceso</th>
            <th>{comparativeHeaders.selected || 'Seleccionado'}</th>
            <th>{comparativeHeaders.previous || 'Anterior'}</th>
            <th>{comparativeHeaders.previous_week || 'Semana anterior'}</th>
          </tr></thead><tbody>{comparativeRows.map((row: any) => <tr key={row.key || row.label}>
            <td>{row.label}</td><td>{fmtVolume(row.selected_m3)}</td><td>{fmtVolume(row.previous_m3)}</td><td>{fmtVolume(row.previous_week_m3)}</td>
          </tr>)}</tbody></table></div>
        </section> : null}

        <section className="panel fade-up report-data-panel report-preview-panel">
          <div className="report-preview-heading"><div><span>Resumen en pantalla</span><h3>Vista previa del reporte</h3><p>Pozos, Líneas, Lavadoras y Jarabes · Periodo {report.period_label}</p></div></div>
          <div className="report-preview-sections">
            {REPORT_SECTIONS.map((section) => <ReportPreviewSection key={section.key} report={report} section={section} />)}
          </div>
        </section>
      </> : !loading ? <ChartEmptyState message="Sin reporte cargado." /> : null}

      {emailOpen && canEmail ? <div className="modal-backdrop" onClick={() => setEmailOpen(false)}><div className="email-report-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Enviar Reporte de Control Hídrico Durango</h3>
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
