# DGO-V07 — Reporte mensual completo sin truncamiento silencioso

**Base:** Dashboard Durango con DGO-V00 → DGO-V06 aplicados.
**Tipo:** Correctivo focalizado de lectura SQL y habilitación de exportación mensual PDF/Excel; NO rediseño de documentos.

## Hallazgo comprobado en el ZIP

- `water_period_service.query_readings_window` utilizaba un único `SELECT TOP (200000)` para Pozos y Líneas. Un mes completo puede exceder esa cifra en una consulta conjunta, con el riesgo de obtener solamente los primeros registros y un volumen incompleto sin error.
- `durango_lavadoras_service._query_rows` y `durango_jarabes_service._query_segment_rows` tenían topes equivalentes de 200000 filas por petición SQL.
- `water_daily_report_service.get_daily_water_report` permite rango calendario; para 28–31 días utiliza histórico agregado `daily`.
- Los históricos de agrupación diaria aceptan hasta 366 días; el Excel específico de 5 minutos tiene **otro límite** de 3 días, sin relación con el reporte mensual.
- Los formatos PDF/Excel de Reportes ya utilizan trabajos en segundo plano (`report_export_job_service`), con un único worker; no se reemplazó este mecanismo.
- La vista previa se consulta sincrónicamente con timeout del frontend. Previamente, si fallaba la vista previa del mes, no quedaba habilitada una exportación mensual con ese intervalo.

## Cambios implementados

1. `water_bounded_range.py` (nuevo): lector SQL por ventanas de hasta 7 días que respeta límites `[inicio, fin)` y, si una ventana alcanza su `TOP`, la subdivide hasta recuperar todas las filas. Si no es posible verificar la integridad incluso en la ventana mínima, **falla explícitamente**; nunca devuelve deliberadamente un resultado recortado.
2. Pozos/Líneas (`water_period_service.py`): lectura por ventanas con los mismos sensores, SQL, filtros, unidades y análisis de totalizadores que ya existían.
3. Lavadoras (`durango_lavadoras_service.py`) y Jarabes (`durango_jarabes_service.py`): protección idéntica contra truncamiento, sin modificar mapeos físicos ni el corte histórico del canal de Jarabes.
4. Reportes UI (`reportExportContract.ts`, `ReportesSection.tsx`): identifica un **mes calendario completo**, asigna el filtro solicitado aunque la vista previa exceda su timeout y permite iniciar **PDF/Excel en segundo plano**. Evita mostrar una vista previa anterior como si correspondiera al mes seleccionado. La vista HTML y el envío manual de correo conservan su contrato actual.
5. Pruebas: meses de 28, 29, 30 y 31 días; consultas que alcanzan un tope artificial; preservación de todos los registros y extremos; fallo explícito si no puede garantizarse integridad; permisos/exportaciones existentes.

## No se modificó

- **Diseño, formato, gráficas o tablas del PDF y Excel existente** (`build_daily_water_report_pdf`, `build_daily_water_report_excel`).
- Cálculos de volúmenes/totalizadores, factores, fechas operativas, sensores o mapeo físico de la planta.
- SQL Server, tablas, índices, triggers, BOS, datos de sensores, SQLite ni credenciales.
- Lógica de autenticación, roles, envío manual o programado de correos.
- Límites de históricos individuales ni el límite de 3 días para Excel de 5 minutos.

## Validación local sin acceso SQL de planta

- Pruebas dirigidas backend: 17 aprobadas (incluyen 6 nuevas).
- Suite backend completa: 255 aprobadas, **1 fallida preexistente** (`test_frontend_auth_contract` verifica una sintaxis antigua del sidebar posterior a V02).
- Pruebas dirigidas frontend: 13 aprobadas (incluyen 2 nuevas); suite completa: 260 aprobadas, **1 fallida preexistente** de caché histórica.
- Sintaxis Python comprobada con `compileall`; frontend con tests de contrato TS, sin compilación Vite porque no están instaladas las dependencias de node.
- No se ha accedido a la SQL Server real; **no están medidos** el tiempo de un mes completo, la memoria máxima, el rendimiento en concurrencia o la exactitud frente a lecturas de planta.

## Prueba de aceptación en planta

1. Respaldar el proyecto con V06 instalado. Aplicar V07 (raíz `backend/`, `frontend/`, `docs/`). Reiniciar el backend y reconstruir/reiniciar el frontend.
2. En **Reportes → Tipo: Periodo**, seleccionar Desde **01/10/2026** hasta **31/10/2026** (31 días completos). Pulsar **Actualizar**. Si no hay vista previa antes del timeout, debe seguir disponible generar **PDF/Excel** para **ese mismo rango**; verificar las fechas antes de descargar.
3. Generar PDF y Excel. Observar que el trabajo pasa por cola y termina en descarga, sin 422 por límite de días ni errores por truncamiento. No cerrar la pestaña durante la espera del archivo.
4. Abrir ambos archivos y verificar fechas de inicio/fin, módulos Pozos/Líneas/Lavadoras/Jarabes, presencia de lecturas y distinción entre cero real y ausencia de datos.
5. Contrastar por lo menos un pozo y una línea contra la suma de días válidos/totalizador consultado en SQL, respetando criterios de cobertura, reinicios y cambio de unidad en Pozo 1. **No asumir igualdad de sumas cuando existen huecos o reinicios**.
6. Revisar logs backend `DGO-H06 reporte` (etapas y segundos), tiempo total, RAM y CPU; repetir una vez para comparar el efecto de caché y comprobar que BOS sigue grabando. Si hay timeout real en SQL, será necesaria una optimización posterior basada en evidencia e índices reales, no un cambio de colores o un aumento ciego de timeouts.
7. Verificar que el reporte de un solo día y el correo programado siguen funcionando como antes.

## Límites de esta entrega

El lector ya **no recorta silenciosamente** las consultas alcanzadas por los tres TOP de 200000. Eso no equivale a una garantía de tiempo o capacidad en la IPC real: consultas mensuales de alto volumen pueden seguir demorando o fallar por timeout, memoria o ausencia de índices. Por ello, la generación mensual queda **implementada en código pero pendiente de prueba en planta**.

La exportación mensual PDF/Excel en segundo plano se habilita para un mes calendario exacto aun si la vista previa no responde; la exportación HTML y el envío manual por correo continúan siendo solicitudes síncronas y no se amplían en V07.

## Archivos

- `backend/app/services/water_bounded_range.py` (nuevo)
- `backend/app/services/water_period_service.py`
- `backend/app/services/durango_lavadoras_service.py`
- `backend/app/services/durango_jarabes_service.py`
- `backend/tests/test_dgo_v07_monthly_report_ranges.py` (nuevo)
- `frontend/src/pages/pozos/reportExportContract.ts`
- `frontend/src/pages/pozos/sections/ReportesSection.tsx`
- `frontend/tests/reportesPreview.test.ts`
- `frontend/tests/dgoV07MonthlyReports.test.ts` (nuevo)
- `docs/incrementales/DGO_V07_REPORTE_MENSUAL_LECTURA_COMPLETA.md` (nuevo)

**Commit sugerido:** `fix(durango): DGO-V07 proteger reportes mensuales contra truncamiento SQL`
