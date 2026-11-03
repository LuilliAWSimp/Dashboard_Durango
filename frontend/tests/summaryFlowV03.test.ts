import assert from 'node:assert/strict';
import test from 'node:test';
import { currentFlowSummary } from '../src/pages/pozos/summaryFlow.ts';

test('V03: no reading is not silently converted to 0 L/s', () => {
  assert.equal(currentFlowSummary([]), null);
  assert.equal(currentFlowSummary([{ current_flow: null }]), null);
  assert.equal(currentFlowSummary([{ current_flow: 25, communication_status: 'offline' }]), null);
  assert.equal(currentFlowSummary([{ current_flow: 25, communicationType: 'stale_data' }]), null);
  assert.equal(currentFlowSummary([{ current_flow: 25, current_reading_available: false }]), null);
});

test('V03: valid 0 L/s remains a measured zero', () => {
  assert.equal(currentFlowSummary([{ current_flow: 0, communication_status: 'operational' }]), 0);
});

test('V03: only available flows contribute to a process sum', () => {
  assert.equal(currentFlowSummary([
    { current_flow: 10.25, communication_status: 'operational' },
    { flow_lps: 2.5 },
    { current_flow: 9, communication_status: 'offline' },
    { current_flow: null },
  ]), 12.75);
});

test('V03: null and non-finite samples are excluded', () => {
  assert.equal(currentFlowSummary([{ flow_lps: 'NaN' }, { flow_lps: Infinity }]), null);
});
