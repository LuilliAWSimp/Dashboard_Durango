# Homologacion Durango 11F - Cards operativas y detalles simplificados

## Objetivo
Reducir ruido tecnico en las tarjetas y vistas de detalle sin modificar sensores, calculos, backend ni fuentes historicas.

## Cambios realizados

### Cards operativas de Pozos, Lineas, Lavadoras y Jarabes
- Se reducen los bloques visibles a cuatro datos principales:
  - Flujo actual.
  - Totalizador actual.
  - Volumen del periodo.
  - Actividad del periodo.
- Se retiran de la tarjeta principal:
  - Validacion.
  - Tiempo activo.
  - Cobertura.
- El estado `Apagado con datos` / `Sin flujo` se presenta al operador como `Detenido`.
- El estado `Activo` / `Operando` se presenta como `En operacion`.
- La comunicacion normal (`Normal`, `Actualizado`, `En linea`, `Online`) deja de ocupar espacio en la tarjeta.
- Si la comunicacion requiere atencion, el aviso sigue visible.
- Cuando la comunicacion es normal, el pie muestra directamente `Ultima lectura` y su fecha/hora.

### Detalle individual
- Se eliminan del resumen principal los indicadores tecnicos que saturaban la vista:
  - Muestras.
  - Cobertura.
  - Calidad.
  - Tiempo activo.
  - Comunicacion normal.
- Se renombran terminos tecnicos:
  - `Apertura conciliada` -> `Totalizador inicial`.
  - `Cierre conciliado` -> `Totalizador final`.
  - `Promedio durante actividad` -> `Flujo promedio`.
- El bloque `Estado del periodo` pasa a `Resumen del periodo`.
- La comunicacion se muestra solo cuando requiere atencion.
- El volumen conserva el diagnostico de calidad solo cuando no puede mostrarse un volumen confiable.

### Tabla operativa
- `Apertura` y `Cierre` pasan a `Totalizador inicial` y `Totalizador final`.
- Los estados tambien usan las etiquetas naturales `Detenido` / `En operacion`.

### Modo claro
- Los bloques internos dejan de usar fondos grises.
- Se usa azul claro ARCA para metricas internas y pies de card.
- Textos y bordes usan azules oscuros/medios con mayor contraste.
- Una falla de comunicacion conserva tratamiento semantico amarillo visible.

## Archivos incluidos
- `frontend/src/pages/pozos/components/OperationalDetailSection.tsx`
- `frontend/src/pages/pozos/components/OperationalModuleSection.tsx`
- `frontend/src/pages/pozos/operationalDisplay.ts`
- `frontend/src/styles/global.css`
- `frontend/tests/operationalDisplay.test.ts`

## Validacion
- Suite frontend: 50/50 pruebas correctas.
- No se modificaron backend, SQL Server, autenticacion, SMTP, sensores, mapeos ni calculos hidraulicos.
