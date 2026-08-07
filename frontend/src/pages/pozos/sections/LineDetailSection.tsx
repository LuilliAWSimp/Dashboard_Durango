import OperationalDetailSection from '../components/OperationalDetailSection';
interface Props { lineId?: string; }
export default function LineDetailSection({ lineId }: Props) { const sensorId=Number(String(lineId||'').replace(/\D/g,'')); return <OperationalDetailSection module="line" sensorId={sensorId||2002} backPath="/pozos/lineas"/>; }
