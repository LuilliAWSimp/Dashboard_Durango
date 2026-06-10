import type { ReactNode } from 'react';

interface MetricPairProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  emphasis?: boolean;
}

function MetricPair({ label, value, unit, emphasis }: MetricPairProps) {
  return (
    <div className={`metric-pair ${emphasis ? 'emphasis' : ''}`}>
      <span>{label}</span>
      <strong>{value}{unit ? <small>{unit}</small> : null}</strong>
    </div>
  );
}

export default MetricPair;
