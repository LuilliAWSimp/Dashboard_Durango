import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HistoryAggregation, WaterHistoryPoint } from '../types';
import { isHistoryPointVisible } from '../dateUtils';
import WaterHistoryTooltip from './WaterHistoryTooltip';

const axisColor = '#b9e7ff';
const gridColor = 'rgba(56,189,248,0.14)';

interface WaterHistoryChartProps {
  points: WaterHistoryPoint[];
  aggregation: HistoryAggregation;
  height?: number;
  flowUnit?: string;
}

interface ChartPoint {
  timestamp: number;
  bucketStart: string;
  bucketEnd: string;
  flow: number | null;
  flowMin: number | null;
  flowMax: number | null;
  volume: number | null;
  validatedVolume: number | null;
  discardedVolume: number;
  discardedEvents: number;
  discardedEventDetails: Record<string, unknown>[];
  hasDiscontinuities: boolean;
  volumeReliable: boolean;
  samples: number;
  dataStatus: string;
  tooltipAnchor: number;
}

function tickFormatter(value: number, aggregation: HistoryAggregation, spansMultipleDays: boolean): string {
  const date = new Date(value);
  if (aggregation === 'daily') {
    return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }
  if (spansMultipleDays) {
    return date.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export default function WaterHistoryChart({ points, aggregation, height = 430, flowUnit = 'Unidad por confirmar' }: WaterHistoryChartProps) {
  const data: ChartPoint[] = points
    .filter((point) => isHistoryPointVisible(point.bucket_start, point.data_status))
    .map((point) => ({
    timestamp: new Date(point.bucket_start).getTime(),
    bucketStart: point.bucket_start,
    bucketEnd: point.bucket_end,
    flow: point.flow_avg_lps,
    flowMin: point.flow_min_lps,
    flowMax: point.flow_max_lps,
    volume: point.volume_m3,
    validatedVolume: point.validated_volume_m3 ?? point.volume_m3,
    discardedVolume: Number(point.discarded_volume_m3 || 0),
    discardedEvents: Number(point.discarded_totalizer_events || 0),
    discardedEventDetails: Array.isArray(point.discarded_totalizer_event_details) ? point.discarded_totalizer_event_details : [],
    hasDiscontinuities: Boolean(point.has_discontinuities),
    volumeReliable: Boolean(point.volume_reliable),
    samples: point.samples,
    dataStatus: point.data_status,
    tooltipAnchor: 0,
    }));
  const validTimestamps = data.map((point) => point.timestamp).filter(Number.isFinite);
  const spansMultipleDays = validTimestamps.length > 1
    ? new Date(Math.min(...validTimestamps)).toDateString() !== new Date(Math.max(...validTimestamps)).toDateString()
    : false;
  const showDots = data.length <= 24;
  const domainStart = data.length ? new Date(data[0].bucketStart).getTime() : 0;
  const domainEnd = data.length ? new Date(data[data.length - 1].bucketEnd).getTime() : 1;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 12, right: 28, bottom: 14, left: 8 }}>
        <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
        <XAxis
          dataKey="timestamp"
          type="number"
          scale="time"
          domain={[domainStart, domainEnd]}
          stroke={axisColor}
          tickFormatter={(value) => tickFormatter(Number(value), aggregation, spansMultipleDays)}
          minTickGap={28}
          padding={{ left: 18, right: 18 }}
        />
        <YAxis yAxisId="flow" stroke={axisColor} width={58} />
        <YAxis yAxisId="volume" orientation="right" stroke="#a855f7" width={58} />
        <Tooltip
          content={<WaterHistoryTooltip aggregation={aggregation} flowUnit={flowUnit} />}
          cursor={{ fill: 'rgba(56,189,248,0.05)' }}
          filterNull={false}
          offset={14}
          allowEscapeViewBox={{ x: false, y: false }}
          wrapperStyle={{ zIndex: 60, pointerEvents: 'none', maxWidth: 'calc(100vw - 32px)' }}
          isAnimationActive={false}
        />
        <Legend />
        <Line
          yAxisId="flow"
          type="linear"
          dataKey="tooltipAnchor"
          stroke="transparent"
          dot={false}
          activeDot={false}
          legendType="none"
          isAnimationActive={false}
        />
        <Bar
          yAxisId="volume"
          dataKey="volume"
          name="Volumen del intervalo (m³)"
          fill="#a855f7"
          maxBarSize={30}
          radius={[4, 4, 0, 0]}
        />
        <Line
          yAxisId="flow"
          type="linear"
          dataKey="flow"
          name={`Flujo promedio (${flowUnit})`}
          stroke="#14b8ff"
          strokeWidth={2.6}
          dot={showDots ? { r: 2.8 } : false}
          activeDot={{ r: 4 }}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
