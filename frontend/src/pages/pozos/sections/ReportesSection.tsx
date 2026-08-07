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

type ReportMode = 'day' | 'range';
type ReportTab = 'wells' | 'production_lines' | 'operational_flows';
type ReportFilters = { date?: string; startDate?: string; endDate?: string };
type ExportAction = 'pdf' | 'xlsx' | 'html' | null;

const TABS: Array<{ key: ReportTab; label: string }> = [
  { key: 'wells', label: 'Pozos' },
  { key: 'production_lines', label: 'Líneas' },
  { key: 'operational_flows', label: 'Flujos' },
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
  if (text.includes('sin')) return 'communication';
  return 'normal';
}

function reportRows(report: any, key: ReportTab): any[] {
  return report?.[key]?.rows || [];
}

function validationLabel(item: any): string {
  if (item?.validation) return String(item.validation);
  if (item?.validated_volume_m3 === null || item?.validated_volume_m3 === undefined) return 'Sin volumen validado';
  return item?.has_discontinuities ? 'Validación parcial' : 'Validado';
}

function ReportSkeleton() {
  return (
    <div className="report-preview-skeleton" aria-label="Cargando vista previa del reporte">
      <section className="report-summary-grid">
        {Array.from({ length: 5 }, (_, index) => <div className="report-skeleton-card" key={index}><i /><b /></div>)}
      </section>
      <section className="panel report-data-panel report-skeleton-table"><i /><i /><i /><i /></section>
    </div>
  );
}

export default function ReportesSection() {
  const today = todayInputDate();
  const [mode, setMode] = useState<ReportMode>('day');
  const [date, setDate] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [activeTab, setActiveTab] = useState<ReportTab>('wells');
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
    setActiveTab('wells');
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
      const result = await sendDailyWaterReportEmail({
        to: form.to,
        cc: form.cc || undefined,
        subject: form.subject,
        message: form.message,
        date: mode === 'day' ? date : undefined,
        start_date: mode === 'range' ? startDate : undefined,
        end_date: mode === 'range' ? endDate : undefined,
        formats: selectedFormats,
      });
      setEmailStatus(result.message || 'El servidor SMTP aceptó el correo para entrega.');
    } catch (caught) {
      const candidate = caught as { response?: { data?: { detail?: string } }; message?: string };
      setEmailStatus(candidate.response?.data?.detail || candidate.message || 'No fue posible enviar el correo.');
    } finally {
      setSending(false);
    }
  };

  const summary = report?.summary || {};
  const summaryCards = [
    { label: 'Volumen validado de pozos', value: summary.well_validated_volume_m3 ?? summary.well_volume_m3 },
    { label: 'Volumen validado de líneas', value: summary.line_validated_volume_m3 ?? summary.line_volume_m3 },
    { label: 'Volumen validado de flujos', value: summary.washer_validated_volume_m3 ?? summary.flow_validated_volume_m3 ?? summary.flow_volume_m3 },
    { label: 'Total validado operativo', value: summary.total_validated_operational_m3 ?? summary.total_operational_m3 },
  ];
  const activeTabLabel = TABS.find((tab) => tab.key === activeTab)?.label || 'Pozos';
  const isBusy = exportAction !== null;

  return (
    <div className="reportes-page durango-report-page">
      <section className="panel report-hero-panel fade-up">
        <div className="report-center-heading">
          <span>Centro de reportes</span>
          <PanelHeader title="Reportes" subtitle="Control hídrico · Planta Durango" />
          <p>Genera, consulta y envía reportes del periodo seleccionado.</p>
        </div>

        <div className="report-controls-panel">
          <div className="report-controls-copy"><strong>Periodo del reporte</strong><span>La selección se conserva para la vista, PDF, Excel, HTML y correo.</span></div>
          <div className="date-range-fields report-period-fields">
            <label><span>Tipo</span><select value={mode} onChange={(event) => setMode(event.target.value as ReportMode)}><option value="day">Fecha</option><option value="range">Periodo</option></select></label>
            {mode === 'day' ? (
              <label><span>Fecha</span><div className="date-input-with-icon"><CalendarDays size={16} /><input type="date" value={date} onChange={(event) => { setDate(event.target.value); setForm((current) => ({ ...current, subject: `Reporte Diario de Control Hídrico Durango - ${event.target.value}` })); }} /></div></label>
            ) : <><label><span>Desde</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label><span>Hasta</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></>}
            <div className="report-period-buttons">
              <button type="button" className="date-range-apply" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> {loading ? 'Actualizando...' : 'Actualizar'}</button>
              <button type="button" className="date-range-reset" onClick={reset} disabled={loading}><RotateCcw size={15} /> Restablecer</button>
            </div>
          </div>
        </div>

        <div className="report-actions-panel">
          <div><strong>Acciones del reporte</strong><span>Los formatos completos se construyen únicamente cuando los solicitas.</span></div>
          <div className="report-actions" aria-label="Acciones del reporte">
            <button type="button" className="report-action-button primary-action" disabled={isBusy} onClick={() => void runExport('pdf')}><FileDown size={17} /> {exportAction === 'pdf' ? 'Generando PDF...' : 'Generar PDF'}</button>
            <button type="button" className="report-action-button" disabled={isBusy} onClick={() => void runExport('xlsx')}><FileSpreadsheet size={17} /> {exportAction === 'xlsx' ? 'Generando Excel...' : 'Exportar Excel'}</button>
            <button type="button" className="report-action-button" disabled={isBusy} onClick={() => void runExport('html')}><Eye size={17} /> {exportAction === 'html' ? 'Generando vista...' : 'Vista HTML'}</button>
            <button type="button" className="report-action-button" disabled={sending} onClick={() => setEmailOpen(true)}><Mail size={17} /> Enviar por correo</button>
          </div>
        </div>
        {refreshing ? <div className="status-pill auto-refresh-status">Actualizando datos de la vista previa…</div> : null}
        {error ? <div className="status-pill alert">{error}</div> : null}
      </section>

      {loading && !report ? <ReportSkeleton /> : null}

      {report ? <>
        <section className="report-summary-grid fade-up" aria-label="Resumen ejecutivo del reporte">
          {summaryCards.map((card) => <article className="report-summary-card" key={card.label}><span>{card.label}</span><strong>{fmtVolume(card.value)}</strong></article>)}
          <article className="report-summary-card review"><span>Validación parcial</span><strong>{Number(summary.partial_validation_count ?? summary.review_count ?? 0).toLocaleString('es-MX')} <small>elementos</small></strong><small>Con volumen utilizable y eventos descartados.</small></article>
        </section>
        <p className="report-summary-note">{summary.note}</p>
        {report.legacy_notice ? <div className="status-pill alert">{report.legacy_notice}</div> : null}

        <section className="panel fade-up report-data-panel">
          <div className="report-preview-heading"><div><span>Vista previa ligera</span><h3>{activeTabLabel}</h3><p>Periodo {report.period_label}</p></div><div className="report-section-tabs" role="tablist" aria-label="Secciones del reporte">{TABS.map((tab) => <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key} className={activeTab === tab.key ? 'active' : ''} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>)}</div></div>
          <div className="pozos-table-scroll">
            <table className="pozos-operacion-table report-data-table">
              <thead><tr><th>Elemento</th><th>Flujo actual</th><th>Apertura</th><th>Cierre</th><th>Volumen</th><th>Actividad</th><th>Validación</th><th>Comunicación</th><th>Última actualización</th></tr></thead>
              <tbody>{reportRows(report, activeTab).map((item: any, index: number) => <tr key={`${activeTab}-${index}`}><td>{item.name}</td><td>{item.flow == null ? 'No disponible' : `${fmt(item.flow)} ${item.flow_unit || 'L/s'}`}</td><td>{item.opening_m3 == null ? 'No disponible' : `${fmt(item.opening_m3)} m³`}</td><td>{item.closing_m3 == null ? 'No disponible' : `${fmt(item.closing_m3)} m³`}</td><td>{item.validated_volume_m3 == null ? 'Sin volumen validado' : `${fmt(item.validated_volume_m3)} m³`}</td><td><StatusBadge type={statusType(item.activity)}>{item.activity}</StatusBadge></td><td><StatusBadge type={statusType(validationLabel(item))}>{validationLabel(item)}</StatusBadge></td><td>{item.communication}</td><td>{fmtLocalDate(item.last_update)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </> : !loading ? <ChartEmptyState message="Sin reporte cargado." /> : null}

      {emailOpen ? <div className="modal-backdrop" onClick={() => setEmailOpen(false)}><div className="email-report-modal" onClick={(event) => event.stopPropagation()}>
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
