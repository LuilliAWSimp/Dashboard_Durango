import { useEffect, useMemo } from 'react';
import { downloadWaterReport } from '../services/waterExportService';
import RevisionDiariaSection from './pozos/sections/RevisionDiariaSection';
import BalanceSection from './pozos/sections/BalanceSection';
import DashboardBaseSection from './pozos/sections/DashboardBaseSection';
import PozosSection from './pozos/sections/PozosSection';
import WellDetailSection from './pozos/sections/WellDetailSection';
import LineasSection from './pozos/sections/LineasSection';
import FlujosSection from './pozos/sections/FlujosSection';
import ReportesSection from './pozos/sections/ReportesSection';

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
  balance: {
    title: 'Balance de Agua',
    render: () => <BalanceSection />,
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
