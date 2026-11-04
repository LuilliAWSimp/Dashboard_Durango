# DGO-V07B · Optimización conservadora de informes mensuales — Durango

**Aplicar sobre:** DGO-V07A (cadena V00 → V07 → V07A).  
**Motivación:** reporte de octubre (01/10/2026–31/10/2026) tardó >692 segundos, aunque terminó correctamente. El estado visible era «Calculando comparativos».  
**Alcance:** backend y pruebas; no cambia interfaz, PDF, Excel, periodos, alertas ni procesos SCADA.

## Hallazgos

Un reporte de 31 días calcula datos del intervalo solicitado, históricos por módulo y dos ventanas comparativas independientes (desplazadas 1 y 7 días). Por tanto, se leen varias semanas de datos parcialmente solapadas.

En `water_period_service.py`, la condición `COALESCE(reading.ts_local, reading.ts_minute)` se evaluaba en la columna de filtro de **cada ventana** de SQL Server y la consulta de apertura previa realizaba `ROW_NUMBER()` sobre todo el histórico anterior al intervalo. Estos patrones **pueden** obstaculizar el uso de índices y aumentar la clasificación/lectura. No hay plan de ejecución ni métricas del SQL real para cuantificar su impacto.

## Cambios

1. **Consulta de lecturas por intervalos indexables**: se reemplaza el filtro `COALESCE(...)` por dos ramas `UNION ALL` disjuntas: `ts_local` existente y, cuando es NULL, `ts_minute`. Conserva `sensor_id`, fechas, orden, conversiones, `TOP` acotado y particionado recursivo V07 que evita truncamiento.
2. **Apertura previa por sensor**: dos `OUTER APPLY TOP (1)` por cada sensor obtienen la lectura positiva más reciente en cada rama de tiempo; se elige la más nueva. Evita `ROW_NUMBER()` sobre todo el histórico para cada reporte y preserva la preferencia de reloj original.
3. **Reuso temporal de informe calculado**: al exportar PDF y luego Excel (o viceversa) para **exactamente el mismo rango histórico ya cerrado**, el backend reutiliza durante máximo **10 minutos** el conjunto completo ya calculado (incluyendo los comparativos). Máximo dos rangos en RAM. No cachea intervalos que incluyen el día actual ni comparte archivos entre usuarios; cada descarga conserva el control de acceso anterior.
4. **Instrumentación en logs**: duración de consultas por ventanas, aperturas y familias Pozos/Líneas, Lavadoras y Jarabes, junto con las etapas del reporte que ya instrumentaba `water_daily_report_service.py`. No se registran credenciales ni valores de medición.
5. **Diagnóstico SQL de solo lectura**: archivo `.sql` opcional para verificar índices existentes si la primera exportación sigue siendo lenta. No hay cambios de tablas, índices, procedimientos, disparadores ni datos desde el incremental.

## Límites e invariantes

- No se omiten los comparativos (día anterior y semana anterior). Se sigue consultando el mismo período en ambos casos.
- No se sustituyen datos faltantes por ceros y no se alteran conversiones de flujo ni reconciliación de totalizadores.
- El sistema conserva una sola ejecución de exportación a la vez para no saturar SQL/BOS.
- La **primera** ejecución del mes sigue requiriendo lectura real SQL y puede continuar lenta si los índices actuales o el equipo no son adecuados. No prometer un tiempo de respuesta fijo sin medición.
- El reuso del cálculo no persiste tras reiniciar el backend y deja vencer 10 minutos. Si se regularizan lecturas históricas durante esa ventana, los reportes deben regenerarse tras caducar el cache o reiniciar backend.

## Validación local

- Pruebas dirigidas V07B: lector por dos relojes, búsqueda de apertura indexable, reuso real PDF→Excel y no-cache del día actual.
- Pruebas de regresión V07/V07A: lectura completa en 31 días, período correcto en PDF/Excel, cola de trabajos y permiso por propietario.
- Sintaxis Python.
- No disponible conexión SQL Server Durango en entorno de preparación: rendimiento y plan SQL reales pendientes.

## Validación en planta requerida

1. Respaldar Durango V07A; extraer ZIP desde raíz (backend/ y docs/); **reiniciar backend**.
2. Generar **01/10/2026 a 31/10/2026**, primero PDF. Registrar tiempo total de trabajo hasta `Disponible para descargar` y tamaño del archivo.
3. Comparar el PDF con el generado antes de V07B (mismo rango y lectura): mismos volúmenes, comparativos y apartados.
4. Sin reiniciar backend, generar **Excel del mismo mes** dentro de 10 minutos; debería reutilizar el dataset y evitar las consultas del mes.
5. Consultar logs backend: `DGO-H06 reporte ... etapa=... elapsed_s=...` y `DGO-V07B periodo ...` para localizar las partes lentas si persiste.
6. Si el PDF inicial sigue excediendo el umbral aceptable, ejecutar **solo con autorización del responsable SQL** el archivo `DGO_V07B_DIAGNOSTICO_INDICES_SOLO_LECTURA.sql` y revisar índices/plan real. No ejecutar DDL sin evaluación de impacto sobre SCADA.

**Commit sugerido:** `perf(durango): DGO-V07B optimizar lecturas y reutilizar informes mensuales`
