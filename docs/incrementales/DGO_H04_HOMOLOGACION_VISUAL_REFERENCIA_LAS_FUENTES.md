# DGO-H04 · Homologación visual con referencia Las Fuentes

## Objetivo
Ajustar la jerarquía visual del módulo hídrico de Durango para acercarlo más a la referencia validada de **Planta Las Fuentes**, usando las capturas compartidas por el usuario como apoyo visual cuando la guía textual no fuera suficiente.

## Base de aplicación
Este incremental está preparado para aplicarse **sobre DGO-H03 — Usuario o correo**.

## Alcance
- Refinamiento visual del **Resumen operativo**.
- Refinamiento de cabeceras y jerarquía de los módulos operativos.
- Refinamiento del **Histórico operativo** para alinear toolbar, tabs y controles.
- Refinamiento de **Cortes por turno** para acercar tarjetas y disclosures a la referencia.
- Refinamiento del **Detalle individual** para mejorar breadcrumb, navegación contextual y lectura visual.
- Compatibilidad básica de los nuevos elementos en **modo claro**.

## Cambios implementados

### 1) Jerarquía de encabezados reusable
Se amplió `PanelHeader` para soportar un nuevo campo `eyebrow`, reutilizable en Resumen, módulos, histórico y turnos.

Resultado:
- Encabezados con mejor jerarquía visual.
- Mayor cercanía a la referencia tipo Las Fuentes.
- Menos dependencia de textos largos en una sola línea.

### 2) Resumen operativo con hero homologado
En el Resumen se actualizó la cabecera principal para mostrar:
- eyebrow: `Dashboard ARCA · Planta Durango`
- título: `Resumen operativo de agua`
- subtítulo ejecutivo más claro

Además se reforzó el estilo del hero con:
- gradiente horizontal más cercano a la referencia
- padding superior/inferior más compacto
- mejor escala tipográfica del título

### 3) Módulos operativos
Las cabeceras de módulos ahora incluyen eyebrow contextual tipo:
- `Operación de pozos`
- `Operación de líneas`
- `Operación de lavadoras`
- etc.

También se reforzaron:
- separación visual del bloque de cabecera
- tamaño del título principal
- consistencia de subtítulos
- acabados de tarjetas KPI y cards operativas

### 4) Histórico operativo
Se ajustó el histórico para acercarlo a la referencia en:
- jerarquía del título
- panel de rango independiente
- alineación del toolbar
- tabs de selección
- acciones de exportación
- chips/sensores visibles

Objetivo visual:
- que el histórico se sienta más “panel principal” y menos “bloques sueltos”
- que controles y acciones se lean como una sola franja operativa

### 5) Cortes por turno
Se mejoró la presentación de:
- cabecera del bloque
- tarjetas resumen por turno
- disclosures de detalle por turno
- separación y consistencia espacial

Esto ayuda a que la sección se perciba más cercana al patrón mostrado en las referencias.

### 6) Detalle individual
En el detalle individual se agregó:
- breadcrumb visual contextual (`<módulo> / <elemento>`)
- mejora de navegación contextual entre elementos
- ajustes de jerarquía sobre el hero del detalle

Con esto el detalle queda más alineado al estilo observado en las capturas de referencia.

### 7) Modo claro
Se añadieron overrides puntuales en `theme.css` para que los nuevos elementos (`panel-eyebrow`, breadcrumb y pill contextual) no rompan la lectura en modo claro.

## Archivos modificados
- `frontend/src/pages/pozos/components/PanelHeader.tsx`
- `frontend/src/pages/pozos/sections/DashboardBaseSection.tsx`
- `frontend/src/pages/pozos/components/OperationalModuleSection.tsx`
- `frontend/src/pages/pozos/components/ModuleHistoryPanel.tsx`
- `frontend/src/pages/pozos/components/ShiftConsumptionPanel.tsx`
- `frontend/src/pages/pozos/components/OperationalDetailSection.tsx`
- `frontend/src/styles/pages/shell.css`
- `frontend/src/styles/pages/operational-modules.css`
- `frontend/src/styles/pages/historicos.css`
- `frontend/src/styles/pages/turnos.css`
- `frontend/src/styles/pages/detalles.css`
- `frontend/src/styles/theme.css`
- `docs/incrementales/DGO_H04_HOMOLOGACION_VISUAL_REFERENCIA_LAS_FUENTES.md`

## No se tocó
- Contratos de API.
- Cálculo de KPIs o históricos.
- Exportaciones PDF/Excel a nivel funcional.
- Lógica de autenticación o permisos.
- Estructura backend.

## Validación dirigida
Revisar visualmente:
1. **Resumen**
   - título principal y subtítulo
   - sensación de hero horizontal
2. **Pozos / Líneas / Lavadoras / Jarabes**
   - eyebrow superior
   - jerarquía del título
   - tarjetas KPI y operativas
3. **Histórico operativo**
   - toolbar más alineado
   - tabs, exportaciones y agrupación más integrados
4. **Cortes por turno**
   - tarjetas resumen
   - disclosures por turno
5. **Detalle individual**
   - breadcrumb visual
   - navegación contextual
   - hero más ordenado
6. **Modo claro**
   - verificar que los nuevos textos no pierdan contraste

## Validación técnica local
- Se hizo validación estática sobre los archivos modificados.
- `npm run build` no se pudo ejecutar directamente en este entorno al inicio porque faltaban dependencias instaladas (`vite: not found`).
- También se intentó `npm ci`, pero en este entorno la instalación no terminó antes del timeout del contenedor.

## Resultado
Incremental listo para validación visual del frente homologado con referencia **Las Fuentes**.
