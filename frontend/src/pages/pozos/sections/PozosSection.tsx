import OperationalModuleSection from '../components/OperationalModuleSection';

const DURANGO_WELL_SENSOR_IDS = [1001, 1051];

export default function PozosSection() {
  return (
    <OperationalModuleSection
      module="well"
      title="Pozos"
      subtitle="Pozo 1 y Pozo 2 confirmados para Durango"
      route="/pozos/pozos"
      confirmedSensorIds={DURANGO_WELL_SENSOR_IDS}
    />
  );
}
