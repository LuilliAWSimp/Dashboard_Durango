# Incremental 44 — Limpieza de legado

## Objetivo

Retirar únicamente archivos demostrablemente fuera del runtime después de capabilities, CSS V2 y canonización JS/TS, sin modificar lógica operativa, hidráulica ni backend de producción.

## Resultado

- Se retiraron **36 archivos de código frontend** fuera del grafo runtime.
- Se retiraron además los dos auxiliares transitorios del Incremental 43 (`APLICAR_ELIMINACIONES_43.ps1` y `ELIMINAR_ARCHIVOS_INCREMENTAL_43.txt`).
- El frontend queda con **64 archivos JS/JSX/TS/TSX** y los **64 son alcanzables** desde `main.jsx`.
- Permanecen sólo dos archivos no runtime dentro de `frontend/src`: el logo ARCA consumido por el generador PDF backend y `styles/README.md` como documentación.
- `ConcesionSection` se retira físicamente; `concession: false` permanece como capability de planta.
- Concesión, Tanques, CIP, UV, Consumos y Electricidad ya no pueden reactivarse desde `runtimeCapabilities` porque no forman parte del mapa de secciones accesibles.
- Se conservan redirecciones de compatibilidad (`/domains`, `/electric` y legacy redirect) para no romper marcadores antiguos.

## Bloques retirados

- UI multipanta/eléctrica heredada: dashboards, selectores, mocks, cards y servicios antiguos.
- Histórico previo a V2: chart builders, tooltips, hooks y panel minuto a minuto reemplazados.
- Secciones deshabilitadas de Durango: CIP, Consumos, Tanques, UV y Concesión.
- Wrappers/servicios sin consumidor: `LineDetailSection`, `alertService`, `dashboardService`, `exportService`, `plantService`.

## Aplicación de borrados

El ZIP incluye `ELIMINAR_ARCHIVOS_INCREMENTAL_44.txt` y `APLICAR_ELIMINACIONES_44.ps1`. Después de copiar el incremental sobre la raíz del repositorio, ejecutar:

```powershell
powershell -ExecutionPolicy Bypass -File .\APLICAR_ELIMINACIONES_44.ps1
```

## Archivos eliminados

- `frontend/src/components/BottleIcon.tsx`
- `frontend/src/components/Charts.tsx`
- `frontend/src/components/DataTable.tsx`
- `frontend/src/components/PlantDashboardCard.tsx`
- `frontend/src/components/PlantMultiSelector.tsx`
- `frontend/src/components/PlantSelector.tsx`
- `frontend/src/components/PlantsComparisonChart.tsx`
- `frontend/src/data/circuits.ts`
- `frontend/src/data/multiPlantMock.ts`
- `frontend/src/data/pozosMock.ts`
- `frontend/src/hooks/usePlants.ts`
- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/pages/DomainSelectionPage.tsx`
- `frontend/src/pages/LinesOverviewPage.tsx`
- `frontend/src/pages/MultiPlantDashboardPage.tsx`
- `frontend/src/pages/pozos/chartBuilders.ts`
- `frontend/src/pages/pozos/components/ChartPeriodNote.tsx`
- `frontend/src/pages/pozos/components/ChartTooltip.tsx`
- `frontend/src/pages/pozos/components/FiveMinuteExcelExportButton.tsx`
- `frontend/src/pages/pozos/components/FlowChartOptions.tsx`
- `frontend/src/pages/pozos/components/ReportPreviewTable.tsx`
- `frontend/src/pages/pozos/components/WaterHistoryChart.tsx`
- `frontend/src/pages/pozos/components/WaterHistoryTooltip.tsx`
- `frontend/src/pages/pozos/components/WellsMinuteFlowPanel.tsx`
- `frontend/src/pages/pozos/hooks/useWaterHistory.ts`
- `frontend/src/pages/pozos/normalizers.ts`
- `frontend/src/pages/pozos/sections/CipSection.tsx`
- `frontend/src/pages/pozos/sections/ConsumosSection.tsx`
- `frontend/src/pages/pozos/sections/ConcesionSection.tsx`
- `frontend/src/pages/pozos/sections/LineDetailSection.tsx`
- `frontend/src/pages/pozos/sections/TanquesSection.tsx`
- `frontend/src/pages/pozos/sections/UvSection.tsx`
- `frontend/src/services/alertService.ts`
- `frontend/src/services/dashboardService.ts`
- `frontend/src/services/exportService.ts`
- `frontend/src/services/plantService.ts`
- `APLICAR_ELIMINACIONES_43.ps1`
- `ELIMINAR_ARCHIVOS_INCREMENTAL_43.txt`

## Validación

- Suite frontend completa: **185/185**.
- Parser TypeScript sobre los 64 archivos de código restantes: **0 errores sintácticos**.
- Auditor runtime: **83 archivos alcanzables**, **64 de código**, **18 CSS**, **0 imports relativos sin resolver**.
- Código frontend fuera del runtime: **0**.
- Backend contra Incremental 43: sin cambios.
- CSS contra Incremental 43: sin cambios.
- No se consultó SQL Server ni BOS.
