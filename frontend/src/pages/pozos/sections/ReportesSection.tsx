import { useEffect, useState } from 'react';
import type { MouseEventHandler } from 'react';
import { ShieldCheck } from 'lucide-react';
import { getDailyWaterReport } from '../../../services/waterReportService';
import { exportDailyWaterReportExcel, exportDailyWaterReportHtml, printDailyWaterReportPdf } from '../../../services/dailyWaterReportExportService';
import arcaContinentalLogo from '../../../assets/arca-continental-logo.png';
import { defaultTodayRange, formatDateRangeStatus } from '../dateUtils';
import type { DateRange } from '../types';
import PanelHeader from '../components/PanelHeader';
import DateRangeControls from '../components/DateRangeControls';
import ReportPreviewTable from '../components/ReportPreviewTable';

type ReportExportFormat = 'pdf' | 'excel' | 'html';

type NumericValue = number | string | null | undefined;

interface WaterEntryRow {
  [key: string]: unknown;
  equipo?: string;
  ubicacion?: string;
  suministro_m3?: NumericValue;
  flujo_lps?: NumericValue;
  estado?: string;
}

interface WaterConsumptionRow {
  [key: string]: unknown;
  equipo?: string;
  ubicacion?: string;
  suministro?: NumericValue;
  unidad?: string;
  porcentaje?: NumericValue;
}

interface ProductionLineRow {
  [key: string]: unknown;
  linea?: string;
  sensor_id?: NumericValue;
  flujo_lps?: NumericValue;
  totalizador_m3?: NumericValue;
  volumen_periodo_m3?: NumericValue;
  estado?: string;
}

interface OperationalFlowRow {
  [key: string]: unknown;
  equipo?: string;
  sensor_id?: NumericValue;
  tipo?: string;
  flujo_lps?: NumericValue;
  totalizador_m3?: NumericValue;
  volumen_periodo_m3?: NumericValue;
  estado?: string;
}

interface PendingFieldRow {
  [key: string]: unknown;
  name?: string;
  detail?: string;
}

interface DailyWaterReportSection<T> {
  [key: string]: unknown;
  rows?: T[];
  total_pozos_m3?: NumericValue;
  total_entrada_m3?: NumericValue;
}

interface DailyWaterReport {
  [key: string]: unknown;
  title?: string;
  plant?: string;
  date?: string;
  report_code?: string;
  source_status?: string;
  water_entry?: DailyWaterReportSection<WaterEntryRow>;
  water_consumption?: DailyWaterReportSection<WaterConsumptionRow>;
  production_lines?: DailyWaterReportSection<ProductionLineRow>;
  operational_flows?: DailyWaterReportSection<OperationalFlowRow>;
  missing_fields?: PendingFieldRow[];
}

function ReportesSection() {
  const [dailyReport, setDailyReport] = useState<DailyWaterReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportDraftRange, setReportDraftRange] = useState<DateRange>(defaultTodayRange);
  const [reportRange, setReportRange] = useState<DateRange>(defaultTodayRange);

  const loadDailyReport = async (range: Partial<DateRange> = reportRange) => {
    setReportLoading(true);
    setReportError('');
    try {
      const sameDay = range?.startDate && range?.endDate && range.startDate === range.endDate;
      const report = await getDailyWaterReport(sameDay
        ? { date: range.startDate }
        : { startDate: range?.startDate, endDate: range?.endDate }
      ) as DailyWaterReport;
      setDailyReport(report);
      return report;
    } catch (error) {
      console.error('No fue posible cargar el reporte diario de agua', error);
      setReportError('No fue posible cargar el reporte desde monitoreo de planta.');
      return null;
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    loadDailyReport(reportRange);
  }, [reportRange.startDate, reportRange.endDate, reportRange.refreshKey]);

  const exportReport = async (format: ReportExportFormat) => {
    const report = dailyReport || await loadDailyReport();
    if (!report) {
      window.alert('No fue posible generar el reporte. Revisa la disponibilidad de datos operativos.');
      return;
    }
    if (format === 'pdf') printDailyWaterReportPdf(report, arcaContinentalLogo);
    if (format === 'excel') exportDailyWaterReportExcel(report);
    if (format === 'html') exportDailyWaterReportHtml(report, arcaContinentalLogo);
  };

  const entryRows = dailyReport?.water_entry?.rows || [];
  const consumptionRows = dailyReport?.water_consumption?.rows || [];
  const lineRows = dailyReport?.production_lines?.rows || [];
  const flowRows = dailyReport?.operational_flows?.rows || [];
  const linePeriodTotal = lineRows.reduce((sum, item) => sum + Number(item.volumen_periodo_m3 || 0), 0);
  const flowPeriodTotal = flowRows.reduce((sum, item) => sum + Number(item.volumen_periodo_m3 || 0), 0);
  const reportStatus = `Reporte: ${formatDateRangeStatus(reportRange, 'Hoy')}`;

  return (
    <section className="reportes-page fade-up">
      <div className="panel report-hero-panel">
        <PanelHeader
          title="Reportes"
          subtitle="Reporte operativo de Durango con pozos, líneas y flujos."
        />
        <DateRangeControls
          className="report-date-range-panel"
          title="Fechas del reporte"
          subtitle="Este rango solo afecta este reporte y sus exportaciones."
          draftRange={reportDraftRange}
          activeRange={reportRange}
          onDraftChange={setReportDraftRange}
          onApply={() => {
            setReportRange((previous) => ({ ...reportDraftRange, refreshKey: (previous.refreshKey || 0) + 1 }));
          }}
          onReset={() => {
            const today = defaultTodayRange();
            setReportDraftRange(today);
            setReportRange((previous) => ({ ...today, refreshKey: (previous.refreshKey || 0) + 1 }));
          }}
          status={reportStatus}
          showDateIcons
        />
        <div className="report-actions">
          <button type="button" className="primary-action report-action-button" onClick={() => exportReport('pdf')}>Generar PDF</button>
          <button type="button" className="ghost-action report-action-button" onClick={() => exportReport('excel')}>Exportar Excel</button>
          <button type="button" className="ghost-action report-action-button" onClick={() => exportReport('html')}>Vista HTML</button>
          <button type="button" className="ghost-action report-action-button" onClick={loadDailyReport as unknown as MouseEventHandler<HTMLButtonElement>}>Actualizar datos</button>
        </div>
      </div>

      <article className="daily-report-preview panel">
        <div className="daily-report-band">
          <img src={arcaContinentalLogo} alt="Arca Continental" className="daily-report-logo" />
        </div>
        <div className="daily-report-meta">
          <div>
            <h2>{dailyReport?.title || 'Reporte Diario de Agua'}</h2>
            <p>{dailyReport?.plant || 'Planta Durango'}</p>
            <p>Fecha: {dailyReport?.date || '—'}</p>
            <p>Periodo consultado: {formatDateRangeStatus(reportRange, 'Hoy')}</p>
          </div>
          <div className="daily-report-code">
            <span>Reporte:</span>
            <strong>{dailyReport?.report_code || '—'}</strong>
            <small>{dailyReport ? 'Información operativa' : 'Cargando...'}</small>
          </div>
        </div>

        {reportLoading && <div className="status-pill report-status-pill">Cargando datos operativos...</div>}
        {reportError && <div className="status-pill alert report-status-pill">{reportError}</div>}

        <div className="daily-report-kpis">
          <div><span>Pozos periodo</span><strong>{formatNumber(dailyReport?.water_entry?.total_pozos_m3 || 0, 2)} m³</strong></div>
          <div><span>Líneas periodo</span><strong>{formatNumber(linePeriodTotal, 2)} m³</strong></div>
          <div><span>Lavadoras/Jarabes</span><strong>{formatNumber(flowPeriodTotal, 2)} m³</strong></div>
        </div>

        <ReportPreviewTable
          title="Entrada de Agua"
          headers={['Equipo', 'Ubicación', 'Suministro m³', 'Flujo L/s', 'Estado']}
          rows={entryRows.map((item) => [item.equipo, item.ubicacion, formatNumber(item.suministro_m3, 2), formatNumber(item.flujo_lps, 2), item.estado])}
        />
        <ReportPreviewTable
          title="Consumo de Agua"
          headers={['Equipo', 'Ubicación', 'Suministro', 'Unidad', 'Porcentaje']}
          rows={consumptionRows.map((item) => [item.equipo, item.ubicacion, formatNumber(item.suministro, 2), item.unidad, `${formatNumber(item.porcentaje, 2)}%`])}
        />
        <ReportPreviewTable
          title="Líneas"
          headers={['Línea', 'Flujo L/s', 'Volumen periodo m³', 'Totalizador m³', 'Estado']}
          rows={lineRows.map((item) => [item.linea, formatNumber(item.flujo_lps, 2), formatNumber(item.volumen_periodo_m3, 2), formatNumber(item.totalizador_m3, 2), item.estado])}
        />
        <ReportPreviewTable
          title="Flujos"
          headers={['Punto', 'Flujo L/s', 'Volumen periodo m³', 'Totalizador m³', 'Estado']}
          rows={flowRows.map((item) => [item.equipo, formatNumber(item.flujo_lps, 2), formatNumber(item.volumen_periodo_m3, 2), formatNumber(item.totalizador_m3, 2), item.estado])}
        />
      </article>

      <section className="cards-grid reports-grid">
        {[
          {
            title: 'Pozos',
            description: 'Pozo 1 y Pozo 2 en el reporte operativo.',
            status: `${entryRows.length}/2`,
          },
          {
            title: 'Líneas',
            description: 'Cinco líneas reales de Durango.',
            status: `${lineRows.length}/5`,
          },
          {
            title: 'Flujos',
            description: 'Lavadora Ciel, Jarabes y Lavadora de Vidrio.',
            status: `${flowRows.length}/3`,
          },
        ].map((card) => (
          <article key={card.title} className="panel report-card-clean">
            <div className="report-card-head">
              <div>
                <div className="panel-title small">{card.title}</div>
                <div className="panel-subtitle">{card.description}</div>
              </div>
              <div className="report-card-icon"><ShieldCheck size={18} /></div>
            </div>
            <div className="status-pill normal report-status-pill">{card.status}</div>
          </article>
        ))}
      </section>
    </section>
  );
}

function formatNumber(value: unknown, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value).toLocaleString('es-MX', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default ReportesSection;
