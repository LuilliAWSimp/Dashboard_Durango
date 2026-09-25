import type { DateRange, HistoryAggregation } from '../types';
import type { OperationalModule } from '../operationalNavigation';
import ModuleHistoryPanel from './ModuleHistoryPanel';
import type { OperationalHistoryView } from './ModuleHistoryPanel';
import type { DetailHistoryPeriodSummary } from '../detailHistorySummary';

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
  onPeriodSummaryChange?: (summary: DetailHistoryPeriodSummary) => void;
}

export default function ElementHistoryPanel({
  module,
  view,
  range,
  aggregation,
  onAggregationChange,
  item,
  onPeriodSummaryChange,
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
      panelSubtitle={null}
      className={`operational-detail-history operational-element-history operational-history-${module}`}
      singleElement
      onPeriodSummaryChange={onPeriodSummaryChange}
    />
  );
}
