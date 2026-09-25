# Incremental 34 — Revisión diaria V2

## Objetivo
Modernizar la presentación de Revisión diaria de Durango con fechas explícitas, comparativos operativos por proceso y menos texto técnico visible, sin modificar el contrato hidráulico ni los cálculos backend.

## Cambios
- Cabecera simplificada a `Datos operativos del DD/MM/YYYY`.
- Selector renombrado de `Fecha de revisión` a `Día`.
- Se elimina el KPI transversal `Volumen validado` y se sustituyen los KPIs por volúmenes separados de Pozos, Líneas, Lavadoras y Jarabes.
- Se concentran estados en `Con actividad` y `Con atención`.
- Se agrega comparativo de volumen con fechas explícitas para fecha seleccionada, día anterior y misma fecha de la semana anterior.
- El comparativo reutiliza `operational_groups` ya entregado por backend.
- Se limpian encabezados técnicos del detalle diario.
- `Apertura`/`Cierre` pasan a `Totalizador inicial`/`Totalizador final`.
- `Validación` pasa a `Estado de datos`, `Cobertura` a `Cobertura de datos` y `Última actualización` a `Última lectura`.
- Se retira la razón técnica secundaria del estado de calidad en la tabla principal.
- El bloque de turnos recibe el subtítulo claro `Turnos del DD/MM/YYYY`.
- El polling automático de Revisión diaria deja de forzar `force_refresh`; la actualización manual conserva el refresh forzado.
- Se mantiene explícito que las alertas de una consulta histórica corresponden al estado actual de planta.
- Se extiende el estilo claro de Revisión diaria al nuevo panel comparativo sin tocar `global.css`.

## Sin cambios
- SQL Server / BOS.
- Sensores, IDs, `operational_key`, factores y unidades.
- Conciliación, calidad y cálculos hidráulicos backend.
- Endpoints backend.
- Histórico global e individual.
- PDF / Excel / Excel 5 min.
- Reportes, autenticación y Balance de Agua.
- `global.css`.
