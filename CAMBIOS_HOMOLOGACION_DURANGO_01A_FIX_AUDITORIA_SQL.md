# Durango - Homologacion 01A - Fix auditoria SQL BOS

## Problema corregido

La auditoria historica fallaba en SQL Server al agrupar las tablas BOS (`SensorsBOS_Lavadoras` y potencialmente `SensorsBOS_Tanque`) con una expresion parametrizada `DATEADD(minute, :offset_minutes, Time_Stamp)` repetida en `SELECT` y `GROUP BY`.

ODBC transforma los parametros en marcadores separados (`?`) y SQL Server puede interpretar ambas expresiones como distintas, provocando el error 8120 sobre `Time_Stamp`.

## Solucion

La fecha operativa normalizada se calcula una sola vez dentro de un CTE `normalized`. La consulta exterior agrupa por la columna ya calculada `reading_day`.

Se aplica el mismo patron a:

- `dbo.SensorsBOS_Lavadoras`
- `dbo.SensorsBOS_Tanque` para los segmentos historicos de Jarabes

## Alcance

No cambia sensores, mapeos, fechas de corte, calculos hidraulicos, configuracion SQL Server ni autenticacion. Solo corrige las consultas de cobertura de la herramienta de auditoria de solo lectura.

## Prueba

Desde `backend`:

```powershell
python -m app.scripts.audit_water_history
```

O para generar Markdown:

```powershell
python -m app.scripts.audit_water_history --markdown ../docs/AUDITORIA_HISTORICA_DURANGO_RESULTADO.md
```
