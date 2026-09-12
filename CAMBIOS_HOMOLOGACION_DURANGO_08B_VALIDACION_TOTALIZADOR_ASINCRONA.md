# Homologación Durango 08B - Validación de totalizador asíncrona

## Motivo

La inspección SQL del 31/08/2026 confirmó falsos positivos de `Dato en revisión`.
El totalizador y `instant_value` no siempre cambian en el mismo ciclo de adquisición.

Ejemplos observados:

- Pozo 1: 04:19 flujo 0 L/s y total 100662.328125; 04:20 flujo 21.24 L/s y total 100663.406250.
- Pozo 2: 01:13 flujo 0 L/s; 01:14 flujo 35.37 L/s y avance de 1.9375 m³.
- Línea 5: avance monótono del totalizador durante cambios rápidos del flujo.
- Lavadora Vidrio y Ref Pet: el totalizador presenta actualizaciones agrupadas mientras el flujo instantáneo puede permanecer temporalmente en cero.

Los valores actuales coinciden con SCADA, por lo que esos eventos no representan por sí mismos una falla de sensor.

## Correcciones

### 1. Integración de flujo sin sesgo de un minuto

Antes el volumen esperado entre dos muestras se integraba usando sólo el flujo de la muestra anterior.
Eso marcaba falsamente los arranques porque el minuto anterior podía ser 0 L/s aunque el totalizador y el flujo comenzaran a moverse en la muestra siguiente.

Ahora se usa una estimación trapezoidal entre los dos extremos disponibles.

### 2. `require_flow_validation` se respeta realmente

La comparación física flujo-totalizador sólo puede invalidar un incremento cuando el contrato del elemento tiene:

`require_flow_validation = True`

Antes la comparación se ejecutaba también cuando el contrato tenía `False` siempre que había cobertura de flujo. Esto afectaba, entre otros, a Línea 5.

### 3. Actualizaciones pequeñas asíncronas

El límite para un avance de totalizador con flujo integrado prácticamente cero pasa de 0.50 m³ a 3.0 m³, alineado con la tolerancia absoluta general existente.

Esto permite actualizaciones PLC agrupadas como las observadas en Lavadoras sin certificar saltos grandes.

### 4. Protecciones que se conservan

Siguen siendo discontinuidades:

- caídas o resets del totalizador;
- incrementos grandes incompatibles cuando `require_flow_validation=True`;
- saltos de totalizador con flujo cero superiores a la tolerancia de ingeniería;
- falta de fronteras/cobertura según el contrato común de calidad.

No se modificaron sensores, mapeos, SQL Server, autenticación, SMTP ni reglas de cutover de Durango.

## Resultado esperado para 31/08/2026

Los falsos positivos vistos en Pozo 1, Pozo 2, Línea 5, Lavadora Vidrio y Lavadora Ref Pet deben dejar de invalidar el volumen sólo por desfase de adquisición.

Si un elemento sigue en revisión después de este cambio, el diagnóstico 08A mostrará el siguiente motivo real que deba investigarse.

## Pruebas

Se añadieron pruebas específicas para:

- arranque de Pozo con flujo y totalizador cambiando en la misma muestra;
- actualización agrupada pequeña con flujo instantáneo en cero;
- Línea con `require_flow_validation=False`;
- salto grande con flujo cero, que sigue rechazándose;
- caída/reset del totalizador, que siempre sigue rechazándose.
