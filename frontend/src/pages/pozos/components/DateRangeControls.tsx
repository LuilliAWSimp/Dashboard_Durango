import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import type { DateRange, HistoryAggregation, Period } from '../types';
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
  aggregation?: HistoryAggregation;
  onAggregationChange?: (value: HistoryAggregation) => void;
}

const AGGREGATION_OPTIONS: Array<{ value: HistoryAggregation; label: string }> = [
  { value: 'minute', label: '1 minuto' },
  { value: 'quarter_hour', label: '15 minutos' },
  { value: 'hourly', label: 'Por hora' },
  { value: 'daily', label: 'Por día' },
];

interface AggregationSelectProps {
  value: HistoryAggregation;
  onChange: (value: HistoryAggregation) => void;
}

function AggregationSelect({ value, onChange }: AggregationSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, AGGREGATION_OPTIONS.findIndex((option) => option.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  useEffect(() => {
    setActiveIndex(selectedIndex);
  }, [selectedIndex]);

  useEffect(() => {
    if (!open) return undefined;
    const focusTimer = window.requestAnimationFrame(() => {
      optionRefs.current[activeIndex]?.focus();
    });
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [activeIndex, open]);

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const selectOption = (index: number) => {
    const option = AGGREGATION_OPTIONS[index];
    if (!option) return;
    onChange(option.value);
    setActiveIndex(index);
    close(true);
  };

  const moveActive = (direction: 1 | -1) => {
    setOpen(true);
    setActiveIndex((current) => (current + direction + AGGREGATION_OPTIONS.length) % AGGREGATION_OPTIONS.length);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(AGGREGATION_OPTIONS.length - 1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) selectOption(activeIndex);
      else {
        setActiveIndex(selectedIndex);
        setOpen(true);
      }
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'Tab' && open) setOpen(false);
  };

  const selectedOption = AGGREGATION_OPTIONS[selectedIndex];

  return (
    <div className="history-aggregation-select" ref={rootRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className="history-aggregation-trigger"
        aria-label={`Agrupación del histórico: ${selectedOption.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => {
          setActiveIndex(selectedIndex);
          setOpen((current) => !current);
        }}
      >
        <span>{selectedOption.label}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={listboxId}
          className="history-aggregation-menu"
          role="listbox"
          aria-label="Agrupación del histórico"
        >
          {AGGREGATION_OPTIONS.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              role="option"
              aria-selected={option.value === value}
              tabIndex={index === activeIndex ? 0 : -1}
              className={`history-aggregation-option${option.value === value ? ' is-selected' : ''}`}
              onClick={() => selectOption(index)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function rangeMeta(range: DateRange = {}, aggregation?: Period): RangeMeta {
  const period = aggregation || dateRangePeriod(range);
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
  aggregation,
  onAggregationChange,
}: DateRangeControlsProps) {
  const meta = rangeMeta(activeRange || draftRange, aggregation);
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
        {aggregation && onAggregationChange ? (
          <label>
            <span>Agrupación</span>
            <AggregationSelect value={aggregation} onChange={onAggregationChange} />
          </label>
        ) : null}
        <button type="button" className="date-range-apply" onClick={onApply}>Actualizar</button>
        {onReset ? <button type="button" className="date-range-reset" onClick={onReset}>Restablecer</button> : null}
        <div className="date-range-status">{status || `${meta.periodTitle} · ${meta.rangeLabel}`}</div>
      </div>
    </section>
  );
}

export default DateRangeControls;
