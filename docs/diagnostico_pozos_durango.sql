/* Diagnóstico de solo lectura para Pozos Durango.
   Ejecutar en el servidor y base configurados para la planta.
   No modifica tablas, vistas, procedimientos ni datos. */

SELECT @@SERVERNAME AS servidor_actual, DB_NAME() AS base_actual, GETDATE() AS fecha_servidor;

SELECT
    sensor_id,
    MIN(COALESCE(ts_local, ts_minute, inserted_at)) AS primera_lectura,
    MAX(COALESCE(ts_local, ts_minute, inserted_at)) AS ultima_lectura,
    COUNT_BIG(*) AS muestras,
    SUM(CASE WHEN TRY_CONVERT(float, instant_value) IS NOT NULL THEN 1 ELSE 0 END) AS muestras_con_flujo,
    SUM(CASE WHEN TRY_CONVERT(float, total_value) IS NOT NULL AND TRY_CONVERT(float, total_value) > 0 THEN 1 ELSE 0 END) AS muestras_con_totalizador,
    MIN(CASE WHEN TRY_CONVERT(float, total_value) > 0 THEN TRY_CONVERT(float, total_value) END) AS totalizador_minimo,
    MAX(CASE WHEN TRY_CONVERT(float, total_value) > 0 THEN TRY_CONVERT(float, total_value) END) AS totalizador_maximo
FROM iot.readings_minute
WHERE sensor_id IN (1001, 1051)
GROUP BY sensor_id
ORDER BY sensor_id;

SELECT TOP (1) *
FROM dbo.SensorsBOS_Pozo
ORDER BY Time_Stamp DESC;

SELECT
    column_id,
    name AS columna_bos
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.SensorsBOS_Pozo')
  AND (name LIKE '%sensor_id%' OR name LIKE '%Time_Stamp%')
ORDER BY column_id;

/* Selecciona dinámicamente todas las columnas sensor_id disponibles, sin
   asumir si las posiciones BOS se numeran desde cero o desde uno. */
DECLARE @columnas nvarchar(max);
SELECT @columnas = STRING_AGG(QUOTENAME(name), ', ')
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.SensorsBOS_Pozo')
  AND name LIKE '%sensor_id%';
IF @columnas IS NOT NULL
BEGIN
    DECLARE @sql nvarchar(max) = N'SELECT TOP (20) Time_Stamp, ' + @columnas +
        N' FROM dbo.SensorsBOS_Pozo ORDER BY Time_Stamp DESC;';
    EXEC sys.sp_executesql @sql;
END;
