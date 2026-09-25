# Incremental 23 — Histórico unificado por módulos

## Objetivo

Hacer que Pozos, Líneas, Lavadoras y Jarabes reutilicen exactamente el mismo motor histórico del Resumen, con el módulo físico bloqueado según la sección y con rango histórico independiente del periodo operativo general de la pantalla.

## Cambios

- `ModuleHistoryPanel` incorpora `fixedView` para bloquear una vista física del histórico común sin crear otro motor.
- Las vistas disponibles siguen siendo:
  - Pozos -> backend `well`;
  - Líneas -> backend `line`;
  - Lavadoras -> backend `flow`, filtrado a las lavadoras confirmadas;
  - Jarabes -> backend `flow`, filtrado al elemento Jarabes.
- `OperationalModuleSection` usa el mismo componente histórico para todas las secciones.
- El histórico de cada sección ahora tiene rango independiente `Desde/Hasta`, `Actualizar` y `Restablecer`.
- La agrupación del histórico deja de modificar la agrupación general de cards/KPIs/turnos de la página.
- Las exportaciones visibles conservan el nombre físico de la sección:
  - Lavadoras exporta como Lavadoras;
  - Jarabes exporta como Jarabes;
  - ya no se presentan como el genérico `Flujos` sólo porque ambos usan el contrato backend `flow`.
- El selector de módulo se oculta cuando el histórico está bloqueado dentro de una sección.
- El Resumen conserva el selector global Pozos/Líneas/Lavadoras/Jarabes del Incremental 21.
- El detalle individual se conserva sin cambios para abordarlo en el Incremental 25.

## Sin cambios

- SQL Server.
- BOS.
- Sensores, IDs, factores y unidades.
- Cálculos de flujo, totalizador, volumen o conciliación.
- Endpoints backend.
- Polling común.
- Revisión diaria.
- Turnos.
- Reportes.
- Balance de Agua.
- Autenticación.
- Hojas CSS.
- `global.css`.

## Validación dirigida

- `moduleHistoryReuse23.test.ts`: 5 pruebas OK.
- regresión `operationalHistoryGlobal21.test.ts`: 5 pruebas OK.
- regresión `redundantWellsHistoryRemoval22.test.ts`: 3 pruebas OK.
- regresión `moduleComparison.test.ts`: 8 pruebas OK.
- regresión `css-architecture.test.ts`: 8 pruebas OK.
- Total dirigido: 29 pruebas OK.
- Auditor runtime: 78 archivos alcanzables, 59 de código, 18 CSS, 0 imports relativos sin resolver.
- Validación sintáctica dirigida de los TS/TSX modificados mediante TypeScript `transpileModule`: OK.
- `npm run typecheck` no puede completarse en este ZIP porque faltan las definiciones instaladas `@types/node` y `vite/client` en `node_modules`.
- No se ejecutaron suites completas.

## Archivos modificados

- `frontend/src/pages/pozos/components/ModuleHistoryPanel.tsx`
- `frontend/src/pages/pozos/components/OperationalModuleSection.tsx`
- `frontend/tests/moduleHistoryReuse23.test.ts`
- `frontend/tests/operationalHistoryGlobal21.test.ts`
- `frontend/tests/redundantWellsHistoryRemoval22.test.ts`
- `frontend/tests/css-architecture.test.ts`
- `CAMBIOS_HOMOLOGACION_DURANGO_23_HISTORICO_UNIFICADO_MODULOS.md`
