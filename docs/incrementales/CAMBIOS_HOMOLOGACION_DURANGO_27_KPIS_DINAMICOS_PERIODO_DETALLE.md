# Incremental 27 — KPIs dinámicos del periodo en detalle

## Objetivo

Hacer que la cabecera y el resumen del detalle individual de Pozos, Líneas, Lavadoras y Jarabes utilicen el mismo rango y la misma serie histórica visible para sus indicadores de periodo, evitando mostrar valores de un rango anterior mientras se actualiza la consulta.

## Cambios

- Se agregó un resumen dinámico derivado del mismo dataset usado por `ModuleHistoryPanel`.
- El resumen calcula:
  - flujo promedio ponderado por muestras válidas;
  - volumen total del periodo como suma de `volume_m3` conciliado;
  - intervalo explícito desde el primer bucket real hasta el cierre del último bucket disponible.
- Los intervalos `future_interval` no participan en el resumen.
- `0` válido se conserva como cero y ausencia de volumen permanece `null`.
- La cabecera sustituye el KPI de volumen aislado por `Periodo seleccionado`, que muestra simultáneamente:
  - Flujo promedio;
  - Volumen bombeado/consumido del periodo según el módulo;
  - rango explícito del cálculo.
- Al cambiar rango, agrupación o restablecer, el KPI pasa a `Calculando…` antes de publicar el resultado nuevo.
- Al navegar a otro elemento, el resumen anterior se descarta y se valida la identidad del nuevo elemento.
- El `Flujo promedio` del bloque `Resumen del periodo` usa ahora el mismo resumen publicado por el histórico, evitando dos cálculos visibles potencialmente distintos.
- No se recalculan totalizadores ni volumen en frontend; sólo se agregan los `volume_m3` ya conciliados por backend.
- Los estilos nuevos viven en `frontend/src/styles/pages/detalles.css`.
- No se modificó `global.css`.
- No se modificó backend, SQL Server, BOS, sensores, IDs, factores, unidades, conciliación, endpoints, Reportes, Revisión diaria, Turnos, autenticación ni Balance de Agua.

## Validación dirigida

- `detailHistoryPeriodKpi27.test.ts`: 6 pruebas OK.
- Regresión seleccionada de incrementales 21–26, comparativa y arquitectura CSS: 43 pruebas OK.
- Total dirigido: 49 pruebas OK.
- Transpilación sintáctica TypeScript de los 5 archivos TS/TSX modificados: OK.
- Auditor de runtime: 81 archivos alcanzables, 62 de código, 18 CSS, 0 imports relativos sin resolver.
- No se ejecutaron suites completas.
- No se realizaron consultas SQL Server/BOS.

## Archivos modificados

- `frontend/src/pages/pozos/components/DetailHistoryPeriodMetric.tsx`
- `frontend/src/pages/pozos/components/ElementHistoryPanel.tsx`
- `frontend/src/pages/pozos/components/ModuleHistoryPanel.tsx`
- `frontend/src/pages/pozos/components/OperationalDetailSection.tsx`
- `frontend/src/pages/pozos/detailHistorySummary.ts`
- `frontend/src/styles/pages/detalles.css`
- `frontend/tests/detailHistoryPeriodKpi27.test.ts`
- `CAMBIOS_HOMOLOGACION_DURANGO_27_KPIS_DINAMICOS_PERIODO_DETALLE.md`
