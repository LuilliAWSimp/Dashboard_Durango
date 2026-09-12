# Homologación Durango 08A — Diagnóstico explícito de calidad

## Objetivo

Explicar por qué un elemento aparece como **Dato en revisión** sin modificar umbrales, sensores ni resultados hidráulicos.

## Nuevos campos

Cada elemento conciliado puede exponer:

- `quality_reason_code`
- `quality_reason`
- `quality_details`
- `reconciled_discarded_totalizer_event_details`

Los detalles pueden incluir hora, totalizador anterior, nuevo totalizador, incremento, volumen esperado por flujo y segundos transcurridos.

## Motivos normalizados

- `TOTALIZER_RESET_OR_DROP` — caída/reinicio de totalizador.
- `TOTALIZER_INCREMENT_WITH_ZERO_FLOW` — incremento con flujo integrado prácticamente cero.
- `TOTALIZER_FLOW_MISMATCH` — incremento incompatible con flujo y tiempo.
- `INSUFFICIENT_FLOW_VALIDATION` — cobertura de flujo insuficiente para validar incremento.
- `MISSING_OPENING_READING` — falta lectura previa para apertura.
- `MISSING_CLOSING_READING` — falta cierre válido dentro del periodo.
- `VOLUME_NOT_CALCULABLE` / `VOLUME_NOT_RELIABLE`.
- `PARTIAL_COVERAGE`, `NO_DATA`, `VALID_ZERO`, `VALIDATED`.

## UI

El motivo aparece debajo del badge de validación en **Revisión diaria** y **Vista previa de Reportes**. En el detalle individual aparece debajo de `Volumen del periodo` cuando el volumen no es confiable.

## Seguridad del cambio

Este incremental es diagnóstico: no altera `totalizer_quality.py`, tolerancias, mapeos, SQL Server, autenticación, SMTP ni sensores. Después de observar el motivo real podremos decidir si hace falta una consulta SQL puntual o un ajuste de umbral.
