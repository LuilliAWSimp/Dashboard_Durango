/* DGO-H02: reglas de revision historica bajo demanda, sin alarmas persistentes. */
import type { WaterHistoryPoint } from './types';

export type FlowThresholdDirection = 'below' | 'above' | 'both';
export type FlowThresholdBasis = 'extreme' | 'average';
export type FlowThresholdStatus = 'No revisado' | 'Sin lectura' | 'Bajo umbral' | 'Sobre umbral' | 'Fuera de rango' | 'Dentro de rango';
export type ThresholdDraft = {
  enabled: boolean;
  direction: FlowThresholdDirection;
  basis: FlowThresholdBasis;
  minText: string;
  maxText: string;
};
export type ThresholdConfig = {
  enabled: boolean;
  direction: FlowThresholdDirection;
  basis: FlowThresholdBasis;
  minValue: number | null;
  maxValue: number | null;
};

function parseRequired(text: string): number | null {
  if (!text.trim()) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function thresholdValidation(draft: ThresholdDraft): string {
  if (!draft.enabled) return '';
  const low = parseRequired(draft.minText);
  const high = parseRequired(draft.maxText);
  if (draft.direction !== 'above' && low === null) return 'Indica un mínimo válido, mayor o igual a cero.';
  if (draft.direction !== 'below' && high === null) return 'Indica un máximo válido, mayor o igual a cero.';
  if (draft.direction === 'both' && low !== null && high !== null && low > high) return 'El mínimo no puede superar el máximo.';
  return '';
}

export function normalizeThreshold(draft: ThresholdDraft): ThresholdConfig {
  return {
    enabled: draft.enabled && !thresholdValidation(draft),
    direction: draft.direction,
    basis: draft.basis,
    minValue: parseRequired(draft.minText),
    maxValue: parseRequired(draft.maxText),
  };
}

function numeric(value: unknown): number | null {
  if (value == null || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function evaluateFlowThreshold(point: WaterHistoryPoint, config: ThresholdConfig): FlowThresholdStatus {
  if (!config.enabled) return 'No revisado';
  if ((numeric(point.samples) ?? 0) <= 0) return 'Sin lectura';
  const avg = numeric(point.flow_avg_lps);
  const low = config.basis === 'average' ? avg : numeric(point.flow_min_lps) ?? avg;
  const high = config.basis === 'average' ? avg : numeric(point.flow_max_lps) ?? avg;
  const needLow = config.direction !== 'above';
  const needHigh = config.direction !== 'below';
  if ((needLow && low === null) || (needHigh && high === null)) return 'Sin lectura';
  const below = needLow && low !== null && config.minValue !== null && low < config.minValue;
  const above = needHigh && high !== null && config.maxValue !== null && high > config.maxValue;
  if (below && above) return 'Fuera de rango';
  if (below) return 'Bajo umbral';
  if (above) return 'Sobre umbral';
  return 'Dentro de rango';
}

export function summarizeFlowThreshold(points: WaterHistoryPoint[], config: ThresholdConfig) {
  const states = points.filter((point) => point.data_status !== 'future_interval').map((point) => evaluateFlowThreshold(point, config));
  return {
    total: states.length,
    breached: states.filter((state) => state === 'Bajo umbral' || state === 'Sobre umbral' || state === 'Fuera de rango').length,
    below: states.filter((state) => state === 'Bajo umbral' || state === 'Fuera de rango').length,
    above: states.filter((state) => state === 'Sobre umbral' || state === 'Fuera de rango').length,
    within: states.filter((state) => state === 'Dentro de rango').length,
    noReading: states.filter((state) => state === 'Sin lectura').length,
  };
}
