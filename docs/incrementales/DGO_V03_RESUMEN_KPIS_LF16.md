# DGO-V03 - Resumen y KPI compactos basados en Las Fuentes LF16

**Base:** Durango con DGO-V00, DGO-V01 y DGO-V02 instalados.
**Referencia cotejada:** Dashboard_Las_Fuentes-test(7).zip, LF16, pantalla Resumen y CSS de Las Fuentes.
**Tipo:** ZIP incremental puro; no sustituye el proyecto completo.

## Cambios

- El encabezado de Resumen deja de ser el gran recuadro degradado. Se utiliza un titulo compacto y el mismo estilo de superficies LF16.
- Siete KPI separados se presentan como cuatro tarjetas enlazables por proceso: Pozos, Lineas, Lavadoras y Jarabes.
- Cada tarjeta muestra volumen del periodo, flujo reportado, actividad del periodo y cobertura/comparativo diario.
- La nueva caja de Estado general conserva ultima actualizacion, elementos con flujo actual y alertas activas.
- Los accesos a los cuatro modulos usan rutas existentes, sin agregar sensores ni cambiar servicios.
- Se reutilizan los totales calculados por `operational_summary`; los flujos se leen de los mismos renglones actuales, omitiendo estados de comunicacion reportados como fallidos/obsoletos y lecturas marcadas como no disponibles. Un flujo cero real sigue siendo cero. Sin muestras utilizables se muestra `Sin lectura`.
- El historico operativo global, la tabla comparativa, la logica de alertas y los permisos quedan intactos.
- Responsive: cuatro tarjetas en escritorio ancho; dos en anchos medios; una en movil. No se usa `zoom` CSS.

## Archivos incluidos

- `frontend/src/pages/pozos/sections/DashboardBaseSection.tsx` (modificado)
- `frontend/src/pages/pozos/summaryFlow.ts` (nuevo, lectura de flujo sin ceros ficticios)
- `frontend/src/styles/durangoSummaryLF16.css` (nuevo)
- `frontend/src/main.jsx` (modificado)
- `frontend/tests/summaryVisualV03.test.ts` (nuevo)
- `frontend/tests/summaryFlowV03.test.ts` (nuevo)
- `docs/incrementales/DGO_V03_RESUMEN_KPIS_LF16.md` (nuevo)

## Fuera de alcance

No se alteraron SQL Server, BOS, triggers, volumenes, factores, zonas horarias,
turnos, historicos, exportaciones, reportes, correo, roles ni autenticacion.
La densidad interna y filtros del historico se ajustaran en DGO-V04.
La restriccion de umbrales a administradores pertenece a un cambio funcional aparte.

## Verificacion requerida en planta

1. Abrir Resumen al 100% de zoom, en escritorio ancho y pantalla reducida.
2. Comparar los cuatro volumenes y la tabla comparativa con el dashboard anterior al mismo periodo.
3. Verificar que los valores ausentes no se representen como 0 y que el flujo valido igual a 0 se muestre como 0.
4. Entrar a cada modulo haciendo clic en las nuevas tarjetas.
5. Comprobar fecha de actualizacion, alertas y su comportamiento con SQL no disponible.
6. Verificar claro/oscuro y movil; hacer pruebas de historico y exportacion para detectar regresiones.

**Commit sugerido:** `style(durango): DGO-V03 compactar resumen y KPIs segun LF16`
