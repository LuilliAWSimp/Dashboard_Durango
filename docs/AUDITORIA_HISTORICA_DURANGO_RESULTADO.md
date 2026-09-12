# Auditoria historica ARCA - Durango

Generado: 2026-08-31 13:18:55 (America/Mexico_City)
Ventana: `2026-08-04 18:16:00` a `2026-08-31 13:19:00` [fin exclusivo].

## Cortes conocidos

| Corte | Fecha local | Alcance |
|---|---|---|
| Corte general SCADA / inicio del segmento validado | 2026-08-04 18:16:00 | planta |
| Pozo 1 cambia de flujo raw m3/h a L/s | 2026-08-11 12:15:00 | pozo_1 |
| Jarabes cambia de TANQUE_FLOW_IN[4] / 3010 a TANQUE_FLOW_IN[1] / 3004 | 2026-08-11 13:40:29 | jarabes |

## Inicio y disponibilidad por elemento

| Elemento | Fuente | Primer registro | Primer flujo != 0 | Primer totalizador > 0 | Muestras |
|---|---|---|---|---|---:|
| Pozo 1 | iot.readings_minute | 2026-06-03 15:35:00 | 2026-06-03 16:01:00 | 2026-06-03 15:35:00 | 109063 |
| Pozo 2 | iot.readings_minute | 2026-06-03 15:35:00 | 2026-06-03 15:35:00 | 2026-06-03 15:35:00 | 109063 |
| Línea 1 | iot.readings_minute | 2026-06-03 15:35:00 | 2026-06-03 16:01:00 | 2026-06-03 15:35:00 | 107899 |
| Línea 3 | iot.readings_minute | 2026-06-03 15:35:00 | 2026-06-09 10:01:00 | 2026-06-03 15:35:00 | 107899 |
| Línea 4 | iot.readings_minute | 2026-06-03 15:35:00 | 2026-06-03 15:35:00 | 2026-06-03 15:35:00 | 107899 |
| Línea 5 | iot.readings_minute | 2026-06-03 15:35:00 | 2026-06-03 16:06:00 | 2026-06-03 15:35:00 | 107899 |
| Lavadora Línea 2 | iot.readings_minute | 2026-06-03 15:35:00 | 2026-06-03 15:47:00 | 2026-06-03 15:35:00 | 107899 |
| Lavadora Vidrio | dbo.SensorsBOS_Lavadoras | 2026-08-04 18:16:00 | 2026-08-17 11:51:00 | 2026-08-04 18:16:00 | 38489 |
| Lavadora Ref Pet | dbo.SensorsBOS_Lavadoras | 2026-08-04 18:16:00 | 2026-08-04 18:21:00 | 2026-08-04 18:16:00 | 38489 |
| Jarabes | dbo.SensorsBOS_Tanque | 2026-08-04 18:16:00 | 2026-08-04 18:16:00 | 2026-08-04 18:16:00 | 2309181 |

## Cobertura incompleta

Se listan dias con cobertura menor a 95.00% o sin registros.

## Interpretacion para la homologacion

- Inicio del segmento validado: `2026-08-04 18:16:00`.
- No relabelar ni mezclar datos anteriores al corte general de SCADA con el segmento validado posterior.
- Pozo 1: Antes del corte de calibracion dividir el flujo raw entre 3.6; desde el corte usar L/s directo.
- Jarabes: Conservar una identidad operativa y resolver el canal fisico por segmento temporal.
- Un dia sin registros debe conservarse como hueco; nunca convertirse en 0 m3.
- Un dia parcial debe conservar su porcentaje de cobertura cuando se use en comparativos o reportes.
