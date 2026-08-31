# Homologación Durango 08 — Reportes consumiendo Revisión diaria

## Objetivo

Hacer que el reporte diario de **un solo día** reutilice la misma fuente conciliada que la sección **Revisión diaria**, evitando que PDF, Excel, HTML, vista previa y correo manual vuelvan a reconstruir por separado los volúmenes del día.

La arquitectura queda:

```text
SQL / BOS
   ↓
normalización Durango
   ↓
conciliación [T0,T1)
   ↓
contrato global de calidad
   ↓
/water/review/daily
   ↓
water_daily_report_service
   ├─ vista previa
   ├─ PDF
   ├─ Excel
   ├─ HTML
   └─ correo manual
```

## 1. Fuente única para reporte diario

Para un reporte donde:

```text
start_date == end_date
```

`water_daily_report_service.py` deja de llamar directamente a `get_period_data()` para reconstruir el día.

Ahora llama a:

```python
get_daily_water_review(
    fecha,
    include_shifts=...,
    include_comparatives=False,
)
```

El servicio de reportes adapta ese payload, pero **no recalcula el volumen físico**.

Se reutilizan directamente los campos conciliados de Revisión diaria:

- apertura;
- cierre;
- volumen validado;
- confiabilidad;
- actividad;
- calidad;
- muestras;
- comunicación;
- turnos.

## 2. Reportes de varios días

Los rangos de más de un día siguen usando por ahora el servicio conciliado de periodo:

```text
get_period_data(start_date, end_date)
```

Esto es intencional: la guía de homologación define Revisión diaria como fuente canónica del **reporte diario de un día**. No se fuerza una suma artificial de días independientes para un rango completo.

El payload identifica su fuente mediante:

```json
{
  "report_source": "daily_review"
}
```

o, para un rango:

```json
{
  "report_source": "period_service"
}
```

## 3. Turnos

En un reporte diario, los turnos ya vienen dentro del payload de Revisión diaria.

Antes:

```text
Reporte → periodo
Reporte → turnos
```

Ahora:

```text
Reporte
   ↓
Revisión diaria
   ├─ día conciliado
   └─ turnos
```

La vista previa ligera sigue solicitando:

```text
include_history=false
include_shifts=false
```

por lo que al entrar a Reportes no se cargan históricos pesados ni turnos administrativos innecesariamente.

## 4. Calidad consistente

Las filas del reporte respetan primero el contrato común:

```text
quality_status
quality_label
volume_reliable
validated_volume_m3
```

Estados esperados:

```text
Validado
Cero válido
Cobertura parcial
Dato en revisión
Sin datos
```

Si el contrato nuevo no está presente, se conserva compatibilidad con los campos anteriores del reporte.

## 5. Total validado vs subtotal validado

Si todos los elementos monitoreados tienen volumen confiable:

```text
Total validado
```

Si existe al menos un elemento con cobertura parcial, en revisión o sin datos:

```text
Subtotal validado
```

No se convierte la ausencia de información en `0 m³`.

Nuevos campos de resumen:

```text
monitored_items_count
coverage_complete
coverage_label
volume_basis_label
review_count
no_data_count
```

Ejemplo:

```json
{
  "validated_items_count": 8,
  "monitored_items_count": 10,
  "coverage_complete": false,
  "coverage_label": "Cobertura parcial",
  "volume_basis_label": "Subtotal validado",
  "review_count": 1,
  "no_data_count": 1
}
```

## 6. PDF

El PDF sigue usando el mismo objeto de reporte que la vista previa y correo.

Se agregó al resumen ejecutivo:

- Total validado / Subtotal validado según calidad;
- cobertura del reporte;
- elementos validados / monitoreados;
- cantidad en revisión;
- cantidad sin datos.

No se modificó el diseño institucional general.

## 7. Excel

La hoja `Resumen` agrega:

- elementos monitoreados;
- cobertura del reporte;
- elementos en revisión;
- elementos sin datos;
- fuente del reporte (`Revisión diaria conciliada` o `Periodo conciliado`).

Las hojas de Pozos, Líneas, Lavadoras, Jarabes, Turnos e históricos conservan su estructura actual.

## 8. HTML

El HTML muestra:

- `Total validado` o `Subtotal validado`;
- cobertura;
- elementos validados / monitoreados;
- fuente del reporte;
- elementos en revisión;
- elementos sin datos.

Se mantuvieron sincronizadas las variantes:

```text
frontend/src/services/dailyWaterReportExportService.ts
frontend/src/services/dailyWaterReportExportService.js
```

Esto es necesario por la coexistencia actual de archivos JS/TS en Durango.

## 9. Vista previa de Reportes

La pantalla muestra una card adicional de:

```text
Cobertura del reporte
```

con:

- Cobertura completa, o
- Cobertura parcial.

También muestra la fuente:

```text
Fuente: Revisión diaria conciliada
```

para un día, y:

```text
Fuente: periodo conciliado
```

para rangos.

## 10. Correo manual

No se cambió SMTP ni la seguridad.

El endpoint actual continúa protegido para:

```text
admin
operator
```

Pero como el correo manual usa `_report_or_error()` y el mismo `water_daily_report_service`, los adjuntos PDF/Excel del correo reciben exactamente la misma información conciliada que la descarga manual.

```text
Vista previa
PDF
Excel
HTML
Correo
      ↓
 mismo objeto de reporte
```

## Archivos modificados

```text
backend/app/services/water_daily_report_service.py
backend/tests/test_durango_report_validated_summary.py
frontend/src/pages/pozos/sections/ReportesSection.tsx
frontend/src/services/dailyWaterReportExportService.ts
frontend/src/services/dailyWaterReportExportService.js
```

## No se modificó

- `.env`;
- configuración SMTP;
- credenciales;
- autenticación;
- permisos de roles;
- SQL Server;
- sensores;
- mapeos;
- turnos;
- calibración histórica de Pozo 1;
- cambio de canal de Jarabes;
- reglas físicas de totalizador.

## Comprobaciones mínimas

- Python modificado compila sintácticamente.
- Regresiones frontend de Reportes/HTML: **10/10 correctas**.
- JS y TS del exportador HTML producen el mismo resultado.

La prueba backend conectada a SQL Server no se ejecuta en el entorno de generación porque no dispone de `pyodbc`; no se modificó la configuración de conexión.

## Prueba recomendada en planta

1. Abrir `Reportes`.
2. Seleccionar un solo día posterior a los cortes históricos conocidos, por ejemplo `2026-08-12`.
3. Confirmar que aparece:
   - `Fuente: Revisión diaria conciliada`;
   - cobertura;
   - volúmenes iguales a Revisión diaria.
4. Generar PDF.
5. Generar Excel.
6. Generar HTML.
7. Enviar correo manual con PDF + Excel.
8. Comparar los valores principales entre los cinco formatos.
9. Seleccionar un rango de varios días y confirmar que la fuente cambia a `periodo conciliado`.
