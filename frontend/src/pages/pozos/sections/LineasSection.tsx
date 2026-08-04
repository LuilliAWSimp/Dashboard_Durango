import OperationalModuleSection from '../components/OperationalModuleSection';
import OperationalDetailSection from '../components/OperationalDetailSection';
interface Props { itemId?: string; }
export default function LineasSection({ itemId }: Props) { const sensorId=Number(String(itemId||'').replace(/\D/g,'')); return itemId&&sensorId?<OperationalDetailSection module="line" sensorId={sensorId} backPath="/pozos/lineas"/>:<OperationalModuleSection module="line" title="Líneas" subtitle="Cinco líneas confirmadas en su orden operativo" route="/pozos/lineas"/>; }
