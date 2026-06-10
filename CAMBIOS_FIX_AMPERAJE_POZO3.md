# Fix amperaje Pozo 03

Se ajustó la conversión de amperaje para Pozos únicamente.

Antes todos los valores de `quality` se dividían entre 100. Eso corregía sensores que guardan amperaje como `amps * 100`, por ejemplo `1260 -> 12.60 A`, pero provocaba que Pozo 03 / Viveros mostrara `0.30 A` cuando el SCADA muestra aproximadamente `30.87 A`.

Nueva regla:

- Si `quality >= 100`, se interpreta como `amps * 100` y se divide entre 100.
- Si `quality < 100`, se interpreta como amperaje directo y se muestra tal cual.

Ejemplos:

- `1260 -> 12.60 A`
- `30.87 -> 30.87 A`

Este cambio se aplica solo en Pozos. Líneas y Tanques no muestran amperaje.
