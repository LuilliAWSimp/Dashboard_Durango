# Cambio: amperaje solo en Pozos

Se agregó el amperaje únicamente al módulo de Pozos.

## Backend

- El amperaje se calcula desde `dbo.SensorsBOS_Pozo` usando el campo `quality`.
- Fórmula aplicada: `amperaje = quality / 100`.
- Se agregan los campos `amps` y `amperaje` en cada pozo.
- El campo `quality` ya no se usa como calidad de comunicación para Pozos, porque representa amperaje codificado.
- Si un pozo tiene flujo o amperaje real, se marca como `Encendido / Normal`.
- Líneas y tanques no calculan ni muestran amperaje.

## Frontend

- Pozos muestra amperaje en tarjetas.
- Pozos muestra amperaje en la tabla comparativa.
- Detalle de pozo muestra amperaje actual.
- Histórico corto del pozo muestra amperaje promedio del periodo.
- Resumen general de pozos muestra amperaje con 2 decimales.
