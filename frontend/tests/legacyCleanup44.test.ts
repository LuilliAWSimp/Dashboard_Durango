import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const srcRoot = fileURLToPath(new URL('../src/', import.meta.url));
const read = (relativePath: string) => readFileSync(join(srcRoot, relativePath), 'utf8');

const removedLegacyFiles = [
  'components/BottleIcon.tsx',
  'components/Charts.tsx',
  'components/DataTable.tsx',
  'components/PlantDashboardCard.tsx',
  'components/PlantMultiSelector.tsx',
  'components/PlantSelector.tsx',
  'components/PlantsComparisonChart.tsx',
  'data/circuits.ts',
  'data/multiPlantMock.ts',
  'data/pozosMock.ts',
  'hooks/usePlants.ts',
  'pages/DashboardPage.tsx',
  'pages/DomainSelectionPage.tsx',
  'pages/LinesOverviewPage.tsx',
  'pages/MultiPlantDashboardPage.tsx',
  'pages/pozos/chartBuilders.ts',
  'pages/pozos/components/ChartPeriodNote.tsx',
  'pages/pozos/components/ChartTooltip.tsx',
  'pages/pozos/components/FiveMinuteExcelExportButton.tsx',
  'pages/pozos/components/FlowChartOptions.tsx',
  'pages/pozos/components/ReportPreviewTable.tsx',
  'pages/pozos/components/WaterHistoryChart.tsx',
  'pages/pozos/components/WaterHistoryTooltip.tsx',
  'pages/pozos/components/WellsMinuteFlowPanel.tsx',
  'pages/pozos/hooks/useWaterHistory.ts',
  'pages/pozos/normalizers.ts',
  'pages/pozos/sections/CipSection.tsx',
  'pages/pozos/sections/ConsumosSection.tsx',
  'pages/pozos/sections/ConcesionSection.tsx',
  'pages/pozos/sections/LineDetailSection.tsx',
  'pages/pozos/sections/TanquesSection.tsx',
  'pages/pozos/sections/UvSection.tsx',
  'services/alertService.ts',
  'services/dashboardService.ts',
  'services/exportService.ts',
  'services/plantService.ts',
];

test('Incremental 44 retira archivos frontend demostrablemente fuera del runtime', () => {
  for (const relativePath of removedLegacyFiles) {
    assert.equal(existsSync(join(srcRoot, relativePath)), false, `${relativePath} debe estar eliminado`);
  }
});

test('Concesión conserva capability deshabilitada pero ya no tiene componente ni entrada de navegación', () => {
  const page = read('pages/PozosDashboardPage.jsx');
  const capabilities = read('config/plantCapabilities.ts');
  assert.doesNotMatch(page, /ConcesionSection/);
  assert.doesNotMatch(page, /concesion:\s*\{/);
  assert.match(capabilities, /concession:\s*false/);
  assert.doesNotMatch(capabilities, /key:\s*'concesion'/);
  assert.doesNotMatch(capabilities, /concesion:\s*'concession'/);
});

test('módulos retirados no pueden reactivarse mediante capabilities runtime', async () => {
  const { isDurangoSectionAccessible } = await import('../src/config/plantCapabilities.ts');
  const runtime = {
    concession: true,
    tanks: true,
    cip: true,
    uv: true,
    consumptions: true,
    energy: true,
  } as const;
  for (const section of ['concesion', 'tanques', 'cip', 'uv', 'consumos', 'electric']) {
    assert.equal(isDurangoSectionAccessible(section, runtime, 'admin'), false, section);
  }
});

test('redirecciones de compatibilidad permanecen aunque se retire la UI heredada', () => {
  const app = read('App.jsx');
  assert.match(app, /path="\/domains"/);
  assert.match(app, /path="\/electric"/);
  assert.match(app, /LegacyPozosRedirect/);
});
