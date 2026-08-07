import { DURANGO_CAPABILITIES } from '../../config/plantCapabilities';
import { buildComparisonRows } from './moduleComparisonCore';
import type { ComparisonMetric, ComparisonRow, OperationalIdentity } from './moduleComparisonCore';
import type { WaterModuleHistoryResponse } from './types';

export { comparisonAxis, toggleComparisonSelection } from './moduleComparisonCore';
export type { ComparisonMetric, ComparisonRow, OperationalIdentity } from './moduleComparisonCore';

export type ComparisonModule = 'well' | 'line' | 'flow';
export const comparisonModuleItems = {
  well: DURANGO_CAPABILITIES.wells,
  line: DURANGO_CAPABILITIES.lines,
  flow: DURANGO_CAPABILITIES.flows,
};

export function configuredComparisonIdentity(item: { sensorId: number | null; operationalKey: string }): OperationalIdentity {
  return item.sensorId ?? item.operationalKey;
}

export function comparisonSeriesIdentity(item: { sensor_id?: number | null; operational_key?: string }): OperationalIdentity {
  return item.sensor_id ?? String(item.operational_key || '');
}

export function buildModuleComparisonRows(data: WaterModuleHistoryResponse | null, now = Date.now()): ComparisonRow[] {
  return buildComparisonRows(data, now);
}
