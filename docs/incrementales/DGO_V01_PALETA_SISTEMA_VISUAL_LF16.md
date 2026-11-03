# DGO-V01 | Paleta y sistema visual base de Las Fuentes LF16

**Planta destino:** Durango.
**Base de instalación:** Dashboard_Durango-test(3).zip con DGO-V00 aplicado.
**Referencia visual examinada:** Dashboard_Las_Fuentes-test(7).zip (LF16).
**Fecha:** 2026-11-03.
**Tipo:** ZIP incremental estricto. No es un reemplazo del proyecto completo.

## Objetivo

Aplicar en Durango el contrato de color real de Las Fuentes LF16, mediante una
única hoja de estilos acotada al shell hídrico (`.pozos-shell`). Esta etapa
estandariza superficies, bordes, texto, controles y colores semánticos de
exportacion; NO reorganiza los KPI ni reduce el tamaño del encabezado.

## Paleta comprobada en Las Fuentes

Fuente: `frontend/src/styles/lasFuentesUiRefresh.css` del ZIP LF16;
acciones: `frontend/src/styles/dashboardButtons.css`.

| Rol | Tema oscuro | Tema claro |
|---|---|---|
| Superficie principal | `#061A28` | `#FFFFFF` |
| Superficie secundaria | `#0A2638` | `#F2F7FA` |
| Borde | `#224151` | `#CFDEE6` |
| Texto principal | `#EEF6FA` | `#163344` |
| Texto secundario | `#A7BDC9` | `#526B7A` |
| Acento | `#73D1F3` | `#096D94` |
| Selección | `#103E53` | `#E2F3FA` |

Colores semánticos LF14 para botones: primario `#087BA5` con borde `#1595BC`;
Excel `#14653B` con borde `#288652`; PDF `#913347` con borde `#B75468`.

El fondo general `#04121E` oscuro y `#F2F7FA` claro se mantiene separado de las
tarjetas y paneles. El color de las series de cada sensor NO cambia.

## Cambios aplicados

1. `frontend/src/styles/durangoVisualSystem.css` (nuevo): tokens `--dgo-*`,
   contrato claro/oscuro y reglas acotadas a la interfaz hídrica.
2. `frontend/src/main.jsx`: incorpora al final la hoja visual nueva, DESPUES
   de `shared.css`, para controlar la precedencia ante las reglas legadas.
3. `frontend/tests/visualPaletteV01.test.ts` (nuevo): tres controles dirigidos
   de colores, variantes de exportacion y orden del CSS.
4. Este documento en `docs/incrementales/`.

Ajustes visibles en esta etapa:
- Superficies y bordes neutros en paneles y KPI existentes.
- Desactivación de brillos decorativos en KPI; no se modifica su cantidad.
- Sidebar recoloreado sin cambiar ancho, iconos, orden ni funcionamiento.
- Controles de fecha, selección de sensores, modo de métrica y agrupacion.
- Botones de reportes/historicos con PDF y Excel en colores LF exactos.
- Tabla y tooltips con lectura adecuada a ambos temás.

## Limites expresos

- V02 ajustara dimensiones, iconografía y estructura del sidebar.
- V03 ajustara hero, densidad, estructura y tamaños de KPI del Resumen.
- V04 a V08 terminaran la homologación de pantallas especificas.
- Un cambio visual NO modifica SQL Server, BOS, API, autenticación,
  catálogos de sensores, horas operativas, cálculos, alertas, datos,
  permisos, gráficas, descargas ni envíos programados.
- No se implementaron funciones nuevas de Concesiones o Reportes.
- No se empleo `zoom` global ni `transform: scale()`.

## Validacion local

| Comprobación | Resultado |
|---|---|
| Integridad de CSS con PostCSS | Correcta: 57 reglas, 174 declaraciones |
| Tres pruebas dirigidas V01 | 3 aprobadas |
| Suite total frontend | 230 aprobadas y 2 fallidas |
| Comparación contra suite V00 | Mismos 2 fallos preexistentes |
| Compilación Vite | No disponible: `vite: not found` (no incluye node_modules) |
| Verificación visual real en navegador | Pendiente de aplicar en la planta |
| SQL Server, BOS, SMTP | No conectados y sin cambios |

Los dos fallos previos provienen de `frontend/tests/visualAndReportsH06.test.ts`:
(1) test antiguo que busca `module-history-range-panel` en un bloque ya
reorganizado; (2) test que busca `recentModuleQueries` en código actual.
Faltaban antes de V01 y se dejan sin modificación para no introducir
cambios de funcionalidad en un incremental exclusivamente visual.

Se intento una comprobación gráfica automatizada con Chromium, pero la
herramienta no finalizo en el entorno de trabajo. No se declara validacion
visual pixel a pixel ni comprobación de tiempos de carga.

## Instalación y revisión de planta

1. Respaldar Durango con DGO-V00 ya aplicado.
2. Extraer el ZIP V01 en la raíz del proyecto (carpetas `frontend/` y `docs/`).
3. Reconstruir frontend con `npm run build` desde `frontend/` en el equipo
   que tenga instaladas las dependencias (si se usan en despliegue).
4. Reiniciar o republicar frontend segun el procedimiento actual.
5. Recargar con `Ctrl + Shift + R`.
6. Comparar Durango vs LF16 en zoom 100 %: Resumen, Histórico, sidebar y
   Reportes, con modo claro/oscuro y menu colapsado/expandido.
7. Comprobar que PDF, Excel, rangos, selects, modales y navegacion funcionan
   antes de avanzar a V02.

## Archivos incluidos en el ZIP

- `frontend/src/main.jsx`
- `frontend/src/styles/durangoVisualSystem.css`
- `frontend/tests/visualPaletteV01.test.ts`
- `docs/incrementales/DGO_V01_PALETA_SISTEMA_VISUAL_LF16.md`

**Commit sugerido:** `style(durango): DGO-V01 homologar paleta LF16 y contrato visual claro oscuro`
