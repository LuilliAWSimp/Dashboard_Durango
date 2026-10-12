import type { ConcessionMonthlyBucket } from '../services/concessionService';

export const CONCESSION_MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Conserva null cuando BOS no tiene observaciones. Nunca interpola consumo. */
export function buildOperationalChart(months: ConcessionMonthlyBucket[]) {
  let cumulative = 0;
  return months.map((item) => {
    const valid = typeof item.volume_m3 === 'number' && Number.isFinite(item.volume_m3) && item.volume_m3 >= 0;
    if (valid) cumulative += item.volume_m3 as number;
    return {
      ...item,
      name: CONCESSION_MONTH_LABELS[item.month - 1] ?? String(item.month),
      volume_m3: valid ? item.volume_m3 : null,
      cumulative_m3: valid ? Math.round(cumulative * 1000) / 1000 : null,
    };
  });
}

export function summarizeOperationalChart(months: ConcessionMonthlyBucket[]) {
  const included = months.filter((item) => item.volume_m3 !== null && Number.isFinite(item.volume_m3) && item.volume_m3 >= 0);
  const total = included.reduce((sum, item) => sum + (item.volume_m3 ?? 0), 0);
  const max = included.reduce<ConcessionMonthlyBucket | null>((best, item) => best === null || (item.volume_m3 ?? 0) > (best.volume_m3 ?? 0) ? item : best, null);
  const recent = included[included.length - 1] ?? null;
  return { total: included.length ? total : null, count: included.length, avg: included.length ? total / included.length : null, max, recent };
}

/** Semantica visual de cobertura: "sin datos" nunca se asume como consumo cero. */
export function concessionMonthStatus(status: ConcessionMonthlyBucket['status']): string {
  if (status === 'outside_window') return 'Fuera del periodo';
  if (status === 'available') return 'Con lecturas';
  if (status === 'partial') return 'Parcial';
  return 'Sin datos';
}
