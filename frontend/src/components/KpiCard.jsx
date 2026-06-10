function valueText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(valueText).join('');
  return '';
}

export default function KpiCard({ label, value, unit, trend, accent, style }) {
  const compactValueClass = valueText(value).replace(/\s/g, '').length >= 9 ? ' kpi-card-long-value' : '';

  return (
    <div className={`panel kpi-card accent-${accent || 'red'} fade-up${compactValueClass}`} style={style}>
      <div className="kpi-glow" />
      <div className="kpi-label">{label}</div>
      <div className="kpi-value-row">
        <div className="kpi-value">{value}</div>
        <div className="kpi-unit">{unit}</div>
      </div>
      <div className="kpi-trend">{trend}</div>
    </div>
  );
}
