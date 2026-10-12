import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('las secciones operativas reutilizan el mismo ModuleHistoryPanel con rango historico independiente', () => {
  const section = read('src/pages/pozos/components/OperationalModuleSection.tsx');
  assert.match(section, /import type \{ OperationalHistoryView \} from '\.\/ModuleHistoryPanel'/);
  assert.match(section, /<ModuleHistoryPanel\s+[\s\S]*?fixedView=\{historyView\}[\s\S]*?independentRange[\s\S]*?\/>/);
  const historyBlock = section.match(/<ModuleHistoryPanel[\s\S]*?\/>/)?.[0] || '';
  assert.doesNotMatch(historyBlock, /aggregation=\{aggregation\}/);
  assert.doesNotMatch(historyBlock, /onAggregationChange=\{setAggregation\}/);
});

test('Pozos Lineas Lavadoras y Jarabes quedan bloqueados a la misma identidad del historico global', () => {
  const section = read('src/pages/pozos/components/OperationalModuleSection.tsx');
  assert.match(section, /sectionConfig\?\.key === 'lavadoras'[\s\S]*?\? 'washers'/);
  assert.match(section, /sectionConfig\?\.key === 'jarabes'[\s\S]*?\? 'jarabes'/);
  assert.match(section, /module === 'well'[\s\S]*?\? 'well'/);
  assert.match(section, /module === 'line'[\s\S]*?\? 'line'/);
});

test('ModuleHistoryPanel usa fixedView para modulo etiqueta elementos y bloqueo de tabs', () => {
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(history, /fixedView\?: OperationalHistoryView/);
  assert.match(history, /const lockedViewConfig = fixedView \? GLOBAL_HISTORY_VIEWS\[fixedView\] : null/);
  assert.match(history, /const module = lockedViewConfig\?\.module \|\| fixedModule \|\| viewConfig\.module/);
  assert.match(history, /const moduleDisplayLabel = lockedViewConfig\?\.label/);
  assert.match(history, /lockedViewConfig[\s\S]*?\? lockedViewConfig\.items/);
  assert.match(history, /!lockedHistory \? <div className="module-history-tabs"/);
});

test('cada historico de seccion tiene fechas propias y conserva nombre fisico en exportaciones', () => {
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(history, /aria-label=\{lockedHistory \? `Fechas del histórico de \$\{moduleDisplayLabel\}` : 'Fechas del histórico global'\}/);
  assert.match(history, /moduleLabel: moduleDisplayLabel/);
  assert.match(history, /module_label: moduleDisplayLabel/);
  assert.match(history, /operational-history-\$\{fixedView \|\| \(fixedModule \? module : globalView\)\}/);
});

test('las secciones y el detalle comparten el motor historico sin duplicar su implementacion', () => {
  const detail = read('src/pages/pozos/components/OperationalDetailSection.tsx');
  const elementHistory = read('src/pages/pozos/components/ElementHistoryPanel.tsx');
  assert.match(detail, /<ElementHistoryPanel[\s\S]*?module=\{module\}/);
  assert.match(elementHistory, /<ModuleHistoryPanel[\s\S]*?fixedModule=\{module\}/);
  assert.doesNotMatch(elementHistory.match(/<ModuleHistoryPanel[\s\S]*?\/>/)?.[0] || '', /independentRange/);
});
