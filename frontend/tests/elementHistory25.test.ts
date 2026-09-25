import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('detalle usa ElementHistoryPanel V2 en lugar de ModuleHistoryPanel directo', () => {
  const detail = read('src/pages/pozos/components/OperationalDetailSection.tsx');
  assert.match(detail, /import ElementHistoryPanel from '\.\/ElementHistoryPanel'/);
  assert.match(detail, /<ElementHistoryPanel[\s\S]*?module=\{module\}[\s\S]*?view=\{historyView\}[\s\S]*?item=\{historyItems\[0\]\}/);
  assert.doesNotMatch(detail, /import ModuleHistoryPanel from/);
});

test('detalle asigna la identidad historica correcta a Pozos Lineas Lavadoras y Jarabes', () => {
  const detail = read('src/pages/pozos/components/OperationalDetailSection.tsx');
  assert.match(detail, /sectionConfig\?\.key === 'lavadoras'[\s\S]*?\? 'washers'/);
  assert.match(detail, /sectionConfig\?\.key === 'jarabes'[\s\S]*?\? 'jarabes'/);
  assert.match(detail, /module === 'well'[\s\S]*?\? 'well'/);
  assert.match(detail, /module === 'line'[\s\S]*?\? 'line'/);
});

test('ElementHistoryPanel reutiliza el motor comun en modo de un solo elemento', () => {
  const elementHistory = read('src/pages/pozos/components/ElementHistoryPanel.tsx');
  assert.match(elementHistory, /<ModuleHistoryPanel/);
  assert.match(elementHistory, /fixedModule=\{module\}/);
  assert.match(elementHistory, /fixedView=\{view\}/);
  assert.match(elementHistory, /items=\{\[item\]\}/);
  assert.match(elementHistory, /singleElement/);
  assert.match(elementHistory, /operational-element-history/);
});

test('historico individual conserva Excel Excel 5 min PDF y agrupaciones del motor comun', () => {
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(history, /> Excel<\/button>/);
  assert.match(history, /'Excel 5 min'/);
  assert.match(history, /'PDF'/);
  assert.match(history, /<option value="minute">1 minuto<\/option>/);
  assert.match(history, /<option value="quarter_hour">15 minutos<\/option>/);
  assert.match(history, /<option value="hourly">Por hora<\/option>/);
  assert.match(history, /<option value="daily">Por día<\/option>/);
});

test('modo individual oculta seleccion redundante y elimina el segundo Excel 5 min del rango', () => {
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  const detail = read('src/pages/pozos/components/OperationalDetailSection.tsx');
  assert.match(history, /!singleElement \? <>[\s\S]*?Elementos visibles/);
  assert.doesNotMatch(detail, /FiveMinuteExcelExportButton/);
  assert.doesNotMatch(detail, /extraAction=/);
  assert.match(detail, /subtitle="El rango actualiza indicadores, histórico y cortes del elemento\."/);
});
