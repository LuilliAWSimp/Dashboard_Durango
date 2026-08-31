# Homologacion Durango 01 - Auditoria historica y fechas validas

## Objetivo

Antes de trasladar a Durango la conciliacion temporal y los historicos de la guia maestra Guadalupe + Zapopan, este incremental agrega una auditoria **de solo lectura** para conocer con precision que datos existen y desde cuando son confiables.

No cambia el dashboard, no modifica SQL Server y no altera sensores, mapeos, turnos, autenticacion ni reportes.

## Por que se hace primero

Durango ya tiene varios cortes fisicos/historicos confirmados:

1. **04/08/2026 18:16 local** - corte general de SCADA. El proyecto ya considera este instante como inicio del segmento operativo validado posterior.
2. **11/08/2026 12:15 local** - Pozo 1 cambia la unidad raw de flujo: antes esta en m3/h y se normaliza dividiendo entre 3.6; despues ya llega en L/s.
3. **11/08/2026 19:40:29 UTC / 13:40:29 local** - Jarabes cambia del canal `TANQUE_FLOW_IN[4]` sensor 3010 al canal `TANQUE_FLOW_IN[1]` sensor 3004.

Por eso no es seguro copiar fechas minimas o reglas historicas de Zapopan, Guadalupe u otra planta.

## Archivos agregados

```text
backend/app/services/durango_history_audit.py
backend/app/scripts/audit_water_history.py
docs/auditoria_historica_durango.sql
CAMBIOS_HOMOLOGACION_DURANGO_01_AUDITORIA_HISTORICA.md
```

## Que audita

Por cada elemento operativo intenta obtener:

- primer registro fisico;
- ultimo registro;
- primer flujo distinto de cero;
- primer totalizador positivo;
- cantidad total de muestras;
- cobertura diaria;
- dias con cobertura parcial;
- dias completamente sin registros;
- fuente fisica;
- zona horaria de la fuente.

Tambien incorpora los cortes historicos ya confirmados en el contrato de Durango.

## Fuentes consideradas

### iot.readings_minute

Se usa para:

- Pozo 1 - 1001;
- Pozo 2 - 1051;
- Linea 1 - 2002;
- Linea 3 - 2006;
- Linea 4 - 2008;
- Linea 5 - 2010;
- Lavadora Linea 2 - 2004, conservando fisicamente `LINEA_FLOW_IN[1]`.

### dbo.SensorsBOS_Lavadoras

Se auditan por columnas reales:

- Lavadora Vidrio;
- Lavadora Ref Pet.

Sus timestamps se interpretan como UTC y se convierten a `America/Mexico_City`.

### dbo.SensorsBOS_Tanque

Jarabes se audita como **una identidad operativa** pero con dos segmentos fisicos:

```text
04/08/2026 18:16 local
        -> sensor 3010 / TANQUE_FLOW_IN[4]

11/08/2026 13:40:29 local
        -> sensor 3004 / TANQUE_FLOW_IN[1]
```

El cambio de canal no debe verse como dos elementos diferentes en el dashboard.

## Como ejecutar la auditoria

En la PC de Durango, con el `.env` real ya configurado:

```powershell
cd backend
python -m app.scripts.audit_water_history
```

Esto imprime el resultado en consola.

Para guardar un MD:

```powershell
python -m app.scripts.audit_water_history --markdown ../docs/AUDITORIA_HISTORICA_DURANGO_RESULTADO.md
```

Para guardar tambien JSON:

```powershell
python -m app.scripts.audit_water_history `
  --markdown ../docs/AUDITORIA_HISTORICA_DURANGO_RESULTADO.md `
  --json ../docs/auditoria_historica_durango.json
```

Se puede limitar el rango:

```powershell
python -m app.scripts.audit_water_history `
  --start-date 2026-08-04 `
  --end-date 2026-08-31
```

## Cobertura

El primer dia no espera 1440 muestras completas si la ventana empieza a las 18:16.

Por ejemplo, para el 04/08 el sistema calcula solamente los minutos esperados entre:

```text
18:16 -> 24:00
```

El dia actual tampoco se compara contra 1440 minutos futuros: usa solamente los minutos transcurridos dentro de la ventana auditada.

Por defecto se considera cobertura completa a partir de 95%:

```text
>= 95%      completa
> 0 y <95%  parcial
0           sin registros
```

El umbral se puede cambiar:

```powershell
python -m app.scripts.audit_water_history --coverage-threshold 98
```

## Resultado que necesitamos antes del Incremental 02

El MD generado debe permitir confirmar para cada elemento:

```text
Elemento
Fuente
Primer registro
Primer flujo util
Primer totalizador positivo
Cobertura por dia
Huecos completos
```

Con esa informacion el siguiente incremental podra introducir la conciliacion `[T0,T1)` sin adivinar fechas validas ni mezclar segmentos historicos incompatibles.

## Regla para futuros cambios

Este incremental no convierte automaticamente un primer valor positivo en una fecha de validez definitiva.

La auditoria entrega evidencia; el contrato operativo sigue mandando.

Por ejemplo:

- Pozo 1 puede tener datos antes y despues del corte de calibracion, pero la unidad se interpreta diferente en cada segmento.
- Jarabes puede tener continuidad hidraulica aunque cambie de sensor/canal fisico.
- datos anteriores al corte general de SCADA no deben relabelarse con el contrato posterior.

## Siguiente incremental previsto

`02 - Conciliacion temporal comun + contrato global de calidad`

Usara los resultados de esta auditoria y conservara `totalizer_quality.py` como analizador fisico especifico de Durango.
