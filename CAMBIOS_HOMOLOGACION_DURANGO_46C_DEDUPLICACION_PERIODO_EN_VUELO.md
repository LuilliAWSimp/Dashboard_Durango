# 46C — Deduplificación de cálculo de periodo en vuelo

## Objetivo

Reducir trabajo SQL duplicado cuando dos endpoints del dashboard solicitan exactamente el mismo rango antes de que la primera consulta termine y alcance a llenar la caché.

## Cambio

- `get_period_data()` conserva la misma caché y los mismos TTL introducidos previamente.
- Se agregó un bloqueo independiente por rango de fechas.
- Si una solicitud ya está calculando, por ejemplo, `2026-09-28 → 2026-09-28`, una segunda solicitud para ese mismo rango espera la primera y reutiliza el resultado cacheado.
- Rangos distintos mantienen bloqueos distintos; no se serializa todo el dashboard.
- `force_refresh=True` conserva su semántica: después de obtener el turno del bloqueo vuelve a calcular y no reutiliza una respuesta anterior como resultado forzado.

## Caso que corrige

En Resumen pueden coincidir la solicitud principal del dashboard y la solicitud de Revisión Diaria/comparativos. Ambas terminan usando `get_period_data()` para el día actual. Antes podían ejecutar el mismo trabajo histórico simultáneamente si la caché aún no estaba lista.

## No se modificó

- Fórmulas de volumen o totalizador.
- Actividad, tiempo activo, cobertura o validación.
- Sensores, IDs, unidades o factores.
- Turnos.
- Consultas SQL ni su contenido.
- BOS/SCADA.
- Frontend, CSS, gráficas o reportes.
- TTL de la caché.

## Validación dirigida

- Dos solicitudes concurrentes del mismo rango ejecutan una sola carga SQL del periodo.
- Ambas reciben el mismo payload.
- La caché queda poblada una sola vez.
- `force_refresh=True` sigue recalculando.
- Se ejecutaron pruebas de periodo, Resumen, Revisión Diaria, servicios de agua, conciliación, totalizadores, calidad y rendimiento histórico.
- Resultado: 32/32 pruebas dirigidas aprobadas con `DB_MODE=sqlite`.
- `py_compile` aprobado para servicio y prueba nueva.
- No se realizaron consultas contra SQL Server/BOS.

## Pendiente separado

Se mantiene para el cierre la revisión del Histórico operativo global donde puede coexistir `ACTUALIZANDO COMPARATIVA...` con `NO FUE POSIBLE CONSULTAR EL HISTÓRICO OPERATIVO.` mientras permanece una gráfica previa visible. No forma parte de este incremental de rendimiento.
