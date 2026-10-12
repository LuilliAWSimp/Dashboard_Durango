import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertCircle, ArrowDownToLine, CalendarDays, CheckCircle2, ClipboardCheck, Database, BarChart3,
  Droplets, FileCheck2, FileText, FileUp, History, Info, LockKeyhole, Pencil, RefreshCw,
  ShieldCheck, TrendingUp, Waves, X,
} from 'lucide-react';
import {
  downloadConcessionPdf, fetchConcessionAudit, fetchConcessions, previewConcessionPdf,
  saveConcessionPdf, updateConcession, queueConcessionHistoryRebuild,
} from '../../../services/concessionService';
import type { ConcessionPayload, ConcessionRecord, PdfPreview, ConcessionMonthlyHistory } from '../../../services/concessionService';
import { fetchConcessionMonthlyHistory } from '../../../services/concessionService';
import { buildOperationalChart, summarizeOperationalChart, concessionMonthStatus, CONCESSION_MONTH_LABELS } from '../../../utils/durangoConcessionOperational';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildConcessionVisualSummary } from '../../../utils/durangoConcessionVisual';

const integer = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });
const formatM3 = (value: number | null | undefined) => value == null ? '—' : integer.format(value);
const baseForm = (row: ConcessionRecord): ConcessionPayload => ({
  title_number: row.title_number,
  annual_volume_m3: row.annual_volume_m3,
  valid_from: row.valid_from,
  valid_to: row.valid_to,
  notes: row.notes || '',
});
const errorMessage = (err: any) => {
  const detail = err?.response?.data?.detail;
  return typeof detail === 'string' ? detail : 'No se completó la operación. Revise la conexión e inténtelo de nuevo.';
};

function StateLabel({ row }: { row: ConcessionRecord }) {
  return <span className={`con-state ${row.has_document ? 'con-state-doc' : ''}`}>
    {row.has_document ? <FileCheck2 size={13} /> : <AlertCircle size={13} />}
    {row.has_document ? 'PDF adjunto · Por validar' : 'Dato provisional'}
  </span>;
}

function OperationalTooltip({ active, payload, mode }: { active?: boolean; payload?: any[]; mode: 'monthly' | 'cumulative' }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row || (mode === 'monthly' ? row.volume_m3 : row.cumulative_m3) == null) return null;
  return <div className="con-operational-tooltip"><strong>{row.name}</strong><span>{mode === 'monthly' ? 'Volumen verificado' : 'Acumulado observado'}: <b>{formatM3(mode === 'monthly' ? row.volume_m3 : row.cumulative_m3)} m³</b></span><small>{row.days_with_volume} días con volumen · Cobertura {row.coverage_percent == null ? 'sin dato' : `${row.coverage_percent}%`}</small>{row.status === 'partial' && <small>Periodo parcial: {row.days_without_data} días sin lecturas, {row.days_excluded} excluidos</small>}</div>;
}

export default function ConcesionesSection({ currentUser }: { currentUser?: { role?: string } }) {
  const isAdmin = currentUser?.role === 'admin';
  const [records, setRecords] = useState<ConcessionRecord[]>([]);
  const [selected, setSelected] = useState('pozo_1');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ConcessionPayload | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PdfPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const [notice, setNotice] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chartMode, setChartMode] = useState<'quota' | 'monthly'>('monthly');
  const [year, setYear] = useState(new Date().getFullYear());
  const [operational, setOperational] = useState<ConcessionMonthlyHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [audit, setAudit] = useState<Array<{ action: string; actor: string; created_at: string; details: Record<string, unknown> }>>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [rebuildBusy, setRebuildBusy] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const payload = await fetchConcessions();
      if (!mounted.current) return;
      setRecords(payload.records);
      setError('');
    } catch (err) {
      if (mounted.current) setError(errorMessage(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh(true);
    const interval = window.setInterval(() => {
      if (!document.hidden && !editing) void refresh();
    }, 30000);
    const focus = () => { if (!editing) void refresh(); };
    window.addEventListener('focus', focus);
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', focus);
    };
  }, [refresh, editing]);

  const loadOperational = useCallback(async (yearToLoad: number, showLoading = true) => {
    if (showLoading) setHistoryLoading(true);
    try {
      const payload = await fetchConcessionMonthlyHistory(yearToLoad);
      if (!mounted.current) return;
      setOperational(payload);
      setHistoryError('');
    } catch (err) {
      if (mounted.current) {
        setHistoryError(errorMessage(err));
        setOperational(null);
      }
    } finally {
      if (mounted.current) setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setOperational(null);
    setHistoryLoading(true);
    const read = async () => {
      try {
        const payload = await fetchConcessionMonthlyHistory(year);
        if (active) { setOperational(payload); setHistoryError(''); }
      } catch (err) {
        if (active) { setHistoryError(errorMessage(err)); setOperational(null); }
      } finally {
        if (active) setHistoryLoading(false);
      }
    };
    void read();
    const timer = window.setInterval(() => { if (!document.hidden) void read(); }, 30 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, [year]);

  const row = records.find((item) => item.well_key === selected) || records[0];
  const { total, largest, shares: widths, documentsPending } = buildConcessionVisualSummary(records);

  const openEdit = () => {
    if (!isAdmin || !row) return;
    setForm(baseForm(row));
    setFile(null);
    setPreview(null);
    setModalError('');
    setEditing(true);
  };

  const acceptFile = async (incoming: File | null) => {
    setFile(incoming);
    setPreview(null);
    setModalError('');
    if (!incoming) return;
    if (!incoming.name.toLowerCase().endsWith('.pdf') || incoming.size > 10 * 1024 * 1024) {
      setModalError('Seleccione un PDF de máximo 10 MB.');
      setFile(null);
      return;
    }
    setPreviewBusy(true);
    try {
      setPreview(await previewConcessionPdf(incoming));
    } catch (err) {
      setModalError(errorMessage(err));
      setFile(null);
    } finally {
      setPreviewBusy(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!row || !form || !isAdmin || saveBusy) return;
    setModalError('');
    if (!form.title_number.trim() || !(Number(form.annual_volume_m3) > 0)) {
      setModalError('Capture un título y un volumen autorizado positivo.');
      return;
    }
    if (form.valid_from && form.valid_to && form.valid_from > form.valid_to) {
      setModalError('La fecha de término es anterior al inicio de vigencia.');
      return;
    }
    setSaveBusy(true);
    try {
      if (file) await saveConcessionPdf(row.well_key, form, file);
      else await updateConcession(row.well_key, form);
      setEditing(false);
      setNotice('Información publicada en el servidor. Otros usuarios verán el cambio al actualizar su consulta.');
      await refresh();
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setSaveBusy(false);
    }
  };

  const showAudit = async () => {
    if (!isAdmin || !row) return;
    setHistoryOpen(true);
    setHistoryBusy(true);
    try {
      setAudit(await fetchConcessionAudit(row.well_key));
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      setHistoryBusy(false);
    }
  };

  const download = async () => {
    if (!row?.has_document) return;
    try { await downloadConcessionPdf(row.well_key, row.document_name); }
    catch (err) { setNotice(errorMessage(err)); }
  };

  const queueRecentDays = async () => {
    if (!isAdmin || rebuildBusy) return;
    setRebuildBusy(true);
    try {
      const today = new Date();
      const latest = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const start = new Date(latest);
      start.setDate(start.getDate() - 6);
      const dayKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
      await queueConcessionHistoryRebuild(dayKey(start), dayKey(latest));
      setNotice('Reprocesamiento de los últimos 7 días en cola. La pantalla seguirá disponible.');
      void loadOperational(year, false);
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      setRebuildBusy(false);
    }
  };

  const chartMax = Math.max(1, Math.ceil(largest / 100000) * 100000);
  const chartTicks = [4, 3, 2, 1, 0].map((part) => chartMax * part / 4);
  const months = CONCESSION_MONTH_LABELS;
  const selectedShare = widths.find((item) => item.well_key === row?.well_key);
  const selectedOperational = operational?.wells.find((item) => item.well_key === row?.well_key);
  const selectedCoverage = selectedOperational?.coverage;
  const chartData = buildOperationalChart(selectedOperational?.months || []);
  const analytics = summarizeOperationalChart(selectedOperational?.months || []);
  const totalObserved = operational?.wells.reduce((sum, item) => sum + (item.operational_total_m3 ?? 0), 0);
  const anyObserved = operational?.wells.some((item) => item.operational_total_m3 !== null);
  const operationalShare = row && selectedOperational?.operational_total_m3 != null && row.annual_volume_m3 > 0
    ? (selectedOperational.operational_total_m3 / row.annual_volume_m3) * 100 : null;
  const endYear = new Date().getFullYear();
  const todayMonth = new Date().getMonth() + 1;
  const isCurrentYear = year === endYear;
  const monthOfInterest = isCurrentYear ? todayMonth : (analytics.recent?.month ?? 12);
  const currentMonth = chartData.find((month) => month.month === monthOfInterest);
  const dayCoverage = selectedCoverage && selectedCoverage.expected_days > 0
    ? selectedCoverage.days_with_volume / selectedCoverage.expected_days * 100 : null;

  return <div className="concessions-page con-v2">
    <section className="con-hero panel fade-up">
      <div className="con-hero-heading">
        <div className="con-hero-icon"><ShieldCheck size={25} /></div>
        <div className="con-hero-copy">
          <span className="con-eyebrow">PLANTA DURANGO / GESTIÓN HÍDRICA</span>
          <h2>Concesiones de agua</h2>
          <p>Autorizaciones por pozo, análisis comparativo y expediente documental de la planta.</p>
        </div>
        <span className="con-pill"><LockKeyhole size={13} />{isAdmin ? 'Acceso administrador' : 'Sólo consulta'}</span>
      </div>
      <div className="con-hero-bottom">
        <div className="con-source-note"><Info size={16}/><span>Datos de referencia tomados del correo. <strong>Vigencia y volúmenes pendientes de cotejar contra los títulos vigentes.</strong></span></div>
        <button type="button" className="con-button con-button-muted" onClick={() => { void refresh(true); void loadOperational(year); }} disabled={loading || historyLoading}><RefreshCw size={15} className={loading ? 'con-spinning' : ''} /> Actualizar datos</button>
      </div>
    </section>

    {error && <div className="con-alert con-alert-error" role="alert"><AlertCircle size={18} /> {error}</div>}
    {notice && <div className="con-alert con-alert-success" role="status"><CheckCircle2 size={18} /> {notice}<button type="button" onClick={() => setNotice('')} aria-label="Cerrar aviso"><X size={16}/></button></div>}

    <section className="con-kpi-grid" aria-label="Resumen de concesiones">
      <article className="con-kpi panel"><span className="con-kpi-icon"><Waves size={19}/></span><small>Pozos con título registrado</small><strong>{loading && !records.length ? '—' : records.length}</strong><span>Inventario de la planta</span></article>
      <article className="con-kpi panel con-kpi-accent"><span className="con-kpi-icon"><Droplets size={19}/></span><small>Volumen autorizado de referencia</small><strong>{records.length ? formatM3(total) : '—'} <em>m³/año</em></strong><span>Suma de los registros provisionales</span></article>
      <article className="con-kpi panel"><span className="con-kpi-icon"><TrendingUp size={19}/></span><small>Extracción observada · {year}</small><strong>{historyLoading ? '...' : anyObserved ? formatM3(totalObserved) : '—'} <em>m³</em></strong><span>Acumulado operativo del periodo disponible</span></article>
      <article className="con-kpi panel"><span className="con-kpi-icon"><ClipboardCheck size={19}/></span><small>Expedientes por validar</small><strong>{records.length ? documentsPending : '—'}</strong><span>No implica cumplimiento legal</span></article>
    </section>

    <section className={`con-status-banner ${anyObserved ? 'con-operational-active' : ''}`} aria-label="Estado del monitoreo"><Info size={19}/><div><strong>{anyObserved ? 'Extracciones operativas disponibles desde BOS' : historyLoading ? 'Sincronizando consumos en segundo plano' : 'Extracción operativa no disponible'}</strong><p>{anyObserved ? `Las barras presentan incrementos verificados por el histórico de la planta desde ${operational?.period_start}. Los meses sin cobertura son parciales o no disponibles. No representan el saldo legal de la concesión.` : historyError || 'Los datos aparecerán progresivamente conforme se complete la sincronización local.'}</p></div><span className="con-status-tag">{anyObserved ? 'Datos operativos' : historyLoading ? 'Consultando' : 'Sin histórico'}</span></section>

    {operational?.sync && <section className="panel con-sync-panel" aria-label="Estado de sincronización de concesiones">
      <div className="con-sync-title"><div><span className="con-eyebrow">CACHE LOCAL · IPC DURANGO</span><h3>Sincronización de consumos</h3><p>Lectura directa de SQLite: abrir o recargar esta página no vuelve a consultar los 70 días en BOS.</p></div>
        <span className={`con-sync-chip ${operational.sync.last_error ? 'con-sync-issue' : operational.sync.initial_load_complete ? 'con-sync-ok' : ''}`}>
          {operational.sync.last_error ? 'Reintento pendiente' : operational.sync.initial_load_complete ? 'Histórico guardado en la IPC' : 'Recuperando históricos'}</span></div>
      <div className="con-sync-info"><strong>{operational.sync.processed_days} / {operational.sync.expected_days} días guardados</strong><span>{operational.sync.progress_percent}%</span></div>
      <div className="con-sync-bar" role="progressbar" aria-valuenow={operational.sync.progress_percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de sincronización"><i style={{width: `${operational.sync.progress_percent}%`}} /></div>
      <div className="con-sync-footer"><small>{operational.sync.last_success_at ? `Última actualización: ${new Date(operational.sync.last_success_at).toLocaleString('es-MX')}` : 'Primera sincronización pendiente'} · Refresco de días recientes cada {operational.sync.refresh_minutes} minutos.</small>
      {isAdmin && <button type="button" className="con-button con-button-muted" disabled={rebuildBusy || operational.sync.manual_rebuild_pending} onClick={() => void queueRecentDays()}><RefreshCw size={14}/>{rebuildBusy ? 'Encolando...' : 'Reprocesar 7 días'}</button>}</div>
      {operational.sync.initial_load_complete && <div className="con-persisted-note"><Database size={16}/><span>Histórico inicial conservado en el servidor. Las visitas posteriores sólo leen los resultados; el sincronizador actualiza días recientes por separado.</span></div>}
      {operational.sync.last_error && <div className="con-sync-warning"><AlertCircle size={15}/><span>La última lectura de BOS falló; se conservan los datos anteriores y el servidor reintentará automáticamente.</span></div>}
    </section>}

    <section className="con-wells-section">
      <div className="con-section-title-row"><div><span className="con-eyebrow">INVENTARIO / SELECCIÓN</span><h3>Concesiones por pozo</h3><p>Selecciona un pozo para ver su ficha. Las barras muestran su participación en el volumen autorizado total.</p></div><span className="con-counter">{records.length} registrados</span></div>
      <div className="con-well-cards" role="group" aria-label="Seleccionar pozo">
        {widths.map((item, index) => <button key={item.well_key} type="button" aria-pressed={item.well_key === row?.well_key} className={`con-well-card panel ${row?.well_key === item.well_key ? 'selected' : ''}`} onClick={() => { setSelected(item.well_key); setHistoryOpen(false); }}>
          <div className="con-well-card-head">
            <div className="con-well-card-icon"><Droplets size={20}/></div>
            <div className="con-well-card-title">
              <strong>{item.well_name}</strong>
              <small>Título {item.title_number} · BOS {item.sensor_id}</small>
            </div>
            <span className="con-status-chip">{item.has_document ? 'PDF adjunto' : 'Sin PDF'}</span>
          </div>
          <div className="con-well-card-main">
            <div className="con-well-card-value">{formatM3(item.annual_volume_m3)} <em>m³/año autorizados*</em></div>
            <div className="con-well-card-progress-label"><small>Parte del total de la planta</small><strong>{item.relativePercent.toFixed(1)}%</strong></div>
            <span className="con-bar"><span className={`con-bar-color-${index % 3}`} style={{ width: `${item.relativePercent}%` }}/></span>
          </div>
          <div className="con-well-card-bottom">
            <span><TrendingUp size={14}/> Extracción observada {year}: <strong>{formatM3(operational?.wells.find((well) => well.well_key === item.well_key)?.operational_total_m3)} m³</strong></span>
            <span>Remanente legal: pendiente</span>
          </div>
        </button>)}
      </div>
      <div className="con-under-cards"><Info size={14}/>* Volúmenes registrados de manera provisional. Los porcentajes de estas tarjetas son <strong>distribución de autorización, nunca porcentaje consumido.</strong></div>
    </section>

    <div className="con-analytics-grid">
      <section className="panel con-analytics-panel">
        <div className="con-panel-heading"><div><span className="con-eyebrow">ANÁLISIS DE CONCESIONES</span><h3>{chartMode === 'quota' ? 'Comparativo de volúmenes autorizados' : `Extracción mensual · ${row?.well_name || 'Pozo'}`}</h3><p>{chartMode === 'quota' ? 'Comparación entre títulos, en metros cúbicos de referencia por año.' : `Incrementos diarios del totalizador agrupados por mes · ${year}.`}</p></div><span className="con-unit-tag">m³ {chartMode === 'quota' ? '/ año' : '/ mes'}</span></div>
        <div className="con-chart-controls"><div className="con-chart-tabs" role="group" aria-label="Tipo de gráfico"><button type="button" className={chartMode === 'quota' ? 'active' : ''} aria-pressed={chartMode === 'quota'} onClick={() => setChartMode('quota')}><BarChart3 size={15}/> Cuotas autorizadas</button><button type="button" className={chartMode === 'monthly' ? 'active' : ''} aria-pressed={chartMode === 'monthly'} onClick={() => setChartMode('monthly')}><CalendarDays size={15}/> Extracción mensual</button></div>{chartMode === 'monthly' && <label className="con-year-select">Año <select aria-label="Año de la extracción" value={year} onChange={(event) => setYear(Number(event.target.value))}>{Array.from({ length: Math.max(1, endYear - 2026 + 1) }, (_, index) => 2026 + index).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>}</div>
        {chartMode === 'quota' ? <div className="con-quota-figure" role="img" aria-label={`Comparativo documental del volumen autorizado: ${widths.map((item) => `${item.well_name} ${formatM3(item.annual_volume_m3)} metros cúbicos por año`).join(', ')}`}>
          <div className="con-chart-main">
            <div className="con-y-ticks">{chartTicks.map((tick, index) => <span key={index}>{integer.format(tick)}</span>)}</div>
            <div className="con-chart-plot"><div className="con-grid-lines">{chartTicks.map((_, index) => <span key={index}/>)}</div>
              <div className="con-chart-bar-group">{widths.map((item, index) => <div className="con-chart-column" key={item.well_key}>
                <span className="con-chart-bar-num">{formatM3(item.annual_volume_m3)}</span>
                <span className={`con-chart-bar-item con-bar-color-${index % 3} ${row?.well_key === item.well_key ? 'active' : ''}`} style={{ height: `${chartMax > 0 ? Math.max(0, Math.min(100, item.annual_volume_m3 / chartMax * 100)) : 0}%` }}/>
                <span className="con-chart-x-label">{item.well_name}</span>
              </div>)}</div>
            </div>
          </div>
          <div className="con-figure-legend"><span><i className="con-legend-swatch"/> Volumen autorizado registrado</span><span><i className="con-legend-dot"/> No representa extracción</span></div>
        </div> : <div className="con-monthly-analysis">
          {historyLoading && <div className="con-chart-feedback"><RefreshCw size={23} className="con-spinning"/><strong>Consultando totalizadores de BOS...</strong><span>Se están procesando las lecturas diarias de ambos pozos.</span></div>}
          {!historyLoading && historyError && <div className="con-chart-feedback"><AlertCircle size={24}/><strong>No fue posible consultar el histórico</strong><span>{historyError}</span><button type="button" className="con-button con-button-muted" onClick={() => void loadOperational(year)}>Reintentar consulta</button></div>}
          {!historyLoading && !historyError && !analytics.count && <div className="con-chart-feedback"><CalendarDays size={26}/><strong>No hay meses con volumen verificable</strong><span>Los periodos sin lecturas no se muestran como cero. Revisa la cobertura del histórico del año seleccionado.</span></div>}
          {!historyLoading && !historyError && analytics.count > 0 && <>
            <div className="con-month-metrics con-month-metrics-v3">
              <div className="con-metric-card"><small>Extracción acumulada</small><strong>{formatM3(analytics.total)} <em>m³</em></strong><span>Solo meses con lecturas · {year}</span></div>
              <div className="con-metric-card"><small>{isCurrentYear ? 'Mes actual' : 'Último mes con datos'}</small><strong>{formatM3(currentMonth?.volume_m3)} <em>m³</em></strong><span>{months[monthOfInterest - 1]} · {concessionMonthStatus(currentMonth?.status || 'no_data')}</span></div>
              <div className="con-metric-card"><small>Días con volumen válido</small><strong>{dayCoverage === null ? '—' : `${dayCoverage.toFixed(1)}%`}</strong><span>{selectedCoverage ? `${selectedCoverage.days_with_volume} / ${selectedCoverage.expected_days} días del periodo` : 'Sin diagnóstico'}</span></div>
              <div className="con-metric-card"><small>Mes de mayor volumen</small><strong>{analytics.max ? months[analytics.max.month - 1] : '—'}</strong><span>{formatM3(analytics.max?.volume_m3)} m³ registrados</span></div>
            </div>
            <div className="con-recharts-holder" role="img" aria-label={`Extracción mensual medida de ${row?.well_name ?? 'pozo'}, ${year}`}>
              <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{top:25,right:8,bottom:0,left:0}} barCategoryGap="24%">
                <CartesianGrid stroke="rgba(102,163,190,.18)" strokeDasharray="3 5" vertical={false}/>
                <XAxis dataKey="name" tick={{fill:'var(--con-muted)',fontSize:11}} tickLine={false} axisLine={false}/>
                <YAxis width={60} tickFormatter={(value:number)=>integer.format(value)} tick={{fill:'var(--con-muted)',fontSize:10}} tickLine={false} axisLine={false}/>
                <Tooltip cursor={{fill:'rgba(82,175,222,.08)'}} content={<OperationalTooltip mode="monthly"/>}/>
                {analytics.avg !== null && <ReferenceLine y={analytics.avg} stroke="#f0b35c" strokeDasharray="6 4"/>}
                <Bar dataKey="volume_m3" maxBarSize={47} radius={[6,6,0,0]}>{chartData.map((entry) => <Cell key={entry.month} fill={entry.status === 'partial' ? '#36a5e5' : '#17c6da'}/>)}</Bar>
              </BarChart></ResponsiveContainer>
            </div>
            <div className="con-month-legend"><span><i className="con-key-teal"/> Mes con lecturas</span><span><i className="con-key-partial"/> Mes parcial</span><span><i className="con-key-orange"/> Media de meses con datos: {formatM3(analytics.avg)} m³</span></div>
            <div className="con-month-status-label">Cobertura del periodo por mes <span>Sin datos nunca se interpreta como 0 m³</span></div>
            <div className="con-month-status-rail" aria-label="Estado de los meses">
              {chartData.map((month) => <div key={month.month} className={`con-month-status-item is-${month.status}`} title={`${month.name}: ${concessionMonthStatus(month.status)} · ${month.days_with_volume} días con volumen`}>
                <strong>{month.name}</strong><span>{month.status === 'outside_window' ? 'Fuera' : month.status === 'available' ? 'Datos' : month.status === 'partial' ? 'Parcial' : 'Sin datos'}</span>
              </div>)}
            </div>
            <div className="con-cumulative-heading"><div><span className="con-eyebrow">TENDENCIA OPERATIVA</span><h4>Acumulado verificado · {year}</h4></div><small>Sin extrapolación de meses faltantes · Vista compacta</small></div>
            <div className="con-cumulative-holder con-cumulative-compact" role="img" aria-label="Evolución de extracción acumulada, sólo meses con lecturas"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:8,right:8,bottom:0,left:0}}>
              <defs><linearGradient id="conCumulativeFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#27c5e9" stopOpacity={0.32}/><stop offset="100%" stopColor="#27c5e9" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid stroke="rgba(102,163,190,.12)" strokeDasharray="3 5" vertical={false}/>
              <XAxis dataKey="name" tick={{fill:'var(--con-muted)',fontSize:10}} tickLine={false} axisLine={false}/>
              <YAxis width={60} tickFormatter={(value:number)=>integer.format(value)} tick={{fill:'var(--con-muted)',fontSize:10}} tickLine={false} axisLine={false}/>
              <Tooltip content={<OperationalTooltip mode="cumulative"/>}/>
              <Area connectNulls={false} type="monotone" dataKey="cumulative_m3" stroke="#2cc9e7" strokeWidth={2.6} fill="url(#conCumulativeFill)" dot={{r:3}} activeDot={{r:5}}/>
            </AreaChart></ResponsiveContainer></div>
            <div className="con-history-coverage"><Info size={16}/><span>Datos disponibles: {operational?.period_start} a {operational?.period_end}. Meses parciales o sin lecturas no se extrapolan; la cuota anual no es una meta mensual.</span></div>
          </>}
        </div>}
        <div className="con-chart-insight"><Info size={17}/><span>{chartMode === 'quota' ? 'Comparativo calculado exclusivamente con los volúmenes autorizados registrados. No existe un límite mensual legal deducible dividiendo la cuota anual entre 12.' : 'La gráfica utiliza sólo volúmenes de intervalos con totalizador verificado. Pueden faltar meses o días. El saldo legal requiere confirmar la vigencia y el ciclo de cada título.'}</span></div>
      </section>

      <section className="panel con-detail-panel">
        {row ? <>
          <div className="con-detail-top"><div><span className="con-eyebrow">EXPEDIENTE / DETALLE</span><h3>Información de la concesión · {row.well_name}</h3><StateLabel row={row}/></div>
            {isAdmin && <button type="button" className="con-button con-button-primary" onClick={openEdit}><Pencil size={15}/> Administrar</button>}
          </div>
          <div className="con-detail-highlight"><div><small>Volumen autorizado de referencia</small><strong>{formatM3(row.annual_volume_m3)} <em>m³/año</em></strong><span>Agua subterránea · Información provisional</span></div><Droplets size={29}/></div>
          <div className="con-detail-share"><span>Participación en la cuota total de la planta</span><strong>{selectedShare?.relativePercent.toFixed(1) ?? '—'}%</strong></div>
          <div className="con-slim-progress"><span style={{ width: `${selectedShare?.relativePercent || 0}%` }}/></div>
          <div className="con-facts con-facts-v2">
            <div><span>Título / permiso</span><strong>{row.title_number}</strong></div>
            <div><span>Origen del agua</span><strong>Subterránea</strong></div>
            <div><span>Sensor BOS vinculado</span><strong>{row.sensor_id}</strong></div>
            <div><span>Inicio de vigencia</span><strong>{row.valid_from || 'Por verificar'}</strong></div>
            <div><span>Fin de vigencia</span><strong>{row.valid_to || 'Por verificar'}</strong></div>
            <div><span>Uso autorizado</span><strong className="con-pending">Por verificar en título</strong></div>
            <div><span>Extracción operativa {year}</span><strong>{formatM3(selectedOperational?.operational_total_m3)} m³</strong></div>
            <div><span>Comparativo medido / cuota*</span><strong>{operationalShare === null ? 'Sin datos' : `${operationalShare.toFixed(1)}%`}</strong></div>
            <div><span>Saldo legal disponible</span><strong className="con-pending">Pendiente de validar</strong></div>
          </div>
          {selectedCoverage && <div className="con-diagnostics" aria-label={`Diagnóstico de mediciones de ${row.well_name}`}>
            <div className="con-diagnostics-heading"><div><span className="con-eyebrow">CONCILIACIÓN OPERATIVA · {year}</span><h4>Calidad y cobertura del histórico</h4></div><span className="con-diagnostics-caption">Datos guardados en SQLite</span></div>
            <div className="con-diagnostics-grid">
              <div><small>Días procesados</small><strong>{selectedCoverage.processed_days} / {selectedCoverage.expected_days}</strong></div>
              <div><small>Días con volumen válido</small><strong>{selectedCoverage.days_with_volume}</strong></div>
              <div><small>Sin lecturas / descartados</small><strong>{selectedCoverage.days_without_data} / {selectedCoverage.days_excluded}</strong></div>
              <div><small>Cobertura de muestras</small><strong>{selectedCoverage.sample_coverage_percent == null ? 'Sin datos' : `${selectedCoverage.sample_coverage_percent}%`}</strong></div>
            </div>
            <div className="con-diagnostics-dates"><span>Primer día con volumen: <b>{selectedCoverage.first_valid_day || 'Sin datos'}</b></span><span>Último día con volumen: <b>{selectedCoverage.last_valid_day || 'Sin datos'}</b></span></div>
            {(selectedCoverage.first_totalizer_m3 != null || selectedCoverage.last_totalizer_m3 != null) && <div className="con-diagnostics-dates"><span>Primera referencia de totalizador: <b>{formatM3(selectedCoverage.first_totalizer_m3)} m³</b></span><span>Última referencia: <b>{formatM3(selectedCoverage.last_totalizer_m3)} m³</b></span></div>}
            <p>Las referencias de totalizador sólo se conservan en días reprocesados tras esta actualización. <strong>No se restan para calcular la extracción</strong> porque podrían existir reinicios y discontinuidades.</p>
          </div>}
          <div className="con-document-box"><FileText size={21}/><div><strong>{row.document_name || 'No se ha adjuntado el título o prórroga'}</strong><span>{row.has_document ? 'Original archivado para cotejo documental' : 'Un administrador puede cargar un PDF desde Administrar'}</span></div>
            {row.has_document && <button type="button" title="Descargar PDF original" aria-label="Descargar PDF original" onClick={() => void download()}><ArrowDownToLine size={19}/></button>}
          </div>
          {row.notes && <div className="con-notes"><strong>Observaciones</strong><p>{row.notes}</p></div>}
          <div className="con-legal-explain">* Indicador operativo parcial: compara el volumen observado con el volumen documental anual, pero <strong>no mide cumplimiento legal</strong> ni calcula remanente.</div><div className="con-detail-actions"><small>Versión {row.version} · Actualizado por {row.updated_by}</small>{isAdmin && <button type="button" onClick={() => void showAudit()}><History size={15}/> Historial de cambios</button>}</div>
          {historyOpen && isAdmin && <div className="con-history"><div className="con-history-title"><strong>Últimas modificaciones</strong><button type="button" aria-label="Cerrar historial" onClick={() => setHistoryOpen(false)}><X size={15}/></button></div>{historyBusy ? 'Cargando...' : audit.length ? audit.map((event, index) => <div key={index}><strong>{event.action === 'attach_pdf' ? 'Documento actualizado' : 'Datos editados'}</strong><small>{event.actor} · {new Date(event.created_at).toLocaleString('es-MX')}</small></div>) : <p>Aún no existen modificaciones.</p>}</div>}
        </> : <p>{loading ? 'Cargando concesiones...' : 'No hay registros de concesiones.'}</p>}
      </section>
    </div>

    <section className="panel con-validation-panel">
      <div className="con-validation-heading">
        <div>
          <span className="con-eyebrow">RUTA DE VALIDACIÓN</span>
          <h3>Estado de integración</h3>
          <p>Etapas necesarias antes de mostrar consumo contra la concesión.</p>
        </div>
        <span className="con-status-chip con-validation-status">Revisión pendiente</span>
      </div>
      <div className="con-validation-steps">
        <div className="con-validation-step">
          <span className="con-step-circle con-step-provisional"><FileCheck2 size={18}/></span>
          <div>
            <strong>1. Captura de referencias</strong>
            <small>Dos cuotas registradas de manera provisional.</small>
          </div>
        </div>
        <div className="con-validation-step">
          <span className="con-step-circle"><FileText size={18}/></span>
          <div>
            <strong>2. Validación documental</strong>
            <small>Revisar títulos vigentes, prórrogas y periodo aplicable.</small>
          </div>
        </div>
        <div className="con-validation-step">
          <span className="con-step-circle"><Database size={18}/></span>
          <div>
            <strong>3. Histórico operativo BOS</strong>
            <small>Extracción mensual conectada; auditar cobertura y ciclo antes de calcular remanente legal.</small>
          </div>
        </div>
      </div>
    </section>

    {editing && row && form && <div className="con-modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget && !saveBusy) setEditing(false); }}>
      <section role="dialog" aria-modal="true" aria-label={`Administrar concesión ${row.well_name}`} className="con-modal panel">
        <div className="con-modal-header"><div><span className="con-eyebrow">ADMINISTRACIÓN · {row.well_name}</span><h3>Actualizar concesión</h3><p>Los cambios se publicarán para los usuarios de la planta.</p></div><button type="button" aria-label="Cerrar" onClick={() => setEditing(false)} disabled={saveBusy}><X size={20}/></button></div>
        <form onSubmit={(event) => void save(event)}>
          <div className="con-form-grid">
            <label>Número de título<input required maxLength={100} value={form.title_number} onChange={(e) => setForm({ ...form, title_number: e.target.value })}/></label>
            <label>Volumen autorizado (m³/año)<input required type="number" step="any" min="0.001" value={form.annual_volume_m3} onChange={(e) => setForm({ ...form, annual_volume_m3: Number(e.target.value) })}/></label>
            <label>Inicio de vigencia<input type="date" value={form.valid_from || ''} onChange={(e) => setForm({ ...form, valid_from: e.target.value || null })}/></label>
            <label>Fin de vigencia<input type="date" value={form.valid_to || ''} onChange={(e) => setForm({ ...form, valid_to: e.target.value || null })}/></label>
            <label className="con-form-wide">Observaciones<textarea maxLength={2000} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notas de validación y procedencia"/></label>
          </div>
          <div className="con-upload">
            <div className="con-upload-title"><FileUp size={18}/><strong>Adjuntar PDF de CONAGUA</strong><small>Opcional · máximo 10 MB</small></div>
            <input aria-label="Seleccionar archivo PDF" type="file" accept=".pdf,application/pdf" onChange={(event) => void acceptFile(event.currentTarget.files?.[0] || null)}/>
            {previewBusy && <p>Analizando texto del documento...</p>}
            {preview && <div className="con-pdf-preview"><strong><CheckCircle2 size={15}/> PDF leído · {preview.pages} página(s)</strong>
              <p>{preview.text_detected ? 'Se encontró texto extraíble. Confirma los datos: la extracción no modifica los campos automáticamente.' : 'Es un documento sin texto extraíble o escaneado. Completa los datos manualmente.'}</p>
              {preview.title_candidates.length > 0 && <div className="con-suggestions">Posibles títulos: {preview.title_candidates.map((candidate) => <button key={candidate} type="button" onClick={() => setForm((current) => current && ({ ...current, title_number: candidate.replace(/\s+/g, '') }))}>{candidate}</button>)}</div>}
              {preview.number_candidates.length > 0 && <details><summary>Posibles números detectados (sin interpretación automática)</summary><p>{preview.number_candidates.join(' · ')}</p></details>}
            </div>}
          </div>
          <div className="con-form-disclaimer"><AlertCircle size={17}/><span>La carga y captura no certifican la validez legal. Revisa el título, la vigencia y la asignación al pozo antes de publicar.</span></div>
          {modalError && <div className="con-alert con-alert-error" role="alert">{modalError}</div>}
          <div className="con-modal-actions"><button type="button" className="con-button con-button-muted" onClick={() => setEditing(false)} disabled={saveBusy}>Cancelar</button><button type="submit" className="con-button con-button-primary" disabled={saveBusy || previewBusy}><CheckCircle2 size={17}/>{saveBusy ? 'Publicando...' : 'Guardar y publicar'}</button></div>
        </form>
      </section>
    </div>}
  </div>;
}
