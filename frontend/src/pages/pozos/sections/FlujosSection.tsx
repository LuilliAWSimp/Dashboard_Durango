import OperationalModuleSection from '../components/OperationalModuleSection';
import OperationalDetailSection from '../components/OperationalDetailSection';

interface Props { itemId?: string; }

export default function FlujosSection({ itemId }: Props) {
  const identity = itemId ? decodeURIComponent(itemId).replace(/^sensor-/, '') : '';
  return identity
    ? <OperationalDetailSection module="flow" sensorId={identity} backPath="/pozos/flujos" />
    : <OperationalModuleSection
        module="flow"
        title="Lavadoras"
        subtitle="Lavadora Vidrio y Lavadora Ref Pet"
        route="/pozos/flujos"
      />;
}
