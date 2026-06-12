function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function reportFileBaseName(report) {
  const plant = String(report.plant || 'durango')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/planta/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'durango';
  const date = String(report.date || new Date().toISOString().slice(0, 10));
  return `reporte-diario-agua-${plant}-${date}`;
}

function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen del logo.'));
    reader.readAsDataURL(blob);
  });
}

async function resolveImageToDataUrl(src) {
  if (!src || typeof src !== 'string') return '';
  if (src.startsWith('data:')) return src;

  try {
    const response = await fetch(src, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`No se pudo cargar el logo: ${response.status}`);
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch (error) {
    console.warn('No se pudo incrustar el logo como data URL. Se usará la ruta original.', error);
    return src;
  }
}

function waitForFrameImages(frameWindow) {
  const images = Array.from(frameWindow?.document?.images || []);
  if (!images.length) return Promise.resolve();

  return Promise.allSettled(images.map((image) => {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();
    if (typeof image.decode === 'function') return image.decode().catch(() => undefined);
    return new Promise((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    });
  }));
}

function format(value, suffix = '') {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return `${value.toLocaleString('es-MX', { maximumFractionDigits: 2 })}${suffix}`;
  return `${value}${suffix}`;
}

function table(title, headers, rows, emptyText = 'Sin datos disponibles para esta planta o periodo.') {
  if (!rows?.length) return `<section class="block"><h2>${escapeHtml(title)}</h2><p class="empty">${escapeHtml(emptyText)}</p></section>`;
  return `<section class="block"><h2>${escapeHtml(title)}</h2><table><thead><tr>${headers.map(h => `<th>${escapeHtml(h.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${headers.map(h => `<td>${escapeHtml(format(row[h.key], h.suffix || ''))}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
}

export function buildDailyWaterReportHtml(report, logoUrl) {
  const entry = report.water_entry || {};
  const consumption = report.water_consumption || {};
  const lines = report.production_lines?.rows || [];
  const flows = report.operational_flows?.rows || [];
  const missing = report.missing_fields || [];
  const linePeriodTotal = lines.reduce((sum, item) => sum + Number(item.volumen_periodo_m3 || item.period_m3 || 0), 0);
  const flowPeriodTotal = flows.reduce((sum, item) => sum + Number(item.volumen_periodo_m3 || item.period_m3 || 0), 0);
  const title = String(report.title || 'Reporte Diario de Agua');
  const fileTitle = reportFileBaseName(report);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8" /><title>${escapeHtml(fileTitle)}</title><style>
    @page{size:letter;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1f2937;background:#fff;margin:0}.page{padding:22px}.top-band{height:76px;background:linear-gradient(135deg,#d71920,#8a1515);clip-path:polygon(0 0,100% 0,92% 100%,0 100%);margin-bottom:22px;display:flex;align-items:center;padding:14px 24px}.logo{width:230px;max-height:58px;object-fit:contain;background:white;border-radius:8px;padding:6px}.meta{display:grid;grid-template-columns:1fr auto;gap:16px;margin-bottom:24px}.title h1{margin:0;font-size:22px}.title p,.report-code p{margin:4px 0;font-size:13px}.report-code{text-align:right}.report-code strong{color:#d71920}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px}.kpi{border:1px solid #e5e7eb;border-radius:12px;padding:12px}.kpi-label{font-size:12px;color:#64748b}.kpi-value{font-size:22px;font-weight:800}.block{break-inside:avoid;margin:18px 0}.block h2{font-size:15px;margin:0 0 8px;color:#111827}.note{border:1px solid #bfdbfe;background:#eff6ff;border-radius:10px;padding:10px;color:#1e3a8a;font-size:12px}table{width:100%;border-collapse:collapse;font-size:11px}th{color:#475569;border-bottom:2px solid #9ca3af;text-align:left;padding:7px}td{border-bottom:1px solid #e5e7eb;padding:7px}.empty{color:#64748b}.pending{border:1px solid #fecaca;background:#fff7f7;border-radius:10px;padding:10px}.pending li{margin:4px 0}.footer{margin-top:18px;color:#94a3b8;font-size:10px;text-align:right}@media print{.no-print{display:none}.page{padding:0}.top-band{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><main class="page">
    <div class="top-band">${logoUrl ? `<img class="logo" src="${logoUrl}" />` : ''}</div>
    <section class="meta"><div class="title"><h1>${escapeHtml(title)}</h1><p>Planta: ${escapeHtml(report.plant || 'Durango')}</p><p>Fecha: ${escapeHtml(report.date || '')}</p><p>Fuente: ${escapeHtml(report.data_source || '')}</p></div><div class="report-code"><p>Reporte: <strong>${escapeHtml(report.report_code || '')}</strong></p><p>Estado: ${escapeHtml(report.source_status || '')}</p></div></section>
    <section class="kpis"><div class="kpi"><div class="kpi-label">Pozos periodo</div><div class="kpi-value">${format(entry.total_pozos_m3)} m³</div></div><div class="kpi"><div class="kpi-label">Líneas periodo</div><div class="kpi-value">${format(linePeriodTotal)} m³</div></div><div class="kpi"><div class="kpi-label">Lavadoras/Jarabes</div><div class="kpi-value">${format(flowPeriodTotal)} m³</div></div></section>
    <section class="block note">Durango no tiene fuente energética ni niveles de tanques operativos confirmados en este dashboard. Las tablas muestran lecturas BOS reales disponibles; los volúmenes de periodo se calculan solo cuando existen totalizadores inicial/final.</section>
    ${table('Entrada de Agua - Pozos', [{key:'equipo',label:'Equipo'},{key:'ubicacion',label:'Ubicación'},{key:'suministro_m3',label:'Volumen periodo',suffix:' m³'},{key:'flujo_lps',label:'Flujo actual',suffix:' L/s'},{key:'estado',label:'Estado'},{key:'comunicacion',label:'Comunicación'}], entry.rows || [])}
    ${table('Líneas', [{key:'linea',label:'Línea'},{key:'sensor_id',label:'Sensor'},{key:'flujo_lps',label:'Flujo actual',suffix:' L/s'},{key:'volumen_periodo_m3',label:'Volumen periodo',suffix:' m³'},{key:'totalizador_m3',label:'Totalizador',suffix:' m³'},{key:'estado',label:'Estado'}], lines)}
    ${table('Lavadoras y Jarabes', [{key:'equipo',label:'Punto'},{key:'sensor_id',label:'Sensor'},{key:'tipo',label:'Tipo'},{key:'flujo_lps',label:'Flujo actual',suffix:' L/s'},{key:'volumen_periodo_m3',label:'Volumen periodo',suffix:' m³'},{key:'totalizador_m3',label:'Totalizador',suffix:' m³'},{key:'estado',label:'Estado'},{key:'observacion',label:'Observación'}], flows)}
    ${table('Consumo de Agua - Volumen del periodo', [{key:'equipo',label:'Equipo'},{key:'ubicacion',label:'Detalle'},{key:'suministro',label:'Volumen periodo',suffix:' m³'},{key:'porcentaje',label:'Participación',suffix:'%'}], consumption.rows || [])}
    ${table('Suministro Agua 24 hrs', [{key:'equipo',label:'Equipo'},{key:'ubicacion',label:'Ubicación'},{key:'lectura_inicio_m3',label:'Lectura inicio'},{key:'lectura_final_m3',label:'Lectura final'},{key:'suministro_m3',label:'Suministro',suffix:' m³'}], report.supply_24h?.rows || [])}
    <section class="block pending"><h2>Datos pendientes o no confirmados</h2>${missing.length ? `<ul>${missing.map(item => `<li><strong>${escapeHtml(item.name)}</strong>: ${escapeHtml(item.detail)}</li>`).join('')}</ul>` : '<p>Sin pendientes detectados para esta consulta.</p>'}</section>
    <div class="footer">Generado: ${escapeHtml(report.generated_at || '')}</div>
  </main></body></html>`;
}

export function exportDailyWaterReportHtml(report, logoUrl) {
  downloadBlob(buildDailyWaterReportHtml(report, logoUrl), `${reportFileBaseName(report)}.html`, 'text/html;charset=utf-8');
}

export function exportDailyWaterReportExcel(report) {
  const html = buildDailyWaterReportHtml(report, '');
  downloadBlob(html, `${reportFileBaseName(report)}.xls`, 'application/vnd.ms-excel;charset=utf-8');
}

export async function printDailyWaterReportPdf(report, logoUrl) {
  const embeddedLogo = await resolveImageToDataUrl(logoUrl);
  const html = buildDailyWaterReportHtml(report, embeddedLogo);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  const reportTitle = reportFileBaseName(report);
  const previousTitle = document.title;
  let printStarted = false;
  let cleanedUp = false;

  iframe.style.position = 'fixed';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.opacity = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    document.title = previousTitle;
    setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(url);
    }, 1200);
  };

  iframe.onload = async () => {
    if (printStarted) return;
    printStarted = true;

    const frameWindow = iframe.contentWindow;
    if (!frameWindow) {
      cleanup();
      return;
    }

    const handleAfterPrint = () => {
      frameWindow.removeEventListener('afterprint', handleAfterPrint);
      cleanup();
    };

    frameWindow.addEventListener('afterprint', handleAfterPrint);

    try {
      await waitForFrameImages(frameWindow);
      frameWindow.document.title = reportTitle;
      document.title = reportTitle;
      setTimeout(() => {
        frameWindow.focus();
        frameWindow.print();
      }, 250);
    } catch (error) {
      frameWindow.removeEventListener('afterprint', handleAfterPrint);
      cleanup();
      console.error('No se pudo preparar el PDF del reporte diario:', error);
    }
  };

  iframe.src = url;
  document.body.appendChild(iframe);
}
