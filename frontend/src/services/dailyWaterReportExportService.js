function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmt(value) {
  if (value === null || value === void 0 || value === "") return "No disponible";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(value);
}
function fmtVolume(value) {
  return value === null || value === void 0 || value === "" ? "No disponible" : `${fmt(value)} m\xB3`;
}
function fmtDate(value) {
  if (!value) return "Sin lectura";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function volumeDisplay(row) {
  if (row?.validated_volume_m3 !== null && row?.validated_volume_m3 !== void 0) {
    return `${fmt(row.validated_volume_m3)} m\xB3`;
  }
  return "Sin volumen validado";
}
function validationLabel(row) {
  if (row?.validated_volume_m3 !== null && row?.validated_volume_m3 !== void 0) return "Validado";
  if (row?.validation && String(row.validation) !== "Validaci\xF3n parcial") return String(row.validation);
  return "Sin volumen validado";
}
const CHART_COLORS = ["#1597d4", "#7047eb", "#f59e0b", "#10b981", "#e84a5f"];
function aggregationLabel(value) {
  return { quarter_hour: "15 minutos", hourly: "1 hora", daily: "1 d\xEDa" }[String(value)] || "periodo";
}
function historyTime(value) {
  const parsed = new Date(String(value || "")).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}
function historyLabel(value, aggregation, singleDay) {
  const date = new Date(value);
  if (String(aggregation) === "daily") return date.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit" });
  if (singleDay) return date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  return `${date.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit" })} ${date.toLocaleTimeString("es-MX", { hour: "2-digit" })}`;
}
function flowHistoryChart(history, singleDay) {
  const series = history?.series || [];
  const points = series.flatMap((item) => item.points || []);
  const effectiveEnd = historyTime(history?.effective_end_at) ?? Number.POSITIVE_INFINITY;
  const timestampValues = points.map((point) => historyTime(point.bucket_start || point.timestamp)).filter((value) => value !== null).filter((value) => value < effectiveEnd);
  const timestamps = [...new Set(timestampValues)].sort((a, b) => a - b);
  const values = points.filter((point) => Number(point.samples || 0) > 0 && point.flow_avg_lps != null).map((point) => Number(point.flow_avg_lps)).filter((value) => Number.isFinite(value));
  if (!timestamps.length || !values.length) return '<div class="chart-empty">Sin registros hist\xF3ricos para graficar.</div>';
  const width = 960;
  const height = 300;
  const left = 62;
  const right = 24;
  const top = 18;
  const bottom = 72;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const first = timestamps[0];
  const last = timestamps[timestamps.length - 1];
  const span = Math.max(last - first, 1);
  const max = Math.max(...values, 1) * 1.12;
  const x = (value) => left + (value - first) / span * plotWidth;
  const y = (value) => top + plotHeight - Math.max(value, 0) / max * plotHeight;
  const grid = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const gridY = top + plotHeight - ratio * plotHeight;
    return `<line x1="${left}" y1="${gridY}" x2="${left + plotWidth}" y2="${gridY}"/><text x="${left - 10}" y="${gridY + 4}" text-anchor="end">${fmt(max * ratio)}</text>`;
  }).join("");
  const labelIndexes = [...new Set(Array.from({ length: 5 }, (_, index) => Math.round(index * (timestamps.length - 1) / 4)))];
  const xLabels = labelIndexes.map((index) => `<text x="${x(timestamps[index])}" y="${top + plotHeight + 24}" text-anchor="middle">${escapeHtml(historyLabel(timestamps[index], history?.aggregation, singleDay))}</text>`).join("");
  const paths = series.map((item, seriesIndex) => {
    const byTime = new Map((item.points || []).map((point) => [historyTime(point.bucket_start || point.timestamp), point]).filter(([stamp]) => stamp !== null));
    let path = "";
    let started = false;
    for (const stamp of timestamps) {
      const point = byTime.get(stamp);
      const value = point && Number(point.samples || 0) > 0 && point.flow_avg_lps != null ? Number(point.flow_avg_lps) : null;
      if (value === null || !Number.isFinite(value)) {
        started = false;
        continue;
      }
      path += `${started ? "L" : "M"} ${x(stamp).toFixed(2)} ${y(value).toFixed(2)} `;
      started = true;
    }
    const color = CHART_COLORS[seriesIndex % CHART_COLORS.length];
    return `<path d="${path}" stroke="${color}" stroke-width="3" fill="none"/><g class="legend-item" transform="translate(${left + seriesIndex % 2 * 420},${height - 24 - Math.floor(seriesIndex / 2) * 20})"><line x1="0" y1="0" x2="24" y2="0" stroke="${color}" stroke-width="4"/><text x="32" y="4">${escapeHtml(item.name)}</text></g>`;
  }).join("");
  return `<svg class="report-chart" role="img" aria-label="Hist\xF3rico de flujo" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet"><g class="chart-grid">${grid}</g><rect x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}" class="chart-frame"/><text x="18" y="${top + plotHeight / 2}" class="axis-title">L/s</text>${xLabels}${paths}</svg>`;
}
function volumeChart(rows) {
  if (!rows.length) return '<div class="chart-empty">Sin elementos para comparar.</div>';
  const width = 960;
  const rowHeight = 48;
  const height = 36 + rows.length * rowHeight;
  const labelWidth = 220;
  const valueWidth = 160;
  const plotWidth = width - labelWidth - valueWidth - 20;
  const values = rows.map((row) => row.validated_volume_m3 == null ? null : Number(row.validated_volume_m3));
  const max = Math.max(...values.filter((value) => value !== null && Number.isFinite(value)), 1);
  const bars = rows.map((row, index) => {
    const value = values[index];
    const top = 20 + index * rowHeight;
    const color = "#1597d4";
    const bar = value != null && value > 0 ? `<rect x="${labelWidth}" y="${top}" width="${plotWidth * value / max}" height="18" rx="4" fill="${color}"/>` : "";
    const label = value == null ? Number(row.samples || 0) <= 0 ? "Sin registros" : "Sin volumen validado" : `${fmt(value)} m\xB3`;
    return `<text x="0" y="${top + 14}">${escapeHtml(row.name)}</text><rect x="${labelWidth}" y="${top}" width="${plotWidth}" height="18" rx="4" class="bar-track"/>${bar}<text x="${labelWidth + plotWidth + 12}" y="${top + 14}">${escapeHtml(label)}</text>`;
  }).join("");
  return `<svg class="report-chart volume-chart" role="img" aria-label="Volumen validado por elemento" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">${bars}</svg>`;
}
function buildDailyWaterReportHtml(report) {
  const section = (title, rows, history) => `
    <section class="module-section">
      <h2>${escapeHtml(title)}</h2>
      <p class="section-meta">Periodo ${escapeHtml(report.period_label)} \xB7 Agrupaci\xF3n hist\xF3rica: ${escapeHtml(aggregationLabel(history?.aggregation))}</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Elemento</th><th>Flujo actual</th><th>Apertura</th><th>Cierre</th><th>Volumen</th><th>Actividad</th><th>Validaci\xF3n</th><th>Comunicaci\xF3n</th><th>\xDAltima actualizaci\xF3n</th></tr></thead>
        <tbody>${rows.map((row) => `<tr>
          <td>${escapeHtml(row.name)}</td>
          <td>${row.flow == null ? "No disponible" : `${fmt(row.flow)} ${escapeHtml(row.flow_unit || "L/s")}`}</td>
          <td>${row.opening_m3 == null ? "No disponible" : `${fmt(row.opening_m3)} m\xB3`}</td>
          <td>${row.closing_m3 == null ? "No disponible" : `${fmt(row.closing_m3)} m\xB3`}</td>
          <td>${escapeHtml(volumeDisplay(row))}</td>
          <td>${escapeHtml(row.activity)}</td>
          <td>${escapeHtml(validationLabel(row))}</td>
          <td>${escapeHtml(row.communication)}</td>
          <td>${escapeHtml(fmtDate(row.last_update))}</td>
        </tr>`).join("")}</tbody>
      </table></div>
      <h3>Comportamiento de flujo \xB7 ${escapeHtml(title)}</h3>
      ${flowHistoryChart(history, report.start_date === report.end_date)}
      <h3>Volumen validado por elemento</h3>
      ${volumeChart(rows)}
    </section>`;
  const summary = report.summary || {};
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title><style>
    *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1f2937;margin:0;background:#eef2f5}.report{width:min(1180px,calc(100% - 32px));margin:24px auto;background:#fff;padding:34px;border-radius:12px;box-shadow:0 8px 30px rgba(15,23,42,.08)}header{text-align:center;border-bottom:3px solid #c8102e;padding-bottom:18px}.brand{color:#c8102e;font-size:12px;font-weight:800;letter-spacing:.16em}h1{font-size:28px;margin:7px 0 6px;color:#1f2937}h2{font-size:22px;color:#1f2937;margin:0 0 8px}h3{font-size:15px;color:#334155;margin:22px 0 10px}.meta,.section-meta{color:#64748b;font-size:12px}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:26px 0 12px}.summary div{border:1px solid #cbd9e4;border-radius:8px;padding:13px;background:#f8fafc}.summary span{display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.06em}.summary strong{display:block;color:#1f2937;font-size:19px;margin-top:7px}.note{margin:12px 0 26px;padding:12px 14px;border-left:4px solid #c8102e;background:#f1f6fa;color:#475569;font-size:12px;line-height:1.5}.module-section{margin-top:36px;padding-top:8px}.table-wrap{width:100%;overflow-x:auto;border:1px solid #c5d6e3;border-radius:8px}table{width:100%;min-width:900px;border-collapse:collapse;font-size:11px}th{background:#e8f1f8;color:#334155;text-align:center}th,td{border:1px solid #c5d6e3;padding:8px;vertical-align:middle}td:nth-child(n+2){text-align:center}tbody tr:nth-child(even){background:#f7fafc}.report-chart{display:block;width:100%;height:auto;border:1px solid #d7e4ed;border-radius:8px;background:#fbfdff}.chart-grid line{stroke:#e4edf3}.chart-grid text,.report-chart text{font:12px Arial;fill:#475569}.chart-frame{fill:none;stroke:#d7e4ed}.axis-title{font-weight:700}.bar-track{fill:#edf3f7}.chart-empty{border:1px solid #d7e4ed;border-radius:8px;padding:48px 20px;text-align:center;color:#64748b;background:#fbfdff}@media(max-width:900px){.report{width:calc(100% - 16px);margin:8px;padding:20px}.summary{grid-template-columns:repeat(2,1fr)}h1{font-size:22px}.module-section{margin-top:28px}}@media(max-width:540px){.summary{grid-template-columns:1fr}.report{padding:16px}.report-chart{min-width:680px}.module-section{overflow-x:auto}}@media print{body{background:#fff}.report{width:100%;margin:0;padding:0;box-shadow:none}.module-section{break-before:page;page-break-before:always}.table-wrap,.report-chart{break-inside:avoid;page-break-inside:avoid}}
  </style></head><body>
    <main class="report"><header><div class="brand">ARCA CONTINENTAL \xB7 PLANTA DURANGO</div><h1>Reporte Diario de Control H\xEDdrico</h1><p class="meta">Periodo: ${escapeHtml(report.period_label)} \xB7 Generado: ${escapeHtml(fmtDate(report.generated_at))}</p></header>
    <div class="summary">
      <div><span>Volumen validado de pozos</span><strong>${fmtVolume(summary.well_validated_volume_m3 ?? summary.well_volume_m3)}</strong></div>
      <div><span>Volumen validado de l\xEDneas</span><strong>${fmtVolume(summary.line_validated_volume_m3 ?? summary.line_volume_m3)}</strong></div>
      <div><span>Volumen validado de lavadoras</span><strong>${fmtVolume(summary.washer_validated_volume_m3)}</strong></div>
      <div><span>Volumen validado de Jarabes</span><strong>${fmtVolume(summary.jarabes_validated_volume_m3)}</strong></div>
      <div><span>Total validado operativo</span><strong>${fmtVolume(summary.total_validated_operational_m3 ?? summary.total_operational_m3)}</strong></div>
      <div><span>Pozos con actividad</span><strong>${Number(summary.wells_active || 0)}/${report.wells?.rows?.length || 0}</strong></div>
      <div><span>L\xEDneas con actividad</span><strong>${Number(summary.lines_active || 0)}/${report.production_lines?.rows?.length || 0}</strong></div>
      <div><span>Lavadoras con actividad</span><strong>${Number(summary.washers_active || 0)}/${report.washers?.rows?.length || 0}</strong></div>
      <div><span>Jarabes con actividad</span><strong>${Number(summary.jarabes_active || 0)}/${report.jarabes?.rows?.length || 0}</strong></div>
    </div>
    <p class="note">${escapeHtml(summary.note || "Los vol\xFAmenes mostrados consideran \xFAnicamente incrementos validados. Los eventos descartados no se incluyen en los totales.")}<br><strong>Cero:</strong> lectura v\xE1lida sin flujo. <strong>Hueco:</strong> intervalo sin registros suficientes. Los gr\xE1ficos no generan intervalos futuros.</p>
    ${section("Pozos", report.wells?.rows || [], report.history?.wells)}
    ${section("L\xEDneas", report.production_lines?.rows || [], report.history?.lines)}
    ${section("Lavadoras", report.washers?.rows || [], report.history?.washers)}
    ${section("Jarabes", report.jarabes?.rows || [], report.history?.jarabes)}
  </main></body></html>`;
}
function exportDailyWaterReportHtml(report) {
  const blob = new Blob([buildDailyWaterReportHtml(report)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `reporte-diario-control-hidrico-durango-${report.start_date}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
export {
  buildDailyWaterReportHtml,
  exportDailyWaterReportHtml
};
