# Incremental 37 - Fechas y nomenclatura de Reportes

## Objetivo

Homologar la presentación temporal y la nomenclatura de Reportes para que Vista previa, PDF, Excel, HTML y correo identifiquen explícitamente el periodo real consultado, sin modificar la matemática hidráulica ni las fuentes físicas de Durango.

## Cambios

- El reporte general deja de llamarse visualmente "Reporte Diario" cuando puede representar un rango de fechas.
- Los comparativos muestran fechas o rangos reales:
  - `Seleccionado · DD/MM/YYYY` o `Seleccionado · DD/MM/YYYY → DD/MM/YYYY`;
  - `Anterior · ...`;
  - `Semana anterior · ...`.
- Para reportes de un día se reutilizan los comparativos canónicos de Revisión diaria.
- Para rangos de varios días, las referencias se calculan con el mismo motor de periodo, desplazando el rango completo un día y siete días.
- Si una referencia comparativa no está disponible, el reporte conserva el periodo principal y presenta `No disponible`; no se fabrica un cero.
- Las columnas dependientes del periodo incluyen la fecha/rango consultado:
  - `Volumen bombeado · <periodo>` para Pozos;
  - `Volumen consumido · <periodo>` para Líneas, Lavadoras y Jarabes.
- Se homologa la nomenclatura de totalizadores:
  - `Totalizador apertura`;
  - `Totalizador al cierre`.
- La primera columna de cada tabla conserva el nombre físico del elemento: Pozo, Línea, Lavadora o Jarabes.
- El asunto del correo identifica la fecha o rango completo seleccionado.
- Los nombres de PDF, Excel y HTML incluyen:
  - fecha única o ambos límites del rango;
  - hora de generación `HH-MM-SS`, compatible con Windows.
- El bloque fijo de 12 h conserva su semántica de bloque y añade la hora de generación.
- Se ajustó el layout PDF para envolver encabezados largos y reservar mayor ancho a la columna de volumen, evitando empalmes en rangos multidía.

## Alcance protegido

No se modificaron SQL Server, BOS, sensores, IDs, `operational_key`, factores de escala, unidades, conciliación, calidad, cálculos de flujo, cálculos de volumen, reglas de totalizadores, definición de turnos, SMTP, autenticación, Balance de Agua, Revisión diaria, CSS ni `global.css`.

## Validación dirigida

- Frontend Reportes/Turnos/Revisión/CSS: 41/41 pruebas.
- Backend contrato Reportes: 13/13 pruebas con SQLite temporal para evitar dependencia de SQL Server/pyodbc.
- Caso multidía validado: 19/09/2026 → 25/09/2026.
- PDF diario y PDF multidía renderizados e inspeccionados visualmente.
- Encabezados de tablas PDF: sin solapes ni recortes tras ajuste de wrapping/ancho.
- Runtime: 83 archivos alcanzables, 64 archivos de código, 18 CSS, 0 imports relativos sin resolver.
- No se ejecutaron suites completas.
- No se realizaron consultas reales a SQL Server ni BOS.
