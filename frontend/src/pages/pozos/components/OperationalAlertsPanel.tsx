import { AlertTriangle, CheckCircle2, RadioTower } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import {
  buildWaterAlertRoute,
  type WaterAlertRouteContext,
  type WaterOperationalAlert,
} from '../waterOperationalAlerts';

interface OperationalAlertsPanelProps extends WaterAlertRouteContext {
  alerts: WaterOperationalAlert[];
  title?: string;
  subtitle?: string;
  historicalNote?: string;
}

function severityLabel(severity: WaterOperationalAlert['severity']) {
  return severity === 'critical' ? 'Crítica' : 'Atención';
}

function moduleLabel(module: WaterOperationalAlert['module']) {
  if (module === 'well') return 'Pozo';
  if (module === 'line') return 'Línea';
  if (module === 'flow') return 'Flujo';
  return 'Planta';
}

export default function OperationalAlertsPanel({
  alerts,
  range,
  aggregation,
  title = 'Alertas y prioridades',
  subtitle = 'Elementos que requieren atención operativa.',
  historicalNote,
}: OperationalAlertsPanelProps) {
  const navigate = useNavigate();

  const openAlert = (alert: WaterOperationalAlert) => {
    navigate(buildWaterAlertRoute(alert, { range, aggregation }));
  };

  return (
    <section className="panel fade-up operational-alerts-panel" aria-label={title}>
      <div className="operational-alerts-heading">
        <div>
          <span>{title}</span>
          <h3>{subtitle}</h3>
          {historicalNote ? <p>{historicalNote}</p> : null}
        </div>
        <StatusBadge type={alerts.length ? 'warning' : 'normal'}>{alerts.length ? `${alerts.length} activas` : 'Sin alertas'}</StatusBadge>
      </div>

      {alerts.length ? (
        <div className="operational-alerts-grid">
          {alerts.map((alert) => (
            <article
              key={alert.id}
              className={`operational-alert-card ${alert.severity}`}
              role="button"
              tabIndex={0}
              onClick={() => openAlert(alert)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                openAlert(alert);
              }}
            >
              <div className="operational-alert-icon" aria-hidden="true">
                {alert.severity === 'critical' ? <RadioTower size={20} /> : <AlertTriangle size={20} />}
              </div>
              <div className="operational-alert-copy">
                <div className="operational-alert-title-row">
                  <span>{moduleLabel(alert.module)}</span>
                  <StatusBadge type={alert.severity}>{severityLabel(alert.severity)}</StatusBadge>
                </div>
                <strong>{alert.name}</strong>
                <h4>{alert.title}</h4>
                <p>{alert.message}</p>
              </div>
              <span className="operational-alert-action">Ver detalle</span>
            </article>
          ))}
        </div>
      ) : (
        <div className="operational-alerts-empty">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>Sin alertas operativas activas</span>
          <p>No se detectan condiciones que requieran atención.</p>
        </div>
      )}
    </section>
  );
}
