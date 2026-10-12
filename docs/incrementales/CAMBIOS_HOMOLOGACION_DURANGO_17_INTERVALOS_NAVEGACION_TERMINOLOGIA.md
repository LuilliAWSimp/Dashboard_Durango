# Incremental 17 — Intervalos explícitos, navegación contextual y terminología de volumen

## Objetivo

Homologar la presentación temporal y semántica del Dashboard ARCA Durango sin duplicar lógica entre pantallas.

## Cambios

### Intervalos explícitos compartidos
- `DateRangeControls` usa un único formateador de rango.
- Los rangos cerrados indican fecha y hora: `00:00 → 23:59`.
- Si el rango termina hoy, se muestra `hasta ahora` y la hora real en lugar de un cierre futuro falso.
- El histórico modular reutiliza la misma etiqueta en su Excel y la envía también al PDF.
- Los reportes diarios incorporan `period_start_at`, `period_end_at` y un `period_label` con horas explícitas.

### Navegación contextual
- Las cards de módulo y las alertas guardan la ruta real desde la que se abrió el detalle.
- `Volver` regresa primero a esa ruta real, conservando query/rango cuando existe.
- Si se accede directamente a una URL de detalle, se conserva el fallback seguro al módulo correspondiente.
- La navegación anterior/siguiente entre elementos mantiene el mismo contexto de retorno.

### Terminología física común
Se centralizó la terminología para evitar nombres distintos entre cards, histórico, turnos y reportes:
- Pozos: `Volumen bombeado`.
- Líneas / Lavadoras / Jarabes: `Volumen consumido`.
- Se mantienen variantes comunes: `validado`, `del periodo`, `del intervalo`, `del turno`, etc.

La terminología compartida existe tanto en frontend como en backend para no depender de textos repetidos por pantalla.

### Reportes y exportaciones
- Vista previa de Reportes usa la terminología física del módulo.
- KPI de reportes y HTML exportado usan la misma nomenclatura.
- PDF/Excel backend usan la nomenclatura homologada.
- El PDF del histórico modular recibe la etiqueta explícita del rango visible.

## Validación dirigida
- 4 pruebas frontend de presentación/navegación: OK.
- 11 pruebas backend de terminología/reportes: OK.
- Transpilación sintáctica de los TS/TSX modificados: OK.
- Sintaxis Python de los servicios modificados: OK.
- Sintaxis del JS de exportación HTML: OK.
- No se ejecutaron suites generales hidráulicas ni de todo el dashboard.
