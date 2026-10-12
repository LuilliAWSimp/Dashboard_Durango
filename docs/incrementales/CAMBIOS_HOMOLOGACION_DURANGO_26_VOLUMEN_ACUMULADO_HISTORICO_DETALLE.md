# Incremental 26 — Volumen por intervalo / acumulado progresivo

## Objetivo

Modernizar el histórico individual V2 para que el volumen pueda analizarse como valor de cada intervalo o como acumulado progresivo del rango, manteniendo `Sin datos != 0` y conservando paridad entre gráfica, tooltip y exportaciones visibles.

## Cambios

- El histórico individual abre por defecto en `Ambos`, mostrando Flujo + Volumen.
- Se agregó el selector `Volumen` con:
  - `Por intervalo`;
  - `Acumulado progresivo`.
- `Por intervalo` conserva el volumen conciliado de cada bucket como barras.
- `Acumulado progresivo` suma exclusivamente valores `volume_m3` numéricos válidos y se presenta como línea.
- Los buckets sin volumen válido permanecen como `null`; no se convierten a cero y la línea no conecta el hueco.
- Después de un hueco, el siguiente bucket válido continúa acumulando desde el total válido previo.
- Tooltip, Excel visible y PDF usan la misma representación seleccionada.
- Excel 5 min sigue siendo una exportación técnica independiente y no cambia su contrato.
- El comportamiento acumulado se limita al modo individual; Resumen y comparativas por módulo conservan su funcionamiento anterior.
- Se añadió tipado explícito de `volume_m3` al contrato frontend de puntos comparativos, sin alterar runtime ni backend.
- No se modificaron SQL Server, BOS, sensores, IDs, factores, conciliación, cálculos backend, endpoints, Reportes, Revisión diaria, Turnos, autenticación, Balance de Agua ni `global.css`.

## Validación dirigida

- `detailHistoryVolume26.test.ts`: 4 pruebas.
- Regresión seleccionada 21–25 + `moduleComparison` + arquitectura CSS: 39 pruebas.
- Total dirigido: 43 pruebas aprobadas.
- Transpilación sintáctica TypeScript dirigida de los archivos modificados: correcta.
- Auditor runtime: 79 archivos alcanzables, 60 de código, 18 CSS, 0 imports relativos sin resolver.
- `tsc` completo no se toma como validación del incremental porque el ZIP fuente no contiene todas las dependencias frontend y además conserva errores de tipado preexistentes fuera de este alcance.
- No se ejecutaron suites completas.
- No se realizaron consultas a SQL Server ni BOS.

## Archivos modificados

- `frontend/src/pages/pozos/components/ElementHistoryPanel.tsx`
- `frontend/src/pages/pozos/components/ModuleHistoryPanel.tsx`
- `frontend/src/pages/pozos/detailHistoryVolume.ts`
- `frontend/src/pages/pozos/moduleComparisonCore.ts`
- `frontend/tests/detailHistoryVolume26.test.ts`
- `CAMBIOS_HOMOLOGACION_DURANGO_26_VOLUMEN_ACUMULADO_HISTORICO_DETALLE.md`
