import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const sidebarJsx = readFileSync(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8');
const sidebarTsx = readFileSync(new URL('../src/components/Sidebar.tsx', import.meta.url), 'utf8');
const themeCss = readFileSync(new URL('../src/styles/theme.css', import.meta.url), 'utf8');
const sharedCss = readFileSync(new URL('../src/styles/shared.css', import.meta.url), 'utf8');
const historicosCss = readFileSync(new URL('../src/styles/pages/historicos.css', import.meta.url), 'utf8');

test('Durango conserva oscuro por defecto y persiste la preferencia de tema', () => {
  assert.match(app, /DURANGO_THEME_STORAGE_KEY = 'arca-durango-theme'/);
  assert.match(app, /=== 'light' \? 'light' : 'dark'/);
  assert.match(app, /localStorage\.setItem\(DURANGO_THEME_STORAGE_KEY, theme\)/);
  assert.match(app, /theme-\$\{theme\}/);
  assert.match(app, /data-theme=\{theme\}/);
});

test('selector de tema existe en los dos Sidebar usados por el proyecto', () => {
  for (const sidebar of [sidebarJsx, sidebarTsx]) {
    assert.match(sidebar, /Modo claro/);
    assert.match(sidebar, /Modo oscuro/);
    assert.match(sidebar, /Sun/);
    assert.match(sidebar, /Moon/);
    assert.match(sidebar, /sidebar-theme-control/);
  }
});

test('modo claro usa superficies claras, sidebar azul y KPIs azules desde theme.css', () => {
  assert.match(themeCss, /\.pozos-shell\.theme-light\s*\{/);
  assert.match(themeCss, /\.pozos-shell\.theme-light \.sidebar[\s\S]*?#062743/);
  assert.match(themeCss, /\.pozos-shell\.theme-light \.panel,[\s\S]*?background:\s*#ffffff;/);
  assert.match(themeCss, /\.pozos-shell\.theme-light \.kpi-card[\s\S]*?background:\s*linear-gradient\(145deg, #0b4f7a 0%, #073b61 100%\)/);
  assert.match(themeCss, /\.pozos-shell\.theme-light \.kpi-card \.kpi-value\s*\{\s*color:\s*#ffffff;/);
});

test('modo claro adapta controles, tablas y graficas en sus capas responsables', () => {
  assert.match(themeCss, /color-scheme:\s*light;/);
  assert.match(themeCss, /\.pozos-shell\.theme-light th,[\s\S]*?background:\s*#eaf5fb;/);
  assert.match(themeCss, /\.pozos-shell\.theme-light \.recharts-cartesian-axis-tick-value[\s\S]*?fill:\s*#405e75 !important;/);
  assert.match(themeCss, /\.pozos-shell\.theme-light \.chart-tooltip,[\s\S]*?background:\s*rgba\(255,255,255,.98\)/);
  assert.match(historicosCss, /\.pozos-shell\.theme-light \.recharts-cartesian-grid line,[\s\S]*?stroke:\s*rgba\(31, 78, 112, \.28\) !important/);
});

test('modo claro aplica contrato global de contraste para texto funcional', () => {
  assert.match(themeCss, /--light-title:\s*#0B1F3A/);
  assert.match(themeCss, /--light-body:\s*#334E68/);
  assert.match(themeCss, /--light-muted:\s*#5C7184/);
  assert.match(themeCss, /--light-label:\s*#234A70/);
  assert.match(themeCss, /\.pozos-shell\.theme-light \.report-center-heading \.panel-title,[\s\S]*?color:\s*var\(--light-title\)/);
  assert.match(themeCss, /\.pozos-shell\.theme-light \.report-center-heading > span,[\s\S]*?color:\s*var\(--light-label\)/);
  assert.match(themeCss, /\.pozos-shell\.theme-light \.report-field-label,[\s\S]*?color:\s*var\(--light-label\)/);
  assert.match(themeCss, /\.pozos-shell\.theme-light input::placeholder,[\s\S]*?color:\s*#71869A/);
});

test('modo claro conserva contraste semantico y acciones destructivas visibles', () => {
  assert.match(themeCss, /\.pozos-shell\.theme-light \.danger-action,[\s\S]*?color:\s*#B42318/);
  assert.match(themeCss, /\.pozos-shell\.theme-light \.status-pill\.warning,[\s\S]*?color:\s*#765B00/);
  assert.match(themeCss, /\.pozos-shell\.theme-light \.status-pill\.critical[\s\S]*?color:\s*#A61B1B/);
  assert.match(themeCss, /\.pozos-shell\.theme-light th,[\s\S]*?color:\s*var\(--light-label\)/);
});

test('11E conserva controles y graficas claras en shared.css e historicos.css', () => {
  assert.match(sharedCss, /Homologacion Durango 11E/);
  assert.match(historicosCss, /\.pozos-shell\.theme-light \.module-metric-selector[\s\S]*?background:\s*#eaf6fd !important/);
  assert.match(historicosCss, /\.pozos-shell\.theme-light \.module-selection-heading[\s\S]*?color:\s*#234a70 !important/);
  assert.match(historicosCss, /\.pozos-shell\.theme-light \.history-aggregation-menu[\s\S]*?background:\s*#ffffff !important/);
  assert.match(sharedCss, /\.pozos-shell\.theme-light \.date-range-status,[\s\S]*?background:\s*#eaf6fd !important/);
  assert.match(historicosCss, /stroke:\s*rgba\(31, 78, 112, \.28\) !important/);
});
