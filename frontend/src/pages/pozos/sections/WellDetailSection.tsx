import OperationalDetailSection from '../components/OperationalDetailSection';
interface Props { wellId?: string; }
export default function WellDetailSection({ wellId }: Props) { const sensorId=Number(String(wellId||'').replace(/\D/g,'')); return <OperationalDetailSection module="well" sensorId={sensorId||1001} backPath="/pozos/pozos"/>; }
