import OperationalModuleSection from '../components/OperationalModuleSection';
import OperationalDetailSection from '../components/OperationalDetailSection';

interface Props {
  itemId?: string;
}

export default function JarabesSection({ itemId }: Props) {
  const identity = itemId ? decodeURIComponent(itemId).replace(/^sensor-/, '') : '';

  return identity
    ? (
      <OperationalDetailSection
        module="flow"
        sensorId={identity}
        backPath="/pozos/jarabes"
      />
    )
    : (
      <OperationalModuleSection
        module="flow"
        title="Jarabes"
        subtitle="Seguimiento de flujo y totalizador de Jarabes"
        route="/pozos/jarabes"
        filterItems={(item) => item.operationalKey === 'jarabes'}
      />
    );
}