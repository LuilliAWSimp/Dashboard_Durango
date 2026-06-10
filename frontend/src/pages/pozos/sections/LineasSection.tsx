import PozosSection from './PozosSection';
import LineDetailSection from './LineDetailSection';

interface LineasSectionProps {
  itemId?: string;
}

export default function LineasSection({ itemId }: LineasSectionProps) {
  if (itemId) {
    return <LineDetailSection lineId={itemId} />;
  }

  return <PozosSection mode="lineas" />;
}
