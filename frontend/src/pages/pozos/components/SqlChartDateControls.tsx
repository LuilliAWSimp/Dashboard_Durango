import type { DateRange, HistoryAggregation } from '../types';
import DateRangeControls, { rangeMeta } from './DateRangeControls';

interface SqlChartDateController {
  draftRange: DateRange;
  range: DateRange;
  setDraftRange: (range: DateRange) => void;
  apply: () => void;
  reset: () => void;
  aggregation?: HistoryAggregation;
  setAggregation?: (value: HistoryAggregation) => void;
  error?: string;
  loading?: boolean;
}

interface SqlChartDateControlsProps {
  controller: SqlChartDateController;
  title?: string;
  subtitle?: string;
}

function SqlChartDateControls({ controller, title = 'Fechas de la gráfica', subtitle = 'Este rango solo afecta esta gráfica y no modifica los estados actuales.' }: SqlChartDateControlsProps) {
  const meta = rangeMeta(controller.range, controller.aggregation);
  const status = controller.error || (controller.loading ? 'Cargando datos...' : `${meta.periodTitle} · ${meta.rangeLabel}`);
  return (
    <DateRangeControls
      className="chart-date-range-panel"
      title={title}
      subtitle={subtitle}
      draftRange={controller.draftRange}
      activeRange={controller.range}
      onDraftChange={controller.setDraftRange}
      onApply={controller.apply}
      onReset={controller.reset}
      status={status}
      aggregation={controller.aggregation}
      onAggregationChange={controller.setAggregation}
    />
  );
}

export default SqlChartDateControls;
