import { CalendarDays } from 'lucide-react';
import type { DateRange, Period } from '../types';
import { dateRangePeriod, formatDateRangeStatus, periodLabel, periodTitle } from '../dateUtils';

interface RangeMeta {
  period: Period;
  periodLabel: string;
  periodTitle: string;
  rangeLabel: string;
}

export interface DateRangeControlsProps {
  draftRange: DateRange;
  activeRange?: DateRange | null;
  onDraftChange: (range: DateRange) => void;
  onApply: () => void;
  onReset?: () => void;
  status?: string;
  title?: string;
  subtitle?: string;
  className?: string;
  showDateIcons?: boolean;
}

export function rangeMeta(range: DateRange = {}): RangeMeta {
  const period = dateRangePeriod(range);
  const rangeLabel = formatDateRangeStatus(range, 'Hoy');
  return {
    period,
    periodLabel: periodLabel(period),
    periodTitle: periodTitle(period),
    rangeLabel,
  };
}

function DateRangeControls({
  draftRange,
  activeRange,
  onDraftChange,
  onApply,
  onReset,
  status,
  title = 'Rango de fechas',
  subtitle = 'Este rango solo afecta la gráfica, tabla o reporte donde aparece.',
  className = '',
  showDateIcons = true,
}: DateRangeControlsProps) {
  const meta = rangeMeta(activeRange || draftRange);
  const renderDateInput = (field: 'startDate' | 'endDate') => {
    const input = (
      <input
        type="date"
        value={draftRange[field] || ''}
        onChange={(event) => onDraftChange({ ...draftRange, [field]: event.target.value })}
      />
    );
    if (!showDateIcons) return input;
    return (
      <div className="date-input-with-icon">
        <CalendarDays size={16} aria-hidden="true" />
        {input}
      </div>
    );
  };
  return (
    <section className={`date-range-panel panel fade-up ${className}`.trim()}>
      <div>
        <div className="panel-title">{title}</div>
        <div className="panel-subtitle">{subtitle}</div>
        <div className="date-range-meta">
          <span>{meta.periodTitle}</span>
          <span>{meta.rangeLabel}</span>
        </div>
      </div>
      <div className="date-range-fields">
        <label>
          <span>Desde</span>
          {renderDateInput('startDate')}
        </label>
        <label>
          <span>Hasta</span>
          {renderDateInput('endDate')}
        </label>
        <button type="button" className="date-range-apply" onClick={onApply}>Actualizar</button>
        {onReset ? <button type="button" className="date-range-reset" onClick={onReset}>Restablecer</button> : null}
        <div className="date-range-status">{status || `${meta.periodTitle} · ${meta.rangeLabel}`}</div>
      </div>
    </section>
  );
}

export default DateRangeControls;
