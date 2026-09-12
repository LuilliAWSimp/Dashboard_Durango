/*
  Auditoria historica de solo lectura - Planta Durango

  Objetivo:
  - confirmar inicio fisico por sensor;
  - primer flujo distinto de cero;
  - primer totalizador positivo;
  - cobertura diaria de iot.readings_minute;
  - detectar dias parciales.

  IMPORTANTE:
  Esta hoja no sustituye el script Python, porque Lavadoras y Jarabes tienen
  fuentes BOS y conversion UTC/local propias. No modifica ningun dato.
*/

SELECT @@SERVERNAME AS servidor_actual, DB_NAME() AS base_actual, GETDATE() AS fecha_servidor;

/* 1) Sensores historicos con identidad numerica en iot.readings_minute. */
SELECT
    sensor_id,
    MIN(COALESCE(ts_local, ts_minute, inserted_at)) AS PrimerRegistro,
    MAX(COALESCE(ts_local, ts_minute, inserted_at)) AS UltimoRegistro,
    COUNT_BIG(*) AS TotalRegistros,
    MIN(CASE
        WHEN TRY_CONVERT(float, instant_value) IS NOT NULL
         AND TRY_CONVERT(float, instant_value) <> 0
        THEN COALESCE(ts_local, ts_minute, inserted_at)
    END) AS PrimerFlujoNoCero,
    MIN(CASE
        WHEN TRY_CONVERT(float, total_value) IS NOT NULL
         AND TRY_CONVERT(float, total_value) > 0
        THEN COALESCE(ts_local, ts_minute, inserted_at)
    END) AS PrimerTotalizadorPositivo
FROM iot.readings_minute
WHERE sensor_id IN (
    1001, 1051,             -- Pozos
    2002, 2006, 2008, 2010, -- Lineas
    2004                    -- Lavadora Linea 2; fisicamente LINEA_FLOW_IN[1]
)
GROUP BY sensor_id
ORDER BY sensor_id;

/* 2) Cobertura diaria desde el corte general validado de SCADA. */
DECLARE @InicioLocal datetime2 = '2026-08-04T18:16:00';
DECLARE @FinLocal datetime2 = DATEADD(day, 1, CAST(GETDATE() AS date));

SELECT
    sensor_id,
    CAST(COALESCE(ts_local, ts_minute, inserted_at) AS date) AS Dia,
    COUNT_BIG(*) AS Registros
FROM iot.readings_minute
WHERE sensor_id IN (1001, 1051, 2002, 2004, 2006, 2008, 2010)
  AND COALESCE(ts_local, ts_minute, inserted_at) >= @InicioLocal
  AND COALESCE(ts_local, ts_minute, inserted_at) < @FinLocal
GROUP BY sensor_id, CAST(COALESCE(ts_local, ts_minute, inserted_at) AS date)
ORDER BY Dia, sensor_id;

/*
  3) Cortes conocidos que deben conservarse en cualquier homologacion:

  - 2026-08-04 18:16 local:
      corte general SCADA / inicio del segmento validado posterior.

  - 2026-08-11 12:15 local:
      Pozo 1 cambia de raw m3/h a L/s. Antes se normaliza /3.6.

  - 2026-08-11 19:40:29 UTC (13:40:29 local):
      Jarabes cambia de TANQUE_FLOW_IN[4] / 3010
      a TANQUE_FLOW_IN[1] / 3004.
*/
