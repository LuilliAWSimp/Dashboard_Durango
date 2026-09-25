# Homologación Durango 41 — Balance / Concesión

## Objetivo

Cerrar la visibilidad y el contrato de los dos módulos que permanecían pendientes en el Incremental 40, sin inventar relaciones hidráulicas ni información legal no confirmada.

## Decisión aplicada

### Balance de Agua

Permanece visible como `Balance de Agua · En validación` porque ya existe evidencia operativa por grupo y un contrato backend protegido que documenta las preguntas físicas pendientes.

No se habilita como balance oficial.

Se elimina de la presentación y del cálculo candidato cualquier resta o suma transversal entre grupos cuya relación física todavía no está confirmada.

En particular:

- no se publica suma de `Líneas + Lavadoras + Jarabes` como consumo final;
- no se calcula `Pozos - Líneas - Lavadoras - Jarabes`;
- no se publica diferencia no conciliada;
- no se publica pérdida, fuga, eficiencia o porcentaje de aprovechamiento.

La pantalla conserva por separado:

- Pozos monitoreados;
- Líneas;
- Lavadoras;
- Jarabes.

Y muestra como pendientes:

- fuente base;
- consumos finales aditivos;
- revisión de doble conteo;
- habilitación de diferencia no conciliada.

El backend conserva campos legacy de aritmética candidata con valor `None` para no romper consumidores antiguos, pero `candidate_arithmetic_enabled` queda explícitamente en `False`.

### Concesión

Se deshabilita como módulo navegable.

Durango no tiene actualmente confirmados en el contrato del proyecto:

- título de concesión;
- volumen autorizado;
- vigencia/ciclo;
- mapeo título ↔ pozo;
- base acumulada oficial del ciclo.

Por ello:

- `concession` pasa a `false` en capabilities frontend/backend;
- Concesión sale del menú;
- una URL directa queda bloqueada por el mismo guard de capabilities;
- el endpoint de sección devuelve `not_available` sin consultar BOS;
- no se calculan remanente, porcentaje usado ni consumo oficial a partir de datos operativos.

El componente heredado `ConcesionSection.tsx` no se elimina todavía; queda para la limpieza de legado posterior.

## Validación

- 14/14 pruebas frontend focales Balance/Concesión/capabilities: OK.
- 10/10 pruebas backend focales Balance/Concesión/capabilities: OK.
- 72/72 pruebas frontend dirigidas de regresión 31–41: OK.
- 35/35 pruebas backend dirigidas de capabilities, Balance, SCADA, terminología y servicios de agua: OK, con una prueba heredada de Reportes deseleccionada porque ya falla sin cambios en la base del Incremental 40 (`get_shift_consumption_data` no existe en `water_daily_report_service`).
- La falla heredada fue reproducida contra `/mnt/data/work_dur40_full`: no es introducida por este incremental.
- `py_compile` de los servicios backend modificados y prueba nueva: OK.
- auditor runtime: 84 archivos alcanzables, 65 de código, 18 CSS, 0 imports relativos sin resolver.
- CSS sin cambios respecto al Incremental 40.
- `global.css` sin cambios.
- No se ejecutaron suites completas.
- No se consultó SQL Server ni BOS.

## Fuera de alcance

No se modificaron sensores, IDs, `operational_key`, fuentes BOS, tablas SQL, factores, unidades, conciliación, cálculos de flujo/volumen/totalizador, históricos, turnos, Revisión diaria, Reportes, exportaciones, SMTP, autenticación ni el contrato físico definitivo del Balance.
