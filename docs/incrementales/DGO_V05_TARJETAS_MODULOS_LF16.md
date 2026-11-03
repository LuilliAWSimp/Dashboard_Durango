# DGO-V05 — Tarjetas y módulos operativos homologados con Las Fuentes LF16

## Base y aplicación

**Base exacta:** `Dashboard_Durango-test(3).zip` más incrementales DGO-V00, V01, V02, V03 y V04, instalados en ese orden. Este ZIP es estrictamente incremental: extraer sobre la **raíz de Durango**, no sobre el directorio `frontend`.

## Alcance visual

- Cabeceras de **Pozos, Líneas, Lavadoras y Jarabes** reducidas de hasta 48 px a un máximo de 28 px en escritorio, con subtítulo sobrio y separador fino LF16.
- El selector de período bajo el encabezado se integra en una superficie neutra más compacta; **sin modificar** sus filtros, fechas o agrupaciones.
- Los cinco KPI actuales de cada sección siguen presentes; se reduce su altura y se ajustan tamaños, espaciados y colores a LF16.
- Tarjetas de equipo de tamaño contenido, con **volumen del período** y **flujo actual** como métricas principales; **totalizador actual** y **tiempo activo en el período** como métricas secundarias. El tiempo activo ya existía en la tabla y no se calcula de nuevo.
- Grilla adaptable de tres columnas en pantallas amplias, dos en escritorio mediano/tablet y una en móvil; pozo/línea/lavadora/jarabes usan el **mismo componente** y los mismos estilos, sin copiar catálogos físicos de Las Fuentes.
- Fondo, borde, tooltip de foco y estados compatibles con variables LF16 ya introducidas en DGO-V01. El pie de tarjeta conserva última lectura, comunicación excepcional y botón Ver detalle.

## Archivos nuevos/modificados

- `frontend/src/pages/pozos/components/OperationalModuleSection.tsx` — composición de tarjetas (sin cambio de consulta o lógica hidráulica).
- `frontend/src/styles/durangoModulesLF16.css` — estilos V05 con alcance local al módulo, incluidas variantes claro/oscuro y responsive.
- `frontend/src/main.jsx` — carga explícita de la hoja después de V04.
- `frontend/tests/modulesVisualV05.test.ts` — 5 pruebas de preservación y homologación.
- `docs/incrementales/DGO_V05_TARJETAS_MODULOS_LF16.md` — este documento.

## Fuera de alcance deliberadamente

Sin cambios en backend, SQL Server, BOS, sensores e identidades, factores de conversión, rangos/turnos, rutas, autenticación/permisos, cálculos, exportaciones, reportes, histórico, cortes o detalle individual. La limitación de la herramienta de umbrales a administradores queda para un incremental funcional independiente.

## Validación recomendada al instalar

1. Abrir Pozos, Líneas, Lavadoras y Jarabes con modo **oscuro y claro**, zoom **100 %** y sidebar expandido/contraído.
2. Confirmar que la tarjeta muestra volumen de período, flujo, totalizador, tiempo activo y última lectura sin ceros inventados cuando falta un dato.
3. Comprobar que **Ver detalle**, Histórico operativo, sus tres exportaciones y Cortes por turno siguen activos en cada módulo.
4. Revisar ancho 1920, 1440, 1024, 768 y móvil (≤ 760 px), especialmente nombres largos y datos sin conexión.
5. Comprobar con lecturas reales que el total de tarjetas y tablas sigue siendo el mismo.

**Commit sugerido:** `style(durango): DGO-V05 homologar tarjetas y encabezados operativos con LF16`
