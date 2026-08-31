import { useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { downloadWaterReport } from '../services/waterExportService';
import RevisionDiariaSection from './pozos/sections/RevisionDiariaSection';
import BalanceSection from './pozos/sections/BalanceSection';
import DashboardBaseSection from './pozos/sections/DashboardBaseSection';
import PozosSection from './pozos/sections/PozosSection';
import WellDetailSection from './pozos/sections/WellDetailSection';
import LineasSection from './pozos/sections/LineasSection';
import FlujosSection from './pozos/sections/FlujosSection';
import ConcesionSection from './pozos/sections/ConcesionSection';
import ReportesSection from './pozos/sections/ReportesSection';
import JarabesSection from './pozos/sections/JarabesSection';
import UsersPage from './UsersPage';

const pieColors = ['#14b8ff', '#0ea5e9', '#38bdf8'];
const axisColor = '#b9e7ff';
const gridColor = 'rgba(56,189,248,0.14)';

function emptyChartRange() {
  return { startDate: '', endDate: '', refreshKey: 0 };
}



const sectionMap = {
  dashboard: {
    title: 'Resumen hídrico',
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
    title: 'Lavadoras',
    render: ({ itemId } = {}) => <FlujosSection itemId={itemId} />,
  },

  //sección de jarabes
  jarabes: {
  title: 'Jarabes',
  render: ({ itemId } = {}) => <JarabesSection itemId={itemId} />,
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
    render: ({ user } = {}) => <ReportesSection currentUser={user} />,
  },
  usuarios: {
    title: 'Usuarios',
    render: ({ user } = {}) => user?.role === 'admin' ? <UsersPage /> : <Navigate to="/pozos/dashboard" replace />,
  },
};

export default function PozosDashboardPage({ section = 'dashboard', itemId, setHeaderMeta, user }) {
  const current = sectionMap[section] || sectionMap.dashboard;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [section, itemId]);

  useEffect(() => {
    setHeaderMeta({
      title: current.title,
      subtitle: '',
      onExport: section === 'reportes' || section === 'usuarios' ? null : async (format) => {
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

  const content = useMemo(() => current.render({ itemId, user }), [current, itemId, user]);

  return (
    <div className="page-grid pozos-page" data-export-root data-section={section}>
      {content}
    </div>
  );
}
