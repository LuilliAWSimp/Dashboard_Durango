import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const history = readFileSync(new URL('../src/pages/pozos/components/ModuleHistoryPanel.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/pages/historicos.css', import.meta.url), 'utf8');
const jobs = readFileSync(new URL('../src/pages/pozos/sections/ReportesSection.tsx', import.meta.url), 'utf8');

test('el selector de fechas y las exportaciones comparten una barra de histórico', () => {
  const start = history.indexOf('<div className="module-history-toolbar">');
  const end = history.indexOf('{singleElement ? <div className="dgo-h02-threshold-panel"', start);
  assert.ok(start >= 0 && end > start);
  const toolbar = history.slice(start, end);
  assert.ok(toolbar.includes('module-history-range-panel'));
  assert.ok(toolbar.includes('module-comparison-controls'));
  assert.ok(toolbar.includes('module-history-range-actions'));
  assert.ok(toolbar.includes('module-history-aggregation'));
  assert.ok(css.includes('.module-history-toolbar > .module-history-range-panel'));
});

test('la exportación normal de Reportes muestra progreso del backend', () => {
  assert.ok(jobs.includes('exportJob.stage'));
  assert.ok(jobs.includes('exportJob.queue_seconds'));
  assert.ok(jobs.includes('exportJob.work_seconds'));
  assert.ok(jobs.includes("runExport('pdf')"));
});

test('al cambiar de pestaña del histórico reutiliza datos recientes sin bloquear actualizaciones', () => {
  assert.ok(history.includes('recentModuleQueries'));
  assert.ok(history.includes('Date.now() - previousQuery.at < 45_000'));
  assert.ok(history.includes('!forceRefresh && !background'));
  assert.ok(history.includes('recentModuleQueries.current.size > 6'));
});
