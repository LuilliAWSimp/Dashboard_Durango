import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DURANGO_CAPABILITIES } from '../src/config/plantCapabilities.ts';
import {
  buildComparisonRows,
  comparisonAxis,
  toggleComparisonSelection,
} from '../src/pages/pozos/moduleComparisonCore.ts';
import type { WaterModuleHistoryResponse } from '../src/pages/pozos/types.ts';

test('la clasificación central contiene cuatro líneas y cuatro flujos sin duplicar 2004', () => {
  assert.deepEqual(DURANGO_CAPABILITIES.lines.map((item) => item.sensorId), [2002, 2006, 2008, 2010]);
  assert.deepEqual(
    DURANGO_CAPABILITIES.flows.map((item) => item.sensorId ?? item.operationalKey),
    [2004, 'lavadora_vidrio', 'lavadora_ref_pet', 3004],
  );
  assert.equal(DURANGO_CAPABILITIES.flows[0]?.name, 'Lavadora Línea 2');
  assert.equal(DURANGO_CAPABILITIES.flows.at(-1)?.name, 'Jarabes');
  assert.equal(DURANGO_CAPABILITIES.flows.at(-1)?.sensorId, 3004);
});

test('la comparativa conserva cero real, null sin registro y totalizador observado', () => {
  const response = {
    module: 'flow',
    start_date: '2026-08-07',
    end_date: '2026-08-07',
    aggregation: 'quarter_hour',
    source_status: 'operational',
    series: [{
      sensor_id: 2004,
      operational_key: 'lavadora_linea_2',
      name: 'Lavadora Línea 2',
      source_status: 'readings_minute',
      has_data: true,
      points: [
        { sensor_id: 2004, bucket_start: '2026-08-07T08:00:00', bucket_end: '2026-08-07T08:15:00', aggregation: 'quarter_hour', samples: 15, flow_avg_lps: 0, flow_min_lps: 0, flow_max_lps: 0, totalizer_open_m3: 100, totalizer_close_m3: 100, volume_m3: 0, volume_reliable: true, data_status: 'zero_consumption' },
        { sensor_id: 2004, bucket_start: '2026-08-07T08:15:00', bucket_end: '2026-08-07T08:30:00', aggregation: 'quarter_hour', samples: 0, flow_avg_lps: null, flow_min_lps: null, flow_max_lps: null, totalizer_open_m3: null, totalizer_close_m3: null, volume_m3: null, volume_reliable: false, data_status: 'no_data' },
      ],
    }],
  } as WaterModuleHistoryResponse;
  const rows = buildComparisonRows(response, Date.parse('2026-08-07T09:00:00'));
  assert.equal(rows[0]?.flow_2004, 0);
  assert.equal(rows[0]?.totalizer_2004, 100);
  assert.equal(rows[1]?.flow_2004, null);
  assert.equal(rows[1]?.totalizer_2004, null);
});

test('Ambos declara ejes independientes y la selección múltiple no altera otro estado', () => {
  assert.deepEqual(comparisonAxis('flow'), { showFlow: true, showTotalizer: false, independentAxes: false });
  assert.deepEqual(comparisonAxis('totalizer'), { showFlow: false, showTotalizer: true, independentAxes: false });
  assert.deepEqual(comparisonAxis('both'), { showFlow: true, showTotalizer: true, independentAxes: true });
  const selected = toggleComparisonSelection([2002, 2006, 2008, 2010], 2008);
  assert.deepEqual(selected, [2002, 2006, 2010]);
  assert.deepEqual(toggleComparisonSelection(selected, 2008), [2002, 2006, 2010, 2008]);
});

test('el selector compartido de turnos conserva etiqueta y estilos accesibles', () => {
  const component = readFileSync(new URL('../src/pages/pozos/components/ShiftConsumptionPanel.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  assert.match(component, /Turno operativo/);
  assert.match(component, /aria-label="Turno operativo"/);
  assert.match(styles, /\.shift-selector-field select\s*\{/);
  assert.match(styles, /\.shift-selector-field select:focus-visible/);
});

import {
  JARABES_SECTION_CONFIG,
  LAVADORAS_SECTION_CONFIG,
} from '../src/pages/pozos/operationalSectionConfig.ts';

test('Lavadoras y Jarabes tienen catálogos de presentación separados', () => {
  assert.deepEqual(LAVADORAS_SECTION_CONFIG.allowedOperationalKeys, ['lavadora_linea_2', 'lavadora_vidrio', 'lavadora_ref_pet']);
  assert.deepEqual(JARABES_SECTION_CONFIG.allowedOperationalKeys, ['jarabes']);
  assert.equal(LAVADORAS_SECTION_CONFIG.labels.totalKpi, 'Total de lavadoras');
  assert.equal(LAVADORAS_SECTION_CONFIG.labels.operatingKpi, 'Lavadoras operando');
  assert.equal(LAVADORAS_SECTION_CONFIG.labels.noFlowKpi, 'Lavadoras sin flujo');
  assert.equal(LAVADORAS_SECTION_CONFIG.labels.readingsKpi, 'Lecturas de lavadoras');
  assert.equal(JARABES_SECTION_CONFIG.labels.totalKpi, 'Elementos monitoreados');
  assert.equal(JARABES_SECTION_CONFIG.labels.operatingKpi, 'Jarabes operando');
  assert.equal(JARABES_SECTION_CONFIG.labels.noFlowKpi, 'Jarabes sin flujo');
  assert.equal(JARABES_SECTION_CONFIG.labels.readingsKpi, 'Lecturas de Jarabes');
});

test('las secciones nuevas pasan configuración al componente operativo reutilizable', () => {
  const lavadoras = readFileSync(new URL('../src/pages/pozos/sections/FlujosSection.tsx', import.meta.url), 'utf8');
  const jarabes = readFileSync(new URL('../src/pages/pozos/sections/JarabesSection.tsx', import.meta.url), 'utf8');
  const moduleSection = readFileSync(new URL('../src/pages/pozos/components/OperationalModuleSection.tsx', import.meta.url), 'utf8');
  const historyPanel = readFileSync(new URL('../src/pages/pozos/components/ModuleHistoryPanel.tsx', import.meta.url), 'utf8');
  const shiftPanel = readFileSync(new URL('../src/pages/pozos/components/ShiftConsumptionPanel.tsx', import.meta.url), 'utf8');

  assert.match(lavadoras, /sectionConfig=\{LAVADORAS_SECTION_CONFIG\}/);
  assert.match(jarabes, /sectionConfig=\{JARABES_SECTION_CONFIG\}/);
  assert.match(moduleSection, /rowMatchesAllowedItems/);
  assert.match(moduleSection, /filteredSummary\(rows\)/);
  assert.match(historyPanel, /seriesMatchesAllowed/);
  assert.match(shiftPanel, /matchesAllowedItem/);
});
