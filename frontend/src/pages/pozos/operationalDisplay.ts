export function displayOperationalState(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return 'Sin registros';

  const normalized = raw.toLowerCase();
  if (normalized.includes('apagado') || normalized.includes('sin flujo')) return 'Detenido';
  if (normalized.includes('operando') || normalized === 'activo' || normalized.includes('en operacion') || normalized.includes('en operación')) return 'En operación';
  return raw;
}

export function isNormalCommunication(value: unknown): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return normalized === 'normal'
    || normalized.includes('actualiz')
    || normalized.includes('en linea')
    || normalized.includes('en línea')
    || normalized.includes('online');
}
