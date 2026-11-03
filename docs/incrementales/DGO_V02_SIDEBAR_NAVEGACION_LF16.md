# DGO-V02 | Sidebar, identidad y navegación alineados a Las Fuentes LF16

**Planta:** Durango.  **Incremental:** DGO-V02.  **Base obligatoria:** Durango con DGO-V00 y DGO-V01 aplicados (sobre `Dashboard_Durango-test(3).zip`).

## Alcance de la entrega

Se comparó el sidebar de Durango con el código activo de `Dashboard_Las_Fuentes-test(7).zip` (LF16), especialmente `frontend/src/styles/lasFuentesUiRefresh.css` y el componente `Sidebar.tsx`.

| Elemento | Durango previo | DGO-V02 (LF16) |
|---|---|---|
| Sidebar expandido | 274 px | **252 px** |
| Sidebar contraído | 88 px | **72 px** |
| Logo del sidebar | 115 px y fila horizontal apretada | **108 px**, fila superior separada del nombre |
| Iconos de menú | ~16 px | **18 px** |
| Botones del menú contraído | Reglas variables, radios ~13–15 px | **44 × 44 px**, radio 8 px |
| Navegación visible | Tarjetas altas, gaps grandes | Filas de **42 px mínimo**, bordes discretos |
| Tema y cierre de sesión | Controles grandes y con gradientes | Superficies neutras LF16; acciones originales sin cambiar |
| Pantalla <=900 px | Sidebar fijo con margen reservado de 92 px | Cajón móvil con barra superior, overlay y contenido a todo el ancho |

### Ajustes específicos

1. Nueva hoja final `durangoSidebarLF16.css`, delimitada al contenedor `.pozos-shell`, con precedencia posterior a DGO-V01; evita volver a añadir correcciones en `global.css`.
2. Layout del logotipo: botón de plegado en la primera fila, logotipo de ARCA Durango, y nombre/subtítulo debajo, al estilo LF16. No se sustituye la imagen ni el nombre real de la planta.
3. Menú reducido: scroll vertical solo en navegación; la marca, cambio de tema y sesión permanecen accesibles en sus propias filas. Se mantienen roles, títulos, rutas y orden según `buildDurangoNavigation`.
4. Menú móvil: botón superior, overlay para cerrar, tecla **Escape**, cierre al seleccionar sección, liberación del scroll al cerrar, y cierre automático al ampliar la ventana por encima de 900 px. Sin columna lateral permanente ocupando espacio.
5. Card de sesión: mismo usuario, rol, cambio de contraseña y cierre de sesión; se retiran únicamente efectos visuales grandes de botones y tarjeta.
6. Regresión: se generaliza la prueba previa de V01 para verificar que la paleta LF16 se carga después del CSS antiguo sin exigir que sea el **último** CSS del proyecto en incrementales futuros.

## Archivos incluidos (7)

- `frontend/src/App.jsx`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/main.jsx`
- `frontend/src/styles/durangoSidebarLF16.css` (**nuevo**)
- `frontend/tests/sidebarVisualV02.test.ts` (**nuevo**, 5 pruebas)
- `frontend/tests/visualPaletteV01.test.ts` (actualización del contrato de orden de hojas)
- `docs/incrementales/DGO_V02_SIDEBAR_NAVEGACION_LF16.md` (**nuevo**)

## Exclusiones: sin cambios funcionales

- SQL Server, BOS, sensores, conversión Pozo 1, horarios, balance, concesiones, usuarios ni APIs.
- Lógica de rutas, filtrado de menú por permisos, autenticación y roles.
- Históricos, cálculos, gráfica, reportes, PDF/Excel, email, pruebas backend y base SQLite.
- Encabezado grande, KPIs y layout de Resumen: **reservados para DGO-V03**.

## Validaciones ejecutadas

- 5/5 pruebas dirigidas V02: **aprobadas**.
- Suite frontend completa: **235 aprobadas, 2 fallidas** (237 en total); ambos fallos ya existían en el ZIP base y en V00/V01, en `visualAndReportsH06.test.ts`: estructura antigua esperada de barra de histórico y caché de consultas. No se modificaron esos históricos ni sus pruebas.
- CSS de V02: analizado sintácticamente con `tinycss2`, **0 errores de hoja o declaraciones**.
- Orden de carga CSS: V02 después de V01, conservando V01 después del CSS antiguo.
- `npm run build`: **no ejecutado**, no están instaladas las dependencias `node_modules` en el ZIP entregado.
- Navegador 100% y dispositivos reales: **pendiente de revisión en equipo de planta**, no se acredita paridad píxel por píxel.

## Aplicación y validación en equipo

1. Respaldar Durango con V01 instalado (incluye V00).
2. Extraer DGO-V02 **sobre la raíz del proyecto** y reemplazar los archivos incluidos; no eliminar otros archivos.
3. Reconstruir frontend conforme al flujo de despliegue instalado, y reiniciarlo si es necesario. No hace falta reiniciar backend por este cambio.
4. Refrescar navegador con `Ctrl + Shift + R`.
5. En 1366×768 y zoom **100%**, revisar menú contraído/expandido, logo, cambios de tema, Usuario, Cambiar contraseña, Cerrar sesión y navegación de todos los módulos.
6. En móvil o viewport <=900 px, abrir/cerrar menú, tocar un enlace, cerrar por overlay y con Escape, verificar que el contenido use todo el ancho y que se pueda desplazar el listado de secciones.
7. Repetir verificaciones en modo claro y oscuro; documentar capturas si hay algún contraste o superposición inesperada.

**Commit sugerido:** `style(durango): DGO-V02 homologar sidebar y navegacion con LF16`

**Siguiente:** DGO-V03 — Resumen, encabezado y organización de KPIs. Este es el cambio que atacará principalmente la necesidad de usar zoom 80%.
