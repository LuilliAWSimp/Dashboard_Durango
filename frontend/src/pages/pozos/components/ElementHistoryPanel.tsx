import type { DateRange, HistoryAggregation } from '../types';
import type { OperationalModule } from '../operationalNavigation';
import ModuleHistoryPanel from './ModuleHistoryPanel';
import type { OperationalHistoryView } from './ModuleHistoryPanel';

interface HistoryItem {
  sensorId: number | null;
  operationalKey: string;
  name: string;
  flowUnit?: string;
}

interface Props {
  module: OperationalModule;
  view: OperationalHistoryView;
  range: DateRange;
  aggregation: HistoryAggregation;
  onAggregationChange: (value: HistoryAggregation) => void;
  item: HistoryItem;
}

export default function ElementHistoryPanel({
  module,
  view,
  range,
  aggregation,
  onAggregationChange,
  item,
}: Props) {
  return (
    <ModuleHistoryPanel
      range={range}
      fixedModule={module}
      fixedView={view}
      aggregation={aggregation}
      onAggregationChange={onAggregationChange}
      items={[item]}
      panelTitle={`Histórico operativo · ${item.name}`}
      panelSubtitle="Flujo, totalizador y exportaciones del elemento para el rango seleccionado."
      className={`operational-detail-history operational-element-history operational-history-${module}`}
      singleElement
    />
  );
}
