# Homologación Durango 02 - Conciliación temporal y contrato global de calidad

## Objetivo

Introducir en Durango las dos capas comunes que después compartirán Histórico, Revisión diaria, Reportes y Resumen:

1. conciliación temporal canónica `[T0,T1)`;
2. contrato global de calidad ARCA.

Este incremental es deliberadamente transicional: **no reemplaza todavía los campos históricos/volumen que consumen las pantallas actuales**. Agrega los nuevos campos conciliados en paralelo para migrar consumidores de forma controlada en los siguientes pasos.

## Regla temporal común

Se agregó `backend/app/services/water_interval_reconciliation.py`.

Para cualquier intervalo `[T0,T1)`:

- apertura: última lectura de totalizador válida con `timestamp < T0`;
- muestras del periodo: sólo `T0 <= timestamp < T1`;
- cierre: última lectura válida dentro del periodo;
- la lectura de apertura es contexto y **no cuenta como muestra**;
- si no existe lectura anterior, se declara `missing_previous_reading=true`;
- `boundary_complete=true` sólo cuando existe apertura anterior y cierre dentro del periodo.

La conciliación **no decide** si un incremento es físicamente válido. Esa responsabilidad sigue en `totalizer_quality.py`.

## Contrato global de calidad

Se agregó `backend/app/services/water_quality.py` con cinco estados visibles estándar:

| quality_status | Etiqueta |
|---|---|
| `validated` | Validado |
| `valid_zero` | Cero válido |
| `partial_coverage` | Cobertura parcial |
| `review` | Dato en revisión |
| `no_data` | Sin datos |

Reglas generales:

- 0 muestras -> `Sin datos`;
- discontinuidad, frontera incompleta o volumen no confiable -> `Dato en revisión`;
- cobertura < 80% con volumen técnicamente calculable -> `Cobertura parcial`;
- volumen confiable igual a cero -> `Cero válido`;
- volumen confiable positivo -> `Validado`.

## Integración inicial en `water_period_service.py`

Para Pozos, Líneas y Lavadora Línea 2 (fuente `iot.readings_minute`) cada item de periodo incorpora ahora, además de los campos existentes:

```text
reconciled_open_m3
reconciled_close_m3
opening_source
missing_previous_reading
boundary_complete
previous_valid_reading
first_period_reading
quality_data_status
quality_status
quality_label
quality_volume_reliable
```

También el resumen por módulo expone `quality_counts`.

### Importante

Los campos legacy:

```text
period_open_m3
period_close_m3
period_m3
validated_volume_m3
volume_reliable
```

se mantienen en este incremental para no cambiar de golpe Revisión diaria, Reportes o frontend.

La migración a los campos conciliados se hará progresivamente en los siguientes incrementales.

## Fuentes BOS especiales

Lavadora Vidrio, Lavadora Ref Pet y Jarabes conservan por ahora su servicio actual. Su conciliación de frontera anterior requiere consultar una lectura BOS previa a `T0`; se realizará al migrar Revisión diaria/periodos para no introducir una aproximación incorrecta.

## Contrato específico Durango conservado

No se modifica:

- corte SCADA: `2026-08-04 18:16` local;
- Pozo 1: antes de `2026-08-11 12:15` normalizar flujo raw con `/3.6`; después usar L/s directo;
- Jarabes: identidad lógica única con cambio 3010 -> 3004;
- `totalizer_quality.py` y sus reglas físicas;
- mapeos y fuentes BOS;
- turnos, reportes, autenticación o frontend.

## Ejemplo

Si el periodo es `07:00 <= t < 15:00`:

```text
06:59  total=100.0  <- apertura, contexto
07:00  total=100.1  <- muestra 1
...
14:59  total=108.4  <- cierre
15:00  total=108.5  <- fuera del periodo
```

La conciliación devuelve:

```text
reconciled_open_m3 = 100.0
reconciled_close_m3 = 108.4
opening_source = previous_valid_reading
boundary_complete = true
```

La fila 06:59 no incrementa `samples_received`.

## Archivos

- `backend/app/services/water_interval_reconciliation.py` (nuevo)
- `backend/app/services/water_quality.py` (nuevo)
- `backend/app/services/water_period_service.py`
- `backend/tests/test_durango_interval_reconciliation.py` (nuevo)
