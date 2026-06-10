import type { DateRange } from '../types';
import DateRangeControls, { rangeMeta } from './DateRangeControls';

interface SqlChartDateController {
  draftRange: DateRange;
  range: DateRange;
  setDraftRange: (range: DateRange) => void;
  apply: () => void;
  reset: () => void;
  error?: string;
  loading?: boolean;
}

interface SqlChartDateControlsProps {
  controller: SqlChartDateController;
  title?: string;
  subtitle?: string;
}

function SqlChartDateControls({ controller, title = 'Fechas de la gráfica', subtitle = 'Este rango solo afecta esta gráfica y no modifica los estados actuales.' }: SqlChartDateControlsProps) {
  const meta = rangeMeta(controller.range);
  const status = controller.error || (controller.loading ? 'Cargando SQL Server...' : `${meta.periodTitle} · ${meta.rangeLabel}`);
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
    />
  );
}

export default SqlChartDateControls;
