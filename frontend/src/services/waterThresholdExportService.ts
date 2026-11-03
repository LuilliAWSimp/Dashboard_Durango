import api from './api';
import type { FlowThresholdBasis, FlowThresholdDirection, ThresholdConfig } from '../pages/pozos/flowThreshold';

export type ThresholdExportRequest = {
  module: 'well' | 'line' | 'flow';
  sensorId: number | string;
  startDate: string;
  endDate: string;
  aggregation: string;
  config: ThresholdConfig;
};

export async function downloadWaterThresholdDetail(format: 'pdf' | 'excel', request: ThresholdExportRequest): Promise<void> {
  const { module, sensorId, startDate, endDate, aggregation, config } = request;
  if (!config.enabled) throw new Error('Configura primero límites válidos para revisar umbrales.');
  const params: {
    module: string; sensor_id: string; start_date: string; end_date: string; aggregation: string;
    threshold_enabled: boolean; threshold_direction: FlowThresholdDirection;
    threshold_basis: FlowThresholdBasis; threshold_min_value?: number; threshold_max_value?: number;
  } = {
    module, sensor_id: String(sensorId), start_date: startDate, end_date: endDate, aggregation,
    threshold_enabled: true, threshold_direction: config.direction, threshold_basis: config.basis,
  };
  if (config.direction !== 'above' && config.minValue !== null) params.threshold_min_value = config.minValue;
  if (config.direction !== 'below' && config.maxValue !== null) params.threshold_max_value = config.maxValue;
  const response = await api.get<Blob>(`/water/history/detail/${format}`, { params, responseType: 'blob', timeout: 120_000 });
  const name = String(response.headers?.['content-disposition'] || '').match(/filename="?([^";]+)"?/i)?.[1]
    || `umbral-flujo-durango-${String(sensorId)}-${startDate}-${endDate}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
  const url = URL.createObjectURL(new Blob([response.data], { type: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  try {
    const element = document.createElement('a');
    element.href = url;
    element.download = name;
    document.body.appendChild(element);
    element.click();
    element.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
