import api from './api';

/** DGO-H01. La solicitud HTTP solo crea el trabajo; la generación vive en el backend. */
export async function runBackgroundReportExport(kind, options = {}, onUpdate = () => {}) {
  const { data: initial } = await api.post('/water/reports/jobs', { kind, options }, { timeout: 20_000 });
  const jobId = initial.id;
  if (!/^[0-9a-f]{32}$/.test(jobId || '')) throw new Error('Identificador de exportación inválido.');
  let job = initial;
  onUpdate(job);
  const startedAt = Date.now();
  // No esperar una respuesta larga de Cloudflare; cada petición es corta.
  while (job.status === 'queued' || job.status === 'running') {
    if (Date.now() - startedAt > 2 * 60 * 60 * 1000) {
      throw new Error('La exportación está tardando demasiado. Consulta al administrador.');
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const response = await api.get(`/water/reports/jobs/${jobId}`, { timeout: 15_000 });
    job = response.data;
    onUpdate(job);
  }
  if (job.status !== 'ready') {
    throw new Error(job.error || 'La exportación no se pudo completar.');
  }
  const response = await api.get(`/water/reports/jobs/${jobId}/download`, {
    responseType: 'blob', timeout: 120_000,
  });
  const extension = kind.endsWith('excel') ? 'xlsx' : 'pdf';
  const defaultName = `Reporte_Durango.${extension}`;
  const filename = job.filename || defaultName;
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  onUpdate(null);
}
