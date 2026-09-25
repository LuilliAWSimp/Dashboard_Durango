# Línea base de runtime — Durango — Incremental 20

> Inventario técnico reproducible. No modifica SQL Server, BOS, sensores, cálculos ni comportamiento hidráulico.

## Entradas confirmadas

- Frontend Vite: `frontend/src/main.jsx`.
- Aplicación/ruteo: `frontend/src/App.jsx`.
- Backend FastAPI: `backend/app/main.py`.

## Resumen frontend alcanzable

- Archivos alcanzables desde `main.jsx`: **79**.
- Código JS/TS/JSX/TSX alcanzable: **60**.
- Hojas CSS alcanzables por imports: **18**.
- Imports relativos sin resolver: **0**.

### CSS cargado por el runtime

- `frontend/src/pages/pozos/components/styles/scheduled-report-email.css`
- `frontend/src/styles/global.css`
- `frontend/src/styles/pages/balance.css`
- `frontend/src/styles/pages/detalles.css`
- `frontend/src/styles/pages/historicos.css`
- `frontend/src/styles/pages/login.css`
- `frontend/src/styles/pages/operational-cards-details.css`
- `frontend/src/styles/pages/operational-modules.css`
- `frontend/src/styles/pages/reportes.css`
- `frontend/src/styles/pages/resumen.css`
- `frontend/src/styles/pages/revision-diaria.css`
- `frontend/src/styles/pages/session-controls.css`
- `frontend/src/styles/pages/shell.css`
- `frontend/src/styles/pages/turnos.css`
- `frontend/src/styles/pages/usuarios.css`
- `frontend/src/styles/shared.css`
- `frontend/src/styles/theme.css`
- `frontend/src/styles/tokens.css`

### Rutas declaradas en `App.jsx`

- `/login`
- `/`
- `/domains`
- `/electric`
- `/electric/:section`
- `/pozos`
- `/pozos/:section`
- `/pozos/:section/:itemId`
- `/:legacySection`
- `*`

## Pares JS/TS y JSX/TSX

La columna **runtime alcanzable** indica qué variante entra hoy en el grafo desde `main.jsx`; no autoriza todavía a borrar la otra variante.

| Familia | Archivos presentes | Runtime alcanzable |
|---|---|---|
| `components/BottleIcon` | `frontend/src/components/BottleIcon.jsx`<br>`frontend/src/components/BottleIcon.tsx` | — |
| `components/BrandLogo` | `frontend/src/components/BrandLogo.jsx`<br>`frontend/src/components/BrandLogo.tsx` | `frontend/src/components/BrandLogo.jsx` |
| `components/Charts` | `frontend/src/components/Charts.jsx`<br>`frontend/src/components/Charts.tsx` | — |
| `components/DataTable` | `frontend/src/components/DataTable.jsx`<br>`frontend/src/components/DataTable.tsx` | — |
| `components/Header` | `frontend/src/components/Header.jsx`<br>`frontend/src/components/Header.tsx` | `frontend/src/components/Header.jsx` |
| `components/KpiCard` | `frontend/src/components/KpiCard.jsx`<br>`frontend/src/components/KpiCard.tsx` | `frontend/src/components/KpiCard.jsx` |
| `components/PlantDashboardCard` | `frontend/src/components/PlantDashboardCard.jsx`<br>`frontend/src/components/PlantDashboardCard.tsx` | — |
| `components/PlantMultiSelector` | `frontend/src/components/PlantMultiSelector.jsx`<br>`frontend/src/components/PlantMultiSelector.tsx` | — |
| `components/PlantSelector` | `frontend/src/components/PlantSelector.jsx`<br>`frontend/src/components/PlantSelector.tsx` | — |
| `components/PlantsComparisonChart` | `frontend/src/components/PlantsComparisonChart.jsx`<br>`frontend/src/components/PlantsComparisonChart.tsx` | — |
| `components/Sidebar` | `frontend/src/components/Sidebar.jsx`<br>`frontend/src/components/Sidebar.tsx` | `frontend/src/components/Sidebar.jsx` |
| `data/circuits` | `frontend/src/data/circuits.js`<br>`frontend/src/data/circuits.ts` | — |
| `data/multiPlantMock` | `frontend/src/data/multiPlantMock.js`<br>`frontend/src/data/multiPlantMock.ts` | — |
| `data/pozosMock` | `frontend/src/data/pozosMock.js`<br>`frontend/src/data/pozosMock.ts` | — |
| `hooks/usePlants` | `frontend/src/hooks/usePlants.js`<br>`frontend/src/hooks/usePlants.ts` | — |
| `pages/DashboardPage` | `frontend/src/pages/DashboardPage.jsx`<br>`frontend/src/pages/DashboardPage.tsx` | — |
| `pages/DomainSelectionPage` | `frontend/src/pages/DomainSelectionPage.jsx`<br>`frontend/src/pages/DomainSelectionPage.tsx` | — |
| `pages/LinesOverviewPage` | `frontend/src/pages/LinesOverviewPage.jsx`<br>`frontend/src/pages/LinesOverviewPage.tsx` | — |
| `pages/LoginPage` | `frontend/src/pages/LoginPage.jsx`<br>`frontend/src/pages/LoginPage.tsx` | `frontend/src/pages/LoginPage.jsx` |
| `pages/MultiPlantDashboardPage` | `frontend/src/pages/MultiPlantDashboardPage.jsx`<br>`frontend/src/pages/MultiPlantDashboardPage.tsx` | — |
| `services/alertService` | `frontend/src/services/alertService.js`<br>`frontend/src/services/alertService.ts` | — |
| `services/api` | `frontend/src/services/api.js`<br>`frontend/src/services/api.ts` | `frontend/src/services/api.js` |
| `services/authService` | `frontend/src/services/authService.js`<br>`frontend/src/services/authService.ts` | `frontend/src/services/authService.js` |
| `services/dailyWaterReportExportService` | `frontend/src/services/dailyWaterReportExportService.js`<br>`frontend/src/services/dailyWaterReportExportService.ts` | `frontend/src/services/dailyWaterReportExportService.js` |
| `services/dashboardService` | `frontend/src/services/dashboardService.js`<br>`frontend/src/services/dashboardService.ts` | — |
| `services/exportService` | `frontend/src/services/exportService.js`<br>`frontend/src/services/exportService.ts` | — |
| `services/plantService` | `frontend/src/services/plantService.js`<br>`frontend/src/services/plantService.ts` | — |
| `services/waterExportService` | `frontend/src/services/waterExportService.js`<br>`frontend/src/services/waterExportService.ts` | `frontend/src/services/waterExportService.js` |
| `services/waterReportService` | `frontend/src/services/waterReportService.js`<br>`frontend/src/services/waterReportService.ts` | `frontend/src/services/waterReportService.js` |
| `services/waterService` | `frontend/src/services/waterService.js`<br>`frontend/src/services/waterService.ts` | `frontend/src/services/waterService.js` |

## Archivos frontend alcanzables

- `frontend/src/App.jsx`
- `frontend/src/assets/arca-logo.png`
- `frontend/src/components/BrandLogo.jsx`
- `frontend/src/components/Header.jsx`
- `frontend/src/components/KpiCard.jsx`
- `frontend/src/components/SessionCard.jsx`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/config/plant.ts`
- `frontend/src/config/plantCapabilities.ts`
- `frontend/src/hooks/autoRefreshCoordinator.ts`
- `frontend/src/hooks/useAutoRefresh.ts`
- `frontend/src/main.jsx`
- `frontend/src/pages/LoginPage.jsx`
- `frontend/src/pages/PozosDashboardPage.jsx`
- `frontend/src/pages/UsersPage.tsx`
- `frontend/src/pages/pozos/components/ChartEmptyState.tsx`
- `frontend/src/pages/pozos/components/DateRangeControls.tsx`
- `frontend/src/pages/pozos/components/FiveMinuteExcelExportButton.tsx`
- `frontend/src/pages/pozos/components/MetricPair.tsx`
- `frontend/src/pages/pozos/components/ModuleHistoryPanel.tsx`
- `frontend/src/pages/pozos/components/NotificationCenter.tsx`
- `frontend/src/pages/pozos/components/OperationalAlertsPanel.tsx`
- `frontend/src/pages/pozos/components/OperationalDetailSection.tsx`
- `frontend/src/pages/pozos/components/OperationalModuleSection.tsx`
- `frontend/src/pages/pozos/components/PanelHeader.tsx`
- `frontend/src/pages/pozos/components/ScheduledReportEmailPanel.tsx`
- `frontend/src/pages/pozos/components/ShiftConsumptionPanel.tsx`
- `frontend/src/pages/pozos/components/SqlChartDateControls.tsx`
- `frontend/src/pages/pozos/components/StatusBadge.tsx`
- `frontend/src/pages/pozos/components/WellsMinuteFlowPanel.tsx`
- `frontend/src/pages/pozos/components/styles/scheduled-report-email.css`
- `frontend/src/pages/pozos/dateUtils.ts`
- `frontend/src/pages/pozos/hooks/useSqlChartDashboard.ts`
- `frontend/src/pages/pozos/moduleComparison.ts`
- `frontend/src/pages/pozos/moduleComparisonCore.ts`
- `frontend/src/pages/pozos/operationalDisplay.ts`
- `frontend/src/pages/pozos/operationalNavigation.ts`
- `frontend/src/pages/pozos/operationalSectionConfig.ts`
- `frontend/src/pages/pozos/operationalTerminology.ts`
- `frontend/src/pages/pozos/sections/BalanceSection.tsx`
- `frontend/src/pages/pozos/sections/ConcesionSection.tsx`
- `frontend/src/pages/pozos/sections/DashboardBaseSection.tsx`
- `frontend/src/pages/pozos/sections/FlujosSection.tsx`
- `frontend/src/pages/pozos/sections/JarabesSection.tsx`
- `frontend/src/pages/pozos/sections/LineasSection.tsx`
- `frontend/src/pages/pozos/sections/PozosSection.tsx`
- `frontend/src/pages/pozos/sections/ReportesSection.tsx`
- `frontend/src/pages/pozos/sections/RevisionDiariaSection.tsx`
- `frontend/src/pages/pozos/sections/WellDetailSection.tsx`
- `frontend/src/pages/pozos/types.ts`
- `frontend/src/pages/pozos/waterOperationalAlerts.ts`
- `frontend/src/services/api.js`
- `frontend/src/services/authService.js`
- `frontend/src/services/dailyWaterReportExportService.js`
- `frontend/src/services/reportEmailScheduleService.ts`
- `frontend/src/services/waterExportService.js`
- `frontend/src/services/waterFiveMinuteExportService.ts`
- `frontend/src/services/waterHistoricalExportService.ts`
- `frontend/src/services/waterModuleHistoryExportService.ts`
- `frontend/src/services/waterReportService.js`
- `frontend/src/services/waterService.js`
- `frontend/src/styles/global.css`
- `frontend/src/styles/pages/balance.css`
- `frontend/src/styles/pages/detalles.css`
- `frontend/src/styles/pages/historicos.css`
- `frontend/src/styles/pages/login.css`
- `frontend/src/styles/pages/operational-cards-details.css`
- `frontend/src/styles/pages/operational-modules.css`
- `frontend/src/styles/pages/reportes.css`
- `frontend/src/styles/pages/resumen.css`
- `frontend/src/styles/pages/revision-diaria.css`
- `frontend/src/styles/pages/session-controls.css`
- `frontend/src/styles/pages/shell.css`
- `frontend/src/styles/pages/turnos.css`
- `frontend/src/styles/pages/usuarios.css`
- `frontend/src/styles/shared.css`
- `frontend/src/styles/theme.css`
- `frontend/src/styles/tokens.css`
- `frontend/src/types/index.ts`

## Literales API encontrados en código frontend alcanzable

- `/api/v1`
- `/auth/change-password`
- `/auth/login`
- `/auth/logout`
- `/auth/me`
- `/auth/setup-status`
- `/auth/users`
- `/report-email-schedules`
- `/water/history`
- `/water/history/five-minute/excel`
- `/water/history/module`
- `/water/history/module/pdf`
- `/water/reports/catalog`
- `/water/reports/daily`
- `/water/reports/daily/email`
- `/water/reports/daily/excel`
- `/water/reports/daily/pdf`
- `/water/review/daily`
- `/water/shifts`
- `/water/sources`
- `/water/sources/validate`
- `/water/wells/minute-flow`

## Routers montados por FastAPI

- `app.api.routes.auth`
- `app.api.routes.dashboard`
- `app.api.routes.export`
- `app.api.routes.email`
- `app.api.routes.plants`
- `app.api.routes.report_email_schedules`
- `app.api.routes.water`

### Rutas declaradas en routers montados

| Router | Método | Ruta local del router |
|---|---|---|
| `auth` | `GET` | `/me` |
| `auth` | `GET` | `/setup-status` |
| `auth` | `GET` | `/users` |
| `auth` | `PATCH` | `/users/{user_id}` |
| `auth` | `POST` | `/change-password` |
| `auth` | `POST` | `/login` |
| `auth` | `POST` | `/logout` |
| `auth` | `POST` | `/users` |
| `auth` | `POST` | `/users/{user_id}/reset-password` |
| `auth` | `POST` | `/users/{user_id}/revoke-sessions` |
| `dashboard` | `GET` | `/plant/{plant_id}/{section}` |
| `dashboard` | `GET` | `/{section}` |
| `email` | `POST` | `/report` |
| `export` | `GET` | `/plant/{plant_id}/{section}/{format_name}` |
| `export` | `GET` | `/{section}/{format_name}` |
| `plants` | `GET` | `/{plant_id}` |
| `report_email_schedules` | `DELETE` | `/{schedule_id}` |
| `report_email_schedules` | `GET` | `/{schedule_id}` |
| `report_email_schedules` | `GET` | `/{schedule_id}/runs` |
| `report_email_schedules` | `PATCH` | `/{schedule_id}` |
| `report_email_schedules` | `POST` | `/{schedule_id}/run-now` |
| `water` | `GET` | `/dashboard/{section}` |
| `water` | `GET` | `/history` |
| `water` | `GET` | `/history/five-minute/excel` |
| `water` | `GET` | `/history/module` |
| `water` | `GET` | `/reports/catalog` |
| `water` | `GET` | `/reports/daily` |
| `water` | `GET` | `/reports/daily/excel` |
| `water` | `GET` | `/reports/daily/pdf` |
| `water` | `GET` | `/reports/historical/excel` |
| `water` | `GET` | `/reports/historical/pdf` |
| `water` | `GET` | `/review/daily` |
| `water` | `GET` | `/shifts` |
| `water` | `GET` | `/sources` |
| `water` | `GET` | `/wells/minute-flow` |
| `water` | `POST` | `/history/module/pdf` |
| `water` | `POST` | `/reports/daily/email` |
| `water` | `POST` | `/sources/upload` |
| `water` | `POST` | `/sources/validate` |
| `water` | `POST` | `/sources/{source_id}/activate` |

## Imports relativos sin resolver

- Ninguno.

## Decisiones de esta línea base

1. No eliminar todavía pares `.js/.ts` o `.jsx/.tsx`; se canonizarán después de migrar las funciones modernas.
2. Para cambios funcionales inmediatos, seguir siempre el archivo que aparece como **runtime alcanzable**.
3. No retirar todavía routers backend heredados sólo por no verlos en la UI; su consumo se comprobará antes de la limpieza profunda.
4. `global.css` permanece congelado como base heredada; este incremental no agrega ni mueve estilos.
5. Esta línea base es el punto de comparación para los incrementales 21–44.

## Reproducción

```powershell
python .\tools\audit_runtime_baseline.py --write .\docs\RUNTIME_BASELINE_DURANGO_20.md
```

