import assert from 'node:assert/strict';
import test from 'node:test';
import { isExtendedReportRange, isValidReportFilters, reportFiltersLabel, sameReportFilters } from '../src/pages/pozos/reportExportContract.ts';

const october = { startDate: '2026-10-01', endDate: '2026-10-31' };
const today = { date: '2026-11-03' };

test('no se descarga el dia previo cuando se selecciona un mes sin pulsar Actualizar', () => {
  assert.equal(sameReportFilters(october, today), false);
  assert.equal(isValidReportFilters(october), true);
  assert.equal(reportFiltersLabel(october), '01/10/2026 al 31/10/2026');
  assert.equal(isExtendedReportRange(october), true);
});

test('rangos de mas de siete dias no requieren vista previa sincrona', () => {
  assert.equal(isExtendedReportRange({ startDate: '2026-10-01', endDate: '2026-10-07' }), false);
  assert.equal(isExtendedReportRange({ startDate: '2026-10-01', endDate: '2026-10-08' }), true);
  assert.equal(isExtendedReportRange({ date: '2026-10-31' }), false);
  assert.equal(isExtendedReportRange({ startDate: '2026-02-01', endDate: '2026-02-28' }), true);
  assert.equal(isExtendedReportRange({ startDate: '2028-02-01', endDate: '2028-02-29' }), true);
});

test('nunca se exportan fechas incompletas o calendarios invalidos', () => {
  for (const bad of [
    {}, { date: '' }, { date: '2026-02-30' }, { date: '2026-13-01' },
    { startDate: '2026-10-01' },
    { startDate: '2026-11-01', endDate: '2026-10-31' },
    { startDate: '2026-10-01', endDate: '2026-11-31' },
    { date: '2026-10-10', startDate: '2026-10-01', endDate: '2026-10-31' },
  ]) {
    assert.equal(isValidReportFilters(bad), false);
  }
});
