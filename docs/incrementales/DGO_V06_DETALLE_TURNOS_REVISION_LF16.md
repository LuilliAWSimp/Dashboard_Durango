# DGO-V06 | Homologacion visual del detalle individual, cortes por turno y revision diaria

**Planta:** ARCA Durango. **Referencia:** Las Fuentes LF16 (`Dashboard_Las_Fuentes-test(7).zip`).

**Aplicar exclusivamente sobre:** Durango con DGO-V00, V01, V02, V03, V04 y V05 ya instalados. ZIP incremental: las rutas comienzan en `frontend/` y `docs/`.

## Objetivo

Reproducir la jerarquia visual compacta de LF16, con su paleta ya incorporada en V01, manteniendo los procesos de Durango (Pozos, Lineas, Lavadoras y Jarabes) y **sin cambiar** el funcionamiento de datos, filtros, informes o turnos.

## Cambios

### Detalle individual
- Se sustituye la apariencia de hero grande y degradado por un encabezado liviano con linea divisoria.
- Se compactan **Volver**, navegacion anterior/siguiente, breadcrumb y titulo; se conserva su operacion.
- KPI del detalle con distribucion hasta cuatro columnas, tipografia LF16, superficies planas y unidades legibles. Se mantiene el KPI del periodo calculado desde el historico, y la distincion entre ausencia y cero real.
- Se reduce el ruido de la seleccion de fechas y del resumen de totalizadores/flujo, sin alterar datos ni descarga historica.
- Ajustes responsive para navegacion y metricas.

### Cortes por turno
- Encabezado y controles con densidad LF16.
- Tarjetas de turnos compactas y fondo neutro; el estado parcial/pendiente sigue resaltado por un borde discreto.
- Desplegables, tablas y selectores uniformes con scroll horizontal **solo dentro de la tabla**.
- No se cambia el horario configurado de Durango, el estado de corte, los subtotales ni los criterios de datos disponibles.

### Revision diaria
- Encabezado mas bajo, sin hero con degradado.
- Seis KPIs conservados con altura reducida y rejilla adaptable.
- Tablas de comparativo y detalle con bordes, tipografia y espacios LF16.
- Permanecen las alertas actuales, comparativos por dia/semana, fecha seleccionada, tabla completa y cortes por turno.

## Archivos del incremental
1. `frontend/src/main.jsx` - importa la capa V06 despues de V05.
2. `frontend/src/styles/durangoDetailReviewLF16.css` - estilos nuevos y limitados a las tres pantallas.
3. `frontend/tests/detailReviewVisualV06.test.ts` - 5 pruebas dirigidas de contrato de interfaz.
4. `docs/incrementales/DGO_V06_DETALLE_TURNOS_REVISION_LF16.md` - esta guia.

## Validacion en el entorno de preparacion
- Base V05 reconstruida superponiendo V00-V05 en orden al ZIP original del usuario.
- Suite antes de V06: **253 aprobadas, 1 fallida** (prueba heredada sobre cache del historico).
- Suite V06: **258 aprobadas, 1 fallida** (la **misma** prueba heredada; sin fallos nuevos en tests ejecutados).
- 5 pruebas nuevas V06 aprobadas.
- CSS validado con tinycss2: 0 errores de sintaxis reportados a nivel de hoja/declaraciones.
- Prueba real con SQL Server/BOS: no realizada; no son necesarios para cambiar estilos.
- Compilacion Vite y QA visual en navegadores/dispositivos reales: **pendientes**; el ZIP no contiene node_modules.

## Instalacion
1. Respaldar Durango con V05.
2. Extraer el ZIP **sobre la raiz de Durango**, sin crear una carpeta del incremental.
3. Reemplazar los archivos indicados.
4. Reconstruir frontend y reiniciarlo conforme al despliegue de la planta.
5. Recargar navegador forzadamente (`Ctrl+Shift+R`).
6. Probar a **100 % de zoom**: detalle de cada modulo; navegacion Volver/anterior/siguiente; fechas, exportaciones, cortes completos/parciales/pendientes; revision diaria, comparativos, tablas; temas claro/oscuro y vista movil.

## Limites y siguientes pasos
- No se tocan backend, SQL, sensores, factor de conversion, roles, correo, graficas ni reportes.
- La restriccion administrativa de umbrales historicos se mantiene para un incremental **funcional** futuro; V06 es exclusivamente visual.
- Proximo: **DGO-V07** (estilos de Reportes, PDF/Excel en interfaz y correo programado), con las funciones presentes intactas.

**Commit sugerido:** `style(durango): DGO-V06 homologar detalle turnos y revision diaria con LF16`
