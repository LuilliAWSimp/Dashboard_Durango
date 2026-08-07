import OperationalModuleSection from '../components/OperationalModuleSection';
import OperationalDetailSection from '../components/OperationalDetailSection';

interface Props { itemId?: string; }

export default function FlujosSection({ itemId }: Props) {
  const identity = itemId ? decodeURIComponent(itemId).replace(/^sensor-/, '') : '';
  return identity
    ? <OperationalDetailSection module="flow" sensorId={identity} backPath="/pozos/flujos" />
    : <OperationalModuleSection
        module="flow"
        title="Flujos"
        subtitle="Lavadoras y Jarabes con seguimiento de flujo y totalizador"
        route="/pozos/flujos"
      />;
}
