# 46D — Carga paralela segura de Resumen y periodo

## Objetivo

Reducir el tiempo de espera del primer cálculo fresco de KPIs/tablas sin cambiar datos, fórmulas ni frecuencia de actualización.

## Cambio

- El dashboard necesita dos fuentes independientes para construir una vista con periodo:
  1. fotografía operativa actual desde BOS;
  2. cálculo del periodo solicitado.
- Antes ambas se resolvían en serie: primero terminaba la fotografía actual y después comenzaba el cálculo del periodo.
- En refrescos automáticos/no forzados ahora ambas lecturas se inician en paralelo y se combinan únicamente cuando las dos han terminado.
- Cada lectura conserva su propia sesión SQLAlchemy y sus servicios existentes; no se mezclaron consultas ni se cambió ningún SQL.
- `force_refresh=True` conserva el comportamiento secuencial anterior para no aumentar la presión sobre SQL Server durante una actualización manual explícita.
- Si el periodo devuelve `WaterPeriodError`, se conserva el mismo contrato de `period_data`, `period_source_status` y `period_error`.
- Si la fotografía actual falla o no tiene datos, se conserva la misma respuesta vacía/error que existía antes.

## Qué se espera mejorar

En una carga fresca de Resumen, el tiempo total deja de ser aproximadamente la suma de:

`lectura actual + cálculo del periodo`

y pasa a acercarse al tiempo de la operación más lenta de las dos.

La mejora real depende de la latencia de SQL Server/BOS en planta. No se simuló ni alteró el origen de datos.

## No se modificó

- Fórmulas de volumen, flujo o totalizador.
- Actividad, tiempo activo, cobertura o validación.
- Sensores, IDs, operational keys, unidades o factores.
- Turnos.
- Contenido de las consultas SQL.
- Caché/TTL introducidos en 46B y deduplicación en vuelo de 46C.
- Frecuencia automática de 60 s.
- Frontend, CSS, gráficas, reportes o Balance.

## Validación dirigida

- Se agregó una prueba con barrera de sincronización que exige que fotografía actual y periodo hayan iniciado simultáneamente en refresco automático; una implementación secuencial falla esa prueba.
- Se verificó que `force_refresh=True` mantenga orden secuencial.
- Se verificó que una vista sin rango no solicite cálculo de periodo.
- Se ejecutaron pruebas de caché 46B, in-flight 46C, servicios hídricos, balance/concesión, rendimiento histórico, cambio SCADA, Jarabes/zonas horarias y validación física de totalizador.
- Resultado: 62/62 pruebas dirigidas aprobadas con `DB_MODE=sqlite`.
- `py_compile` aprobado para servicio y prueba nueva.
- No se realizaron consultas contra SQL Server/BOS.

## Pendientes separados para después de la optimización

1. Histórico operativo global: revisar el estado contradictorio donde puede mostrarse `ACTUALIZANDO COMPARATIVA...` junto con `NO FUE POSIBLE CONSULTAR EL HISTÓRICO OPERATIVO.` mientras permanece una gráfica previa.
2. Históricos por módulo/detalle: mostrar un indicador visible durante `Actualizar`, mantener la gráfica anterior, evitar doble clic y diferenciar carga/error/actualizado.
