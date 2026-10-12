import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertCircle, ArrowDownToLine, CalendarDays, CheckCircle2, ClipboardCheck, Database,
  Droplets, FileCheck2, FileText, FileUp, History, Info, LockKeyhole, Pencil, RefreshCw,
  ShieldCheck, TrendingUp, Waves, X,
} from 'lucide-react';
import {
  downloadConcessionPdf, fetchConcessionAudit, fetchConcessions, previewConcessionPdf,
  saveConcessionPdf, updateConcession,
} from '../../../services/concessionService';
import type { ConcessionPayload, ConcessionRecord, PdfPreview } from '../../../services/concessionService';

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
  const [audit, setAudit] = useState<Array<{ action: string; actor: string; created_at: string; details: Record<string, unknown> }>>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
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

  const row = records.find((item) => item.well_key === selected) || records[0];
  const total = records.reduce((acc, record) => acc + record.annual_volume_m3, 0);
  const widths = records.map((record) => ({ ...record, relativePercent: total > 0 ? (record.annual_volume_m3 / total) * 100 : 0 }));

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

  return <div className="concessions-page">
    <section className="con-hero panel fade-up">
      <div className="con-hero-heading">
        <div className="con-hero-icon"><ShieldCheck size={26} /></div>
        <div>
          <span className="con-eyebrow">PLANTA DURANGO · CONTROL DOCUMENTAL</span>
          <h2>Concesiones de agua</h2>
          <p>Volúmenes autorizados por pozo, respaldo de títulos y seguimiento de validación.</p>
        </div>
        <span className="con-pill"><LockKeyhole size={13} /> {isAdmin ? 'Administración habilitada' : 'Consulta de planta'}</span>
      </div>
      <div className="con-hero-bottom">
        <div className="con-source-note"><Info size={16} /> Datos iniciales tomados de fotografía de correo. No se consideran verificados ante CONAGUA.</div>
        <button type="button" className="con-button con-button-muted" onClick={() => void refresh(true)} disabled={loading}><RefreshCw size={15} /> Actualizar</button>
      </div>
    </section>

    {error && <div className="con-alert con-alert-error" role="alert"><AlertCircle size={18} /> {error}</div>}
    {notice && <div className="con-alert con-alert-success" role="status"><CheckCircle2 size={18} /> {notice}<button type="button" onClick={() => setNotice('')} aria-label="Cerrar aviso"><X size={16}/></button></div>}

    <section className="con-kpi-grid">
      <article className="con-kpi panel"><span className="con-kpi-icon"><Waves size={19} /></span><small>Pozos registrados</small><strong>{loading && !records.length ? '—' : records.length}</strong><span>Asociados a esta planta</span></article>
      <article className="con-kpi panel con-kpi-accent"><span className="con-kpi-icon"><Droplets size={19} /></span><small>Volumen de referencia</small><strong>{records.length ? formatM3(total) : '—'} <em>m³/año</em></strong><span>Suma provisional de títulos</span></article>
      <article className="con-kpi panel"><span className="con-kpi-icon"><TrendingUp size={19} /></span><small>Extracción anual conciliada</small><strong>— <em>m³</em></strong><span>Esperando base legal e histórica</span></article>
      <article className="con-kpi panel"><span className="con-kpi-icon"><ClipboardCheck size={19} /></span><small>Documentos por validar</small><strong>{records.length ? records.filter((r) => r.review_state !== 'validated').length : '—'}</strong><span>No se declara cumplimiento legal</span></article>
    </section>

    <section className="con-status-banner"><AlertCircle size={19} /><div><strong>Monitoreo de cuota aún no habilitado</strong><p>Hasta validar vigencia, periodo de cómputo y totalizadores históricos, no se mostrarán porcentajes utilizados, disponibilidad ni proyecciones inventadas.</p></div></section>

    <div className="con-content-grid">
      <section className="panel con-left-panel">
        <div className="con-section-heading"><div><span className="con-eyebrow">INVENTARIO DOCUMENTAL</span><h3>Concesiones por pozo</h3><p>Selecciona un pozo para consultar o actualizar su ficha.</p></div></div>
        <div className="con-well-list" role="group" aria-label="Seleccionar pozo">
          {widths.map((item) => <button key={item.well_key} type="button" aria-pressed={item.well_key === row?.well_key} className={`con-well ${row?.well_key === item.well_key ? 'selected' : ''}`} onClick={() => { setSelected(item.well_key); setHistoryOpen(false); }}>
            <span className="con-well-top"><span className="con-well-icon"><Droplets size={18}/></span><span className="con-well-name"><strong>{item.well_name}</strong><small>Sensor BOS {item.sensor_id}</small></span><span className="con-well-amount"><strong>{formatM3(item.annual_volume_m3)}</strong><small>m³/año</small></span></span>
            <span className="con-bar"><span style={{ width: `${item.relativePercent}%` }}/></span>
            <span className="con-well-foot"><span>{item.title_number}</span><span>{item.has_document ? 'PDF adjunto' : 'Sin PDF'}</span></span>
          </button>)}
        </div>
        <div className="con-chart-foot"><Info size={15} /> Barras: proporción de la cuota de cada pozo respecto al total, <strong>no porcentaje consumido.</strong></div>
      </section>

      <section className="panel con-detail-panel">
        {row ? <>
          <div className="con-detail-top"><div><span className="con-eyebrow">FICHA DE CONCESIÓN</span><h3>{row.well_name}</h3><StateLabel row={row} /></div>
            {isAdmin && <button type="button" className="con-button con-button-primary" onClick={openEdit}><Pencil size={15}/> Administrar</button>}
          </div>
          <div className="con-detail-highlight"><div><small>Volumen autorizado de referencia</small><strong>{formatM3(row.annual_volume_m3)} <em>m³/año</em></strong><span>Agua subterránea · Información provisional</span></div><Droplets size={31}/></div>
          <div className="con-facts">
            <div><span>Número de título</span><strong>{row.title_number}</strong></div>
            <div><span>Sensor vinculado</span><strong>{row.sensor_id}</strong></div>
            <div><span>Inicio de vigencia</span><strong>{row.valid_from || 'Pendiente de verificar'}</strong></div>
            <div><span>Fin de vigencia</span><strong>{row.valid_to || 'Pendiente de verificar'}</strong></div>
            <div><span>Extracción anual</span><strong className="con-pending">Sin conciliar</strong></div>
            <div><span>Volumen disponible</span><strong className="con-pending">No calculado</strong></div>
          </div>
          <div className="con-document-box"><FileText size={22} /><div><strong>{row.document_name || 'No se ha adjuntado el título o prórroga'}</strong><span>{row.has_document ? 'Documento archivado localmente para revisión' : 'Un administrador puede agregar un PDF desde Administrar'}</span></div>
            {row.has_document && <button type="button" title="Descargar PDF original" onClick={() => void download()}><ArrowDownToLine size={19}/></button>}
          </div>
          {row.notes && <div className="con-notes"><strong>Observaciones</strong><p>{row.notes}</p></div>}
          <div className="con-detail-actions"><small>Actualización v{row.version} · {row.updated_by}</small>{isAdmin && <button type="button" onClick={() => void showAudit()}><History size={15}/> Historial de cambios</button>}</div>
          {historyOpen && isAdmin && <div className="con-history"><div className="con-history-title"><strong>Últimas modificaciones</strong><button type="button" aria-label="Cerrar historial" onClick={() => setHistoryOpen(false)}><X size={15}/></button></div>{historyBusy ? 'Cargando...' : audit.length ? audit.map((event, index) => <div key={index}><strong>{event.action === 'attach_pdf' ? 'Documento actualizado' : 'Datos editados'}</strong><small>{event.actor} · {new Date(event.created_at).toLocaleString('es-MX')}</small></div>) : <p>Aún no existen modificaciones.</p>}</div>}
        </> : <p>Cargando concesiones...</p>}
      </section>
    </div>

    <section className="panel con-roadmap"><div><Database size={22}/><span><strong>Integración BOS pendiente de conciliación</strong><small>Los sensores {records.map((r) => r.sensor_id).join(' y ')} permanecen vinculados como referencia técnica. Este módulo no altera ni reinterpreta datos SCADA.</small></span></div><div><CalendarDays size={22}/><span><strong>Periodo de concesión pendiente</strong><small>El sistema no asume que el ciclo autorizado coincide con el año calendario sin verificar el título.</small></span></div></section>

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
