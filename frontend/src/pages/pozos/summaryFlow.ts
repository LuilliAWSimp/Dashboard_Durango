import type { FlexibleRecord } from './types';

function finiteFlow(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/** Current flow is presentation-only: never infer zero from missing data. */
export function currentFlowSummary(items: FlexibleRecord[]): number | null {
  let total = 0;
  let available = 0;
  for (const item of items) {
    const communication = String(item.communication_status ?? item.communicationType ?? '').toLowerCase();
    if (item.current_reading_available === false) continue;
    if (['no_data', 'stale_data', 'offline', 'communication', 'warning'].includes(communication)) continue;
    const flow = finiteFlow(item.current_flow ?? item.current_flow_lps ?? item.flow_lps ?? item.flow ?? item.instant_flow_lps ?? item.flujo_lps);
    if (flow === null) continue;
    total += flow;
    available += 1;
  }
  return available ? total : null;
}
