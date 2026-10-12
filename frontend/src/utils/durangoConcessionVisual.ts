/** Sólo resúmenes documentales: nunca convertir cuota en consumo medido. */
type QuotaRecord = { annual_volume_m3: number; review_state: string; well_key: string };

export function buildConcessionVisualSummary<T extends QuotaRecord>(records: T[]) {
  const amounts = records.map((row) => Number.isFinite(row.annual_volume_m3) && row.annual_volume_m3 > 0 ? row.annual_volume_m3 : 0);
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  const largest = Math.max(0, ...amounts);
  return {
    total,
    largest,
    documentsPending: records.filter((row) => row.review_state !== 'validated').length,
    shares: records.map((row, index) => ({ ...row, relativePercent: total > 0 ? (amounts[index] / total) * 100 : 0 })),
  };
}
