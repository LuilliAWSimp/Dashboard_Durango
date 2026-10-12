# DGO-H06 — Diagnóstico y optimización acotada del PDF normal; controles del histórico de Resumen

**Planta:** Durango  
**Base:** H05 (con H04, H03, H02, H01 y C06 anteriores).  
**Motivo:** PDF **normal** de Reportes solicitado para el rango 2026-10-01 a 2026-10-12, con espera reportada superior a 6 minutos; no se probó el botón «PDF histórico». Gráfica del Resumen lenta y fechas poco integradas respecto a la referencia visual Las Fuentes.

## Cambios implementados

1. **PDF normal y Excel normal de Reportes:** la generación continúa en segundo plano usando la cola H01 (sin HTTP de minutos). Ahora los estados del trabajo identifican fases: periodo/lecturas, históricos, comparativos, construcción del documento y guardado. Se incluyen tiempos de espera y ejecución; **no son estimaciones de porcentaje**.
2. **Histórico del reporte:** se consultan los tres módulos físicos `flow`, `well`, `line` con un máximo de **2 trabajos simultáneos** en vez de tres consultas secuenciales. `washers` y `jarabes` se derivan de la misma respuesta `flow`: no se duplica BOS. Se preservan todos los intervalos, validaciones y contratos.
3. **Comparativos del reporte multidía:** periodo anterior y semana anterior, que son ventanas independientes, ahora se consultan simultáneamente pero también con máximo 2 trabajos. Si una consulta falla, mantiene la misma representación de ausencia de datos.
4. **Telemetría backend:** el servicio registra tiempos acumulados por etapa en los logs, sin credenciales ni SQL. Permite verificar si el cuello de botella está en lecturas/periodos, históricos, comparativos o PDF.
5. **Resumen — selector de fechas:** integra módulos, métricas, exportaciones, Desde, Hasta, Agrupación, Actualizar y Restablecer en una misma barra adaptable. Se conserva exactamente el comportamiento de los controles, límites del rango, métricas y formato de los datos.
6. **Resumen — cambios de pestaña:** caché de navegador **en memoria, no persistente**, máximo seis combinaciones y 45 segundos de frescura. Volver a una pestaña recién consultada evita una descarga repetida. **Actualizar, forzar actualización o el refresco automático no reutilizan** ese resultado, para seguir reflejando datos recientes.

## Diagnóstico de origen

La vista previa de Reportes usa `include_history=false` y `include_shifts=false`, mientras que el PDF normal realiza una consulta completa con históricos y turnos. Es incorrecto tomar el tiempo de la vista previa como tiempo de generación estimado del PDF. El motor también puede ejecutar validaciones físicas adicionales de totalizador, especialmente en rangos de hasta 31 días. **No se elimina ni omite esa validación**.

El PDF normal no utiliza el exportador «PDF histórico completo de planta»; este último no forma parte de H06.

## Verificación funcional dirigida en IPC

1. Aplicar solo los archivos contenidos en el ZIP sobre **H05**. Conservar `.env`, `auth.sqlite3`, `concessions.sqlite3`, directorio de documentos, WAL/SHM y credenciales.
2. Reiniciar backend; reconstruir frontend y recargar sin caché.
3. En **Reportes**, seleccionar `Periodo` 2026-10-01 a 2026-10-12 y pulsar Actualizar. Confirmar que la vista previa corresponde a ese rango.
4. Pulsar **Generar PDF** (no «PDF histórico»). Observar `Exportación en espera`, luego fase real de trabajo y tiempo procesado. El estado cambia cada 3 segundos. Confirmar que la descarga ocurre cuando el job termina y que no se marca éxito prematuramente.
5. Inspeccionar logs del backend por `DGO-H06 reporte` y separar los tiempos de periodo, histórico, comparativos y render; **reportar los segundos observados**. Si tarda más de 6 minutos, ahora queda localizable el tramo que lo está provocando.
6. Comparar nombres, volumen validado, calidad, fechas, comparativos, gráficas y contenido del PDF contra un informe de H05 del mismo rango (cuando exista una referencia confiable). Si la fecha incluye el día corriente, evitar comparar snapshots tomados en momentos diferentes sin registrar la hora.
7. Comprobar un informe de un día, Excel normal y PDF histórico completo (este último solo como prueba de regresión, no como parte del incidente original).
8. En **Resumen**, alternar Pozos/Líneas y volver: la combinación fresca debe mostrarse inmediatamente. Pulsar Actualizar y verificar que hace una consulta real. Confirmar barra de controles tanto en escritorio como móvil, oscuro y claro.

## Consideraciones

- Las consultas BOS todavía pueden ser lentas; H06 reduce consultas en serie y aporta diagnóstico, **pero no garantiza un tiempo máximo de generación** sin mediciones en la IPC real.
- Ejecutar hasta dos consultas pesadas simultáneamente exige verificar el consumo de CPU/IO de SQL Server/IPC; si esa carga resulta problemática, reducir concurrencia en una revisión posterior con métricas concretas.
- No se implementan nuevos índices SQL, cambios a sensores, modificaciones de cálculo, alarmas, cambios de autenticación, cambios en Concesiones ni cachés persistentes nuevas.
- La caché de pestañas es distinta de la caché persistente SQLite de **Concesiones**.
- No cerrar la pestaña antes de la descarga automática; los jobs siguen trabajando en el servidor por la cola H01.

## Pruebas locales

- Suite backend SQLite de pruebas: **230 tests + 6 subtests aprobados**.
- Suite frontend con Node: **220 tests aprobados**.
- Validación de compilación Python y sintaxis CSS correcta.
- TypeScript/Vite completo **no verificado**; en este entorno faltan `@types/node` y `vite/client` a pesar de existir parte de `node_modules`.
- No se ha medido la mejora de rendimiento frente al BOS real ni desplegado en la IPC.

## Archivos

- `backend/app/services/report_export_job_service.py`
- `backend/app/services/water_daily_report_service.py`
- `backend/tests/test_dgo_h06_report_performance.py`
- `frontend/src/pages/pozos/components/ModuleHistoryPanel.tsx`
- `frontend/src/pages/pozos/sections/ReportesSection.tsx`
- `frontend/src/styles/pages/historicos.css`
- `frontend/tests/visualAndReportsH06.test.ts`
- `docs/incrementales/DGO_H06_PDF_NORMAL_RENDIMIENTO_HISTORICO_RESUMEN.md`

**Commit sugerido:** `DGO-H06 | Optimizar y diagnosticar PDF normal y unificar controles del histórico`
