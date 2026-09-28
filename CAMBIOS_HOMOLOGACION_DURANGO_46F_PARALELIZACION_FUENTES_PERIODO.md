# Durango 46F - Paralelización de fuentes del periodo

## Objetivo
Reducir el tiempo de la primera construcción de un periodo cuando todavía no existe una respuesta válida en caché, sin modificar fórmulas, sensores, rangos ni reglas de validación.

## Cambio aplicado
`water_period_service.get_period_data()` conserva el mismo contrato, pero la carga fría del periodo ya no consulta secuencialmente las tres familias de fuentes independientes.

Antes:
1. Pozos/Líneas desde `iot.readings_minute`.
2. Lavadoras desde `dbo.SensorsBOS_Lavadoras`.
3. Jarabes desde `dbo.SensorsBOS_Tanque`.

Ahora esas tres familias arrancan en paralelo mediante un `ThreadPoolExecutor` limitado a 3 workers. Cada familia continúa usando sus propias sesiones SQL y sus mismas funciones existentes. Al terminar, el resultado se ensambla de forma determinista en el mismo orden anterior: Pozos/Líneas, Lavadoras, Jarabes.

## Contratos conservados
- Mismos IDs y contratos de sensores.
- Mismos rangos locales y conversión horaria.
- Mismo corte SCADA de Durango.
- Mismo fallback BOS de pozos.
- Misma búsqueda de lectura previa.
- Misma conciliación de intervalos.
- Misma validación de totalizadores.
- Mismo cálculo de volumen, actividad, cobertura y calidad.
- Mismo orden final del payload.
- Misma caché 46B/46E y deduplicación en vuelo 46C.
- `force_refresh` conserva su semántica.

## Riesgo controlado
La optimización aumenta únicamente la concurrencia temporal de la carga fría del periodo hasta un máximo de tres familias independientes. No se comparte una sesión SQLAlchemy entre threads.

## Validación dirigida
- Nueva prueba que bloquea artificialmente las tres familias y verifica que las tres hayan iniciado antes de liberar cualquiera de ellas. Una implementación secuencial falla esa prueba.
- Nueva prueba que confirma que el ensamblado conserva el orden Lavadoras -> Jarabes después del bloque principal.
- Regresiones seleccionadas de caché 46B, deduplicación 46C, paralelismo 46D, refresco 46E, Revisión Diaria, Jarabes/timezones, corte SCADA, conciliación, calidad, totalizadores y servicios de agua.
- Resultado: 72/72 pruebas aprobadas.
- `py_compile` correcto.
- No se realizaron consultas reales a SQL Server/BOS durante la validación.

## Archivos modificados
- `backend/app/services/water_period_service.py`
- `backend/tests/test_durango_period_parallel_sources_46f.py`
- `CAMBIOS_HOMOLOGACION_DURANGO_46F_PARALELIZACION_FUENTES_PERIODO.md`
