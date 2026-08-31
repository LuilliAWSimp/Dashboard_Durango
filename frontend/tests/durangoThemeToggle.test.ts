import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const sidebarJsx = readFileSync(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8');
const sidebarTsx = readFileSync(new URL('../src/components/Sidebar.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');

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

test('modo claro usa superficies claras, sidebar azul y KPIs azules globales', () => {
  assert.match(css, /\.pozos-shell\.theme-light\s*\{/);
  assert.match(css, /\.pozos-shell\.theme-light \.sidebar[\s\S]*?#062743/);
  assert.match(css, /\.pozos-shell\.theme-light \.panel,[\s\S]*?background:\s*#ffffff;/);
  assert.match(css, /\.pozos-shell\.theme-light \.kpi-card[\s\S]*?background:\s*linear-gradient\(145deg, #0b4f7a 0%, #073b61 100%\)/);
  assert.match(css, /\.pozos-shell\.theme-light \.kpi-card \.kpi-value\s*\{\s*color:\s*#ffffff;/);
});

test('modo claro adapta controles, tablas y graficas', () => {
  assert.match(css, /color-scheme:\s*light;/);
  assert.match(css, /\.pozos-shell\.theme-light th,[\s\S]*?background:\s*#eaf5fb;/);
  assert.match(css, /\.pozos-shell\.theme-light \.recharts-cartesian-axis-tick-value[\s\S]*?fill:\s*#405e75 !important;/);
  assert.match(css, /\.pozos-shell\.theme-light \.chart-tooltip,[\s\S]*?background:\s*rgba\(255,255,255,.98\)/);
});
