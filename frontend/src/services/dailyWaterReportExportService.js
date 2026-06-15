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

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(numberValue) ? numberValue : null;
}

function firstNumericValue(row, keys) {
  for (const key of keys) {
    const value = toNumber(row[key]);
    if (value !== null) return value;
  }
  return null;
}

function hasPositiveMetric(rows, keys) {
  return rows.some((row) => (firstNumericValue(row, keys) || 0) > 0);
}

function compactName(value) {
  const label = String(value ?? '').trim();
  return label || 'Sin nombre';
}

function barChart(title, rows, labelKeys, valueKeys, suffix) {
  const items = rows
    .map((row, index) => {
      const labelKey = labelKeys.find((key) => row[key] !== undefined && row[key] !== null && row[key] !== '');
      const label = compactName(labelKey ? row[labelKey] : `Elemento ${index + 1}`);
      const value = firstNumericValue(row, valueKeys);
      return { label, value };
    })
    .filter((item) => item.value !== null && item.value >= 0);

  if (!items.length) return '';
  const maxValue = Math.max(...items.map((item) => item.value), 0);
  if (maxValue <= 0) return '';

  return `<section class="block chart-block"><h2>${escapeHtml(title)}</h2><div class="bar-chart">${items.map((item) => {
    const width = Math.max((item.value / maxValue) * 100, item.value > 0 ? 3 : 0);
    return `<div class="bar-row"><div class="bar-label">${escapeHtml(item.label)}</div><div class="bar-track"><div class="bar-fill" style="width:${width.toFixed(2)}%"></div></div><div class="bar-value">${escapeHtml(format(item.value, suffix))}</div></div>`;
  }).join('')}</div></section>`;
}

function metricChart(titleBase, rows, labelKeys, periodKeys, flowKeys) {
  if (hasPositiveMetric(rows, periodKeys)) {
    return barChart(`${titleBase} - volumen del periodo`, rows, labelKeys, periodKeys, ' m³');
  }
  if (hasPositiveMetric(rows, flowKeys)) {
    return barChart(`${titleBase} - flujo actual`, rows, labelKeys, flowKeys, ' L/s');
  }
  return '';
}


export function buildDailyWaterReportHtml(report, logoUrl) {
  const entry = report.water_entry || {};
  const consumption = report.water_consumption || {};
  const entryRows = entry.rows || [];
  const lines = report.production_lines?.rows || [];
  const flows = report.operational_flows?.rows || [];
  const linePeriodTotal = lines.reduce((sum, item) => sum + Number(item.volumen_periodo_m3 || item.period_m3 || 0), 0);
  const flowPeriodTotal = flows.reduce((sum, item) => sum + Number(item.volumen_periodo_m3 || item.period_m3 || 0), 0);
  const title = String(report.title || 'Reporte Diario de Agua');
  const fileTitle = reportFileBaseName(report);
  const wellChart = metricChart('Pozos', entryRows, ['equipo', 'ubicacion'], ['suministro_m3', 'volumen_periodo_m3', 'period_m3'], ['flujo_lps', 'flow_lps', 'flow']);
  const lineChart = metricChart('Líneas', lines, ['linea', 'name'], ['volumen_periodo_m3', 'period_m3', 'period_delta_m3'], ['flujo_lps', 'flow_lps', 'flow']);
  const flowChart = metricChart('Flujos', flows, ['equipo', 'name'], ['volumen_periodo_m3', 'period_m3', 'period_delta_m3'], ['flujo_lps', 'flow_lps', 'flow']);

  return `<!doctype html><html lang="es"><head><meta charset="utf-8" /><title>${escapeHtml(fileTitle)}</title><style>
    @page{size:A4;margin:10mm 10mm 12mm 10mm}*{box-sizing:border-box}html,body{background:#fff;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#1f2937;font-size:12px}.page{width:100%;max-width:190mm;margin:0 auto;padding:0}.top-band{height:68px;background:linear-gradient(135deg,#d71920,#8a1515);clip-path:polygon(0 0,100% 0,92% 100%,0 100%);margin-bottom:16px;display:flex;align-items:center;padding:12px 20px}.logo{width:215px;max-height:52px;object-fit:contain;background:white;border-radius:8px;padding:5px}.meta{display:grid;grid-template-columns:1fr auto;gap:14px;margin-bottom:16px}.title h1{margin:0;font-size:21px}.title p,.report-code p{margin:3px 0;font-size:12px}.report-code{text-align:right}.report-code strong{color:#d71920}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:14px}.kpi{border:1px solid #e5e7eb;border-radius:12px;padding:10px}.kpi-label{font-size:11px;color:#64748b}.kpi-value{font-size:20px;font-weight:800}.block{break-inside:avoid-page;page-break-inside:avoid;margin:14px 0 16px}.block h2{font-size:14px;margin:0 0 7px;color:#111827}table{width:100%;max-width:100%;border-collapse:collapse;table-layout:auto;font-size:10.5px;break-inside:auto}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{overflow-wrap:anywhere;vertical-align:top}th{color:#475569;border-bottom:2px solid #9ca3af;text-align:left;padding:6px 5px}td{border-bottom:1px solid #e5e7eb;padding:6px 5px}.empty{color:#64748b}.chart-block{border:1px solid #e5e7eb;border-radius:12px;padding:10px;break-inside:avoid-page;page-break-inside:avoid}.bar-chart{display:grid;gap:7px}.bar-row{display:grid;grid-template-columns:108px 1fr 78px;gap:7px;align-items:center;font-size:10.5px}.bar-label{font-weight:700;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bar-track{height:11px;border-radius:999px;background:#f1f5f9;overflow:hidden}.bar-fill{height:100%;border-radius:999px;background:#d71920}.bar-value{text-align:right;font-weight:700;color:#111827}@media print{.no-print{display:none}.top-band,.bar-fill{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><main class="page">
    <div class="top-band">${logoUrl ? `<img class="logo" src="${logoUrl}" />` : ''}</div>
    <section class="meta"><div class="title"><h1>${escapeHtml(title)}</h1><p>Planta: ${escapeHtml(report.plant || 'Durango')}</p><p>Fecha: ${escapeHtml(report.date || '')}</p></div><div class="report-code"><p>Reporte: <strong>${escapeHtml(report.report_code || '')}</strong></p><p>Estado: ${escapeHtml(report.source_status || '')}</p></div></section>
    <section class="kpis"><div class="kpi"><div class="kpi-label">Pozos periodo</div><div class="kpi-value">${format(entry.total_pozos_m3)} m³</div></div><div class="kpi"><div class="kpi-label">Líneas periodo</div><div class="kpi-value">${format(linePeriodTotal)} m³</div></div><div class="kpi"><div class="kpi-label">Flujos periodo</div><div class="kpi-value">${format(flowPeriodTotal)} m³</div></div></section>
    ${wellChart}${lineChart}${flowChart}
    ${table('Pozos', [{key:'equipo',label:'Equipo'},{key:'ubicacion',label:'Ubicación'},{key:'suministro_m3',label:'Volumen periodo',suffix:' m³'},{key:'flujo_lps',label:'Flujo actual',suffix:' L/s'},{key:'estado',label:'Estado'},{key:'comunicacion',label:'Comunicación'}], entryRows)}
    ${table('Líneas', [{key:'linea',label:'Línea'},{key:'sensor_id',label:'Sensor'},{key:'flujo_lps',label:'Flujo actual',suffix:' L/s'},{key:'volumen_periodo_m3',label:'Volumen periodo',suffix:' m³'},{key:'totalizador_m3',label:'Totalizador',suffix:' m³'},{key:'estado',label:'Estado'}], lines)}
    ${table('Flujos', [{key:'equipo',label:'Punto'},{key:'sensor_id',label:'Sensor'},{key:'tipo',label:'Tipo'},{key:'flujo_lps',label:'Flujo actual',suffix:' L/s'},{key:'volumen_periodo_m3',label:'Volumen periodo',suffix:' m³'},{key:'totalizador_m3',label:'Totalizador',suffix:' m³'},{key:'estado',label:'Estado'}], flows)}
    ${table('Consumo de Agua - Volumen del periodo', [{key:'equipo',label:'Equipo'},{key:'ubicacion',label:'Detalle'},{key:'suministro',label:'Volumen periodo',suffix:' m³'},{key:'porcentaje',label:'Participación',suffix:'%'}], consumption.rows || [])}
    ${table('Suministro Agua 24 hrs', [{key:'equipo',label:'Equipo'},{key:'ubicacion',label:'Ubicación'},{key:'lectura_inicio_m3',label:'Lectura inicio'},{key:'lectura_final_m3',label:'Lectura final'},{key:'suministro_m3',label:'Suministro',suffix:' m³'}], report.supply_24h?.rows || [])}
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
  const iframe = document.createElement('iframe');
  const reportTitle = reportFileBaseName(report);
  const previousTitle = document.title;
  let cleanedUp = false;

  iframe.style.position = 'fixed';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.opacity = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.src = 'about:blank';

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    document.title = previousTitle;
    setTimeout(() => iframe.remove(), 1200);
  };

  document.body.appendChild(iframe);
  const frameWindow = iframe.contentWindow;
  const frameDocument = iframe.contentDocument || frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    cleanup();
    return;
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
  frameDocument.title = reportTitle;
  document.title = reportTitle;

  const handleAfterPrint = () => {
    frameWindow.removeEventListener('afterprint', handleAfterPrint);
    cleanup();
  };

  frameWindow.addEventListener('afterprint', handleAfterPrint);

  try {
    await waitForFrameImages(frameWindow);
    setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
    }, 250);
  } catch (error) {
    frameWindow.removeEventListener('afterprint', handleAfterPrint);
    cleanup();
    console.error('No se pudo preparar el PDF del reporte diario:', error);
  }
}

