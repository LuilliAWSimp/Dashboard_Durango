import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const component = readFileSync(new URL('../src/pages/pozos/components/ModuleHistoryPanel.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/pages/historicos.css', import.meta.url), 'utf8');

test('H09: la vista previa captura su identidad, fechas, metrica y elementos', () => {
  assert.match(component, /type HistoryChartSnapshot = \{/);
  assert.match(component, /response: WaterModuleHistoryResponse/);
  assert.match(component, /viewLabel: moduleDisplayLabel/);
  assert.match(component, /metric,\s*totalizerDisplay,\s*volumeDisplay,\s*flowOnly/);
  assert.match(component, /selected: \[\.\.\.selected\]/);
  assert.match(component, /formatOperationalDateRange\(\{ startDate: lastChart\.response\.start_date/);
});

test('H09: no borra el resultado previo en cambio de rango y mantiene exportaciones aisladas', () => {
  const load = component.slice(component.indexOf('const load = useCallback'), component.indexOf('const filteredData = useMemo'));
  assert.doesNotMatch(load, /setData\(null\)/);
  assert.match(component, /if \(!data \|\| resolvedQueryIdentity !== queryIdentity\) return null/);
  assert.match(component, /const chartData = isPreviousChart && lastChart \? lastChart\.response : filteredData/);
  assert.match(component, /const exportRows = useMemo.*?displayRows\.map/);
  assert.match(component, /className=\{isPreviousChart \? 'dgo-h09-chart-previous'/);
});

test('H09: refresco normal indica progreso y modo claro accesible', () => {
  assert.match(component, /setRefreshing\(true\)/);
  assert.match(component, /chartPending = loading \|\| refreshing/);
  assert.match(component, /data-history-view=/);
  assert.match(css, /\.dgo-h09-history-reference/);
  assert.match(css, /theme-light \.dgo-h09-history-reference/);
  assert.match(css, /prefers-reduced-motion/);
});
