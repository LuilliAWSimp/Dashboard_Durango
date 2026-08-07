import KpiCard from '../../../components/KpiCard';
import { uvAssociatedContext, uvOperationalLog, uvOperationalSummary } from '../../../data/pozosMock';
import ChartEmptyState from '../components/ChartEmptyState';
import PanelHeader from '../components/PanelHeader';
import SqlChartDateControls from '../components/SqlChartDateControls';
import StatusBadge from '../components/StatusBadge';
import useSqlChartDashboard from '../hooks/useSqlChartDashboard';

function UvSection() {
  const stateType = uvOperationalSummary.inferredStateType || 'normal';
  const communicationType = uvOperationalSummary.communicationType || 'normal';
  const uvChart = useSqlChartDashboard('dashboard');

  return (
    <>
      <section className="uv-hero panel fade-up">
        <div className="uv-hero-copy">
          <div className="section-eyebrow">Monitoreo operativo</div>
          <h2>Lámparas UV</h2>
          <p>
            Vista basada en flujo asociado al paso UV. No interpreta intensidad, vida útil ni eficacia de desinfección;
            solo muestra señales operativas disponibles para revisión rápida.
          </p>
        </div>
        <div className="uv-hero-status">
          <span>Estado inferido</span>
          <StatusBadge type={stateType}>{uvOperationalSummary.inferredState}</StatusBadge>
          <small>{uvOperationalSummary.note}</small>
        </div>
      </section>

      <section className="cards-grid uv-kpi-grid">
        <KpiCard label="Flujo actual" value={uvOperationalSummary.currentFlow.toLocaleString('es-MX')} unit="L/s" trend="Flujo asociado al paso UV" accent="blue" />
        <KpiCard label="Última actualización" value={uvOperationalSummary.lastUpdate} unit="h" trend="Última lectura recibida" accent="cyan" />
        <KpiCard label="Comunicación" value={uvOperationalSummary.communication} unit="" trend="Estado de señal disponible" accent={communicationType === 'normal' ? 'green' : 'amber'} />
        <KpiCard label="Estado inferido" value={uvOperationalSummary.inferredState} unit="" trend="Inferido por flujo mayor a cero" accent={stateType === 'normal' ? 'green' : 'amber'} />
      </section>

      <section className="content-grid pozos-main-grid uv-main-grid">
        <div className="panel chart-panel fade-up">
          <PanelHeader title="Tendencia de flujo asociado" subtitle="Filtrable por fecha cuando exista el tag UV mapeado para monitoreo" />
          <SqlChartDateControls controller={uvChart} />
          <ChartEmptyState message="Aún no hay histórico UV disponible. No se muestran datos mock." />
        </div>

        <div className="panel fade-up uv-context-panel">
          <PanelHeader title="Contexto asociado" subtitle="Relaciones operativas usadas como referencia" />
          <div className="uv-context-list">
            {uvAssociatedContext.map((item) => (
              <article key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel fade-up">
        <PanelHeader title="Bitácora operativa UV" subtitle="Lecturas de flujo, comunicación y referencia de línea/tanque" />
        <div className="table-wrap uv-table-wrap">
          <table className="data-table uv-operational-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Flujo</th>
                <th>Estado inferido</th>
                <th>Comunicación</th>
                <th>Última lectura</th>
                <th>Referencia</th>
              </tr>
            </thead>
            <tbody>
              {uvOperationalLog.map((row) => {
                const rowStateType = row.communication === 'Sin comunicación' ? 'communication' : row.state === 'Sin flujo' ? 'warning' : 'normal';
                return (
                  <tr key={`${row.hour}-${row.lastReading}`}>
                    <td>{row.hour}</td>
                    <td className="metric-strong">{Number(row.flow || 0).toLocaleString('es-MX')} L/s</td>
                    <td><StatusBadge type={rowStateType}>{row.state}</StatusBadge></td>
                    <td><span className={`communication-chip ${row.communication === 'Sin comunicación' ? 'offline' : ''}`}>{row.communication}</span></td>
                    <td>{row.lastReading}</td>
                    <td>{row.reference}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}




export default UvSection;
