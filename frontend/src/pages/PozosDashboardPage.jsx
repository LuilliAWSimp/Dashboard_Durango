import { useEffect, useMemo } from 'react';
import { downloadWaterReport } from '../services/waterExportService';
import RevisionDiariaSection from './pozos/sections/RevisionDiariaSection';
import BalanceSection from './pozos/sections/BalanceSection';
import DashboardBaseSection from './pozos/sections/DashboardBaseSection';
import PozosSection from './pozos/sections/PozosSection';
import WellDetailSection from './pozos/sections/WellDetailSection';
import LineasSection from './pozos/sections/LineasSection';
import FlujosSection from './pozos/sections/FlujosSection';
import TanquesSection from './pozos/sections/TanquesSection';
import ConcesionSection from './pozos/sections/ConcesionSection';
import ReportesSection from './pozos/sections/ReportesSection';

const pieColors = ['#14b8ff', '#0ea5e9', '#38bdf8'];
const axisColor = '#b9e7ff';
const gridColor = 'rgba(56,189,248,0.14)';

function emptyChartRange() {
  return { startDate: '', endDate: '', refreshKey: 0 };
}

const demoStateOptions = [
  { key: 'base', label: 'Base de datos' },
  { key: 'apagado', label: 'Apagado manual' },
  { key: 'inactivo', label: 'Inactivo' },
];

const demoStateMeta = {
  apagado: { status: 'Apagado manual', statusType: 'idle', estado_comunicacion: 'En línea', communicationType: 'online' },
  inactivo: { status: 'Inactivo', statusType: 'inactive', estado_comunicacion: 'En línea', communicationType: 'online' },
};

function getFallbackOnValue(well, field, fallback) {
  const value = well[field];
  if (value !== null && value !== undefined && value !== 0) return value;
  return fallback;
}

function applyDemoWellState(well, overrideState) {
  if (!overrideState || overrideState === 'base') return well;

  const meta = demoStateMeta[overrideState];
  if (!meta) return well;
  const next = {
    ...well,
    estado_operativo: overrideState,
    status: meta.status,
    statusType: meta.statusType,
    estado_comunicacion: meta.estado_comunicacion,
    communicationType: meta.communicationType,
    demoOverride: overrideState,
  };
  if (overrideState === 'apagado' || overrideState === 'inactivo') {
    return {
      ...next,
      apagado_manual: overrideState === 'apagado',
      kwh: 0,
      flujo_entrada: 0,
      flujo_salida: 0,
      flow: 0,
      dailyKwh: 0,
      amps: 0,
      efficiency: null,
      loadFactor: 0,
      ampFlowRatio: null,
      ultima_lectura: overrideState === 'apagado' ? 'Ahora · apagado demo' : well.ultima_lectura,
      updated: overrideState === 'apagado' ? 'Ahora · apagado demo' : well.updated,
      diagnosis: overrideState === 'apagado'
        ? 'Apagado manual para simulación visual; no debe tratarse como falla.'
        : 'Pozo inactivo; se distingue de un apagado operativo normal.',
    };
  }
  return next;
}

function filterWellsByStatus(wells, filter) {
  if (filter === 'encendidos') return wells.filter((well) => ['normal', 'warning', 'critical'].includes(well.statusType));
  if (filter === 'apagados') return wells.filter((well) => well.statusType === 'idle');
  if (filter === 'inactivos') return wells.filter((well) => well.statusType === 'inactive');
  if (filter === 'sin-comunicacion') return wells.filter((well) => well.statusType === 'communication');
  return wells;
}



const sectionMap = {
  dashboard: {
    title: 'Resumen de Pozos',
    render: () => <DashboardBaseSection />,
  },
  pozos: {
    title: 'Pozos',
    render: ({ itemId } = {}) => itemId ? <WellDetailSection wellId={itemId} /> : <PozosSection />,
  },
  lineas: {
    title: 'Líneas',
    render: ({ itemId } = {}) => <LineasSection itemId={itemId} />,
  },
  flujos: {
    title: 'Flujos',
    render: ({ itemId } = {}) => <FlujosSection itemId={itemId} />,
  },
  tanques: {
    title: 'Tanques',
    render: () => <TanquesSection />,
  },
  balance: {
    title: 'Balance de Agua',
    render: () => <BalanceSection />,
  },
  concesion: {
    title: 'Concesión',
    render: () => <ConcesionSection />,
  },
  revision: {
    title: 'Revisión Diaria',
    render: () => <RevisionDiariaSection />,
  },
  reportes: {
    title: 'Reportes',
    render: () => <ReportesSection />,
  },
};

export default function PozosDashboardPage({ section = 'dashboard', itemId, setHeaderMeta }) {
  const current = sectionMap[section] || sectionMap.dashboard;

  useEffect(() => {
    setHeaderMeta({
      title: current.title,
      subtitle: '',
      onExport: section === 'reportes' ? null : async (format) => {
        try {
          await downloadWaterReport(section, format, { itemId, title: current.title });
        } catch (error) {
          console.error('No fue posible exportar el reporte de Pozos', error);
          window.alert('No fue posible exportar el reporte de Pozos. Intenta nuevamente.');
        }
      },
      onEmail: null,
    });
  }, [current, section, itemId, setHeaderMeta]);

  const content = useMemo(() => current.render({ itemId }), [current, itemId]);

  return (
    <div className="page-grid pozos-page" data-export-root data-section={section}>
      {content}
    </div>
  );
}
