# DGO-H02 — Revisión de umbrales en el histórico individual de Durango

**Base obligatoria:** Dashboard Durango con DGO-C01…C06 y DGO-H01 aplicado.  
**Referencia documental:** Guía Maestra Única ARCA V2 (12/10/2026), contrato J19, capítulo 14.7.  
**Tipo de entrega:** incremental: solo archivos modificados o agregados, sin DB ni proyecto completo.

## Qué cambió

- El histórico **individual** (detalle de Pozos, Líneas, Lavadoras o Jarabes que tengan flujo) presenta una opción apagada por defecto: `Revisar umbrales`.
- Cuando se activa, permite sentido `below`, `above`, `both`, criterio `extreme` (Mín/Máx) o `average` (Promedio), y límites en **L/s**.
- El resumen enumera buckets infractores, bajo mínimo, sobre máximo, dentro de rango y sin lectura; en modo ambos un bucket puede contarse en los dos sentidos.
- Las líneas horizontales se dibujan en el eje de **flujo**, no en el eje de volumen/totalizador.
- En el tooltip individual se añade el estado del umbral por intervalo.
- Cuando la revisión está activada y los límites son válidos, PDF y Excel individuales se generan en el **backend** consultando el histórico individual del sensor y aplicando el mismo evaluador; no se aceptan buckets/diagnósticos provenientes del navegador.
- PDF nativo: gráfica de flujo, líneas de referencia, resumen, tabla por intervalo con fecha de inicio/fin, promedio, extremos, volumen confiable, cierre de totalizador, muestras y estado, resaltando incidencias.
- XLSX nativo: mismo resumen y detalle; valores no confiables en blanco y celdas numéricas reales; filtros, inmovilización y formato de impresión.

## No cambia

- Histórico global de Resumen o histórico operativo **por módulo**: sin filtros de umbral.
- Excel 5 min, que continúa siendo una exportación técnica separada.
- Históricos BOS, SQL Server, sensores, reglas de calidad y reconciliación, totalizadores, datos y cachés SQLite, Concesiones, usuarios, CSRF o roles.
- Si `Revisar umbrales` permanece apagado, Excel visible (.xls) y PDF previo conservan su flujo anterior.
- No hay alarmas SCADA, notificaciones ni límites guardados permanentemente.

## Contrato

`GET /api/v1/water/history/detail/pdf` y `GET /api/v1/water/history/detail/excel`, autenticados, con:

```text
module = well | line | flow
sensor_id = ID real o clave operativa reconocida por el contrato de la planta
start_date / end_date = YYYY-MM-DD
aggregation = minute | quarter_hour | hourly | daily
threshold_enabled = true
threshold_direction = below | above | both
threshold_basis = extreme | average
threshold_min_value = numero >= 0, requerido en below/both
threshold_max_value = numero >= 0, requerido en above/both
```

La API responde 422 a parámetros incorrectos; 503/504 para BOS no disponible/timeout, 401 por sesión y 500 inesperado. Los límites del motor de históricos de Durango permanecen: 1 día a minuto, 7 a 15 minutos, 31 por hora y 366 diarios.

Regla de evaluación:

- **Sin lectura** cuando `samples <= 0` o faltan valores necesarios; un `0 L/s` con muestras **sí es una lectura**.
- **Mín/Máx** compara `flow_min_lps < mínimo` o `flow_max_lps > máximo`; cuando el origen no entrega extremo, usa el promedio si está disponible.
- **Promedio** compara `flow_avg_lps` con cada límite.
- Comparaciones **estrictas**, igualdad al límite no es infracción.
- En ambos, si infringe mínimo y máximo en el mismo bucket, clasificar `Fuera de rango` una sola vez en total infractor.
- El tiempo comunicado es el bucket del histórico, no el instante exacto del evento.

## Archivos del incremental

- `backend/app/api/routes/water.py`
- `backend/app/services/durango_flow_threshold.py`
- `backend/app/services/durango_threshold_export_service.py`
- `backend/app/services/water_module_history_pdf_service.py`
- `backend/tests/test_dgo_h02_threshold.py`
- `frontend/src/pages/pozos/components/ModuleHistoryPanel.tsx`
- `frontend/src/pages/pozos/flowThreshold.ts`
- `frontend/src/services/waterThresholdExportService.ts`
- `frontend/src/styles/pages/historicos.css`
- `frontend/tests/flowThresholdH02.test.ts`
- `docs/incrementales/DGO_H02_UMBRALES_FLUJO_HISTORICO.md`

## Validación realizada

- Pruebas backend (`DB_MODE=sqlite`, base temporal y datos simulados): **221 aprobadas**.
- Pruebas frontend Node: **211 aprobadas**.
- Pruebas específicas H02: extremos/promedio/ambos, igualdad, cero real/sin muestras, validaciones 422, rutas y sesión, exportación PDF/XLSX, volumen no confiable en blanco.
- PDF simulado de 96 intervalos: cuatro páginas renderizadas y revisadas visualmente; encabezados repetidos y estados resaltados.
- TypeScript/Vite completo: **no ejecutado** porque faltan `@types/node` y `vite/client` en el entorno. Ejecutar `npm ci && npm run typecheck && npm run build` en la IPC.
- Conectividad real BOS y prueba en navegador IPC/Cloudflare: **pendientes**, no declarar comprobadas.

## Prueba dirigida IPC

1. Tomar respaldo operativo normal. Aplicar sobre H01 conservando `auth.sqlite3`, `concessions.sqlite3`, documentos privados y archivos de configuración.
2. Reiniciar backend y reconstruir frontend.
3. Abrir detalle de un pozo con datos recientes; con checkbox apagado, verificar PDF/Excel tradicionales.
4. Activar revisión con umbrales **de prueba**, por ejemplo 1 y 15 L/s; comparar por extremos y por promedio. No tratarlos como valores oficiales.
5. Comprobar línea(s) en eje L/s, intervalos fuera, sin lectura y tooltip.
6. Descargar PDF y Excel; comparar estados/cantidades y fechas con la gráfica del mismo periodo. Si transcurrió tiempo o entraron lecturas, volver a consultar antes de cotejar un día abierto.
7. Probar intervalo sin muestras, flujo real cero, igualdad exacta al umbral y límites inválidos; PDF/Excel deben quedar bloqueados con mensaje.
8. Revisar la misma funcionalidad en una línea y lavadora/Jarabes solo si sus sensores reportan flujo.
9. Verificar que en Resumen/módulo no apareció la barra de umbral y que Excel 5 min sigue funcionando; comprobar escritorio, móvil, claro y oscuro.

**Observación:** las exportaciones individuales con umbral usan consulta HTTP normal al backend, no la cola de reportes H01 (la cola H01 se enfocó en Reportes). Para intervalos largos puede requerirse un trabajo asíncrono propio en una futura fase; no se presenta como resuelto.

**Commit sugerido:** `DGO-H02 | Añadir evaluación de umbrales y exportación individual PDF Excel`
