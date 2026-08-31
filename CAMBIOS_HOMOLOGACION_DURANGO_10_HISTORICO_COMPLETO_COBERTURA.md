# Homologación Durango 10 — Histórico completo de planta, datos crudos y cobertura

## Objetivo

Añadir a **Reportes** una exportación histórica integral equivalente al estándar más reciente de Zapopan, sin mezclar el dato físico almacenado con el dato hidráulico conciliado.

Este incremental incorpora:

- Excel histórico completo.
- PDF resumen histórico.
- detalle crudo por minuto;
- resumen crudo por periodo;
- datos crudos diarios;
- resumen conciliado;
- conciliado diario;
- cobertura diaria por elemento;
- detección de huecos;
- catálogo de sensores y fuentes;
- notas de interpretación.

## Fechas confirmadas que usa Durango

### Histórico físico

Para `iot.readings_minute`:

```text
03/06/2026 15:35 hora local
```

Este inicio está confirmado por la auditoría histórica del Incremental 01.

### Segmento hidráulico validado

```text
04/08/2026 18:16 hora local
```

Los registros anteriores se conservan como **datos crudos**, pero no se relabelan como pertenecientes al contrato operativo posterior al cambio general de SCADA.

### Pozo 1

```text
11/08/2026 12:15 local
```

Antes del corte:

```text
flujo normalizado L/s = instant_value bruto / 3.6
```

Después:

```text
flujo normalizado L/s = instant_value bruto
```

El Excel conserva ambas columnas: flujo bruto y flujo normalizado.

### Jarabes

```text
11/08/2026 13:40:29 local
```

Antes:

```text
3010 / TANQUE_FLOW_IN[4]
```

Después:

```text
3004 / TANQUE_FLOW_IN[1]
```

Para el usuario continúa siendo una sola identidad lógica: **Jarabes**.

## Separación entre dato crudo y conciliado

### Dato crudo

Responde a:

> ¿Qué quedó almacenado físicamente?

No se oculta porque luego una validación hidráulica lo considere parcial o no confiable.

Un cero real se conserva como `0`.

Un hueco se conserva vacío.

### Dato conciliado

Responde a:

> ¿Qué puede utilizarse operativamente como volumen confiable?

Reutiliza el Histórico operativo diario ya homologado, incluyendo:

- fronteras `[T0,T1)`;
- apertura y cierre;
- validación de totalizador;
- corrección de señales asíncronas del Incremental 08B;
- cobertura;
- `volume_reliable`;
- `validated_volume_m3`;
- estados de calidad.

No se crea una segunda fórmula de volumen dentro del exportador histórico.

## Excel

Nuevo endpoint:

```http
GET /api/v1/water/reports/historical/excel
```

Parámetros opcionales:

```text
start_date=YYYY-MM-DD
end_date=YYYY-MM-DD
```

Si no se especifican, exporta desde el inicio físico confirmado hasta el día actual.

Máximo por exportación:

```text
366 días
```

### Hojas

#### Resumen

Incluye planta, periodo, fechas de corte y reglas principales.

#### Crudo 1 min

Una fila por minuto local.

Para cada elemento incluye:

```text
flujo bruto
flujo normalizado L/s
totalizador m³
fuente/canal
```

Esto permite revisar el valor físico y el valor presentado por el dashboard sin perder trazabilidad.

#### Resumen crudo

Por elemento:

```text
primera muestra
última muestra
flujo bruto inicial/final
flujo normalizado inicial/final
totalizador inicial/final
delta crudo
muestras
cobertura
```

El `delta crudo` es solamente:

```text
último totalizador - primer totalizador
```

Puede contener resets o saltos y **no sustituye** al volumen validado.

#### Datos crudos diarios

Por día y elemento:

```text
flujo bruto promedio
flujo normalizado promedio/mín/máx
total inicial/final
delta crudo
muestras
esperadas
cobertura
fuente
```

#### Resumen conciliado

Por elemento:

```text
volumen validado acumulado
días validados
días en revisión
días sin datos
```

#### Conciliado diario

Reutiliza `/water/history/module` con agregación diaria y muestra:

```text
apertura
cierre
volumen calculado
volumen validado
confiabilidad
flujo promedio
muestras
cobertura
estado del dato
validación
eventos descartados
```

#### Cobertura diaria

La cobertura se calcula por **minutos observados**, no por número bruto de filas BOS.

Esto es importante porque `SensorsBOS_Tanque` puede tener muchas muestras por minuto.

#### Huecos

Resume los días donde uno o más elementos tienen cobertura no íntegra.

No inventa lecturas ni reconstruye minutos ausentes.

#### Sensores

Documenta:

- identidad;
- sensor;
- tabla;
- canal;
- timezone;
- unidad bruta;
- inicio físico;
- inicio validado;
- regla histórica.

#### Notas

Explica la semántica de crudo, conciliado, ceros, huecos, Pozo 1 y Jarabes.

## Cobertura del día actual

No se utiliza `1440` como denominador cuando el día todavía no termina.

Ejemplo:

```text
13:18 local
```

Se compara contra los minutos transcurridos hasta ese momento.

De esta forma un sensor que ha entregado todos los minutos disponibles aparece como:

```text
Completo hasta el momento
```

y no como ~55 % de un día que todavía no termina.

## Primer día físico

El 03/06/2026 tampoco se compara contra un día completo para `iot.readings_minute`.

La ventana esperada inicia a:

```text
15:35
```

## Lavadoras y Jarabes antes del corte general

No se atribuyen automáticamente datos anteriores al 04/08/2026 18:16 a las identidades actuales.

La razón es que la auditoría confirmó el mapeo operativo posterior al corte, no necesariamente el contrato físico anterior.

Esto evita relabelar histórico no confirmado.

## PDF histórico

Nuevo endpoint:

```http
GET /api/v1/water/reports/historical/pdf
```

El PDF es un resumen, no una exportación minuto a minuto.

Incluye:

- periodo;
- criterios;
- cortes conocidos;
- resumen crudo;
- resumen conciliado;
- cobertura diaria;
- días sin registros;
- días parciales;
- notas de interpretación.

## Frontend

En **Reportes** aparece un nuevo bloque:

```text
HISTÓRICO COMPLETO DE PLANTA
Crudo + conciliado + cobertura

[ Excel histórico completo ] [ PDF histórico ]
```

El Excel usa botón verde para conservar la convención visual de exportaciones Excel.

## Archivos

### Nuevos

```text
backend/app/services/water_historical_export_service.py
backend/tests/test_durango_full_historical_export_contract.py
frontend/src/services/waterHistoricalExportService.ts
CAMBIOS_HOMOLOGACION_DURANGO_10_HISTORICO_COMPLETO_COBERTURA.md
```

### Modificados

```text
backend/app/api/routes/water.py
frontend/src/pages/pozos/sections/ReportesSection.tsx
frontend/src/styles/global.css
```

## No se modifica

- `.env`;
- credenciales SQL Server;
- SMTP;
- autenticación;
- correo programado;
- sensores;
- mapeos;
- horarios de turno;
- lógica de alertas;
- reglas de conciliación existentes;
- validación asíncrona 08B.

## Prueba recomendada en planta

1. Reiniciar backend/frontend.
2. Ir a **Reportes**.
3. Descargar **PDF histórico** primero; debe ser rápido y servir para validar cobertura.
4. Descargar **Excel histórico completo**.
5. Revisar las hojas `Crudo 1 min`, `Cobertura diaria` y `Conciliado diario`.
6. Confirmar especialmente:
   - Pozo 1 alrededor del 11/08 12:15;
   - Jarabes alrededor del 11/08 13:40;
   - que antes del 04/08 el dato crudo de iot pueda existir pero no aparezca como volumen conciliado válido.
