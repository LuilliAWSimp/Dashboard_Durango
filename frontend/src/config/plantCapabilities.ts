export const DURANGO_CAPABILITIES = {
  plant: 'Durango',
  modules: {
    wells: true,
    lines: true,
    flows: true,
    tanks: 'pending_validation',
    concession: 'pending_validation',
    energy: false,
    reports: true,
    shifts: true,
  },
  wells: [
    { sensorId: 1001, name: 'Pozo 1', flowUnit: 'L/s' },
    { sensorId: 1051, name: 'Pozo 2', flowUnit: 'L/s' },
  ],
  lines: [
    { sensorId: 2002, name: 'Línea 1', flowUnit: 'L/s' },
    { sensorId: 2006, name: 'Línea 2', flowUnit: 'L/s' },
    { sensorId: 2004, name: 'Línea 3', flowUnit: 'L/s' },
    { sensorId: 2008, name: 'Línea 4', flowUnit: 'L/s' },
    { sensorId: 2010, name: 'Línea 5', flowUnit: 'L/s' },
  ],
  flows: [
    { sensorId: 3002, name: 'Lavadora Ciel', flowUnit: 'L/s', sourceTokens: ['CIEL'] },
    { sensorId: 3004, name: 'Jarabes', flowUnit: 'L/s', sourceTokens: ['JARABE'] },
    { sensorId: 3006, name: 'Lavadora de Vidrio', flowUnit: 'L/s', sourceTokens: ['VIDRIO'] },
  ],
} as const;

export type DurangoModule = 'well' | 'line' | 'flow';

export function itemBySensor(sensorId: number) {
  return [...DURANGO_CAPABILITIES.wells, ...DURANGO_CAPABILITIES.lines, ...DURANGO_CAPABILITIES.flows]
    .find((item) => item.sensorId === sensorId);
}
