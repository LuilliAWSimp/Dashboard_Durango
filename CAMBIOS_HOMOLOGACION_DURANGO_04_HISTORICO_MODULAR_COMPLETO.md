# Homologación Durango 04 — Histórico modular completo

## Objetivo

Llevar el histórico operativo de Durango al contrato visual/funcional usado como referencia en Zapopan, sin sustituir los mapeos ni cortes históricos propios de Durango.

Este incremental extiende el histórico existente para que Pozos, Líneas y Flujos compartan:

- 1 minuto;
- 15 minutos;
- 1 hora;
- 1 día;
- Flujo;
- Totalizador;
- Ambos;
- Totalizador como variación del periodo o valor absoluto;
- Excel de exactamente la muestra visible;
- PDF de exactamente la muestra visible.

## 1. Agregación de 1 minuto

El endpoint ahora acepta:

```text
minute
quarter_hour
hourly
daily
```

Rutas:

```text
GET /api/v1/water/history
GET /api/v1/water/history/module
```

La vista de `minute` está limitada a un máximo de **1 día calendario** por consulta para evitar respuestas excesivas.

### Pozos y Líneas

Para `iot.readings_minute` se consulta directamente cada lectura física del minuto, conservando:

- flujo;
- totalizador observado;
- huecos;
- cero real.

Pozo 1 sigue respetando su corte histórico:

```text
antes de 2026-08-11 12:15 local -> normalización histórica
posterior al corte                 -> L/s directo
```

### Lavadoras y Jarabes

Las tablas BOS pueden contener más de una lectura dentro del mismo minuto. Para la gráfica de 1 minuto:

- el minuto cuenta una sola vez para cobertura;
- el flujo se resume dentro de ese minuto;
- se conserva el totalizador observado del minuto;
- no se convierten huecos en cero.

Jarabes mantiene su identidad operativa única aunque atraviese el cambio físico 3010 -> 3004.

## 2. Semántica del totalizador a 1 minuto

A 1 minuto no se presenta un volumen validado independiente para cada punto. El objetivo de la serie minuto a minuto es mostrar el **valor físico observado del totalizador** y el flujo.

Por ello cada punto de 1 minuto expone:

```text
totalizer_close_m3 = valor observado
volume_m3           = null
volume_reliable     = false
```

Los volúmenes conciliados continúan perteneciendo a los intervalos superiores y a Revisión diaria.

## 3. Variación del totalizador

La interfaz conserva siempre el valor absoluto recibido del backend y calcula una segunda serie de presentación:

```text
variacion = totalizador observado - primera lectura válida visible
```

Esto NO modifica el dato almacenado ni la conciliación hidráulica.

Ejemplo:

```text
10:00  15,430.20 m3 -> variación 0.00 m3
10:15  15,433.10 m3 -> variación 2.90 m3
10:30  15,436.25 m3 -> variación 6.05 m3
```

Si existe un reset o descenso real, la variación puede hacerse negativa. No se oculta.

### Modos de visualización

**Totalizador** permite:

```text
Variación del periodo
Valor absoluto
```

**Ambos** usa automáticamente:

```text
Flujo                   -> eje izquierdo
Variación del totalizador -> eje derecho
```

Esto evita que un totalizador absoluto de miles de m3 aplaste visualmente una serie de flujo pequeña.

## 4. Excel del histórico operativo

El botón `Excel` genera un archivo `.xls` compatible con Excel a partir de las filas que ya están cargadas en la gráfica.

No realiza otra consulta SQL.

Por tanto:

```text
lo visible en gráfica = lo exportado
```

Respeta:

- módulo;
- elementos seleccionados;
- métrica;
- agrupación;
- rango;
- variación o absoluto del totalizador.

Los `null` permanecen vacíos.

## 5. PDF del histórico operativo

Nueva ruta:

```text
POST /api/v1/water/history/module/pdf
```

El frontend envía únicamente la muestra ya visible:

```json
{
  "module_label": "Pozos",
  "metric_label": "Ambos",
  "aggregation_label": "15 min",
  "start_date": "2026-08-12",
  "end_date": "2026-08-12",
  "selected_names": ["Pozo 1", "Pozo 2"],
  "rows": [],
  "series": []
}
```

El backend genera un PDF con:

- encabezado Planta Durango;
- rango;
- elementos seleccionados;
- gráfica con fondo claro;
- tabla de los mismos valores visibles;
- huecos vacíos.

Para la vista absoluta del totalizador el eje no se fuerza a cero, evitando comprimir valores grandes.

## 6. Archivos modificados

Backend:

```text
backend/app/services/water_history_service.py
backend/app/services/water_module_history_pdf_service.py   NUEVO
backend/app/api/routes/water.py
backend/tests/test_durango_history_overview.py
```

Frontend:

```text
frontend/src/pages/pozos/components/ModuleHistoryPanel.tsx
frontend/src/pages/pozos/components/DateRangeControls.tsx
frontend/src/pages/pozos/moduleComparisonCore.ts
frontend/src/pages/pozos/operationalNavigation.ts
frontend/src/pages/pozos/types.ts
frontend/src/services/waterModuleHistoryExportService.ts   NUEVO
frontend/src/styles/global.css
frontend/tests/moduleComparison.test.ts
```

## 7. Qué no se modifica

No se cambian:

- sensores;
- mapeos;
- tablas SQL;
- autenticación;
- SMTP;
- turnos;
- reglas del Pozo 1;
- cambio histórico de Jarabes;
- `totalizer_quality.py`;
- Revisión diaria;
- cálculos del Resumen;
- reportes diarios.

## 8. Validaciones realizadas

- compilación sintáctica de los archivos Python modificados: correcta;
- generación aislada del PDF: correcta;
- pruebas frontend de comparación modular: 7/7 correctas;
- la prueba backend conectada no puede ejecutarse en el entorno de generación porque éste no dispone de `pyodbc`; no representa un fallo del proyecto de Durango.

## 9. Prueba recomendada en la PC de Durango

Probar un día posterior al corte de calibración, por ejemplo `2026-08-12`:

1. entrar al histórico operativo;
2. seleccionar Pozos;
3. cambiar entre 1 min / 15 min / 1 h / 1 día;
4. comprobar Flujo;
5. comprobar Totalizador -> Variación;
6. cambiar a Valor absoluto;
7. comprobar Ambos;
8. descargar Excel;
9. descargar PDF;
10. repetir en Líneas y Flujos.

Para `1 min`, Inicio y Fin deben corresponder al mismo día.

## Siguiente incremental

**Durango 05 — Excel conciliado de 5 minutos + detalles individuales usando el histórico común.**
