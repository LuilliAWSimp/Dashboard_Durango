# Incremental 39 — Contrato unificado de exportaciones

## Objetivo
Asegurar la regla operativa **lo que se ve = lo que se exporta** en Reportes e históricos, sin modificar fuentes físicas, conciliación ni cálculos hidráulicos.

## Cambios

### Reportes — periodo aplicado
- Se separa el periodo en edición del periodo realmente aplicado a la vista previa.
- PDF, Excel, HTML y correo usan exclusivamente `appliedFilters`, es decir, el mismo periodo que originó la vista visible.
- Cambiar un input sin pulsar **Actualizar** ya no cambia silenciosamente el periodo de las exportaciones.
- Se muestra aviso de **Cambios de periodo pendientes** hasta aplicar el nuevo periodo.
- El auto-refresh también reutiliza el periodo aplicado, no valores aún en edición.
- Los formatos quedan deshabilitados hasta que existe una vista previa válida.
- Los rangos invertidos se normalizan antes de aplicarse.

### Histórico — contrato visual PDF
- Cada serie exportada declara explícitamente:
  - `chart_type`: `line` o `bar`;
  - `axis`: `left` o `right`.
- El PDF recibe además las etiquetas reales de eje izquierdo y derecho.
- **Ambos + Por intervalo** exporta Flujo como línea y Volumen como barras.
- **Ambos + Acumulado progresivo** exporta Flujo y Volumen acumulado como líneas independientes.
- **Totalizador** conserva línea y eje correspondiente.
- El backend deja de inferir la geometría de la gráfica a partir del texto de `metric_label`.
- Los huecos continúan vacíos y no se convierten en cero.
- El escalado con series positivas y barras respeta cero como base real.

## Sin cambios
- SQL Server / BOS.
- Sensores, IDs, `operational_key`, factores y unidades.
- Conciliación y matemática de flujo/volumen/totalizadores.
- Endpoints de lectura histórica.
- Excel 5 min.
- Estructura V2, fechas y copy de Reportes 36–38.
- SMTP, programación de correo, autenticación y Balance de Agua.
- CSS y `global.css`.
