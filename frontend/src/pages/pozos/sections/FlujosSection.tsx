import OperationalModuleSection from '../components/OperationalModuleSection';
import OperationalDetailSection from '../components/OperationalDetailSection';
import { LAVADORAS_SECTION_CONFIG } from '../operationalSectionConfig';

interface Props { itemId?: string; }

export default function FlujosSection({ itemId }: Props) {
  const identity = itemId ? decodeURIComponent(itemId).replace(/^sensor-/, '') : '';
  return identity
    ? <OperationalDetailSection module="flow" sensorId={identity} backPath={LAVADORAS_SECTION_CONFIG.routeBase} sectionConfig={LAVADORAS_SECTION_CONFIG} />
    : <OperationalModuleSection
        module="flow"
        title={LAVADORAS_SECTION_CONFIG.title}
        subtitle={LAVADORAS_SECTION_CONFIG.subtitle}
        route={LAVADORAS_SECTION_CONFIG.routeBase}
        sectionConfig={LAVADORAS_SECTION_CONFIG}
      />;
}
