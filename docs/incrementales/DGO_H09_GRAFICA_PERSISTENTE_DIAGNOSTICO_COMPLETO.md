# DGO-H09 — Histórico modular: continuidad de gráfica y diagnóstico de consultas completas

**Planta:** Durango. **Base requerida:** DGO-H08 aplicado sobre DGO-H07, H06, H05…
**Tipo de entrega:** incremental puro; únicamente archivos nuevos o modificados.
**Origen del cambio:** en IPC, Flujo de Pozos/Líneas se resolvió en segundos con H08, pero «Ambos» de Líneas del 1 al 12 de octubre seguía tardando más de dos minutos. Al actualizar o consultar otro rango, la gráfica visible desaparecía.

## 1. Comportamiento anterior

H07/H08 descartaba temporalmente `data` y exigía que la identidad de consulta coincidiera con `resolvedQueryIdentity`. Esto evitaba mezclar fechas, pero mostraba un espacio vacío durante el trabajo SQL. En modo completo el periodo de espera puede ser apreciable.

## 2. Nuevo contrato de presentación (frontend)

- Después de **la primera consulta exitosa con series visibles**, se conserva una instantánea de la última gráfica.
- Si se cambia el rango, la agrupación, la pestaña o el modo de datos que requiere otro resultado, la gráfica anterior **permanece visible** mientras se obtiene la nueva.
- Esa gráfica siempre lleva un aviso explícito «Vista anterior» con su **módulo, fechas, agrupación y métrica originales**. No se asigna la fecha recién seleccionada a datos anteriores.
- Los ejes, colores, leyenda, tooltip y columnas de la vista anterior continúan usando los parámetros bajo los cuales se construyó. Esto impide convertir una respuesta `flow_only` en datos de totalizador aparentes.
- La nueva respuesta sustituye la gráfica anterior únicamente cuando llega completa y se valida su identidad de consulta.
- En **Actualizar** sobre las mismas fechas, la gráfica permanece sin necesidad de un aviso de periodo anterior, y se indica la actualización en curso.
- Si la nueva consulta falla, continúa visible la gráfica anterior con aviso y error, sin simular que la consulta nueva tuvo éxito.
- **PDF, Excel y Excel 5 min se bloquean mientras la gráfica mostrada sea de la consulta anterior.** Los exportadores de gráfica únicamente utilizan `filteredData` de la identidad actual, jamás la instantánea.
- Si no se ha obtenido todavía ninguna gráfica previa, se sigue mostrando un estado de carga, sin gráficos ficticios.
- El detalle individual conserva su aislamiento de sensores; la mejora de continuidad se aplica al histórico modular y global, donde estaba reportado el problema.

**Alcance de la persistencia visual:** solo memoria del componente durante la navegación actual. No se guardan datos operativos en `localStorage`, SQLite ni archivos.

## 3. Diagnóstico del rendimiento de «Ambos» (backend)

Sin alterar SQL ni los cálculos, las consultas modulares que **no se sirvan de caché** registran `DGO-H09 historico` con:

- `sql_fuentes_s`: tiempo de lectura de fuentes/agrupados, incluyendo sus transformaciones previas a construir las series.
- `sql_validacion_totalizador_s`: tiempo específico de la lectura física de validación de totalizadores de Pozos.
- `procesamiento_s`: tiempo de construcción de puntos y series hidráulicas.
- `total_s`: tiempo completo de ese cálculo de histórico modular, sin contar la espera en la cola anterior al inicio.
- Módulo, fechas, agrupación y modo (`flujo`/`completo`) para identificar la consulta, sin registrar secretos o cadenas ODBC.

H07 ya registra `Historico modular terminado ... seconds=...` después de ejecutar el trabajo. La diferencia entre ese tiempo y lo percibido en el navegador puede incluir tiempo en cola, sondeos HTTP y transferencia.

**Este incremental NO afirma que el modo «Ambos» sea ahora rápido.** La validación física y el SQL completo siguen igual. Los tiempos registrados permitirán diseñar una optimización segura y contrastarla con Insurgentes sin omitir cálculos.

## 4. Archivos del incremental

- `frontend/src/pages/pozos/components/ModuleHistoryPanel.tsx`
- `frontend/src/styles/pages/historicos.css`
- `frontend/tests/historyJobsH07.test.ts` (actualiza la expectativa visual anterior)
- `frontend/tests/fastFlowHistoryH08.test.ts` (actualiza el mensaje de carga)
- `frontend/tests/historyPersistenceH09.test.ts` (nuevo)
- `backend/app/services/water_history_service.py` (registro de tiempos)
- `backend/tests/test_dgo_h09_history_diagnostics.py` (nuevo)
- `docs/incrementales/DGO_H09_GRAFICA_PERSISTENTE_DIAGNOSTICO_COMPLETO.md`

## 5. No se tocó

- SQL Server/BOS, esquemas, índices y lecturas originales.
- Validación de volumen, totalizadores, fórmulas, sensores, roles, autenticación y APIs.
- Concesiones y bases SQLite, documentos y respaldos.
- Generación PDF general de Reportes ni la cola H01.

## 6. Validación realizada localmente

- Backend con SQLite temporal y fuentes simuladas: **238 pruebas y 6 subpruebas aprobadas**.
- Frontend Node: **224 pruebas aprobadas**.
- Sintaxis TSX: `typescript.transpileModule` sin diagnósticos.
- Compilación completa TypeScript/Vite: **pendiente** (`@types/node` y `vite/client` no están instalados en este entorno). Realizar instalación de dependencias del proyecto y compilación en la IPC.
- Conectividad real SQL Server, latencia de 12 días, estilo visual en navegador e integración con Cloudflare: pendientes.

## 7. Pruebas dirigidas en la IPC

1. Aplicar el incremental sobre H08 y reconstruir el frontend, reiniciar backend. Conservar los `.sqlite3`, WAL/SHM, `.env`, PDFs y configuración.
2. Abrir Resumen > Histórico > Líneas > **Flujo** > 1 a 12 de octubre > Por día y esperar a que aparezca la gráfica.
3. Cambiar a **Ambos**. La gráfica de **Flujo** debe mantenerse con aviso «Vista anterior · Líneas · … · Flujo» mientras el servidor calcula la serie completa. No se deben dibujar barras de volumen falsos.
4. Observar los botones PDF/Excel normales deshabilitados mientras la vista anterior está activa. Confirmar que el gráfico nuevo reemplaza al viejo cuando llega la consulta completa.
5. Con la serie completa lista, pulsar **Actualizar** sin cambiar periodo; debe seguir visible la gráfica, con un estado de actualización y sin desaparecer.
6. Cambiar a otra fecha o módulo. Debe mantenerse el último resultado como referencia **bien identificado**; la selección actual del usuario no debe confundirse con la referencia.
7. Si falla la nueva consulta SQL, confirmar que se ve el error además del gráfico anterior etiquetado, no un gráfico aparentemente actualizado.
8. Repetir en tema claro y oscuro y en móvil.
9. En logs del backend, buscar la línea `DGO-H09 historico` de `line`, `modo=completo`, y recopilar `sql_fuentes_s`, `sql_validacion_totalizador_s`, `procesamiento_s` y `total_s`, además del registro H07 de finalización del trabajo. Compartir **solo duraciones**, sin credenciales ni datos privados.

**Commit sugerido (GitHub Desktop):** `DGO-H09 | Conservar gráfica durante consultas y diagnosticar rendimiento de Ambos`
