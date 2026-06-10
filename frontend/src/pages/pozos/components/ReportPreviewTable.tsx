import type { ReactNode } from 'react';

interface ReportPreviewTableProps {
  title: string;
  headers: string[];
  rows?: ReactNode[][];
}

function ReportPreviewTable({ title, headers, rows }: ReportPreviewTableProps) {
  return (
    <div className="daily-report-table-wrap">
      <h3>{title}</h3>
      {rows?.length ? (
        <table className="daily-report-table">
          <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={`${title}-${index}`}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell || '—'}</td>)}</tr>)}</tbody>
        </table>
      ) : <p className="panel-subtitle">Sin datos disponibles.</p>}
    </div>
  );
}

export default ReportPreviewTable;
