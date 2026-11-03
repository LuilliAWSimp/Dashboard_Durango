# DGO-H05 — Pulido visual de Revisión diaria, Reportes y Usuarios

**Base de aplicación:** DGO-H04 sobre DGO-H03, H02, H01 y C06 con sus incrementales previos.

**Referencia:** Guía Maestra Única ARCA V2 (12/10/2026), reglas de homologación visual Las Fuentes y capturas de referencia del 12/10/2026.

**Tipo:** incremental puro. No incluye archivos de bases de datos ni configuración privada.

## Propósito

Continuar la homologación visual iniciada en H04 en pantallas secundarias de Durango, respetando por completo el comportamiento y los datos propios de la planta. Adicionalmente, corregir un error de variable en el breadcrumb que se introdujo en H04.

## Cambios

### Revisión diaria
- Cabecera con eyebrow `Operación de agua · Durango` y mejor jerarquía del título.
- Barra de selección del día integrada visualmente en el panel, conservando `Actualizar` y `Hoy` con las mismas acciones.
- Tarjetas con densidad ajustada: seis columnas en pantallas amplias, tres en escritorio estándar, dos en tablet y una en móvil.
- Títulos secundarios de comparativo y detalle con pequeñas etiquetas contextuales.
- Refinamiento de bordes y filas/tablas sin retirar campos, estados ni cobertura.
- Ajustes específicos para contraste en modo claro.

### Reportes
- Jerarquía visual más compacta del centro de reportes.
- Controles de tipo de periodo, fechas, actualizar y restablecer con radios y alturas unificados.
- Acciones PDF, Excel, HTML y correo con espaciado e iconos consistentes, foco visible y mínimo táctil en móvil.
- Superficies de flujo de trabajo y paneles secundarios con radios y bordes del sistema visual.
- Contraste de superficies en modo claro.
- **Se conserva** el procesamiento en segundo plano H01, los permisos, las exportaciones y los formularios originales.

### Administración de Usuarios
- Eyebrows contextuales para cabecera, alta de usuarios e inventario.
- Formularios y tablas más simétricos, con scroll horizontal limitado a la tabla.
- Acciones de tabla mejor alineadas y botones táctiles en móvil.
- Foco visible y superficies compatibles con tema claro.
- **Se conservan** las validaciones y permisos de H03, los cambios de rol, altas, revocación de sesiones y contraseñas.

### Hotfix heredado de H04
- En `OperationalDetailSection.tsx`, el breadcrumb añadido por H04 usaba `{title}`, variable inexistente en ese componente.
- Se sustituye por `{navigationLabel}`, que ya es calculada según el módulo actual, **sin cambiar rutas ni parámetros de navegación**.

### Ajuste de pruebas
- Se actualizó la expectativa del subtítulo en `summaryExecutive31.test.ts` a la nueva redacción incorporada en H04.
- Se agrega `visualHomologationH05.test.ts` para proteger el contrato de estos cambios y comprobar que se conservan acciones clave.

## Archivos modificados/nuevos

1. `frontend/src/pages/pozos/sections/RevisionDiariaSection.tsx`
2. `frontend/src/pages/UsersPage.tsx`
3. `frontend/src/pages/pozos/components/OperationalDetailSection.tsx`
4. `frontend/src/styles/pages/revision-diaria.css`
5. `frontend/src/styles/pages/reportes.css`
6. `frontend/src/styles/pages/usuarios.css`
7. `frontend/tests/summaryExecutive31.test.ts`
8. `frontend/tests/visualHomologationH05.test.ts` (**nuevo**)
9. `docs/incrementales/DGO_H05_PULIDO_VISUAL_REVISION_REPORTES_USUARIOS.md` (**nuevo**)

## No se modificó

- Backend, BOS/SQL Server, mapeos de sensores o mediciones hidráulicas.
- Funciones, fechas o cálculos operativos de Revisión diaria.
- Generación y contenido de PDF/Excel/HTML, cola de exportaciones H01 y correo programado.
- Roles, autenticación, cookies, sesiones y SQLite de Usuarios/Concesiones.
- Concesiones, Balance o diagrama; `global.css` permanece congelado.
- Menú, rutas de navegación o capacidades de la planta.

## Validación en entorno local

- Suite completa de pruebas frontend con `npm test`: **217 aprobadas, 0 fallidas**.
- Parseo de CSS con `tinycss2`: **0 errores de sintaxis de hoja** en los tres archivos de estilos modificados.
- Revisión dirigida del breadcrumb, controles y clases; no se requirió consulta BOS.
- `npm run typecheck` **no pudo completarse** por falta de dependencias de tipos `@types/node` y `vite/client` en el entorno de preparación.
- No se realizó validación visual en la IPC real ni compilación Vite completa. Es obligatorio validarlas tras la instalación.

## Validación dirigida en la IPC

1. Con H04 ya aplicado, extraer H05 respetando las rutas existentes (no reemplazar ninguna base ni `.env`).
2. Reconstruir el frontend (`npm ci` si faltan dependencias y `npm run build`) y reiniciar/republicar según la instalación de Durango.
3. Abrir Revisión diaria en pantalla ancha, tablet y móvil, con tema claro/oscuro; verificar calendario, `Actualizar`, `Hoy`, seis KPI, comparativo, tablas y turnos.
4. Abrir Reportes y alternar Fecha/Periodo; generar PDF, Excel e histórico completo. Comprobar progreso H01, descarga, estado y envío por correo según permisos existentes.
5. Abrir Usuarios como admin y revisar cabecera, formulario, tabla horizontal, edición, acciones y modal sin hacer cambios destructivos en cuentas reales. Probar con cuenta de prueba.
6. Abrir detalle de Pozo 1 y comprobar que aparece `pozos / Pozo 1` y que los controles Volver/siguiente siguen navegando correctamente.
7. Comprobar que Concesiones sigue mostrando históricos almacenados sin reprocesar los 70 días y que se mantienen los 2 pozos Durango.

## Commit sugerido para GitHub Desktop

`DGO-H05 | Homologar Revisión diaria, Reportes y Usuarios y corregir breadcrumb H04`
