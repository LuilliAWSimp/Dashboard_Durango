import { DURANGO_CAPABILITIES } from '../../config/plantCapabilities.ts';
import type { OperationalIdentity, OperationalModule } from './operationalNavigation.ts';

export interface OperationalSectionItem {
  operationalKey: string;
  sensorId: number | null;
  name: string;
  flowUnit?: string;
  sourceKey?: string;
}

export interface OperationalSectionConfig {
  key: 'wells' | 'lines' | 'lavadoras' | 'jarabes';
  module: OperationalModule;
  title: string;
  subtitle: string;
  singular: string;
  plural: string;
  routeBase: string;
  allowedOperationalKeys: string[];
  items: OperationalSectionItem[];
  labels: {
    totalKpi: string;
    operatingKpi: string;
    noFlowKpi: string;
    readingsKpi: string;
    reviewKpi: string;
    historyTitle: string;
    historySubtitle: string;
    shiftsTitle: string;
    tableTitle: string;
    tableSubtitle: string;
    emptyState: string;
    cardTitle: string;
    navigationLabel: string;
    detailSubtitle: string;
  };
}

function asSectionItems(items: readonly OperationalSectionItem[]): OperationalSectionItem[] {
  return items.map((item) => ({ ...item }));
}

const lavadoraItems = asSectionItems(
  DURANGO_CAPABILITIES.flows.filter((item) => item.operationalKey.startsWith('lavadora_')),
);

const jarabesItems = asSectionItems(
  DURANGO_CAPABILITIES.flows.filter((item) => item.operationalKey === 'jarabes'),
);

export const LAVADORAS_SECTION_CONFIG: OperationalSectionConfig = {
  key: 'lavadoras',
  module: 'flow',
  title: 'Lavadoras',
  subtitle: 'Seguimiento operativo independiente de lavadoras con flujo y totalizador.',
  singular: 'lavadora',
  plural: 'lavadoras',
  routeBase: '/pozos/flujos',
  allowedOperationalKeys: lavadoraItems.map((item) => item.operationalKey),
  items: lavadoraItems,
  labels: {
    totalKpi: 'Total de lavadoras',
    operatingKpi: 'Lavadoras operando',
    noFlowKpi: 'Lavadoras sin flujo',
    readingsKpi: 'Lecturas de lavadoras',
    reviewKpi: 'Lecturas en revisión',
    historyTitle: 'Histórico de lavadoras',
    historySubtitle: 'Flujo y totalizador observado sólo para las lavadoras confirmadas.',
    shiftsTitle: 'Cortes por turno · Lavadoras',
    tableTitle: 'Lecturas de lavadoras',
    tableSubtitle: 'Datos filtrados por identidad operativa de lavadora.',
    emptyState: 'Sin registros de lavadoras para el periodo seleccionado.',
    cardTitle: 'Lavadoras monitoreadas',
    navigationLabel: 'lavadoras',
    detailSubtitle: 'Análisis individual de la lavadora para el periodo seleccionado.',
  },
};

export const JARABES_SECTION_CONFIG: OperationalSectionConfig = {
  key: 'jarabes',
  module: 'flow',
  title: 'Jarabes',
  subtitle: 'Seguimiento operativo independiente del flujo y totalizador de Jarabes.',
  singular: 'elemento de Jarabes',
  plural: 'Jarabes',
  routeBase: '/pozos/jarabes',
  allowedOperationalKeys: jarabesItems.map((item) => item.operationalKey),
  items: jarabesItems,
  labels: {
    totalKpi: 'Elementos monitoreados',
    operatingKpi: 'Jarabes operando',
    noFlowKpi: 'Jarabes sin flujo',
    readingsKpi: 'Lecturas de Jarabes',
    reviewKpi: 'Lecturas en revisión',
    historyTitle: 'Histórico de Jarabes',
    historySubtitle: 'Flujo y totalizador observado sólo para el elemento operativo Jarabes.',
    shiftsTitle: 'Cortes por turno · Jarabes',
    tableTitle: 'Lecturas de Jarabes',
    tableSubtitle: 'Datos filtrados por la identidad operativa Jarabes.',
    emptyState: 'Sin registros de Jarabes para el periodo seleccionado.',
    cardTitle: 'Elementos de Jarabes',
    navigationLabel: 'Jarabes',
    detailSubtitle: 'Análisis individual de Jarabes para el periodo seleccionado.',
  },
};

export function operationalSectionIdentity(item: OperationalSectionItem): OperationalIdentity {
  return item.sensorId ?? item.operationalKey;
}

export function sectionIdentityStrings(config?: OperationalSectionConfig): string[] {
  return config ? config.items.map((item) => String(operationalSectionIdentity(item))) : [];
}

export function sectionOperationalKeyStrings(config?: OperationalSectionConfig): string[] {
  return config ? config.allowedOperationalKeys.map(String) : [];
}

export function routeBaseForOperationalIdentity(
  module: OperationalModule,
  identity: OperationalIdentity,
  operationalKey?: string | null,
): string {
  if (module === 'well') return '/pozos/pozos';
  if (module === 'line') return '/pozos/lineas';
  const key = String(operationalKey || '').trim();
  const identityText = String(identity);
  const match = DURANGO_CAPABILITIES.flows.find((item) => (
    item.operationalKey === key
    || String(item.operationalKey) === identityText
    || (item.sensorId !== null && String(item.sensorId) === identityText)
  ));
  return match?.operationalKey === 'jarabes' ? '/pozos/jarabes' : '/pozos/flujos';
}
