# Incremental 25 — Histórico individual V2

## Objetivo

Separar el histórico de una card individual del histórico comparativo por módulo sin duplicar el motor matemático ni perder exportaciones.

## Cambios

- `ElementHistoryPanel.tsx` deja de ser la implementación histórica antigua y pasa a ser el componente dedicado del detalle individual.
- El nuevo componente reutiliza `ModuleHistoryPanel` como motor común, pero en modo `singleElement`.
- El detalle de Pozos, Líneas, Lavadoras y Jarabes usa ahora `ElementHistoryPanel` en lugar de montar `ModuleHistoryPanel` directamente.
- Se conserva la identidad física de la vista mediante `fixedView`:
  - Pozos -> `well`;
  - Líneas -> `line`;
  - Lavadoras -> `washers`;
  - Jarabes -> `jarabes`.
- Se conservan las exportaciones dentro del histórico individual:
  - Excel de la vista;
  - Excel 5 min;
  - PDF.
- Se conservan las agrupaciones:
  - 1 minuto;
  - 15 minutos;
  - 1 hora;
  - 1 día.
- En modo individual se ocultan los controles redundantes de selección/deselección de elementos.
- Se elimina del rango del detalle el segundo botón `Excel 5 min`, evitando que aparezca duplicado después del Incremental 24.
- El rango superior del detalle continúa gobernando indicadores, histórico y cortes del mismo elemento.
- No se modificó backend, SQL Server, BOS, sensores, IDs, factores, unidades, conciliación, Reportes, Revisión diaria, Turnos, autenticación, Balance ni `global.css`.

## Validación dirigida

- `elementHistory25.test.ts`: 5 pruebas OK.
- regresión `moduleHistoryExports24.test.ts`: 5 pruebas OK.
- regresión `moduleHistoryReuse23.test.ts`: 5 pruebas OK.
- regresión `operationalHistoryGlobal21.test.ts`: 5 pruebas OK.
- regresión `redundantWellsHistoryRemoval22.test.ts`: 3 pruebas OK.
- regresión `css-architecture.test.ts`: 8 pruebas OK.
- total frontend dirigido: 31 pruebas OK.
- auditor runtime: 78 archivos alcanzables, 59 de código, 18 CSS, 0 imports relativos sin resolver.
- transpilación sintáctica TypeScript de los 3 TSX modificados: OK.
- `npm run typecheck`: no completa por dependencias faltantes del ZIP fuente (`@types/node` y `vite/client`).
- No se ejecutaron suites completas.
- No se realizaron consultas a SQL Server ni BOS.
