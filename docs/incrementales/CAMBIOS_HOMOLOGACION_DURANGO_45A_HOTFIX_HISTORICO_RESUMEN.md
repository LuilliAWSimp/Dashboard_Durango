# Incremental 45A — Hotfix histórico de Resumen

## Motivo

El dashboard podía quedar en pantalla vacía al montar `ModuleHistoryPanel` con:

`ReferenceError: inclusiveHistoryRangeDays is not defined`.

El componente utilizaba `inclusiveHistoryRangeDays` y `HISTORY_MAX_RANGE_DAYS`, ambos definidos en `historyRangePolicy.ts`, pero no los importaba.

## Cambio

- Se importan explícitamente `inclusiveHistoryRangeDays` y `HISTORY_MAX_RANGE_DAYS` desde `../historyRangePolicy`.
- No cambia la política 1/7/31/366 días ni la lógica de agrupación; sólo se corrige la referencia runtime.
- Se agrega una prueba de regresión que exige el import de ambos símbolos usados por `ModuleHistoryPanel`.

## Alcance

No se modifica backend, SQL Server, BOS, sensores, cálculos, CSS, capacidades, reportes, turnos ni autenticación.

## Validación

- Pruebas focales de histórico/rangos: 20/20.
- Suite frontend completa: 186/186.
- Auditor runtime: 83 alcanzables, 64 de código, 18 CSS, 0 imports relativos sin resolver.
- Backend sin diferencias respecto al Incremental 45.
- CSS sin diferencias respecto al Incremental 45.
