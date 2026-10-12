# Incremental 22 — Retiro de gráfica histórica redundante de Pozos

## Objetivo

Dejar en el Resumen una sola herramienta histórica: el Histórico operativo global V2 incorporado en el Incremental 21. La gráfica específica `WellsMinuteFlowPanel`, que repetía la consulta minuto a minuto de Pozos, deja de formar parte del runtime.

## Cambios

- Se retiró de `DashboardBaseSection.tsx` el import de `WellsMinuteFlowPanel`.
- Se retiró el render de `<WellsMinuteFlowPanel />` del Resumen.
- El Resumen conserva `ModuleHistoryPanel` como único histórico operativo global.
- El histórico global mantiene la agrupación `1 minuto`, por lo que la capacidad funcional de consulta minuto a minuto queda cubierta por el componente común.
- Se actualizó la prueba contractual del Incremental 21 para que ya no espere la segunda gráfica.
- Se añadió una prueba específica del Incremental 22 que verifica que:
  - el Resumen contiene el histórico global;
  - `WellsMinuteFlowPanel` no se importa ni renderiza;
  - el histórico global conserva `1 minuto` y Pozos.
- La auditoría reproducible del runtime pasa de 79 a 78 archivos alcanzables y confirma que `WellsMinuteFlowPanel.tsx` dejó de formar parte del grafo desde `main.jsx`.

## Alcance deliberadamente conservador

El archivo fuente `WellsMinuteFlowPanel.tsx`, su función cliente `fetchWellsMinuteFlow` y el endpoint backend `/water/wells/minute-flow` permanecen físicamente por ahora. Ya no tienen consumidor desde el Resumen, pero su eliminación definitiva se reserva para la limpieza profunda de legado, cuando se auditen posibles consumidores externos y se pueda retirar el contrato completo sin mezclarlo con este cambio visual/funcional.

No se modificó SQL Server, BOS, sensores, IDs, factores, unidades, cálculos hidráulicos, conciliación, endpoints backend, Reportes, Revisión diaria, Turnos, autenticación, Balance de Agua ni hojas CSS. `global.css` no fue modificado.

## Validación dirigida

- `redundantWellsHistoryRemoval22.test.ts`: 3 pruebas OK.
- Regresión `operationalHistoryGlobal21.test.ts`: 5 pruebas OK.
- Regresión `css-architecture.test.ts`: 8 pruebas OK.
- Total dirigido: 16 pruebas OK.
- Auditor runtime: 78 archivos alcanzables, 59 archivos de código, 18 CSS, 0 imports relativos sin resolver.
- `WellsMinuteFlowPanel.tsx`: no alcanzable desde `main.jsx`.
- `npm run build`: no ejecutable en este entorno porque el `node_modules` disponible no contiene el binario local `vite`.
- No se ejecutaron suites completas.

## Archivos modificados

- `frontend/src/pages/pozos/sections/DashboardBaseSection.tsx`
- `frontend/tests/operationalHistoryGlobal21.test.ts`
- `frontend/tests/redundantWellsHistoryRemoval22.test.ts`
- `CAMBIOS_HOMOLOGACION_DURANGO_22_RETIRO_GRAFICA_POZOS_REDUNDANTE.md`
