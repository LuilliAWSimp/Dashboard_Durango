import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Eye, FileDown, FileSpreadsheet, Mail, RefreshCw, RotateCcw } from 'lucide-react';
import {
  fetchDailyWaterReport,
  downloadDailyWaterReportExcel,
  downloadDailyWaterReportPdf,
  sendDailyWaterReportEmail,
} from '../../../services/waterReportService';
import { exportDailyWaterReportHtml } from '../../../services/dailyWaterReportExportService';
import { todayInputDate } from '../dateUtils';
import ChartEmptyState from '../components/ChartEmptyState';
import PanelHeader from '../components/PanelHeader';
import StatusBadge from '../components/StatusBadge';

type ReportMode = 'day' | 'range';
type ReportFilters = { date?: string; startDate?: string; endDate?: string };

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
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function rows(report: any, key: string): any[] {
  return report?.[key]?.rows || [];
}

function statusType(value: unknown): string {
  const text = String(value || '').toLowerCase();
  if (text.includes('revisión') || text.includes('atrasada')) return 'warning';
  if (text.includes('sin')) return 'communication';
  return 'normal';
}

function volumeDisplay(item: any): string {
  if (item?.has_discontinuities && item?.validated_volume_m3 !== null && item?.validated_volume_m3 !== undefined) {
    return `Volumen validado parcial: ${fmt(item.validated_volume_m3)} m³`;
  }
  if (item?.validated_volume_m3 !== null && item?.validated_volume_m3 !== undefined) {
    return `${fmt(item.validated_volume_m3)} m³`;
  }
  return String(item?.activity || 'No disponible');
}

export default function ReportesSection() {
  const today = todayInputDate();
  const [mode, setMode] = useState<ReportMode>('day');
  const [date, setDate] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState('');
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

  const load = async (nextFilters: ReportFilters = filters) => {
    setLoading(true);
    setError('');
    try {
      setReport(await fetchDailyWaterReport(nextFilters));
    } catch (caught) {
      const candidate = caught as { response?: { data?: { detail?: string } }; message?: string };
      setError(candidate.response?.data?.detail || candidate.message || 'No fue posible consultar el reporte.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    const initial = { date: today };
    setMode('day');
    setDate(today);
    setStartDate(today);
    setEndDate(today);
    setForm((current) => ({
      ...current,
      subject: `Reporte Diario de Control Hídrico Durango - ${today}`,
    }));
    void load(initial);
  };

  useEffect(() => {
    void load({ date: today });
  }, []);

  const send = async () => {
    setSending(true);
    setEmailStatus('');
    try {
      const payload = {
        to: form.to,
        cc: form.cc || undefined,
        subject: form.subject,
        message: form.message,
        date: mode === 'day' ? date : undefined,
        start_date: mode === 'range' ? startDate : undefined,
        end_date: mode === 'range' ? endDate : undefined,
      };
      const result = await sendDailyWaterReportEmail(payload);
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
    { label: 'Volumen validado de lavadoras', value: summary.washer_validated_volume_m3 ?? summary.flow_validated_volume_m3 ?? summary.flow_volume_m3 },
    { label: 'Total validado operativo', value: summary.total_validated_operational_m3 ?? summary.total_operational_m3 },
  ];

  return (
    <div className="reportes-page durango-report-page">
      <section className="panel report-hero-panel fade-up">
        <PanelHeader title="Reportes" subtitle="Reporte Diario de Control Hídrico Durango" />

        <div className="report-controls-panel">
          <div className="report-controls-copy">
            <strong>Periodo del reporte</strong>
            <span>Selecciona la fecha o rango que se utilizará en la vista, PDF, Excel y correo.</span>
          </div>
          <div className="date-range-fields report-period-fields">
            <label>
              <span>Tipo</span>
              <select value={mode} onChange={(event) => setMode(event.target.value as ReportMode)}>
                <option value="day">Fecha</option>
                <option value="range">Periodo</option>
              </select>
            </label>
            {mode === 'day' ? (
              <label>
                <span>Fecha</span>
                <div className="date-input-with-icon">
                  <CalendarDays size={16} />
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => {
                      setDate(event.target.value);
                      setForm((current) => ({
                        ...current,
                        subject: `Reporte Diario de Control Hídrico Durango - ${event.target.value}`,
                      }));
                    }}
                  />
                </div>
              </label>
            ) : (
              <>
                <label>
                  <span>Desde</span>
                  <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                </label>
                <label>
                  <span>Hasta</span>
                  <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                </label>
              </>
            )}
            <div className="report-period-buttons">
              <button type="button" className="date-range-apply" onClick={() => void load()} disabled={loading}>
                <RefreshCw size={15} /> {loading ? 'Actualizando...' : 'Actualizar'}
              </button>
              <button type="button" className="date-range-reset" onClick={reset} disabled={loading}>
                <RotateCcw size={15} /> Restablecer
              </button>
            </div>
          </div>
        </div>

        <div className="report-actions" aria-label="Acciones del reporte">
          <button type="button" className="report-action-button primary-action" onClick={() => void downloadDailyWaterReportPdf(filters)}>
            <FileDown size={17} /> Generar PDF
          </button>
          <button type="button" className="report-action-button" onClick={() => void downloadDailyWaterReportExcel(filters)}>
            <FileSpreadsheet size={17} /> Exportar Excel
          </button>
          <button type="button" className="report-action-button" onClick={() => report && exportDailyWaterReportHtml(report)} disabled={!report}>
            <Eye size={17} /> Vista HTML
          </button>
          <button type="button" className="report-action-button" onClick={() => setEmailOpen(true)}>
            <Mail size={17} /> Enviar por correo
          </button>
        </div>
        {error ? <div className="status-pill alert">{error}</div> : null}
      </section>

      {report ? (
        <>
          <section className="report-summary-grid fade-up" aria-label="Resumen ejecutivo del reporte">
            {summaryCards.map((card) => (
              <article className="report-summary-card" key={card.label}>
                <span>{card.label}</span>
                <strong>{fmtVolume(card.value)}</strong>
              </article>
            ))}
            <article className="report-summary-card review">
              <span>Datos en revisión</span>
              <strong>{Number(summary.review_count || 0).toLocaleString('es-MX')}</strong>
              <small>Elementos con eventos o datos que requieren revisión.</small>
            </article>
          </section>
          <p className="report-summary-note">{summary.note}</p>
          {report.legacy_notice ? <div className="status-pill alert">{report.legacy_notice}</div> : null}

          {[
            ['Pozos', 'wells'],
            ['Líneas', 'production_lines'],
            ['Lavadoras', 'operational_flows'],
          ].map(([title, key]) => (
            <section key={key} className="panel fade-up report-data-panel">
              <PanelHeader title={title} subtitle={`Periodo ${report.period_label}`} />
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
                      <th>Comunicación</th>
                      <th>Última actualización</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows(report, key).map((item: any, index: number) => (
                      <tr key={`${key}-${index}`}>
                        <td>{item.name}</td>
                        <td>{item.flow == null ? 'No disponible' : `${fmt(item.flow)} ${item.flow_unit || 'L/s'}`}</td>
                        <td>{item.opening_m3 == null ? 'No disponible' : `${fmt(item.opening_m3)} m³`}</td>
                        <td>{item.closing_m3 == null ? 'No disponible' : `${fmt(item.closing_m3)} m³`}</td>
                        <td>{volumeDisplay(item)}</td>
                        <td><StatusBadge type={statusType(item.activity)}>{item.activity}</StatusBadge></td>
                        <td>{item.communication}</td>
                        <td>{fmtLocalDate(item.last_update)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      ) : !loading ? (
        <ChartEmptyState message="Sin reporte cargado." />
      ) : null}

      {emailOpen ? (
        <div className="modal-backdrop" onClick={() => setEmailOpen(false)}>
          <div className="email-report-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Enviar Reporte Diario de Control Hídrico Durango</h3>
            <label>Para<input value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} placeholder="correo@dominio.com" /></label>
            <label>CC<input value={form.cc} onChange={(event) => setForm({ ...form, cc: event.target.value })} placeholder="Opcional" /></label>
            <label>Asunto<input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></label>
            <label>Mensaje<textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></label>
            {emailStatus ? <div className="status-pill">{emailStatus}</div> : null}
            <div className="modal-actions">
              <button type="button" className="date-range-reset" onClick={() => setEmailOpen(false)}>Cerrar</button>
              <button type="button" className="date-range-apply" disabled={sending || !form.to.trim()} onClick={() => void send()}>
                {sending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
