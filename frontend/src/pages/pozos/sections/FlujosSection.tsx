import OperationalModuleSection from '../components/OperationalModuleSection';
import OperationalDetailSection from '../components/OperationalDetailSection';
interface Props { itemId?: string; }
export default function FlujosSection({ itemId }: Props) { const sensorId=Number(String(itemId||'').replace(/\D/g,'')); return itemId&&sensorId?<OperationalDetailSection module="flow" sensorId={sensorId} backPath="/pozos/flujos"/>:<OperationalModuleSection module="flow" title="Flujos auxiliares" subtitle="Lavadora Ciel, Jarabes y Lavadora de Vidrio" route="/pozos/flujos"/>; }
