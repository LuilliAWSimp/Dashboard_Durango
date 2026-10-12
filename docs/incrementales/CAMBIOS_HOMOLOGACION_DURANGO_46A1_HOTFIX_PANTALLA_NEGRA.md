# Durango 46A1 - Hotfix de estabilidad de secciones e historico

## Objetivo

Corregir dos referencias de frontend que podian provocar una excepcion de JavaScript y dejar el area principal del dashboard en negro al navegar o aplicar rangos del historico.

## Cambios

- `OperationalModuleSection.tsx`
  - Se define `periodMessage(row)` que ya era invocada por la tabla operativa.
  - La funcion no recalcula actividad ni modifica reglas de negocio: muestra `period_activity` y usa `activity` como fallback, ambos campos ya entregados por el contrato existente.
  - Si ambos campos vienen vacios, muestra `—` en lugar de lanzar una excepcion.

- `ModuleHistoryPanel.tsx`
  - Se agrega la importacion faltante de `supportedHistoryAggregation` desde `historyRangePolicy.ts`.
  - Se conserva sin cambios la politica existente para 1 min / 15 min / 1 h / 1 dia y sus limites por rango.

- `stability46A1.test.ts`
  - Cobertura dirigida para evitar que vuelvan a quedar referencias sin definir en estos dos puntos.
  - Verifica que la actividad se tome de los campos ya existentes y que la politica de agrupacion conserve sus reglas actuales.

## Alcance

No se modifico:

- backend;
- SQL Server;
- BOS;
- sensores o IDs;
- formulas de volumen, flujo o totalizador;
- turnos;
- reglas de actividad;
- reglas de alertas;
- frecuencias de refresco;
- reportes;
- Balance;
- CSS o estilos.

## Validacion dirigida

Se ejecutaron pruebas enfocadas en:

- hotfix 46A1;
- regresion del hotfix 45A del historico;
- presentacion operativa;
- estados operativos;
- optimizacion 46A previa.

Resultado: **13/13 pruebas aprobadas**.

Tambien se ejecuto TypeScript para comprobar especificamente las dos referencias corregidas. Ya no aparecen errores `Cannot find name 'periodMessage'` ni `Cannot find name 'supportedHistoryAggregation'`.

El typecheck global conserva otros errores anteriores y no relacionados con este hotfix; no se corrigieron en este incremental para evitar mezclar alcance.
