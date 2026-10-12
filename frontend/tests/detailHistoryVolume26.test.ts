import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { withProgressiveVolume } from '../src/pages/pozos/detailHistoryVolume.ts';

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('acumulado progresivo suma solo volumenes validos y conserva huecos como null', () => {
  const rows = withProgressiveVolume([
    { timestamp: 3, bucketStart: '2026-09-25T00:30:00', bucketEnd: '2026-09-25T00:45:00', tooltipAnchor: 0, volume_1001: 2.5 },
    { timestamp: 1, bucketStart: '2026-09-25T00:00:00', bucketEnd: '2026-09-25T00:15:00', tooltipAnchor: 0, volume_1001: 10 },
    { timestamp: 2, bucketStart: '2026-09-25T00:15:00', bucketEnd: '2026-09-25T00:30:00', tooltipAnchor: 0, volume_1001: null },
    { timestamp: 4, bucketStart: '2026-09-25T00:45:00', bucketEnd: '2026-09-25T01:00:00', tooltipAnchor: 0, volume_1001: 0 },
  ], 1001);

  assert.deepEqual(rows.map((row) => row.volume_cumulative_1001), [10, null, 12.5, 12.5]);
  assert.deepEqual(rows.map((row) => row.timestamp), [1, 2, 3, 4]);
});

test('modo de volumen aparece solo en historico individual al visualizar Ambos', () => {
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(history, /useState<ComparisonMetric>\(\(\) => singleElement \? 'both' : 'flow'\)/);
  assert.match(history, /singleElement && metric === 'both'/);
  assert.match(history, />Por intervalo<\/button>/);
  assert.match(history, />Acumulado progresivo<\/button>/);
  assert.match(history, /Modo de visualización del volumen/);
});

test('acumulado usa linea, no conecta huecos, y el modo por intervalo conserva barras', () => {
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(history, /volumeDisplay === 'interval'[\s\S]*?<Bar/);
  assert.match(history, /volumeDisplay === 'cumulative'[\s\S]*?<Line/);
  assert.match(history, /dataKey=\{`volume_cumulative_\$\{identity\}`\}/);
  assert.match(history, /connectNulls=\{false\}/);
  assert.match(history, /metric === 'both' && !singleElement/);
});

test('tooltip Excel y PDF usan la misma representacion de volumen visible', () => {
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(history, /Volumen acumulado del periodo/);
  assert.match(history, /volume_cumulative_\$\{identity\}/);
  assert.match(history, /metricLabel = [\s\S]*Volumen acumulado progresivo/);
  assert.match(history, /const exportRows = useMemo<FlexibleRecord\[]>\(\(\) => displayRows\.map/);
});
