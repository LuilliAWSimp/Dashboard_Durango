import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component = readFileSync(new URL('../src/pages/pozos/components/OperationalModuleSection.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/durangoModulesLF16.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

// El módulo compartido es usado por Pozos, Líneas, Lavadoras y Jarabes.
const sections = ['PozosSection.tsx', 'LineasSection.tsx', 'FlujosSection.tsx', 'JarabesSection.tsx'];

test('DGO-V05 carga estilo de módulos después de la base visual V01-V04', () => {
  const v04 = main.indexOf("import './styles/durangoHistoryLF16.css'");
  const v05 = main.indexOf("import './styles/durangoModulesLF16.css'");
  assert.ok(v04 >= 0 && v05 > v04);
  assert.match(css, /--dgo-surface/);
  assert.match(css, /--dgo-border/);
  assert.match(css, /--dgo-muted/);
  assert.match(css, /\.pozos-shell\.theme-light \.dgo-lf16-equipment-card/);
});

test('DGO-V05 compone las cuatro secciones mediante el módulo compartido', () => {
  for (const filename of sections) {
    const source = readFileSync(new URL(`../src/pages/pozos/sections/${filename}`, import.meta.url), 'utf8');
    assert.match(source, /OperationalModuleSection/);
  }
  assert.match(component, /dgo-lf16-module-heading/);
  assert.match(component, /dgo-lf16-module-kpis/);
  assert.match(component, /dgo-lf16-equipment-grid/);
  assert.match(component, /dgo-lf16-equipment-card/);
});

test('DGO-V05 conserva todos los KPI y cambia solo densidad visual', () => {
  assert.equal((component.match(/<KpiCard\b/g) || []).length, 10);
  assert.match(component, /rawSummary\.totalM3/);
  assert.match(component, /rawSummary\.operating/);
  assert.match(component, /rawSummary\.noFlow/);
  assert.match(component, /rawSummary\.readings/);
  assert.match(component, /rawSummary\.review \+ rawSummary\.noHistory/);
  assert.match(css, /min-height: 102px/);
});

test('DGO-V05 preserva mediciones, unidad y estado sin inventar cero', () => {
  assert.match(component, /const volume = number\(row\.period_m3\)/);
  assert.match(component, /const flow = currentFlow\(row\)/);
  assert.match(component, /const totalizer = number\(row\.current_totalizer_m3 \?\? row\.totalizador_m3\)/);
  assert.match(component, /value=\{volume === null \? 'No disponible' : fmt\(volume\)\}/);
  assert.match(component, /value=\{flow === null \? 'Sin dato' : fmt\(flow\)\}/);
  assert.match(component, /value=\{totalizer === null \? 'Sin totalizador' : fmt\(totalizer\)\}/);
  assert.match(component, /value=\{number\(row\.active_minutes\) === null \? '—' : fmt\(row\.active_minutes\)\}/);
  assert.match(component, /communicationNeedsAttention/);
  assert.match(component, /formatSqlDate\(row\.last_update \|\| row\.ultima_lectura\)/);
});

test('DGO-V05 mantiene navegación, históricos, cortes y tabla sin cambiar rutas', () => {
  assert.match(component, /onClick=\{\(\) => openDetail\(identity\)\}/);
  assert.match(component, /buildOperationalDetailPath\(route, identity, controller\.range, aggregation, module\)/);
  assert.match(component, /<ModuleHistoryPanel/);
  assert.match(component, /<ShiftConsumptionPanel/);
  assert.match(component, /pozos-operacion-table/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 1279px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
});
