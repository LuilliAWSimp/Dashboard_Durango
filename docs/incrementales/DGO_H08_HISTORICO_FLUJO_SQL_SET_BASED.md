# DGO-H08 — Histórico modular rápido por SQL Server · contraste con Insurgentes

**Base requerida:** DGO-H07 aplicado. **Entrega:** incremental puro, no contiene bases ni datos.
**Referencia comparativa analizada:** `Dashboard_Insurgentes-test (13)(1).zip`, motor `backend/app/services/insurgentes_history_service.py`.

## Hallazgos verificables de ambos proyectos

1. **Insurgentes** utiliza `_query_buckets_set_based` para rangos agregados por hora/día: ejecuta `GROUP BY` por intervalo en SQL Server y transfiere únicamente agregados, con condiciones de fecha directas sobre `ts_local` para facilitar el uso de índices.
2. **Durango H07** utiliza `_query_15m_multi_chunked` y luego `_aggregate`: incluso cuando el usuario únicamente pide **Flujo**, calcula estadísticas de totalizadores y para Pozos intenta obtener registros por minuto mediante `_query_physical_validation_rows_chunked`. El camino `COALESCE(ts_local, ts_minute)` se utiliza dentro del filtro de fechas.
3. H07 evita que venza la conexión HTTP por consultas largas; **no optimizaba automáticamente el costo SQL**.
4. El progreso H07 decía que la pantalla estaba disponible, no que los datos anteriores debían mantenerse visibles. Esta frase se reemplazó para evitar ambigüedad.

## Implementación H08

- **Flujo de histórico por módulo (Resumen y secciones):** el frontend envía `flow_only=true` exclusivamente cuando la métrica activa es `Flujo` y NO se trata de detalle individual. La consulta es SQL Server, no Modbus ni comunicación directa SCADA.
- Para **Pozos y Líneas**, el backend agrega promedios, extremos, actividad y muestras por intervalo **directamente en SQL Server**. Conserva la normalización del flujo del Pozo 1 antes del corte de calibración.
- El SQL deja la fecha en una condición directa e indexable `ts_local >= :start_dt AND ts_local < :end_dt`. La rama separada `ts_local IS NULL` conserva las lecturas que dependen de `ts_minute`, sin convertir un faltante en cero.
- La agrupación responde a `minute`, `quarter_hour`, `hourly` o `daily`; respeta las mismas ventanas por rango del motor de Durango. Para un periodo de tres días por hora, la salida es por hora y no los cuatro buckets intermedios de 15 min.
- **No se generan volúmenes ficticios:** en el modo ligero `volume_m3`, totalizador de apertura/cierre y validación física quedan como `null`; el tooltip omite la etiqueta de validación de volumen, que no corresponde a la vista Flujo.
- **Totalizador / Ambos:** al cambiar de métrica se vuelve a consultar el **motor completo** de Durango: se mantienen `_query_15m_multi_chunked`, la validación física de Pozos, reglas de calidad y cálculos de volumen. No se cambian reportes ni exportaciones existentes.
- La caché y las huellas de jobs diferencian `flow_only=true` y `false`, para que un resultado ligero jamás se reutilice como histórico completo.
- Para Lavadoras/Jarabes el modo flujo sigue utilizando las fuentes y consultas especiales de Durango. Esta etapa optimiza de forma SQL directa **Pozos y Líneas**; no se afirma una mejora equivalente para las otras fuentes.
- Se reemplazaron textos que sugerían conexión directa con BOS por referencias a **consultas SQL Server**.

## Riesgos y limitaciones

- El índice real, estadísticas, ejecución SQL y latencia de la IPC de Durango deben inspeccionarse con SQL Server. No se hizo una conexión real a ese servidor durante la preparación de H08.
- Las consultas completas de Totalizador/Ambos siguen siendo potencialmente pesadas: requieren validación física del volumen. H08 no las hace rápidas eliminando validaciones.
- El servidor puede necesitar índices adecuados en `iot.readings_minute(sensor_id, ts_local)` y `(... ts_minute)` para el caso NULL; **no se incluye DDL ni se crean índices automáticamente**.
- El gestor de trabajos H07 sigue siendo de memoria y de un solo trabajador, por lo que una consulta completa en marcha puede hacer esperar otras solicitudes, incluso de flujo.
- No se modifica el histórico administrativo persistente de Concesiones ni su caché SQLite.

## Archivos del incremental

- `backend/app/services/water_history_service.py`
- `backend/app/services/water_history_job_service.py`
- `backend/app/api/routes/water.py`
- `frontend/src/services/waterService.js`
- `frontend/src/pages/pozos/components/ModuleHistoryPanel.tsx`
- `backend/tests/test_dgo_h08_fast_flow_module.py`
- `frontend/tests/fastFlowHistoryH08.test.ts`
- `frontend/tests/historyJobsH07.test.ts`
- `docs/incrementales/DGO_H08_HISTORICO_FLUJO_SQL_SET_BASED.md`

## Pruebas realizadas

- Backend: **237 pruebas y 6 subpruebas aprobadas**, SQLite temporal sin conectar al SQL Server productivo.
- Frontend: **221 pruebas aprobadas**.
- Backend Python: compilación sintáctica.
- TypeScript/Vite: no pudo compilarse en el entorno de prueba por falta de `@types/node` y `vite/client`; ejecutar en IPC con dependencias instaladas.

## Validación dirigida en la IPC

1. Instalar después de H07, sin sobrescribir bases SQLite, `.env` ni datos operativos.
2. Reiniciar backend y reconstruir frontend.
3. En Resumen > Histórico modular > Pozos > **Flujo**, comparar carga de `10/10/2026` a `12/10/2026` con agrupación `Por hora` frente al tiempo previo, y confirmar los valores promedio en L/s. Repetir con un mes diario.
4. Cambiar a **Totalizador** y a **Ambos**. Debe generar el volumen mediante el motor completo, sin reutilizar el resultado de solo flujo. Comprobar que al regresar a Flujo reutilice resultados cuando la caché sea válida.
5. Verificar histórico de Líneas. Probar Lavadoras/Jarabes sin esperar ganancias SQL idénticas (usan otras tablas).
6. Probar cero real con muestras y ausencia de muestras: nunca convertir sin lecturas a cero medido.
7. Si las consultas de Flujo siguen tardando, recopilar duración por etapa del backend y plan de ejecución SQL Server (índices, lecturas lógicas, CPU, espera); no aumentar simplemente el timeout.
8. Probar dos usuarios y evitar que se confundan historiales de distintas fechas o modos.

**Commit sugerido:** `DGO-H08 | Acelerar histórico modular de flujo con SQL set-based y aislar validación de volumen`
