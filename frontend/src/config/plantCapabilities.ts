export type DurangoCapabilityState = boolean | 'pending_validation' | 'pending_physical_validation';

export const DURANGO_CAPABILITIES = {
  plant: 'Durango',
  modules: {
    wells: true,
    lines: true,
    flows: true,
    washers: true,
    jarabes: true,
    tanks: false,
    cip: false,
    uv: false,
    consumptions: false,
    concession: false,
    energy: false,
    reports: true,
    shifts: true,
    daily_review: true,
    balance: 'pending_physical_validation',
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
    { operationalKey: 'jarabes', sensorId: 3004, name: 'Jarabes', flowUnit: 'L/s', sourceKey: 'TANQUE_FLOW_IN[1]' },
  ],
  scadaCutoverLocal: '2026-08-04T18:16:00',
} as const;

export type DurangoCapabilityKey = keyof typeof DURANGO_CAPABILITIES.modules;
export type DurangoModule = 'well' | 'line' | 'flow';
export type DurangoRuntimeCapabilities = Partial<Record<DurangoCapabilityKey, DurangoCapabilityState>>;

export interface DurangoNavigationItem {
  key: string;
  label: string;
  iconKey: string;
  capability?: DurangoCapabilityKey;
  adminOnly?: boolean;
  pendingLabel?: string;
}

const DURANGO_NAVIGATION: readonly DurangoNavigationItem[] = [
  { key: 'dashboard', label: 'Resumen', iconKey: 'pozos-dashboard' },
  { key: 'pozos', label: 'Pozos', iconKey: 'pozos-pozos', capability: 'wells' },
  { key: 'lineas', label: 'Líneas', iconKey: 'pozos-lineas', capability: 'lines' },
  { key: 'flujos', label: 'Lavadoras', iconKey: 'pozos-flujos', capability: 'washers' },
  { key: 'jarabes', label: 'Jarabes', iconKey: 'jarabes', capability: 'jarabes' },
  { key: 'balance', label: 'Balance de Agua', iconKey: 'pozos-balance', capability: 'balance', pendingLabel: 'Balance de Agua · En validación' },
  { key: 'concesion', label: 'Concesión', iconKey: 'pozos-concesion', capability: 'concession' },
  { key: 'revision', label: 'Revisión Diaria', iconKey: 'pozos-revision', capability: 'daily_review' },
  { key: 'reportes', label: 'Reportes', iconKey: 'pozos-reportes', capability: 'reports' },
  { key: 'usuarios', label: 'Usuarios', iconKey: 'usuarios', adminOnly: true },
] as const;

const SECTION_CAPABILITY: Readonly<Record<string, DurangoCapabilityKey | null>> = {
  dashboard: null,
  pozos: 'wells',
  lineas: 'lines',
  flujos: 'washers',
  jarabes: 'jarabes',
  balance: 'balance',
  concesion: 'concession',
  revision: 'daily_review',
  reportes: 'reports',
  usuarios: null,
  // Secciones heredadas: quedan declaradas explícitamente para que una URL
  // directa no las reactive por accidente si permanecen archivos legacy.
  tanques: 'tanks',
  consumos: 'consumptions',
  cip: 'cip',
  uv: 'uv',
  electric: 'energy',
};

function normalizeCapabilityState(value: unknown): DurangoCapabilityState | undefined {
  if (value === true || value === false || value === 'pending_validation' || value === 'pending_physical_validation') return value;
  return undefined;
}

export function extractDurangoRuntimeCapabilities(payload: unknown): DurangoRuntimeCapabilities {
  if (!payload || typeof payload !== 'object') return {};
  const root = payload as Record<string, unknown>;
  const plantCapabilities = root.plant_capabilities;
  if (!plantCapabilities || typeof plantCapabilities !== 'object') return {};
  const rawCapabilities = (plantCapabilities as Record<string, unknown>).capabilities;
  if (!rawCapabilities || typeof rawCapabilities !== 'object') return {};

  const result: DurangoRuntimeCapabilities = {};
  Object.keys(DURANGO_CAPABILITIES.modules).forEach((key) => {
    const capabilityKey = key as DurangoCapabilityKey;
    const normalized = normalizeCapabilityState((rawCapabilities as Record<string, unknown>)[capabilityKey]);
    if (normalized !== undefined) result[capabilityKey] = normalized;
  });
  return result;
}

export function durangoCapabilityState(
  capability: DurangoCapabilityKey,
  runtime: DurangoRuntimeCapabilities = {},
): DurangoCapabilityState {
  return runtime[capability] ?? DURANGO_CAPABILITIES.modules[capability];
}

export function durangoCapabilityVisible(
  capability: DurangoCapabilityKey,
  runtime: DurangoRuntimeCapabilities = {},
): boolean {
  return durangoCapabilityState(capability, runtime) !== false;
}

export function isDurangoSectionAccessible(
  section: string,
  runtime: DurangoRuntimeCapabilities = {},
  role?: string,
): boolean {
  if (!(section in SECTION_CAPABILITY)) return false;
  if (section === 'usuarios') return role === 'admin';
  const capability = SECTION_CAPABILITY[section];
  return capability === null ? true : durangoCapabilityVisible(capability, runtime);
}

export function buildDurangoNavigation(
  runtime: DurangoRuntimeCapabilities = {},
  role?: string,
): DurangoNavigationItem[] {
  return DURANGO_NAVIGATION.flatMap((item) => {
    if (item.adminOnly && role !== 'admin') return [];
    if (!item.capability) return [{ ...item }];
    const state = durangoCapabilityState(item.capability, runtime);
    if (state === false) return [];
    const pending = state === 'pending_validation' || state === 'pending_physical_validation';
    return [{ ...item, label: pending && item.pendingLabel ? item.pendingLabel : item.label }];
  });
}

export function itemBySensor(sensorId: number) {
  return [...DURANGO_CAPABILITIES.wells, ...DURANGO_CAPABILITIES.lines, ...DURANGO_CAPABILITIES.flows]
    .find((item) => item.sensorId === sensorId);
}
