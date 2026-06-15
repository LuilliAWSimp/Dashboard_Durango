import { AlertTriangle, Droplets } from 'lucide-react';
import KpiCard from '../../../components/KpiCard';
import type { DashboardData, FlexibleRecord } from '../types';
import ChartEmptyState from '../components/ChartEmptyState';
import PanelHeader from '../components/PanelHeader';
import StatusBadge from '../components/StatusBadge';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';
import { defaultTodayRange } from '../dateUtils';

function toArray(value: unknown): FlexibleRecord[] {
  return Array.isArray(value) ? value as FlexibleRecord[] : [];
}

function asNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value: unknown, decimals = 1): string {
  const number = asNumber(value);
  return number.toLocaleString('es-MX', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function flowValue(row: FlexibleRecord): number {
  return asNumber(row.flow_lps ?? row.flujo_lps ?? row.flow ?? 0);
}

function TanquesSection() {
  const dashboardChart = useSqlChartDashboard('dashboard', defaultTodayRange, { forceRefresh: true, includeHistory: false, includeEnergyWater: false });
  const dashboard = dashboardChart.dashboard as DashboardData | null;
  const flows = toArray(dashboard?.flows);
  const jarabesRows = flows.filter((row) => asNumber(row.sensor_id) === 3004 || String(row.nombre || row.name || '').toLowerCase().includes('jarabes'));
  const auxiliaryRows = flows.filter((row) => [3002, 3004, 3006].includes(asNumber(row.sensor_id)));

  return (
    <>
      <section className="tanques-hero panel fade-up compact-hero">
        <div>
          <h2>Tanques</h2>
          <p>Durango no tiene niveles de tanques operativos confirmados. La sección queda disponible como pendiente de instrumentación.</p>
        </div>
        <div className="tanques-hero-metrics">
          <article>
            <span>Niveles confirmados</span>
            <strong>0</strong>
          </article>
          <article>
            <span>Volumen disponible</span>
            <strong>Sin dato</strong>
          </article>
          <article>
            <span>Fuente de nivel</span>
            <strong>Pendiente</strong>
          </article>
          <article>
            <span>Alertas de nivel</span>
            <strong>0</strong>
          </article>
        </div>
      </section>

      <section className="cards-grid stagger-grid">
        <KpiCard label="Nivel promedio" value="Sin dato" unit="" trend="No hay sensores de nivel confirmados" accent="cyan" />
        <KpiCard label="Volumen en tanques" value="Sin dato" unit="" trend="No se inventan capacidades ni alturas" accent="blue" />
        <KpiCard label="Puntos auxiliares" value={String(auxiliaryRows.length)} unit="puntos" trend="Lavadoras/Jarabes se revisan como flujos auxiliares" accent="teal" />
        <KpiCard label="Jarabes" value={jarabesRows.length ? 'Detectado' : 'Pendiente'} unit="" trend="Pendiente de clasificación operativa" accent="indigo" />
      </section>

      <section className="content-grid tanques-main-grid">
        <div className="panel summary-panel fade-up">
          <PanelHeader title="Sin niveles de tanques confirmados" subtitle="No se muestran tanques, alturas, porcentajes ni volúmenes inventados" />
          <ChartEmptyState message="Durango no tiene niveles de tanques operativos confirmados en la fuente actual. Esta sección queda disponible para cuando exista instrumentación real." />
        </div>

        <div className="panel summary-panel fade-up tanques-alert-panel">
          <PanelHeader title="Pendientes relacionados" subtitle="Validaciones necesarias antes de activar esta sección" />
          <div className="priority-list compact-priority-list">
            <article className="priority-item">
              <div className="priority-icon warning"><AlertTriangle size={16} /></div>
              <div className="priority-copy">
                <div className="priority-head">
                  <strong>Niveles de tanques</strong>
                  <span>Pendiente</span>
                </div>
                <div className="priority-type">Sin fuente confirmada</div>
                <p>No hay sensores de nivel, altura o llenado confirmados para Durango.</p>
              </div>
            </article>
            <article className="priority-item">
              <div className="priority-icon warning"><Droplets size={16} /></div>
              <div className="priority-copy">
                <div className="priority-head">
                  <strong>Jarabes</strong>
                  <span>Validar</span>
                </div>
                <div className="priority-type">Punto operativo pendiente</div>
                <p>Jarabes aparece como punto auxiliar de flujo, no como nivel de tanque. Falta confirmar su clasificación final.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="panel fade-up">
        <PanelHeader title="Puntos auxiliares detectados" subtitle="Referencia operativa; no son niveles de tanques" />
        <div className="concession-contract-list">
          {auxiliaryRows.length ? auxiliaryRows.map((row, index) => {
            const sensorId = asNumber(row.sensor_id);
            const name = String(row.nombre || row.name || `Punto ${index + 1}`);
            const flow = flowValue(row);
            const status = String(row.status || (flow > 0 ? 'Con flujo' : 'Sin flujo instantáneo'));
            const statusType = String(row.statusType || (flow > 0 ? 'normal' : 'warning'));
            return (
              <article key={`${sensorId}-${index}`}>
                <div>
                  <span>{name}</span>
                  <strong>{formatNumber(flow)} L/s</strong>
                  <p>{sensorId ? `Sensor ${sensorId}` : 'Sensor no disponible'} · Punto auxiliar BOS</p>
                </div>
                <StatusBadge type={statusType}>{status}</StatusBadge>
              </article>
            );
          }) : <ChartEmptyState message="Sin puntos auxiliares disponibles en la respuesta actual." />}
        </div>
      </section>
    </>
  );
}

export default TanquesSection;
