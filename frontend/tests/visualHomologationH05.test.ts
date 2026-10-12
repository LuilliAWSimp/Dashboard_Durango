import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const review = read('src/pages/pozos/sections/RevisionDiariaSection.tsx');
const reports = read('src/pages/pozos/sections/ReportesSection.tsx');
const users = read('src/pages/UsersPage.tsx');
const detail = read('src/pages/pozos/components/OperationalDetailSection.tsx');
const reviewCss = read('src/styles/pages/revision-diaria.css');
const reportsCss = read('src/styles/pages/reportes.css');
const usersCss = read('src/styles/pages/usuarios.css');

test('H05 agrega jerarquía visual a Revisión diaria sin tocar su consulta', () => {
  assert.match(review, /eyebrow="Operación de agua · Durango"/);
  assert.match(review, /eyebrow="Análisis por módulo"/);
  assert.match(review, /eyebrow="Lecturas y calidad"/);
  assert.match(review, /fetchWaterDailyReview\(\{/);
  assert.match(review, /includeShifts: true/);
  assert.match(review, /forceRefresh,/);
  assert.match(reviewCss, /\.daily-review-kpi-grid\s*\{\s*grid-template-columns:\s*repeat\(3/);
  assert.match(reviewCss, /@media \(max-width:\s*640px\)/);
});

test('H05 mantiene acciones de Reportes y su estado de trabajo asíncrono', () => {
  assert.match(reports, /runExport\('pdf'\)/);
  assert.match(reports, /runExport\('xlsx'\)/);
  assert.match(reports, /runHistoricalExport\('excel'\)/);
  assert.match(reports, /report-export-job-status/);
  assert.match(reportsCss, /DGO-H05 - Centro de reportes/);
  assert.match(reportsCss, /\.durango-report-page \.report-action-button:focus-visible/);
  assert.match(reportsCss, /\.pozos-shell\.theme-light \.durango-report-page \.report-hero-panel/);
});

test('H05 preserva administración de usuarios y accesibilidad móvil', () => {
  assert.match(users, /eyebrow="Seguridad de acceso · Durango"/);
  assert.match(users, /eyebrow="Inventario de accesos"/);
  assert.match(users, /onSubmit=\{handleCreate\}/);
  assert.match(users, /resetUserPassword/);
  assert.match(users, /revokeUserSessions/);
  assert.match(usersCss, /DGO-H05 - Administración de Usuarios/);
  assert.match(usersCss, /\.users-table-wrap\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(usersCss, /@media \(max-width: 640px\)/);
});

test('H05 corrige referencia inexistente del breadcrumb introducido en H04', () => {
  assert.match(detail, /const navigationLabel =/);
  assert.match(detail, /operational-detail-breadcrumb">\{navigationLabel\} \/ \{name\}/);
  assert.doesNotMatch(detail, /operational-detail-breadcrumb">\{title\}/);
});
