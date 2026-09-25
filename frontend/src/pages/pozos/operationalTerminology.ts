import type { OperationalModule } from './operationalNavigation';

export type OperationalVolumeScope = 'plain' | 'period' | 'interval' | 'day';

const BASE_VOLUME_LABEL: Record<OperationalModule, string> = {
  well: 'Volumen bombeado',
  line: 'Volumen consumido',
  flow: 'Volumen consumido',
};

export function operationalVolumeLabel(
  module: OperationalModule,
  options: { validated?: boolean; scope?: OperationalVolumeScope } = {},
): string {
  const { validated = false, scope = 'plain' } = options;
  const base = `${BASE_VOLUME_LABEL[module]}${validated ? ' validado' : ''}`;
  if (scope === 'period') return `${base} del periodo`;
  if (scope === 'interval') return `${base} del intervalo`;
  if (scope === 'day') return `${base} del día`;
  return base;
}

export function operationalVolumeAxisLabel(module: OperationalModule): string {
  return `${BASE_VOLUME_LABEL[module]} (m³)`;
}
