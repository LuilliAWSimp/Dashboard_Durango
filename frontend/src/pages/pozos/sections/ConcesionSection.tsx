import { AlertTriangle, FileWarning } from 'lucide-react';
import KpiCard from '../../../components/KpiCard';
import PanelHeader from '../components/PanelHeader';
import StatusBadge from '../components/StatusBadge';

function ConcesionSection() {
  return (
    <>
      <section className="concession-hero panel fade-up">
        <div className="concession-hero-copy">
          <h2>Concesión</h2>
          <p>Seguimiento administrativo pendiente de fuente oficial confirmada para Durango.</p>
        </div>
        <div className="daily-review-status-card">
          <div className="daily-review-icon"><FileWarning size={24} /></div>
          <div>
            <span>Estado de fuente</span>
            <strong>Sin fuente confirmada</strong>
          </div>
        </div>
      </section>

      <section className="cards-grid concession-kpi-grid">
        <KpiCard label="Concesión autorizada" value="Pendiente" unit="" trend="No hay límite oficial conectado" accent="red" />
        <KpiCard label="Consumo acumulado oficial" value="Pendiente" unit="" trend="Sin fuente administrativa validada" accent="crimson" />
        <KpiCard label="Remanente" value="Pendiente" unit="" trend="No se calcula sin concesión autorizada" accent="wine" />
        <KpiCard label="Porcentaje usado" value="Sin dato" unit="" trend="No se muestra porcentaje inventado" accent="brown" />
      </section>

      <section className="content-grid concession-main-grid">
        <div className="panel summary-panel fade-up concession-projection-panel">
          <PanelHeader title="Fuente pendiente" subtitle="Esta sección se conserva disponible, pero sin datos mock" />
          <div className="concession-projection-stack">
            <article>
              <span>Situación actual</span>
              <strong>Sin fuente confirmada para Durango</strong>
              <p>No existe en el payload actual un límite autorizado, vigencia o consumo acumulado oficial de concesión.</p>
            </article>
            <article>
              <span>Criterio aplicado</span>
              <strong>No calcular</strong>
              <p>No se generan porcentajes, remanentes ni proyecciones sin una fuente real validada.</p>
            </article>
            <article>
              <span>Datos operativos disponibles</span>
              <strong>Pozos y líneas</strong>
              <p>El consumo operativo del dashboard puede existir, pero no equivale por sí solo a un expediente oficial de concesión.</p>
            </article>
          </div>
        </div>

        <div className="panel fade-up concession-alert-panel">
          <PanelHeader title="Pendientes de validación" subtitle="Información necesaria antes de activar métricas de concesión" />
          <div className="concession-alert-list">
            <article className="warning">
              <div className="alert-icon"><AlertTriangle size={16} /></div>
              <div>
                <strong>Límite autorizado</strong>
                <span>Falta fuente oficial conectada para volumen autorizado y vigencia.</span>
              </div>
              <em>Pendiente</em>
            </article>
            <article className="warning">
              <div className="alert-icon"><AlertTriangle size={16} /></div>
              <div>
                <strong>Consumo acumulado oficial</strong>
                <span>Falta confirmar si se debe calcular desde totalizadores operativos o desde una fuente administrativa.</span>
              </div>
              <em>Pendiente</em>
            </article>
          </div>
        </div>
      </section>

      <section className="panel fade-up concession-breakdown-panel">
        <PanelHeader title="Concesiones activas" subtitle="Sin registros oficiales conectados" />
        <div className="concession-contract-list">
          <article>
            <div>
              <span>Sin fuente confirmada</span>
              <strong>No se muestran concesiones de ejemplo</strong>
              <p>Cuando exista fuente oficial se podrá mostrar límite, vigencia y estado.</p>
            </div>
            <StatusBadge type="communication">Pendiente</StatusBadge>
          </article>
        </div>
      </section>
    </>
  );
}

export default ConcesionSection;
