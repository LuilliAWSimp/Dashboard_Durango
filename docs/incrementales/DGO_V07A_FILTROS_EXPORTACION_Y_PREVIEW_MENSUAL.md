# DGO-V07A — Corrección de filtros PDF/Excel y timeout de vista previa mensual

**Fecha:** 03/11/2026  
**Base obligatoria:** Durango con V00 → V07 aplicado.  
**Naturaleza:** correctivo funcional; no modifica el diseño ni la estructura de los PDF/Excel.

## Incidencia reproducida por el usuario

- Selección visible: `01/10/2026` → `31/10/2026` en tipo **Periodo**.
- Al pulsar **Generar PDF** antes de Actualizar, el archivo correspondía al día que permanecía en `appliedFilters` (`03/11/2026`).
- Al pulsar Actualizar, el cliente HTTP de vista previa superaba `120000 ms`; el proceso de vista previa era síncrono y no utilizaba la cola de exportación.

## Causa

`ReportesSection.tsx` conservaba dos grupos de filtros: `draftFilters` (inputs visibles) y `appliedFilters` (último preview confirmado). `runExport` usaba `appliedFilters` incluso cuando los inputs ya mostraban otro período. V07 permitía exportar un mes sin preview solo tras intentar Actualizar, lo que no cubría el flujo real del usuario.

## Cambios

1. PDF y Excel se envían al worker con una **copia inmutable de los filtros visibles al momento del clic** (`requestedFilters`). No dependen de pulsar Actualizar.
2. Un rango de más de siete días **no solicita vista previa síncrona**: Actualizar simplemente confirma el período, muestra una nota breve y habilita la exportación en segundo plano.
3. Las respuestas tardías de un preview previo ya no pueden sustituir la vista actual. La UI oculta previews de períodos anteriores cuando los filtros cambiaron.
4. Se presenta junto a los controles el **período exacto seleccionado para PDF y Excel**.
5. El backend rechaza exportaciones PDF/Excel diarias sin `date` ni un par `start_date/end_date`; impide el fallback accidental a hoy.
6. El worker coteja el período calculado por `get_daily_water_report` con las fechas solicitadas **antes de construir y publicar** el archivo. Si difieren, el trabajo falla de forma explícita.
7. HTML conserva su operación para períodos cortos confirmados; los períodos extensos se dirigen a PDF/Excel. El correo manual continúa requiriendo una vista previa actual; las programaciones de correo no se alteran.
8. Se actualizaron cuatro pruebas de contrato antiguas que asumían que las exportaciones debían usar el último período aplicado, y se agregaron pruebas de fechas y validación del backend.

## Archivos del ZIP

- `frontend/src/pages/pozos/reportExportContract.ts`
- `frontend/src/pages/pozos/sections/ReportesSection.tsx`
- `frontend/src/styles/pages/reportes.css`
- `frontend/tests/dgoV07MonthlyReports.test.ts`
- `frontend/tests/dgoV07ASelectedPeriod.test.ts` **nuevo**
- `frontend/tests/exportContract39.test.ts`
- `frontend/tests/reportJobsH01.test.ts`
- `frontend/tests/reportesPreview.test.ts`
- `backend/app/services/report_export_job_service.py`
- `backend/tests/test_dgo_v07a_selected_period.py` **nuevo**
- `docs/incrementales/DGO_V07A_FILTROS_EXPORTACION_Y_PREVIEW_MENSUAL.md` **nuevo**

## Validación local

- Pruebas frontend completas: **263 aprobadas y 1 fallo heredado**. Único fallo: caché de histórico en prueba antigua, ajena a V07A.
- Pruebas backend completas con `DB_MODE=sqlite`: **258 aprobadas y 1 fallo heredado**, test que espera el JSX anterior a V02 para el menú de sesión.
- Pruebas dirigidas frontend: **11/11 aprobadas**.
- Pruebas dirigidas backend V07 y V07A: **9/9 aprobadas**.
- Parseo TS/TSX modificado: **0 errores de sintaxis** mediante TypeScript.
- Parseo CSS `reportes.css`: **0 errores** mediante tinycss2.
- Compilación `compileall` del servicio Python: **correcta**.
- No se ejecutó compilación integral Vite en este entorno (ZIP sin `node_modules`).
- No se probó contra SQL Server/BOS real: **no se certifica todavía que el worker termine exitosamente un mes completo** ni su duración.

## Instalación

1. Respaldar el proyecto Durango con V07 aplicado.
2. Extraer V07A en la raíz del proyecto; las carpetas `frontend/`, `backend/` y `docs/` deben coincidir directamente.
3. Reiniciar el backend y reconstruir/reiniciar el frontend; V07A modifica ambos.
4. Recargar el navegador con `Ctrl + Shift + R`.
5. Abrir Reportes → Periodo; seleccionar 01/10/2026 a 31/10/2026.
6. **Sin pulsar Actualizar**, pulsar Generar PDF; revisar que el documento informe octubre. Repetir con Excel.
7. Pulsar Actualizar con ese mismo mes: debe mostrar mensaje de vista previa omitida, **sin efectuar solicitud HTTP pesada de preview**.
8. Revisar el estado de trabajo y anotar tiempo de proceso. Si el worker falla, revisar logs del backend; no asumir que los volúmenes son completos.

## No modificado

- SQL Server, BOS, sensores, cortes, unidades, conversiones o cálculos.
- Contenido/maquetación del reporte PDF y Excel.
- Históricos, concesiones, usuarios y correo programado.

## Otra observación de la captura

El estado **`El servidor SMTP rechazó uno o más destinatarios`** del correo programado es independiente del bug de exportación; requiere revisión de destinatarios/configuración SMTP y no se modificó en V07A.

**Commit sugerido:** `fix(durango): DGO-V07A exportar periodo seleccionado y omitir preview mensual`.
