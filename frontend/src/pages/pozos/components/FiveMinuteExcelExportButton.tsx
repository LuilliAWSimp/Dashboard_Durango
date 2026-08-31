import { useMemo, useState } from 'react';
import { FileSpreadsheet, LoaderCircle } from 'lucide-react';
import type { DateRange } from '../types';
import {
  downloadFiveMinuteHistoryExcel,
  validateFiveMinuteExportRange,
  type FiveMinuteExportModule,
} from '../../../services/waterFiveMinuteExportService';

interface Props {
  module: FiveMinuteExportModule;
  elementId: number | string | null;
  range: DateRange;
}

export default function FiveMinuteExcelExportButton({ module, elementId, range }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [hasError, setHasError] = useState(false);
  const validation = useMemo(
    () => validateFiveMinuteExportRange(String(range.startDate || ''), String(range.endDate || '')),
    [range.startDate, range.endDate],
  );

  const exportExcel = async () => {
    if (elementId === null || elementId === undefined || elementId === '') {
      setHasError(true);
      setMessage('No hay una identidad operativa válida para exportar.');
      return;
    }
    if (validation) {
      setHasError(true);
      setMessage(validation);
      return;
    }
    setLoading(true);
    setHasError(false);
    setMessage('');
    try {
      await downloadFiveMinuteHistoryExcel({
        module,
        elementId,
        startDate: String(range.startDate),
        endDate: String(range.endDate),
      });
      setMessage('Excel de 5 minutos generado.');
    } catch (error) {
      setHasError(true);
      setMessage(error instanceof Error ? error.message : 'No fue posible exportar el Excel de 5 minutos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="five-minute-export-action">
      <button
        type="button"
        className="five-minute-excel-button"
        onClick={exportExcel}
        disabled={loading || elementId === null || elementId === undefined || elementId === ''}
        title="Exportar este elemento en intervalos conciliados de 5 minutos (máximo 3 días)"
      >
        {loading ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : <FileSpreadsheet size={17} aria-hidden="true" />}
        <span>{loading ? 'Generando...' : 'Excel 5 min'}</span>
      </button>
      {message ? <span className={`five-minute-export-message${hasError ? ' is-error' : ''}`}>{message}</span> : null}
    </div>
  );
}
