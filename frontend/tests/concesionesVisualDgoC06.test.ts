import test from 'node:test';
import assert from 'node:assert/strict';
import { concessionMonthStatus, buildOperationalChart } from '../src/utils/durangoConcessionOperational.ts';

test('DGO-C06: los cuatro estados de mes tienen etiquetas sin confundir ausencia con cero', () => {
  assert.equal(concessionMonthStatus('outside_window'), 'Fuera del periodo');
  assert.equal(concessionMonthStatus('no_data'), 'Sin datos');
  assert.equal(concessionMonthStatus('partial'), 'Parcial');
  assert.equal(concessionMonthStatus('available'), 'Con lecturas');
});

test('DGO-C06: periodo sin observaciones no produce volumen mensual ni acumulado', () => {
  const points = buildOperationalChart([
    {month:8, volume_m3:20, days_with_volume:1, days_without_data:10, days_excluded:0, coverage_percent:5, status:'partial'},
    {month:9, volume_m3:null, days_with_volume:0, days_without_data:30, days_excluded:0, coverage_percent:null, status:'no_data'},
    {month:10, volume_m3:30, days_with_volume:2, days_without_data:8, days_excluded:0, coverage_percent:20, status:'partial'},
  ]);
  assert.equal(points[0].cumulative_m3,20);
  assert.equal(points[1].volume_m3,null);
  assert.equal(points[1].cumulative_m3,null);
  assert.equal(points[2].cumulative_m3,50);
});
