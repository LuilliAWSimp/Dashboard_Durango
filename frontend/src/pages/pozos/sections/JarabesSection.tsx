import OperationalModuleSection from '../components/OperationalModuleSection';
import OperationalDetailSection from '../components/OperationalDetailSection';
import { JARABES_SECTION_CONFIG } from '../operationalSectionConfig';

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
        backPath={JARABES_SECTION_CONFIG.routeBase}
        sectionConfig={JARABES_SECTION_CONFIG}
      />
    )
    : (
      <OperationalModuleSection
        module="flow"
        title={JARABES_SECTION_CONFIG.title}
        subtitle={JARABES_SECTION_CONFIG.subtitle}
        route={JARABES_SECTION_CONFIG.routeBase}
        sectionConfig={JARABES_SECTION_CONFIG}
      />
    );
}
