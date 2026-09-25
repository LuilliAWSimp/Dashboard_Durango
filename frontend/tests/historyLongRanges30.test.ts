import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  HISTORY_MAX_RANGE_DAYS,
  inclusiveHistoryRangeDays,
  isHistoryAggregationSupported,
  supportedHistoryAggregation,
} from '../src/pages/pozos/historyRangePolicy.ts';

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('politica temporal conserva limites 1/7/31/366 dias', () => {
  assert.deepEqual(HISTORY_MAX_RANGE_DAYS, {
    minute: 1,
    quarter_hour: 7,
    hourly: 31,
    daily: 366,
  });
  assert.equal(inclusiveHistoryRangeDays('2026-08-12', '2026-08-18'), 7);
  assert.equal(inclusiveHistoryRangeDays('2026-08-12', '2026-08-26'), 15);
  assert.equal(inclusiveHistoryRangeDays('2026-08-12', '2026-09-10'), 30);
});

test('rangos largos promocionan a una agrupacion soportada', () => {
  assert.equal(supportedHistoryAggregation('minute', '2026-08-12', '2026-08-18'), 'quarter_hour');
  assert.equal(supportedHistoryAggregation('quarter_hour', '2026-08-12', '2026-08-26'), 'hourly');
  assert.equal(supportedHistoryAggregation('hourly', '2026-01-01', '2026-02-15'), 'daily');
  assert.equal(supportedHistoryAggregation('daily', '2026-08-12', '2026-09-10'), 'daily');
});

test('selector deshabilita granularidades incompatibles con el rango activo', () => {
  const panel = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  assert.match(panel, /rangeDays > HISTORY_MAX_RANGE_DAYS\.minute/);
  assert.match(panel, /rangeDays > HISTORY_MAX_RANGE_DAYS\.quarter_hour/);
  assert.match(panel, /rangeDays > HISTORY_MAX_RANGE_DAYS\.hourly/);
  assert.equal(isHistoryAggregationSupported('hourly', '2026-08-12', '2026-09-10'), true);
  assert.equal(isHistoryAggregationSupported('quarter_hour', '2026-08-12', '2026-09-10'), false);
});

test('detalle ajusta agrupacion antes de aplicar un rango largo', () => {
  const detail = read('src/pages/pozos/components/OperationalDetailSection.tsx');
  assert.match(detail, /supportedHistoryAggregation\(/);
  assert.match(detail, /current\.draftRange\.startDate/);
  assert.match(detail, /current\.draftRange\.endDate/);
  assert.match(detail, /setHistoryAggregation\(supportedAggregation\)/);
  assert.match(detail, /current\.apply\(\)/);
});
