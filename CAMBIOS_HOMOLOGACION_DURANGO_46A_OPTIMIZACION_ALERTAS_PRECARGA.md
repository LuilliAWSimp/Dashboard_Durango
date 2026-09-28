# Incremental 46A — Optimización de arranque: alertas reutilizan precarga y caché

## Objetivo

Eliminar una consulta redundante al abrir el dashboard y evitar que el polling automático de alertas invalide la caché de la lectura operativa actual.

## Cambios

- `NotificationCenter` deja de enviar `force_refresh=true` al consultar `/water/dashboard/dashboard` para alertas.
- La consulta de alertas conserva exactamente el mismo contrato de lectura actual utilizado por la precarga:
  - `include_history=false`
  - `include_energy_water=false`
- Al terminar la precarga inicial, el centro de alertas puede reutilizar la respuesta que ya se encuentra en la caché frontend de `waterService` en vez de provocar una segunda llamada inmediata.
- El refresco automático de alertas sigue activo con la misma cadencia global; únicamente deja de saltarse la caché.
- La actualización manual del dashboard continúa siendo la operación que puede forzar datos frescos mediante `force_refresh=true`.

## No se tocó

- backend.
- SQL Server ni BOS.
- IDs, sensores, nombres, unidades ni factores.
- totalizadores, flujo, volumen ni reglas de actividad.
- evaluación o contenido de las alertas.
- frecuencia global de auto-refresh.
- históricos, Reportes, Revisión diaria o Balance.
- CSS, responsive o modo claro/oscuro.

## Resultado esperado

- Al abrir Durango, la precarga y el centro de alertas ya no deben producir dos lecturas actuales consecutivas del mismo endpoint.
- Las alertas deben aparecer exactamente igual que antes.
- Los datos visibles y sus cálculos no deben cambiar.

## Validación dirigida

- 31/31 pruebas aprobadas en:
  - `optimization46A.test.ts`
  - `waterOperationalAlerts.test.ts`
  - `historyPerformance29.test.ts`
  - `autoRefreshCoordinator.test.ts`
- Se verificó que las alertas conservan su evaluación y sus rutas.
- Se verificó que el coordinador global mantiene un único intervalo de 60 s y pausa por pestaña oculta.
- Se verificó que la actualización manual del dashboard conserva `force_refresh=true`.
- No se ejecutaron suites completas.
- No se realizaron consultas a SQL Server ni BOS.
