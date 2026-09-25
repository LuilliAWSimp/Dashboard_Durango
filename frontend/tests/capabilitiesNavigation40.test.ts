import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildDurangoNavigation,
  durangoCapabilityState,
  extractDurangoRuntimeCapabilities,
  isDurangoSectionAccessible,
} from '../src/config/plantCapabilities.ts';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/pages/PozosDashboardPage.jsx', import.meta.url), 'utf8');
const capabilities = readFileSync(new URL('../src/config/plantCapabilities.ts', import.meta.url), 'utf8');

test('Incremental 40 elimina el menú hidráulico hardcodeado de App', () => {
  assert.doesNotMatch(app, /const POZOS_MENU_ITEMS/);
  assert.match(app, /buildDurangoNavigation\(runtimeCapabilities, user\?\.role\)/);
  assert.match(app, /extractDurangoRuntimeCapabilities\(data\)/);
});

test('navegación visible responde a capabilities y conserva estados pendientes', () => {
  const items = buildDurangoNavigation({}, 'viewer');
  const labels = items.map((item) => item.label);
  assert.deepEqual(labels, [
    'Resumen', 'Pozos', 'Líneas', 'Lavadoras', 'Jarabes',
    'Balance de Agua · En validación',
    'Revisión Diaria', 'Reportes',
  ]);
  assert.equal(items.some((item) => item.key === 'usuarios'), false);

  const adminItems = buildDurangoNavigation({}, 'admin');
  assert.equal(adminItems.some((item) => item.key === 'usuarios'), true);
});

test('capability deshabilitada oculta navegación y bloquea URL directa', () => {
  const runtime = { washers: false, reports: false } as const;
  const keys = buildDurangoNavigation(runtime, 'viewer').map((item) => item.key);
  assert.equal(keys.includes('flujos'), false);
  assert.equal(keys.includes('reportes'), false);
  assert.equal(isDurangoSectionAccessible('flujos', runtime, 'viewer'), false);
  assert.equal(isDurangoSectionAccessible('reportes', runtime, 'viewer'), false);
  assert.equal(isDurangoSectionAccessible('dashboard', runtime, 'viewer'), true);
});

test('módulos heredados quedan explícitamente inactivos y una sección desconocida no es accesible', () => {
  for (const section of ['tanques', 'consumos', 'cip', 'uv', 'electric']) {
    assert.equal(isDurangoSectionAccessible(section, {}, 'admin'), false, section);
  }
  assert.equal(isDurangoSectionAccessible('inventado', {}, 'admin'), false);
  assert.match(capabilities, /tanks:\s*false/);
  assert.match(capabilities, /cip:\s*false/);
  assert.match(capabilities, /uv:\s*false/);
  assert.match(capabilities, /energy:\s*false/);
});

test('usuarios depende de rol y no de una capability física', () => {
  assert.equal(isDurangoSectionAccessible('usuarios', {}, 'admin'), true);
  assert.equal(isDurangoSectionAccessible('usuarios', {}, 'operator'), false);
  assert.equal(isDurangoSectionAccessible('usuarios', {}, 'viewer'), false);
});

test('payload runtime de backend prevalece sobre fallback frontend', () => {
  const runtime = extractDurangoRuntimeCapabilities({
    plant_capabilities: {
      capabilities: {
        wells: false,
        lines: true,
        balance: 'pending_physical_validation',
        concession: false,
      },
    },
  });
  assert.equal(durangoCapabilityState('wells', runtime), false);
  assert.equal(durangoCapabilityState('lines', runtime), true);
  assert.equal(durangoCapabilityState('washers', runtime), true, 'usa fallback local si backend viejo omite una clave');
});

test('PozosDashboardPage protege rutas antes de renderizar contenido no permitido', () => {
  assert.match(page, /isDurangoSectionAccessible\(section, runtimeCapabilities, user\?\.role\)/);
  assert.match(page, /if \(!sectionAllowed\) return <Navigate to="\/pozos\/dashboard" replace \/>/);
  assert.match(page, /effectiveSection = sectionAllowed \? section : 'dashboard'/);
});
