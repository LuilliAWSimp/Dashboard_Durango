# 46B - Cache de periodo estable para KPIs y tablas

## Objetivo
Reducir el tiempo de espera al navegar entre Resumen, Pozos, Lineas, Lavadoras y Jarabes sin modificar calculos, sensores ni reglas operativas.

## Problema encontrado
`get_period_data()` ya tenia TTL de 60 segundos para rangos que incluyen el dia actual, pero la clave de cache incluia tambien el minuto de `effective_end_at`.

Eso provocaba que una consulta realizada, por ejemplo, a las 09:43 y otra a las 09:44 usaran claves distintas aun cuando la primera respuesta siguiera dentro de su TTL. Al cambiar de seccion se podia volver a ejecutar la consulta historica del periodo y reconstruir KPIs/tablas innecesariamente.

## Cambio
- La identidad de cache del periodo queda basada solo en `start_date` y `end_date`.
- La frescura sigue controlada por los TTL ya existentes:
  - 60 s para rangos que incluyen hoy.
  - 10 min para periodos historicos cerrados.
- `force_refresh=True` conserva exactamente su comportamiento: ignora el cache y recalcula.
- No se cambia el contenido del payload ni las formulas de periodo.

## No se modifico
- SQL de lecturas.
- IDs o sensores.
- Totalizadores.
- Flujo.
- Volumen validado.
- Actividad y tiempo activo.
- Turnos.
- BOS.
- Frontend.
- Graficas o exportaciones.

## Validacion
Se agregaron pruebas para demostrar que:
1. Dos consultas del mismo rango que cruzan de un minuto al siguiente reutilizan el mismo resultado mientras el TTL sigue vigente.
2. Una actualizacion manual con `force_refresh=True` sigue recalculando y reemplazando el cache.
