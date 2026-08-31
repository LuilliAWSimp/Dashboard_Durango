# Homologacion Durango 03 - Revision diaria como fuente unica

## Objetivo

Convertir **Revision diaria** en la fuente diaria comun de Durango, siguiendo el patron de homologacion Guadalupe/Zapopan:

```text
lecturas fisicas
    -> normalizacion Durango
    -> conciliacion [T0,T1)
    -> validacion del totalizador
    -> contrato global de calidad
    -> /api/v1/water/review/daily
    -> Revision diaria
```

Este incremental todavia **no migra Resumen ni Reportes** al nuevo endpoint. Eso se hara en incrementales posteriores para reducir riesgo.

---

## 1. Nuevo endpoint diario

Se agrega:

```http
GET /api/v1/water/review/daily
```

Parametros:

- `date=YYYY-MM-DD`
- `include_shifts=true|false`
- `include_comparatives=true|false`
- `force_refresh=true|false`

Ejemplo:

```http
GET /api/v1/water/review/daily?date=2026-08-31&include_shifts=true&include_comparatives=true
```

El payload contiene:

- Pozos.
- Lineas.
- Flujos/Lavadoras/Jarabes.
- resumen por modulo.
- resumen general.
- turnos.
- comparativo contra el dia anterior.
- comparativo contra la misma fecha de la semana anterior.
- estado del segmento SCADA validado.

Tambien conserva alias compatibles con el frontend actual:

- `wells`
- `production_lines`
- `flows`
- `operational_summary`

---

## 2. Fronteras conciliadas usadas por Revision diaria

Para la nueva fuente diaria se priorizan:

```text
reconciled_open_m3
reconciled_close_m3
reconciled_validated_volume_m3
reconciled_volume_reliable
quality_status
quality_label
boundary_complete
opening_source
```

La semantica es:

```text
[T0,T1)

apertura = ultima lectura valida estrictamente anterior a T0
muestras = T0 <= lectura < T1
cierre   = ultima lectura valida dentro del periodo
```

La lectura de apertura es contexto y **no aumenta la cantidad de muestras del periodo**.

---

## 3. Pozos, Lineas y Lavadora Linea 2

La consulta de apertura de `iot.readings_minute` ahora recupera tambien el flujo instantaneo asociado a la lectura previa.

Esto permite que el analizador fisico de totalizadores evalúe correctamente el primer incremento del intervalo sin perder el contexto de flujo.

Los campos historicos anteriores siguen existiendo para compatibilidad. La nueva Revision diaria consume los campos conciliados.

---

## 4. Lavadora Vidrio y Lavadora Ref Pet

Antes estas fuentes BOS consultaban solamente filas dentro del periodo.

Ahora se consulta explicitamente la ultima lectura valida anterior a `T0` en:

```text
dbo.SensorsBOS_Lavadoras
```

para cada canal:

```text
LAVADORAS_0 -> Lavadora Vidrio
LAVADORAS_1 -> Lavadora Ref Pet
```

La apertura se consulta usando tiempo UTC en SQL y se normaliza una sola vez a la hora local de Durango.

---

## 5. Jarabes y cambio de canal

Jarabes conserva una sola identidad operativa.

El buscador de apertura previa atraviesa correctamente sus dos segmentos fisicos:

```text
04/08/2026 18:16 local
    hasta 11/08/2026 13:40:29 local
    -> 3010 / TANQUE_FLOW_IN[4]

11/08/2026 13:40:29 local en adelante
    -> 3004 / TANQUE_FLOW_IN[1]
```

Si una consulta inicia inmediatamente despues del cambio de canal y aun no existe una lectura previa valida en el canal nuevo, la busqueda puede recuperar la ultima lectura valida del segmento antiguo como frontera de la misma identidad logica `jarabes`.

No se crean dos elementos Jarabes.

---

## 6. Calidad diaria comun

La Revision diaria utiliza el contrato introducido en el Incremental 02:

```text
Validado
Cero valido
Cobertura parcial
Dato en revision
Sin datos
```

Reglas importantes:

- `0.00 m3` solo se presenta cuando el cero es confiable.
- Falta de frontera, discontinuidad o volumen no confiable no se convierte en cero.
- El volumen mostrado por la nueva fuente diaria usa el volumen conciliado validado.
- Cuando el modulo no esta completo, el resumen se identifica como subtotal validado.

---

## 7. Turnos dentro de Revision diaria

Los turnos mantienen:

```text
T1 00:00-07:00
T2 07:00-15:00
T3 15:00-24:00
```

pero ahora sus elementos priorizan tambien:

- apertura conciliada;
- cierre conciliado;
- volumen conciliado;
- calidad comun.

En la pantalla de Revision diaria, `ShiftConsumptionPanel` recibe los turnos incluidos en `/review/daily`.

Por tanto ya no hace una segunda consulta `/water/shifts` solo para esa pantalla.

Otros lugares del dashboard que usan `ShiftConsumptionPanel` siguen pudiendo consultar `/water/shifts` normalmente.

---

## 8. Frontend

`RevisionDiariaSection.tsx` deja de cargar:

```text
/water/dashboard/dashboard
+
/water/shifts
```

como fuentes independientes.

Ahora carga:

```text
/water/review/daily
```

La pantalla conserva:

- selector de fecha;
- refresco automatico del dia actual;
- KPIs;
- alertas;
- tabla de detalle;
- turnos.

La columna de apertura y cierre usa las fronteras conciliadas.

El KPI de flujo se renombra a **Con flujo al cierre**, porque en una fecha historica representa la ultima lectura del periodo y no el flujo actual de la planta.

---

## 9. Comparativos preparados

El endpoint ya entrega:

```text
comparatives.previous_day
comparatives.previous_week
```

con resumen por modulo.

Todavia no se agregan nuevas tarjetas comparativas a la interfaz en este incremental. Los datos quedan preparados para el bloque posterior de Resumen/KPIs/comparativos.

---

## 10. Archivos modificados

Backend:

```text
backend/app/api/routes/water.py
backend/app/services/water_period_service.py
backend/app/services/durango_lavadoras_service.py
backend/app/services/durango_jarabes_service.py
backend/app/services/water_shift_service.py
backend/app/services/water_daily_review_service.py   NUEVO
backend/tests/test_durango_daily_review_service.py   NUEVO
```

Frontend:

```text
frontend/src/services/waterService.js
frontend/src/services/waterService.ts
frontend/src/pages/pozos/components/ShiftConsumptionPanel.tsx
frontend/src/pages/pozos/sections/RevisionDiariaSection.tsx
```

---

## 11. No se modifica

- `.env`.
- credenciales SQL Server.
- SMTP.
- autenticacion.
- usuarios.
- roles.
- sensores confirmados.
- corte SCADA del 04/08/2026.
- conversion historica del Pozo 1.
- identidad/cambio de canal de Jarabes.
- horarios de turnos.
- Reportes.
- Resumen.
- Balance de Agua.

---

## 12. Comprobacion recomendada

Despues de aplicar el incremental, reiniciar el backend y abrir **Revision diaria**.

Probar como minimo:

1. Dia actual.
2. Un dia cerrado posterior al 11/08/2026.
3. `11/08/2026`, porque cruza el cambio de canal de Jarabes.
4. Verificar que Lavadora Vidrio, Lavadora Ref Pet y Jarabes ya tengan `Apertura` cuando existe una lectura anterior valida.
5. Confirmar que los turnos aparecen sin una segunda carga independiente.

Tambien puede consultarse directamente:

```text
http://127.0.0.1:8000/api/v1/water/review/daily?date=2026-08-31
```

El puerto debe ajustarse solamente si la instalacion real usa otro puerto.

---

## 13. Validacion tecnica realizada

Se verifico sintaxis Python de los servicios/ruta modificados y sintaxis JavaScript de `waterService.js`.

La compilacion TypeScript completa no se ejecuto en el entorno de preparacion porque no estaban instaladas localmente las definiciones `node` y `vite/client`; no se instalaron dependencias adicionales solo para esta validacion.

El test nuevo queda incluido para ejecutarse en el entorno normal de Durango, donde `pyodbc` y las dependencias de `requirements.txt` ya estan disponibles.

---

## Siguiente incremental recomendado

**04 - Historico modular completo**

- agregar agregacion de 1 minuto con limite prudente;
- totalizador en modo Variacion / Absoluto;
- homologar `Ambos` con doble eje;
- preparar Excel/PDF desde la misma serie cargada.

Despues se continuaria con Excel 5 min + detalles individuales.
