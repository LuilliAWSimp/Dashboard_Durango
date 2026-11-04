-- DGO-V07B: diagnostico SQL Server SOLO LECTURA.
-- No crea indices, no modifica lecturas, BOS, triggers ni estructura.
-- Ejecutar manualmente en la base ARCA de Durango si el primer PDF mensual sigue tardando demasiado.
-- Devuelve indices con columnas, filtros, y estado para diagnosticar su utilidad.

USE [ARCA];
GO
SELECT
    SCHEMA_NAME(o.schema_id) AS esquema,
    o.name AS tabla,
    i.name AS indice,
    i.type_desc AS tipo_indice,
    i.is_disabled AS deshabilitado,
    i.has_filter AS es_filtrado,
    i.filter_definition AS filtro,
    ic.key_ordinal AS posicion_clave,
    ic.is_included_column AS columna_incluida,
    c.name AS columna
FROM sys.objects AS o
JOIN sys.indexes AS i ON i.object_id = o.object_id
JOIN sys.index_columns AS ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns AS c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE (SCHEMA_NAME(o.schema_id) = 'iot' AND o.name = 'readings_minute')
   OR (SCHEMA_NAME(o.schema_id) = 'dbo' AND o.name IN ('SensorsBOS_Lavadoras','SensorsBOS_Tanque'))
ORDER BY esquema, tabla, indice, ic.key_ordinal, ic.index_column_id;
GO

-- IMPORTANTE:
-- Un indice filtrado por quality IS NOT NULL no necesariamente ayuda a
-- consultas de todos los registros porque el reporte NO filtra por quality.
-- Si se requiere un indice adicional, primero revisar plan real y costo de
-- escritura del SCADA; no ejecutar CREATE INDEX automaticamente.
