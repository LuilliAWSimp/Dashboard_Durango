import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationalChart, summarizeOperationalChart } from '../src/utils/durangoConcessionOperational.ts';

const bucket = (month: number, volume_m3: number | null, status: 'available' | 'partial' | 'no_data' | 'outside_window' = 'available') => ({
  month, volume_m3, status, days_with_volume: volume_m3 === null ? 0 : 5,
  days_without_data: volume_m3 === null ? 30 : 0, days_excluded: 0, coverage_percent: volume_m3 === null ? null : 100,
});

test('vacíos no se convierten en cero ni se interpola el acumulado', () => {
  const data = buildOperationalChart([bucket(1, null, 'outside_window'), bucket(2, 120), bucket(3, null, 'no_data'), bucket(4, 80)]);
  assert.deepEqual(data.map((item) => item.volume_m3), [null, 120, null, 80]);
  assert.deepEqual(data.map((item) => item.cumulative_m3), [null, 120, null, 200]);
});

test('promedio y máximo sólo consideran meses con medición', () => {
  const result = summarizeOperationalChart([bucket(1, null, 'outside_window'), bucket(2, 0), bucket(3, 150), bucket(4, 50)]);
  assert.equal(result.total, 200);
  assert.equal(result.avg, 200 / 3);
  assert.equal(result.max?.month, 3);
  assert.equal(result.count, 3);
  assert.equal(summarizeOperationalChart([bucket(1, null)]).total, null);
});
