# DGO-H10 — Rendimiento de históricos completos basado en Insurgentes

## Base y aplicación

- Planta: Durango.
- Base exacta: `Dashboard_Durango-test(2).zip` recibido en esta solicitud; ya incluye DGO-H09 y los ajustes anteriores de ese proyecto.
- Referencia comparada: `Dashboard_Insurgentes-test (1)(2).zip`.
- Entrega: incremental puro, con las rutas relativas de los tres archivos modificados/nuevos. No sustituye el proyecto completo.
- Extraer sobre la raíz del proyecto Durango (donde están `backend`, `frontend` y `docs`) y aceptar la sustitución del servicio.
- Reiniciar el backend. Este incremental no modifica frontend: no requiere `npm install` ni reconstrucción con Vite. Tampoco requiere instalar nuevas dependencias Python en la planta ni ejecutar scripts SQL.
- Mantener la configuración y las bases locales existentes. Hacer la copia de respaldo habitual antes de sustituir archivos.

## Hallazgo y comparación

La base recibida ya conserva la última gráfica durante la actualización mediante H09. También tiene el modo ligero «Flujo» de H08. El camino completo, utilizado por «Ambos», «Totalizador» y detalles individuales, todavía tenía búsquedas correlacionadas `OUTER APPLY TOP (1)` para apertura y cierre por cada sensor e intervalo de 15 minutos.

| Aspecto | Durango recibido | Referencia Insurgentes | Adaptación H10 |
| --- | --- | --- | --- |
| Aperturas y cierres | Dos búsquedas correlacionadas por intervalo | Reducción por conjuntos y funciones de ventana para rangos largos | `ROW_NUMBER` y agregación condicional compartida entre consulta individual y modular |
| Filtro temporal | `COALESCE(ts_local, ts_minute)` en el filtro del camino completo | Filtros sobre la columna temporal física | Dos ramas excluyentes con `UNION ALL`: `ts_local`, y `ts_minute` solo si `ts_local IS NULL` |
| Agrupación | Puntos de 15 minutos que después valida y agrupa Durango | Reglas y agrupaciones propias de Insurgentes | Se conservan los puntos de 15 minutos y la lógica posterior de Durango |
| Validación física de Pozos | Lectura adicional de minutos hasta 31 días | Contrato industrial diferente | Sigue ejecutándose con los mismos límites, valores y normalización |

El patrón anterior puede multiplicar el trabajo SQL al crecer el rango; además, aplicar `COALESCE` en el filtro dificulta aprovechar índices temporales existentes. H10 elimina ese patrón repetitivo y facilita las búsquedas por fecha. La duración concreta depende del servidor, índices existentes, volumen de datos y carga concurrente; no se midió contra la IPC.

## Cambios implementados

1. Un único constructor SQL para el histórico de 15 minutos de un elemento y de varios elementos. Los totalizadores de apertura/cierre se seleccionan mediante funciones de ventana y una agregación por sensor e intervalo, sin consultas correlacionadas por intervalo.
2. Filtros temporales directos que conservan exactamente la prioridad anterior: si existe `ts_local`, esa fecha manda; solo con `ts_local` nulo se utiliza `ts_minute`. Una fila no se duplica aunque tenga ambas fechas, y una fecha secundaria no reincorpora una fila fuera de rango.
3. El mismo filtro se aplica a las lecturas de validación física y al histórico de un minuto. Los minutos de validación siguen llegando completos dentro de los límites originales; no se sustituyen por promedios.
4. Se preservan parámetros enlazados, manejo de errores/timeouts, comprobación de disponibilidad de la tabla y localización de fechas.

### Dónde aplica

- Históricos completos de Pozos y Líneas, tanto modulares como de detalle.
- La parte de Flujos que se consulta en `iot.readings_minute` (Lavadora L2, sensor 2004).
- Consumidores del servicio histórico común, incluida la exportación histórica que lo utiliza.
- Lectura de un minuto y lectura auxiliar de validación de Pozos del mismo servicio.

Las consultas BOS específicas de Lavadora Vidrio, Lavadora Ref-Pet y Jarabes permanecen como en la base. Los KPIs generales, cortes, concesiones y el reporte diario tienen servicios distintos y este incremental no presenta una mejora medida de esos otros caminos.

## Reglas conservadas

- Primera y última lectura positiva del intervalo tienen prioridad. Si no hay lecturas positivas, se conserva la primera/última lectura no nula, incluidos cero o negativos; el analizador existente determina su validez.
- Si solo hay flujo, apertura y cierre permanecen nulos. Se conservan los intervalos con filas sin valores válidos y sus muestras cero.
- Se mantienen promedios, mínimos, máximos, muestras, muestras activas y promedio activo.
- La normalización histórica del Pozo 1 conserva el factor `1/3.6` antes del corte `2026-08-11 12:15:00`, sin aplicarlo dos veces.
- Límites de rango, bloques de consulta, zona horaria, cambio SCADA, caché y separación de «Flujo»/consulta completa permanecen iguales.
- No se agrupan directamente en horas/días los totalizadores: permanecen los puntos intermedios de 15 minutos para evitar cambiar la conciliación de volumen y su validación.
- La lectura física de Pozos conserva el máximo de 31 días y 100 000 filas por consulta; el fraccionamiento de siete días permanece intacto.
- El comportamiento H09 de gráfica anterior identificada y exportaciones bloqueadas para un periodo pendiente ya estaba implementado y se mantiene.

## Archivos

| Ruta | Acción |
| --- | --- |
| `backend/app/services/water_history_service.py` | Modificado: SQL de históricos completos, minuto y validación |
| `backend/tests/test_dgo_h10_set_based_history.py` | Nuevo: pruebas dirigidas reproducibles con biblioteca estándar |
| `docs/incrementales/DGO_H10_RENDIMIENTO_HISTORICOS_COMPLETOS.md` | Nuevo: esta documentación |

## Validación local realizada

- Sintaxis Python del servicio: correcta.
- **10 pruebas nuevas aprobadas.** Ejecutan el SQL de filtros, ventanas y agrupación en SQLite en memoria, adaptando únicamente la sintaxis de fechas, conversión numérica y `TOP` de T-SQL. No es una ejecución en SQL Server ni una medición del plan ODBC.
- Casos: prioridad de positivos, ceros/negativos, nulos y valores no numéricos, datos de flujo sin totalizador, ausencia de datos, límites temporales `[inicio, fin)`, prioridad de `ts_local`, alternativa `ts_minute`, aislamiento por sensor, corte de calibración, consulta individual frente a modular y límites de la lectura física.
- Caso reproducible de doce días y seis sensores: 14 814 lecturas de prueba, con valores nulos, no numéricos y huecos. Se contrastan los resultados SQL contra una referencia independiente de las reglas anteriores. Después se comparan los puntos resultantes con el código real de construcción/validación de Durango en 15 minutos, por hora y por día.
- **16 pruebas existentes de frontend aprobadas**, relativas a caché, solicitudes de históricos, rangos y persistencia H09. Son verificaciones automatizadas del código, no una inspección visual de navegador.
- Comparación del árbol sintáctico: solo cambian cuatro funciones de consulta y se agregan dos constructores SQL; construcción de puntos, análisis de totalizadores, caché y servicios públicos permanecen idénticos.
- No se ejecutó la suite completa del backend: este entorno no tiene SQLAlchemy/pytest ni acceso a las dependencias requeridas. Las diez pruebas nuevas usan un arnés aislado sin iniciar el servidor web ni ODBC; los datos de prueba no se incorporan a la aplicación.
- Pendientes en planta: ejecución T-SQL nativa, latencia real, plan de ejecución, integración HTTP y comprobación visual. No se afirma una mejora porcentual ni un tiempo final en segundos.

Para repetir las pruebas nuevas desde `backend`:

```text
python -m unittest discover -s tests -p "test_dgo_h10*.py" -v
```

## Validación dirigida en la IPC

1. Antes de aplicar, conservar una captura/Excel de un rango cerrado conocido en Líneas y Pozos, con la misma agrupación y elementos. Si el modo completo no termina, anotar eso como referencia.
2. Aplicar H10 y reiniciar backend.
3. Repetir Líneas del **1 al 12 de octubre de 2026**, agrupación diaria, modo **Ambos**. Usar Actualizar para que la lectura no provenga de caché.
4. Repetir **Totalizador** y detalle individual de una Línea con ese rango; comparar aperturas/cierres, volumen y cobertura cuando haya una referencia anterior.
5. Repetir Pozos del **10 al 12 de octubre**, por hora y en Ambos. Comprobar que sigue mostrándose su validación física y que los datos de la consulta anterior permanecen visibles mientras se actualiza.
6. Probar un día a un minuto, un periodo sin datos y el periodo que incluye el corte de calibración de Pozo 1 si se requiere contrastar su histórico.
7. Revisar una exportación del histórico completo. La selección y fechas deben corresponder a la consulta terminada.
8. Comparar los tiempos de los logs existentes `DGO-H09 historico`: `sql_fuentes_s`, `sql_validacion_totalizador_s`, `procesamiento_s` y `total_s`. Se conserva esa etiqueta para facilitar la comparación con la base. El tiempo percibido también puede incluir la cola de trabajos y la comunicación con el navegador.

Si sigue lento, el siguiente diagnóstico debe basarse en esos tiempos y el plan SQL real; no ampliar timeouts ni retirar la validación física para ocultar la demora.

## No se tocó

`.env`, dependencias, esquema/índices de SQL Server, lecturas originales BOS, SQLite de concesiones/autenticación, mapeos, fórmulas, roles, turnos, diseño/CSS ni archivos de Insurgentes.

**Commit sugerido:** DGO-H10 | Optimizar históricos completos de Durango con consultas por conjuntos

**Estado:** implementado y validado localmente; pendiente confirmar latencia e integración en SQL Server de planta.
