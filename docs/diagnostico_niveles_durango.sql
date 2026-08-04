/* Diagnóstico de NIVELES_BOS para Planta Durango.
   Solo lectura. No activa el módulo ni modifica datos. */

SELECT
    CASE WHEN OBJECT_ID('dbo.NIVELES_BOS', 'U') IS NULL THEN 0 ELSE 1 END AS tabla_existe;

IF OBJECT_ID('dbo.NIVELES_BOS', 'U') IS NOT NULL
BEGIN
    SELECT
        c.column_id,
        c.name AS columna,
        TYPE_NAME(c.user_type_id) AS tipo,
        c.max_length,
        c.precision,
        c.scale
    FROM sys.columns AS c
    WHERE c.object_id = OBJECT_ID('dbo.NIVELES_BOS')
    ORDER BY c.column_id;

    SELECT TOP (1) *
    FROM dbo.NIVELES_BOS
    ORDER BY Time_Stamp DESC;
END;

/* Pendientes de validación fuera de SQL:
   - unidad real de cada columna;
   - altura mínima y máxima;
   - capacidad y geometría de cada depósito;
   - nombre operativo visible;
   - periodicidad esperada de actualización. */
