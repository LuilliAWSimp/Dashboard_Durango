export const DURANGO_CAPABILITIES = {
  plant: 'Durango',
  modules: {
    wells: true,
    lines: true,
    flows: true,
    tanks: false,
    concession: 'pending_validation',
    energy: false,
    reports: true,
    shifts: true,
  },
  wells: [
    { operationalKey: 'pozo_1', sensorId: 1001, name: 'Pozo 1', flowUnit: 'L/s', rawFlowUnit: 'm3/h hasta 2026-08-11 12:15; L/s directo desde entonces', normalizationFactor: 'backend-temporal' },
    { operationalKey: 'pozo_2', sensorId: 1051, name: 'Pozo 2', flowUnit: 'L/s', rawFlowUnit: 'L/s', normalizationFactor: 1 },
  ],
  lines: [
    { operationalKey: 'linea_1', sensorId: 2002, name: 'Línea 1', flowUnit: 'L/s' },
    { operationalKey: 'linea_3', sensorId: 2006, name: 'Línea 3', flowUnit: 'L/s' },
    { operationalKey: 'linea_4', sensorId: 2008, name: 'Línea 4', flowUnit: 'L/s' },
    { operationalKey: 'linea_5', sensorId: 2010, name: 'Línea 5', flowUnit: 'L/s' },
  ],
  flows: [
    { operationalKey: 'lavadora_linea_2', sensorId: 2004, name: 'Lavadora Línea 2', flowUnit: 'L/s', sourceKey: 'LINEA_FLOW_IN[1]' },
    { operationalKey: 'lavadora_vidrio', sensorId: null, name: 'Lavadora Vidrio', flowUnit: 'L/s', sourceKey: 'LAVADORAS_0' },
    { operationalKey: 'lavadora_ref_pet', sensorId: null, name: 'Lavadora Ref Pet', flowUnit: 'L/s', sourceKey: 'LAVADORAS_1' },
    { operationalKey: 'jarabes', sensorId: 3010, name: 'Jarabes', flowUnit: 'L/s', sourceKey: 'TANQUE_FLOW_IN[4]' },
  ],
  scadaCutoverLocal: '2026-08-04T18:16:00',
} as const;

export type DurangoModule = 'well' | 'line' | 'flow';

export function itemBySensor(sensorId: number) {
  return [...DURANGO_CAPABILITIES.wells, ...DURANGO_CAPABILITIES.lines, ...DURANGO_CAPABILITIES.flows]
    .find((item) => item.sensorId === sensorId);
}
