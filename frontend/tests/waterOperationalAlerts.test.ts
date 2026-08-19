import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import {
  buildWaterAlertRoute,
  createOperationalAlertToastTracker,
  evaluateDurangoWaterAlerts,
} from '../src/pages/pozos/waterOperationalAlerts.ts';
import type { DashboardData, FlexibleRecord } from '../src/pages/pozos/types.ts';

function dashboard(items: Partial<Record<'wells' | 'production_lines' | 'flows', FlexibleRecord[]>>): DashboardData {
  return {
    wells: items.wells || [],
    production_lines: items.production_lines || [],
    flows: items.flows || [],
  };
}

function normal(overrides: FlexibleRecord = {}): FlexibleRecord {
  return {
    sensor_id: 2004,
    operational_key: 'lavadora_linea_2',
    name: 'Lavadora Línea 2',
    current_flow: 0,
    current_reading_available: true,
    communication_status: 'normal',
    communicationType: 'normal',
    reading_stale: false,
    validated_volume_m3: 0,
    has_discontinuities: false,
    last_update: '2026-08-07T11:00:00',
    ...overrides,
  };
}

test('flujo cero con lectura reciente y comunicación normal no genera alerta', () => {
  const alerts = evaluateDurangoWaterAlerts(dashboard({ flows: [normal()] }));
  assert.equal(alerts.length, 0);
});

test('Línea 3 con sensor 2006 en cero y muestras recientes no genera alerta', () => {
  const alerts = evaluateDurangoWaterAlerts(dashboard({
    production_lines: [normal({ sensor_id: 2006, operational_key: 'linea_3', name: 'Línea 3', current_flow: 0, samples_received: 60 })],
  }));
  assert.equal(alerts.length, 0);
});

test('Lavadora Vidrio con flujo cero y totalizador estable no genera alerta', () => {
  const alerts = evaluateDurangoWaterAlerts(dashboard({
    flows: [normal({ sensor_id: null, operational_key: 'lavadora_vidrio', name: 'Lavadora Vidrio', current_totalizer_m3: 100, period_open_m3: 100, period_close_m3: 100 })],
  }));
  assert.equal(alerts.length, 0);
});

test('reading_stale true genera alerta Lectura no reciente con edad normalizada', () => {
  const [alert] = evaluateDurangoWaterAlerts(dashboard({ flows: [normal({ reading_stale: true, reading_age_minutes: 38 })] }));
  assert.equal(alert?.code, 'stale_reading');
  assert.equal(alert?.title, 'Lectura no reciente');
  assert.match(alert?.message || '', /38 minutos/);
  assert.equal(alert?.severity, 'warning');
});

test('communication_status offline genera alerta crítica de comunicación', () => {
  const [alert] = evaluateDurangoWaterAlerts(dashboard({ flows: [normal({ communication_status: 'offline' })] }));
  assert.equal(alert?.code, 'no_communication');
  assert.equal(alert?.title, 'Sin comunicación');
  assert.equal(alert?.severity, 'critical');
});

test('current_reading_available false genera alerta crítica', () => {
  const [alert] = evaluateDurangoWaterAlerts(dashboard({ flows: [normal({ current_reading_available: false })] }));
  assert.equal(alert?.code, 'no_communication');
  assert.equal(alert?.severity, 'critical');
});

test('discontinuidades con volumen validado utilizable no generan alerta operativa por sí solas', () => {
  const alerts = evaluateDurangoWaterAlerts(dashboard({ flows: [normal({ has_discontinuities: true, validated_volume_m3: 12.4 })] }));
  assert.equal(alerts.length, 0);
});

test('totalizador inválido explícito y sin volumen validable genera alerta de volumen', () => {
  const [alert] = evaluateDurangoWaterAlerts(dashboard({ flows: [normal({ validated_volume_m3: null, totalizer_invalid: true })] }));
  assert.equal(alert?.code, 'volume_not_validable');
  assert.equal(alert?.title, 'Volumen no validable');
});

test('misma alerta activa durante varios refresh solo produce un toast nuevo', () => {
  const tracker = createOperationalAlertToastTracker();
  const [alert] = evaluateDurangoWaterAlerts(dashboard({ flows: [normal({ reading_stale: true, reading_age_minutes: 38 })] }));
  assert.equal(tracker.next([alert]).length, 1);
  for (let index = 0; index < 5; index += 1) assert.equal(tracker.next([alert]).length, 0);
});

test('alerta resuelta y recurrente vuelve a producir toast', () => {
  const tracker = createOperationalAlertToastTracker();
  const [alert] = evaluateDurangoWaterAlerts(dashboard({ flows: [normal({ reading_stale: true })] }));
  assert.equal(tracker.next([alert]).length, 1);
  assert.equal(tracker.next([]).length, 0);
  assert.equal(tracker.next([alert]).length, 1);
});

test('click de alerta Pozo 1 conserva ruta de detalle operativa', () => {
  const [alert] = evaluateDurangoWaterAlerts(dashboard({ wells: [normal({ sensor_id: 1001, operational_key: 'pozo_1', name: 'Pozo 1', communication_status: 'offline' })] }));
  const route = buildWaterAlertRoute(alert, { range: { startDate: '2026-08-07', endDate: '2026-08-07' }, aggregation: 'quarter_hour' });
  assert.equal(route, '/pozos/pozos/1001?start=2026-08-07&end=2026-08-07&aggregation=quarter_hour&source=well');
});

test('click de alerta Lavadora Vidrio usa operational_key no numérico', () => {
  const [alert] = evaluateDurangoWaterAlerts(dashboard({ flows: [normal({ sensor_id: null, operational_key: 'lavadora_vidrio', name: 'Lavadora Vidrio', communication_status: 'offline' })] }));
  const route = buildWaterAlertRoute(alert, { range: { startDate: '2026-08-07', endDate: '2026-08-07' }, aggregation: 'quarter_hour' });
  assert.equal(route, '/pozos/flujos/lavadora_vidrio?start=2026-08-07&end=2026-08-07&aggregation=quarter_hour&source=flow');
});

test('click de alerta Jarabes conserva la ruta separada de Jarabes', () => {
  const [alert] = evaluateDurangoWaterAlerts(dashboard({ flows: [normal({ sensor_id: 3004, operational_key: 'jarabes', name: 'Jarabes', communication_status: 'offline' })] }));
  const route = buildWaterAlertRoute(alert, { range: { startDate: '2026-08-07', endDate: '2026-08-07' }, aggregation: 'quarter_hour' });
  assert.equal(route, '/pozos/jarabes/3004?start=2026-08-07&end=2026-08-07&aggregation=quarter_hour&source=flow');
});

test('correo exitoso usa toast y no mensaje técnico SMTP', () => {
  const reports = readFileSync(new URL('../src/pages/pozos/sections/ReportesSection.tsx', import.meta.url), 'utf8');
  assert.match(reports, /title: 'Correo enviado correctamente'/);
  assert.match(reports, /setEmailOpen\(false\)/);
  assert.doesNotMatch(reports, /setEmailStatus\(result\.message/);
  assert.doesNotMatch(reports, /El servidor SMTP aceptó el correo para entrega/);
});

test('correo fallido conserva modal y muestra toast de error', () => {
  const reports = readFileSync(new URL('../src/pages/pozos/sections/ReportesSection.tsx', import.meta.url), 'utf8');
  assert.match(reports, /title: 'No se pudo enviar el correo'/);
  assert.match(reports, /Conservamos el formulario abierto/);
});
