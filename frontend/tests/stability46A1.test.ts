import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { supportedHistoryAggregation } from '../src/pages/pozos/historyRangePolicy.ts';

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('46A1 tabla operativa define periodMessage sin recalcular la logica de actividad', () => {
  const section = read('src/pages/pozos/components/OperationalModuleSection.tsx');
  assert.match(section, /function periodMessage\(row: FlexibleRecord\): string \{/);
  assert.match(section, /row\.period_activity \?\? row\.activity/);
  assert.match(section, /<td>\{periodMessage\(row\)\}<\/td>/);
});

test('46A1 historico modular importa el selector de agrupacion soportada que utiliza al aplicar rango', () => {
  const panel = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(panel, /import \{[^}]*supportedHistoryAggregation[^}]*\} from '\.\.\/historyRangePolicy';/);
  assert.match(panel, /supportedHistoryAggregation\(aggregation, next\.startDate, next\.endDate\)/);
});

test('46A1 selector de agrupacion conserva las reglas existentes por longitud de rango', () => {
  assert.equal(supportedHistoryAggregation('minute', '2026-09-28', '2026-09-28'), 'minute');
  assert.equal(supportedHistoryAggregation('minute', '2026-09-27', '2026-09-28'), 'quarter_hour');
  assert.equal(supportedHistoryAggregation('quarter_hour', '2026-09-01', '2026-09-28'), 'hourly');
  assert.equal(supportedHistoryAggregation('hourly', '2026-01-01', '2026-09-28'), 'daily');
});
