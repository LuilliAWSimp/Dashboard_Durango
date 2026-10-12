import type { ComparisonRow, OperationalIdentity } from './moduleComparison';

export type DetailVolumeDisplay = 'interval' | 'cumulative';

/**
 * Agrega el acumulado progresivo del volumen conciliado para un elemento.
 * Los intervalos sin volumen válido permanecen como null y no se convierten en cero.
 * El siguiente intervalo válido continúa acumulando únicamente los volúmenes válidos previos.
 */
export function withProgressiveVolume(
  rows: ComparisonRow[],
  identity: OperationalIdentity,
): ComparisonRow[] {
  let accumulated = 0;
  const intervalKey = `volume_${identity}`;
  const cumulativeKey = `volume_cumulative_${identity}`;

  return [...rows]
    .sort((left, right) => left.timestamp - right.timestamp)
    .map((row) => {
      const raw = row[intervalKey];
      const parsed = raw === null || raw === undefined || raw === '' ? null : Number(raw);
      const intervalVolume = parsed !== null && Number.isFinite(parsed) ? parsed : null;

      if (intervalVolume === null) {
        return { ...row, [cumulativeKey]: null };
      }

      accumulated += intervalVolume;
      return { ...row, [cumulativeKey]: accumulated };
    });
}
