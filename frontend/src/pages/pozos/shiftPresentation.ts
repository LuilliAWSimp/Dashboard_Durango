import type { ShiftElement } from './types';

export type ShiftDataState = 'complete' | 'partial' | 'no_data' | 'pending';

function finite(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  return Number.isFinite(Number(value));
}

export function shiftElementHasData(item: ShiftElement): boolean {
  return Number(item.samples || 0) > 0
    || finite(item.period_m3)
    || finite(item.flow_avg)
    || finite(item.period_open_m3)
    || finite(item.period_close_m3);
}

export function shiftElementDataState(item: ShiftElement): Exclude<ShiftDataState, 'pending'> {
  if (!shiftElementHasData(item)) return 'no_data';
  const status = `${item.data_status || ''} ${(item as Record<string, unknown>).validation_status || ''} ${item.activity || ''}`.toLowerCase();
  if (
    item.period_m3_reliable === false
    || Boolean(item.has_discontinuities)
    || status.includes('partial')
    || status.includes('parcial')
    || status.includes('invalid')
    || status.includes('revisión')
    || status.includes('revision')
  ) return 'partial';
  return 'complete';
}

export function aggregateShiftDataState(items: ShiftElement[], cutStatus: string): ShiftDataState {
  if (String(cutStatus).toLowerCase().includes('pendiente')) return 'pending';
  if (!items.length) return 'no_data';
  const states = items.map(shiftElementDataState);
  if (states.every((state) => state === 'no_data')) return 'no_data';
  if (states.some((state) => state === 'partial' || state === 'no_data')) return 'partial';
  return 'complete';
}

export function shiftDataStateLabel(state: ShiftDataState): string {
  if (state === 'complete') return 'Datos completos';
  if (state === 'partial') return 'Datos parciales';
  if (state === 'no_data') return 'Sin datos';
  return 'Pendiente';
}

export function shiftDataStateBadgeType(state: ShiftDataState): 'normal' | 'warning' | 'communication' {
  if (state === 'complete') return 'normal';
  if (state === 'partial') return 'warning';
  return 'communication';
}

export function explicitShiftSchedule(shiftId: string, schedule: string): string {
  if (shiftId === 'shift_3' && schedule === '15:00–24:00') return '15:00–00:00 (+1 día)';
  return schedule;
}
