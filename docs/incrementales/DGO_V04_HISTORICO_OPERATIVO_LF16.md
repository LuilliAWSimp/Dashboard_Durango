# DGO-V04 — Histórico operativo homologado visualmente con Las Fuentes LF16

**Base:** Dashboard Durango con DGO-V00, DGO-V01, DGO-V02 y DGO-V03 instalados.  
**Referencia visual:** `Dashboard_Las_Fuentes-test(7).zip`, LF16, `OperationalModuleHistoryPanel.tsx`, `lasFuentesUiRefresh.css` y estilos de históricos.  
**Tipo:** Incremental de presentación. No actualizar SQL Server, Blue Open Studio, backend ni bases SQLite.

## Cambios

1. El histórico global muestra encabezado «Histórico operativo · [módulo]», con tamaño y espaciado LF16; los históricos de módulo/detalle respetan su título contextual.
2. Las pestañas Pozos, Líneas, Lavadoras y Jarabes aparecen por encima de una única barra de controles, sin pestañas artificiales para procesos no instrumentados.
3. La barra integra métrica, **PDF**, **Excel**, **Excel 5 min**, Desde/Hasta, Agrupación, Actualizar y Restablecer. En detalle individual, se conserva el rango externo y su control de agrupación.
4. Los botones de selección de sensores muestran la relación seleccionados/total, conservando selección múltiple y estado de cada sensor.
5. Paleta de series igual a Las Fuentes LF16: `#38bdf8`, `#fbbf24`, `#34d399`, `#c084fc`, `#fb7185`, `#f97316`, `#60a5fa`, `#22d3ee`, `#a3e635`, `#e879f9`. Colores del totalizador conservados como serie diferenciada. La gráfica vuelve a altura LF16 de 390 px.
6. Controles, paneles y leyendas usan tokens de V01 y proporciones LF16; breakpoints para monitores, tabletas y móviles, sin `zoom` global ni `!important`.
7. Se actualiza una expectativa antigua de prueba H06 para comprobar la nueva estructura de la barra, sin modificar el motor ni las cachés de históricos.

## Preservado expresamente

- Las fuentes BOS/SQL de Durango, sensor IDs, tipos de proceso y factores de conversión.
- Fechas/hora de la planta, rango independiente y restricciones de agrupación 1m/15m/1h/1d.
- Métricas Flujo / Totalizador / Ambos; delta/absoluto; volumen por intervalo/acumulado.
- Tratamiento de cero real, sin datos, huecos y estados de comunicación.
- Las exportaciones existentes y sus parámetros; Excel 5 min mantiene su límite y sus validaciones.
- La última gráfica válida aparece solo como referencia durante nuevas consultas; no permite exportar datos obsoletos.
- La revisión de umbrales del detalle individual **no cambia de permisos** en este incremento. La restricción admin-only está reservada para la etapa correspondiente y requiere control efectivo también en backend.
- No se cambia el funcionamiento de alertas, reportes ni correo programado.

## Archivos del ZIP

- `frontend/src/pages/pozos/components/ModuleHistoryPanel.tsx`
- `frontend/src/styles/durangoHistoryLF16.css` (nuevo)
- `frontend/src/main.jsx`
- `frontend/tests/historyVisualV04.test.ts` (nuevo)
- `frontend/tests/visualAndReportsH06.test.ts` (expectativa visual actualizada)
- `docs/incrementales/DGO_V04_HISTORICO_OPERATIVO_LF16.md` (nuevo)

## Validación requerida en planta

1. Verificar en Resumen los cuatro módulos y sus gráficos con zoom 100% (y 90% si se prefiere).
2. Comprobar selección, fechas, agrupaciones y Flujo / Totalizador / Ambos en todos los módulos; no usar un rango mayor al autorizado para 1 minuto.
3. Generar PDF y Excel de la selección visible y Excel 5 min de un rango permitido; comparar contenido, fechas y nombres.
4. Repetir en una vista individual con modo totalizador y umbrales; revisar que la función no cambió todavía de permisos.
5. Revisar modo claro/oscuro, tooltips, leyendas y responsive móvil; comprobar que el histórico anterior no se presenta como nuevo ni se exporta cuando la consulta vigente falla.

**Commit sugerido:** `style(durango): DGO-V04 homologar historicos con LF16`

## Verificaciones de preparación (03/11/2026)

- Suite `npm test`: **248 aprobadas y 1 fallida** de 249. El único fallo es preexistente en `visualAndReportsH06.test.ts` (prueba de antigua estrategia `recentModuleQueries`); la comprobación de barra de la misma suite fue actualizada y aprobó. No se simula ningún resultado.
- Cuatro pruebas nuevas `historyVisualV04.test.ts`: aprobadas.
- Sintaxis del componente TSX y `main.jsx` por parser/transpilación TypeScript global: sin diagnósticos.
- CSS `durangoHistoryLF16.css` parseado con `tinycss2`: cero errores de sintaxis.
- `npm run build`: no se completó porque faltan dependencias del frontend en la copia de preparación (`vite: not found`). Se debe compilar en el equipo de instalación.
- No se ejecutaron consultas de BOS/SQL Server, pruebas visuales en navegador ni envíos de correo.
