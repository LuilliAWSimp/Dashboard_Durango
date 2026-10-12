# Incremental 29 — Rendimiento histórico V2

## Objetivo

Reducir consultas redundantes del dashboard y del histórico sin cambiar contratos hidráulicos, conciliación, sensores ni resultados visibles. El polling automático debe respetar caché e in-flight; `force_refresh=true` queda reservado a una actualización manual explícita.

## Cambios

- `useSqlChartDashboard` ya no mantiene una opción global `forceRefresh: true`.
- Resumen, módulos operativos, detalle y Balance dejan de forzar cada lectura automática.
- El coordinador de 60 s continúa compartido, pero el callback automático usa `force_refresh=false`.
- `Actualizar`, `Restablecer` o aplicar un nuevo periodo cambian `refreshKey`; sólo ese cambio explícito activa `force_refresh=true`.
- `ModuleHistoryPanel` aplica la misma política: polling con caché y actualización manual forzada.
- El histórico individual deja de descargar el módulo completo. En modo `singleElement` usa `/water/history` para el `sensor_id` u `operational_key` activo y adapta la respuesta al motor gráfico compartido.
- El histórico global/por sección continúa usando `/water/history/module` porque sí necesita múltiples series.
- La identidad de consulta del detalle incluye el elemento activo para impedir reutilizar datos de la card anterior al navegar Anterior/Siguiente.
- La caché frontend activa (`waterService.js`) conserva deduplicación de solicitudes in-flight y queda limitada a 100 entradas.
- Se mantiene la copia TypeScript alineada temporalmente hasta el incremental de canonización JS/TS.
- La caché del servicio histórico backend queda limitada a 256 entradas y elimina entradas expiradas al almacenar nuevas respuestas.
- No se modificaron TTL actuales: 60 s para histórico que incluye hoy y 10 min para histórico cerrado.

## No se tocó

- SQL Server ni consultas físicas/DDL.
- BOS.
- sensores, IDs, operational keys ni clasificación de elementos.
- factores de escala o unidades.
- conciliación, calidad, totalizadores o cálculo de volumen.
- contratos de respuesta de los endpoints existentes.
- Revisión diaria, Reportes, correo programado o Turnos.
- autenticación.
- CSS o `global.css`.

## Validación dirigida

- Frontend: 65 pruebas seleccionadas aprobadas (incrementales 21–29, auto-refresh, comparativa y arquitectura CSS).
- Backend: 14 pruebas seleccionadas aprobadas, incluidas 3 nuevas de rendimiento/caché.
- `py_compile` del servicio histórico y prueba nueva: correcto.
- Transpilación sintáctica TypeScript dirigida de 8 archivos: correcta.
- Auditor runtime: 81 archivos alcanzables, 62 archivos de código, 18 CSS y 0 imports relativos sin resolver.
- `npm run typecheck` no completa por dependencias faltantes en el ZIP fuente (`@types/node` y `vite/client`), condición preexistente.
- No se ejecutaron suites completas.
- No se hicieron consultas a SQL Server ni BOS.
