function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function fmt(value) {
  if (value === null || value === undefined || value === '') return 'No disponible';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(value);
}
function fmtVolume(value) { return value === null || value === undefined || value === '' ? 'No disponible' : `${fmt(value)} m³`; }
function fmtDate(value) {
  if (!value) return 'Sin lectura';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function volumeDisplay(row) {
  if (row?.has_discontinuities && row?.validated_volume_m3 !== null && row?.validated_volume_m3 !== undefined) return `Volumen validado parcial: ${fmt(row.validated_volume_m3)} m³`;
  if (row?.validated_volume_m3 !== null && row?.validated_volume_m3 !== undefined) return `${fmt(row.validated_volume_m3)} m³`;
  return String(row?.activity || 'No disponible');
}
export function buildDailyWaterReportHtml(report) {
  const section = (title, rows) => `<section><h2>${escapeHtml(title)}</h2><table><thead><tr><th>Elemento</th><th>Flujo actual</th><th>Apertura</th><th>Cierre</th><th>Volumen</th><th>Actividad</th><th>Comunicación</th><th>Última actualización</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${row.flow == null ? 'No disponible' : `${fmt(row.flow)} ${escapeHtml(row.flow_unit || 'L/s')}`}</td><td>${row.opening_m3 == null ? 'No disponible' : `${fmt(row.opening_m3)} m³`}</td><td>${row.closing_m3 == null ? 'No disponible' : `${fmt(row.closing_m3)} m³`}</td><td>${escapeHtml(volumeDisplay(row))}</td><td>${escapeHtml(row.activity)}</td><td>${escapeHtml(row.communication)}</td><td>${escapeHtml(fmtDate(row.last_update))}</td></tr>`).join('')}</tbody></table></section>`;
  const summary = report.summary || {};
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title><style>body{font-family:Arial,sans-serif;color:#152536;margin:30px;background:#fff}h1{text-align:center;color:#073b4c;margin-bottom:6px}h2{color:#075985;margin-top:28px;margin-bottom:10px}.meta{text-align:center;color:#526b78;margin-bottom:24px}.summary{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:10px}.summary div{border:1px solid #cbdde5;border-radius:10px;padding:12px;background:#f7fbfd}.summary span{display:block;color:#31576a;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.summary strong{display:block;color:#073b4c;font-size:20px;margin-top:6px}.note{margin:12px 0 20px;padding:10px 12px;border-left:4px solid #0b6e8e;background:#eef7fa;color:#31576a;font-size:12px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#0b6e8e;color:#fff;text-align:center}th,td{border:1px solid #b6cbd6;padding:7px;vertical-align:middle}td:nth-child(n+2){text-align:center}tbody tr:nth-child(even){background:#f3f8fa}@media(max-width:900px){.summary{grid-template-columns:repeat(2,1fr)}table{font-size:10px}}</style></head><body><h1>Reporte Diario de Control Hídrico Durango</h1><p class="meta">Periodo: ${escapeHtml(report.period_label)} · Generado: ${escapeHtml(fmtDate(report.generated_at))}</p><div class="summary"><div><span>Volumen validado de pozos</span><strong>${fmtVolume(summary.well_validated_volume_m3 ?? summary.well_volume_m3)}</strong></div><div><span>Volumen validado de líneas</span><strong>${fmtVolume(summary.line_validated_volume_m3 ?? summary.line_volume_m3)}</strong></div><div><span>Volumen validado de flujos</span><strong>${fmtVolume(summary.washer_validated_volume_m3 ?? summary.flow_validated_volume_m3 ?? summary.flow_volume_m3)}</strong></div><div><span>Total validado operativo</span><strong>${fmtVolume(summary.total_validated_operational_m3 ?? summary.total_operational_m3)}</strong></div><div><span>Datos en revisión</span><strong>${Number(summary.review_count || 0).toLocaleString('es-MX')}</strong></div></div><p class="note">${escapeHtml(summary.note || 'Los volúmenes mostrados consideran únicamente incrementos validados. Los eventos descartados no se incluyen en los totales.')}</p>${section('Pozos', report.wells?.rows || [])}${section('Líneas', report.production_lines?.rows || [])}${section('Flujos', report.operational_flows?.rows || [])}</body></html>`;
}
export function exportDailyWaterReportHtml(report) { const blob=new Blob([buildDailyWaterReportHtml(report)],{type:'text/html;charset=utf-8'}); const url=URL.createObjectURL(blob); const anchor=document.createElement('a'); anchor.href=url; anchor.download=`reporte-diario-control-hidrico-durango-${report.start_date}.html`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); }
