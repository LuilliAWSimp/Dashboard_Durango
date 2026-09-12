# Homologación Durango 06 — Resumen, KPIs y comparativos diarios

## Objetivo

Acercar el Resumen de Durango al contrato común Guadalupe/Zapopan sin sustituir el contrato físico específico de Durango.

La regla introducida es:

- **Snapshot rápido del dashboard** para datos instantáneos:
  - flujo actual;
  - última lectura;
  - comunicación actual.
- **Revisión diaria conciliada** para valores diarios:
  - volumen validado;
  - actividad del día;
  - cobertura/calidad;
  - comparativos contra día anterior y semana anterior.

Esto evita usar un cálculo de periodo como si fuera un dato instantáneo y evita reconstruir el volumen diario dentro del Resumen.

---

## Backend

Archivo modificado:

`backend/app/services/water_daily_review_service.py`

### 1. Grupos operativos del Resumen

Además de los módulos físicos `wells`, `lines` y `flows`, `/water/review/daily` ahora expone:

```json
{
  "operational_groups": {
    "wells": {},
    "lines": {},
    "lavadoras": {},
    "jarabes": {},
    "other_flows": {}
  }
}
```

`lavadoras` agrupa las identidades cuyo `operational_key` empieza por `lavadora_`.

`jarabes` mantiene su identidad lógica única aunque internamente cambie de 3010 a 3004 según el corte histórico ya confirmado.

### 2. Comparativos

La misma agrupación también se agrega a:

```json
{
  "comparatives": {
    "previous_day": {
      "operational_groups": {}
    },
    "previous_week": {
      "operational_groups": {}
    }
  }
}
```

Por tanto el frontend no vuelve a sumar elementos para calcular el día anterior o la semana anterior.

### 3. Calidad

Cada grupo conserva el contrato de calidad del Incremental 02/03:

- `subtotal_validated_m3`
- `coverage_complete`
- `coverage_available`
- `coverage_total`
- `active_count`
- `inactive_count`
- `review_count`
- `no_data_count`

Un dato ausente sigue sin convertirse en `0 m³`.

---

## Frontend

Archivo modificado:

`frontend/src/pages/pozos/sections/DashboardBaseSection.tsx`

### 1. Un solo día

Cuando:

```text
startDate == endDate
```

el Resumen consulta:

```text
GET /api/v1/water/review/daily
  ?date=YYYY-MM-DD
  &include_shifts=false
  &include_comparatives=true
```

Los KPIs de volumen provienen de Revisión diaria.

Ejemplo:

```text
Volumen validado de pozos · día 31/08/2026
```

No se vuelve a calcular el volumen dentro del componente.

### 2. Rango de varios días

Si el usuario selecciona, por ejemplo:

```text
25/08/2026 → 31/08/2026
```

se conserva el subtotal validado del periodo que ya entrega el dashboard.

Los comparativos diarios se ocultan porque comparar un rango de siete días contra un único "día anterior" sería semánticamente incorrecto.

El usuario recibe el mensaje:

> Los comparativos diarios requieren que la fecha inicial y final sean el mismo día.

### 3. Datos instantáneos

Los KPIs:

- Pozos con flujo actual;
- Líneas con flujo actual;
- Lavadoras con flujo actual;
- Jarabes con flujo actual;
- Última actualización;

siguen usando el snapshot actual del dashboard.

Por tanto consultar el 12/08 no hace que un KPI llamado "flujo actual" utilice el flujo histórico del 12/08.

### 4. Nuevo subtotal operativo

Se agrega:

```text
Subtotal validado · día seleccionado
```

que suma sólo los grupos cuyo volumen está disponible.

Si un elemento/grupo tiene información incompleta, el texto aclara que se trata de un subtotal y nunca asume cero para completar el total.

### 5. Comparativo diario por módulo

Nueva tabla:

| Módulo | Seleccionado | Día anterior | Variación | Semana anterior | Variación semanal | Actividad | Cobertura | Detalle |
|---|---:|---:|---:|---:|---:|---:|---|---|
| Pozos | ... | ... | ... | ... | ... | ... | ... | Abrir |
| Líneas | ... | ... | ... | ... | ... | ... | ... | Abrir |
| Lavadoras | ... | ... | ... | ... | ... | ... | ... | Abrir |
| Jarabes | ... | ... | ... | ... | ... | ... | ... | Abrir |

La variación se expresa como porcentaje cuando existe una referencia distinta de cero.

Si la referencia es cero, se presenta la diferencia absoluta en m³ para evitar divisiones inválidas.

Si falta el dato confiable se muestra:

```text
Sin referencia
```

en lugar de `0`.

### 6. Navegación

Cada fila dispone de `Abrir` y dirige al módulo correspondiente:

- Pozos → `/pozos/pozos`
- Líneas → `/pozos/lineas`
- Lavadoras → `/pozos/flujos`
- Jarabes → `/pozos/jarabes`

---

## Semántica final del Resumen

```text
SQL / BOS
   ↓
Normalización Durango
   ↓
Conciliación [T0,T1)
   ↓
Revisión diaria
   ↓
KPIs diarios + comparativos
```

Mientras que:

```text
SQL / BOS
   ↓
Dashboard rápido
   ↓
Flujo actual + totalizador actual + última lectura
```

El Resumen combina ambas fuentes sin mezclar su significado.

---

## Qué NO cambia

Este incremental no modifica:

- sensores;
- mapeos;
- SQL Server;
- `.env`;
- autenticación;
- SMTP;
- turnos;
- reglas de totalizador;
- corte SCADA del 04/08/2026;
- calibración histórica de Pozo 1;
- remapeo histórico 3010 → 3004 de Jarabes;
- Reportes;
- Histórico modular;
- Excel 5 min.

---

## Prueba recomendada

1. Reiniciar backend y frontend.
2. Entrar a **Resumen**.
3. Seleccionar un solo día posterior a los cortes, por ejemplo `2026-08-12`.
4. Confirmar:
   - volúmenes del día;
   - día anterior;
   - semana anterior;
   - cobertura;
   - links `Abrir`.
5. Cambiar a un rango de varios días y confirmar que:
   - se siguen mostrando subtotales del periodo;
   - la tabla comparativa diaria indica que requiere un solo día.
6. Volver a **Hoy** y confirmar que los KPIs de flujo actual siguen cambiando con el snapshot de planta.

---

## Validaciones mínimas realizadas

- `water_daily_review_service.py`: compilación Python correcta.
- `DashboardBaseSection.tsx`: parsing/transpilación TypeScript/TSX correcta.

No se ejecutaron pruebas conectadas contra SQL Server en el entorno de generación.
