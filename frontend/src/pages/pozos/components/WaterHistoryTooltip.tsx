import type { HistoryAggregation } from '../types';

interface TooltipPayloadEntry {
  payload?: Record<string, unknown>;
}

interface WaterHistoryTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  aggregation: HistoryAggregation;
  flowUnit?: string;
}

interface IntervalParts {
  date: string;
  interval: string;
}

function formatNumber(value: unknown, decimals = 2): string {
  if (value === null || value === undefined || value === '') return 'Sin datos';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 'Sin datos';
  return parsed.toLocaleString('es-MX', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function intervalParts(startValue: unknown, endValue: unknown, aggregation: HistoryAggregation): IntervalParts {
  const start = new Date(String(startValue || ''));
  const end = new Date(String(endValue || ''));
  if (Number.isNaN(start.getTime())) return { date: 'Periodo', interval: '' };
  const date = start.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (aggregation === 'daily') return { date, interval: '' };
  const startTime = start.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const endTime = Number.isNaN(end.getTime())
    ? ''
    : end.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return { date, interval: endTime ? `${startTime} – ${endTime}` : startTime };
}

const STATUS_LABELS: Record<string, string> = {
  operational: 'Con actividad',
  partial_activity: 'Actividad parcial',
  zero_consumption: 'Apagado con datos',
  no_data: 'Sin registros',
  no_history: 'Sin histórico para el periodo',
  invalid_totalizer: 'Validación parcial',
  missing_totalizer: 'Sin totalizador disponible',
  stale_data: 'Lectura atrasada',
  frozen_flow: 'Lectura de flujo congelada',
  mapping_pending: 'Pendiente de confirmación de sensor',
  future_interval: 'Intervalo futuro',
};

export default function WaterHistoryTooltip({ active, payload, aggregation, flowUnit = 'Unidad por confirmar' }: WaterHistoryTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload.find((entry) => entry.payload)?.payload;
  if (!row) return null;
  const samples = Number(row.samples || 0);
  const expectedSamples = Number(row.samplesExpected || 0);
  const dataStatus = String(row.dataStatus || '');
  const interval = intervalParts(row.bucketStart, row.bucketEnd, aggregation);
  if (dataStatus === 'future_interval') {
    return (
      <div className="chart-tooltip solid-tooltip pozos-tooltip water-history-tooltip">
        <div className="chart-tooltip-label water-history-tooltip-heading">
          <span className="water-history-tooltip-date">{interval.date}</span>
          {interval.interval ? <span className="water-history-tooltip-interval">{interval.interval}</span> : null}
        </div>
        <div className="chart-tooltip-list">
          <div className="chart-tooltip-row">
            <span className="chart-tooltip-name">Estado</span>
            <span className="chart-tooltip-value">Intervalo futuro</span>
          </div>
        </div>
      </div>
    );
  }
  const flowDisplay = dataStatus === 'frozen_flow'
    ? 'Lectura de flujo congelada'
    : dataStatus === 'mapping_pending'
      ? 'Pendiente de confirmación de sensor'
      : row.flow === null
        ? 'Sin datos'
        : `${formatNumber(row.flow)} ${flowUnit}`;
  const discardedDetails = Array.isArray(row.discardedEventDetails) ? row.discardedEventDetails as Record<string, unknown>[] : [];
  const firstDiscard = discardedDetails[0];
  const discardReason = String(firstDiscard?.reason || '')
    .replace('incremento_incompatible_con_flujo_cero', 'Incremento incompatible con flujo cero')
    .replace('incremento_incompatible_con_flujo_y_tiempo', 'Incremento incompatible con flujo y tiempo')
    .replace('reinicio_o_caida_de_totalizador', 'Reinicio o caída de totalizador')
    .replace('flujo_insuficiente_para_validar_incremento', 'Flujo insuficiente para validar el incremento');

  return (
    <div className="chart-tooltip solid-tooltip pozos-tooltip water-history-tooltip">
      <div className="chart-tooltip-label water-history-tooltip-heading">
        <span className="water-history-tooltip-date">{interval.date}</span>
        {interval.interval ? <span className="water-history-tooltip-interval">{interval.interval}</span> : null}
      </div>
      <div className="chart-tooltip-list">
        <div className="chart-tooltip-row">
          <span className="chart-tooltip-name">Promedio del intervalo</span>
          <span className="chart-tooltip-value">{flowDisplay}</span>
        </div>
        {row.flowActiveAvg !== null && row.flowActiveAvg !== undefined ? (
          <div className="chart-tooltip-row">
            <span className="chart-tooltip-name">Promedio durante actividad</span>
            <span className="chart-tooltip-value">{formatNumber(row.flowActiveAvg)} {flowUnit}</span>
          </div>
        ) : null}
        {samples > 0 && row.flowMin !== null && row.flowMin !== undefined && row.flowMax !== null && row.flowMax !== undefined ? (
          <div className="chart-tooltip-row">
            <span className="chart-tooltip-name">Mínimo / máximo</span>
            <span className="chart-tooltip-value">{formatNumber(row.flowMin)} / {formatNumber(row.flowMax)} {flowUnit}</span>
          </div>
        ) : null}
        <div className="chart-tooltip-row">
          <span className="chart-tooltip-name">{row.hasDiscontinuities ? 'Volumen validado parcial' : 'Volumen'}</span>
          <span className="chart-tooltip-value">{row.volume === null ? 'Sin datos' : `${formatNumber(row.volume)} m³`}</span>
        </div>
        {Number(row.discardedEvents || 0) > 0 ? (
          <>
            <div className="chart-tooltip-row">
              <span className="chart-tooltip-name">Eventos descartados</span>
              <span className="chart-tooltip-value">{Number(row.discardedEvents).toLocaleString('es-MX')}</span>
            </div>
            <div className="chart-tooltip-row">
              <span className="chart-tooltip-name">Volumen descartado</span>
              <span className="chart-tooltip-value">{formatNumber(row.discardedVolume)} m³</span>
            </div>
            {discardReason ? (
              <div className="chart-tooltip-row">
                <span className="chart-tooltip-name">Motivo</span>
                <span className="chart-tooltip-value">{discardReason}</span>
              </div>
            ) : null}
          </>
        ) : null}
        <div className="chart-tooltip-row">
          <span className="chart-tooltip-name">Tiempo activo</span>
          <span className="chart-tooltip-value">{formatNumber(row.activeMinutes, 0)} min</span>
        </div>
        <div className="chart-tooltip-row">
          <span className="chart-tooltip-name">Muestras</span>
          <span className="chart-tooltip-value">{samples.toLocaleString('es-MX')}{expectedSamples > 0 ? `/${expectedSamples.toLocaleString('es-MX')}` : ''}</span>
        </div>
        <div className="chart-tooltip-row">
          <span className="chart-tooltip-name">Cobertura</span>
          <span className="chart-tooltip-value">{formatNumber(row.coveragePercent)}% · {String(row.coverageStatus || 'Sin registros')}</span>
        </div>
        <div className="chart-tooltip-row">
          <span className="chart-tooltip-name">Actividad</span>
          <span className="chart-tooltip-value">{String(row.intervalState || STATUS_LABELS[dataStatus] || 'Sin registros')}</span>
        </div>
        <div className="chart-tooltip-row">
          <span className="chart-tooltip-name">Validación</span>
          <span className="chart-tooltip-value">{dataStatus === 'invalid_totalizer' ? 'Validación parcial' : row.volume === null ? 'Sin volumen validado' : 'Validado'}</span>
        </div>
      </div>
    </div>
  );
}
