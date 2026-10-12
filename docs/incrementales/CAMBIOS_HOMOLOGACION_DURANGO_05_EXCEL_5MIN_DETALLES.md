# Homologación Durango 05 — Excel conciliado de 5 minutos y detalles con histórico común

## Objetivo

Eliminar una fuente histórica paralela en los detalles individuales y añadir una exportación operativa cada 5 minutos basada en el mismo contrato de conciliación introducido en los incrementales 02–04.

Este incremental no cambia sensores, mapeos, autenticación, SMTP, turnos ni reglas físicas de Durango.

## 1. Nuevo Excel conciliado de 5 minutos

Se agrega:

`GET /api/v1/water/history/five-minute/excel`

Parámetros:

- `module=well|line|flow`
- `element_id=<sensor o operational_key>`
- `start_date=YYYY-MM-DD`
- `end_date=YYYY-MM-DD`

El rango máximo es de **3 días calendario**.

### Identidades soportadas

El endpoint no exige que todos los elementos tengan sensor numérico. Por ejemplo:

- Pozo 1 → `1001`
- Línea 1 → `2002`
- Lavadora Línea 2 → `2004`
- Lavadora Vidrio → `lavadora_vidrio`
- Lavadora Ref Pet → `lavadora_ref_pet`
- Jarabes → `3004` / identidad operativa `jarabes`

Esto evita inventar IDs para fuentes BOS que no tienen un sensor numérico útil en el contrato operativo.

## 2. Regla temporal

Cada bucket usa el contrato:

```text
[T0,T1)

apertura = última lectura válida < T0
muestras = T0 <= lectura < T1
cierre   = última lectura válida dentro del bucket
```

La lectura previa de apertura:

- sirve como contexto del totalizador;
- no cuenta como muestra;
- no altera cobertura;
- no altera flujo promedio.

Los intervalos normales son de 5 minutos.

### Corte SCADA

Nunca se mezclan datos anteriores al corte validado:

`2026-08-04 18:16:00 America/Mexico_City`

Si una consulta incluye el 04/08, el primer intervalo puede ser parcial:

`18:16–18:20`

Después los buckets regresan a fronteras normales:

`18:20–18:25`, `18:25–18:30`, etc.

## 3. Fuentes

### iot.readings_minute

Se usa para:

- Pozo 1
- Pozo 2
- Línea 1
- Línea 3
- Línea 4
- Línea 5
- Lavadora Línea 2

La normalización histórica del Pozo 1 sigue en la capa Durango:

- antes de `2026-08-11 12:15` → `raw / 3.6`
- desde ese corte → L/s directo

### dbo.SensorsBOS_Lavadoras

Se usa para:

- Lavadora Vidrio
- Lavadora Ref Pet

Se consulta la lectura válida inmediatamente anterior al bucket inicial para resolver su apertura real.

### dbo.SensorsBOS_Tanque

Jarabes conserva una sola identidad operativa mientras el backend resuelve el canal físico según la fecha:

- segmento anterior → `3010 / TANQUE_FLOW_IN[4]`
- segmento actual → `3004 / TANQUE_FLOW_IN[1]`

## 4. Contenido del Excel

Hoja `5 minutos`:

- Elemento
- Identidad
- Inicio local
- Fin local
- Flujo promedio
- Flujo mínimo
- Flujo máximo
- Apertura totalizador
- Cierre totalizador
- Volumen conciliado
- Volumen reportable
- Muestras recibidas
- Muestras esperadas
- Cobertura
- Calidad
- Fuente de apertura

### Volumen conciliado vs volumen reportable

`Volumen conciliado` conserva el resultado calculado por la capa de conciliación incluso cuando el intervalo necesita revisión.

`Volumen reportable` sólo se llena cuando el contrato marca el volumen como confiable.

Por lo tanto:

```text
Sin datos != 0 m3
Dato en revisión != 0 m3
Cobertura parcial != volumen completo
```

La hoja `Conciliacion` muestra:

- total de intervalos;
- intervalos reportables;
- intervalos con datos no reportables;
- intervalos sin datos;
- subtotal reportable;
- regla temporal;
- corte SCADA.

## 5. Detalles individuales

`OperationalDetailSection.tsx` deja de usar el histórico individual anterior como gráfica principal.

Antes:

```text
Detalle
  └─ useWaterHistory()
       └─ /water/history
```

Ahora:

```text
Detalle
  └─ ModuleHistoryPanel
       └─ /water/history/module
```

El panel se filtra a un único elemento, por lo que mantiene la apariencia de un detalle pero usa la misma serie que la comparativa/histórico general.

Los indicadores del detalle también empiezan a priorizar el contrato conciliado (`reconciled_open_m3`, `reconciled_close_m3`, `reconciled_validated_volume_m3`, `reconciled_volume_reliable`). Un volumen no confiable se presenta mediante su etiqueta de calidad en lugar de convertirlo visualmente en `0.00 m³`.

Así se evita que:

```text
Histórico general = A
Detalle individual = B
```

## 6. Controles del detalle

El rango de fecha del detalle actualiza:

- KPIs del periodo;
- histórico operativo;
- exportación de 5 minutos;
- contexto de navegación anterior/siguiente.

El histórico común conserva:

- Flujo
- Totalizador
- Ambos
- 1 min
- 15 min
- 1 h
- 1 día
- Variación del totalizador
- Valor absoluto
- Excel visible
- PDF visible

Y se agrega el botón:

`Excel 5 min`

## 7. Archivos

### Nuevos

- `backend/app/services/water_five_minute_export_service.py`
- `backend/tests/test_durango_five_minute_export.py`
- `frontend/src/services/waterFiveMinuteExportService.ts`
- `frontend/src/pages/pozos/components/FiveMinuteExcelExportButton.tsx`

### Modificados

- `backend/app/api/routes/water.py`
- `frontend/src/pages/pozos/components/DateRangeControls.tsx`
- `frontend/src/pages/pozos/components/OperationalDetailSection.tsx`
- `frontend/src/styles/global.css`

## 8. No se modifica

- `.env`
- credenciales
- SQL Server
- autenticación
- SMTP
- sensores
- mapeos
- horarios de turnos
- corte SCADA
- calibración histórica del Pozo 1
- remapeo histórico de Jarabes
- `totalizer_quality.py`

## 9. Prueba sugerida

Aplicar después del Incremental 04 y reiniciar backend/frontend.

Probar un día posterior a los cortes, por ejemplo `2026-08-12`:

1. Abrir Pozo 1.
2. Confirmar que el histórico ofrece Flujo / Totalizador / Ambos.
3. Alternar 1 min / 15 min / 1 h / 1 día según el rango permitido.
4. Presionar `Excel 5 min`.
5. Revisar las hojas `5 minutos` y `Conciliacion`.
6. Repetir en Línea 1.
7. Repetir en Lavadora Vidrio.
8. Repetir en Jarabes.

Para probar el cambio de canal de Jarabes, usar `2026-08-11`.

## 10. Resultado esperado para homologación

A partir de este incremental la referencia arquitectónica es:

```text
Fuente física
   ↓
Normalización Durango
   ↓
Conciliación común
   ↓
Histórico por módulo
   ├─ Resumen / comparativa
   └─ Detalle individual

Conciliación común
   ↓
Excel 5 min
```

El siguiente incremental puede centrarse en **Resumen/KPIs y comparativos**, porque el detalle individual ya dejó de sostener una ruta histórica independiente.
