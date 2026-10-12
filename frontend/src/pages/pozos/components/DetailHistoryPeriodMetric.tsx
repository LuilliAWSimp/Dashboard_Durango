import type { OperationalIdentity } from '../moduleComparison';
import type { DetailHistoryPeriodSummary } from '../detailHistorySummary';

interface Props {
  summary: DetailHistoryPeriodSummary | null;
  identity: OperationalIdentity;
  flowUnit: string;
  volumeLabel: string;
}

function formatNumber(value: number | null): string {
  return value === null
    ? '—'
    : value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DetailHistoryPeriodMetric({ summary, identity, flowUnit, volumeLabel }: Props) {
  const pending = !summary || String(summary.identity) !== String(identity) || summary.loading;

  if (pending) {
    return (
      <div className="detail-period-kpi-content detail-period-kpi-content--loading" aria-live="polite">
        <strong>Calculando…</strong>
        <small>Actualizando el periodo seleccionado</small>
      </div>
    );
  }

  return (
    <div className="detail-period-kpi-content" aria-live="polite">
      <div className="detail-period-kpi-values">
        <span><strong>{formatNumber(summary.flowAverage)}{summary.flowAverage === null ? '' : ` ${flowUnit}`}</strong><small>Flujo promedio</small></span>
        <span><strong>{formatNumber(summary.volumeM3)}{summary.volumeM3 === null ? '' : ' m³'}</strong><small>{volumeLabel}</small></span>
      </div>
      <small className="detail-period-kpi-range">{summary.intervalLabel}</small>
      {summary.error ? <small className="detail-period-kpi-error">{summary.error}</small> : null}
    </div>
  );
}
