# Durango 33 — Limpieza de detalles

## Alcance

Limpieza visual y de copy en el detalle individual de Pozos, Líneas, Lavadoras y Jarabes. No cambia contratos de datos, cálculos hidráulicos, históricos, exportaciones ni backend.

## Cambios

- Se retira la ceja visible `Detalle operativo` del hero de la card individual.
- Se eliminan subtítulos redundantes del hero, selector de rango y `Resumen del periodo`.
- Se retira `Actividad del periodo` del resumen individual porque el estado ya se muestra en cabecera y la actividad por turno permanece en `Cortes por turno`.
- El histórico individual puede omitir explícitamente su subtítulo sin caer en el texto interno de fallback `mismo motor histórico del Resumen`.
- En modo `singleElement` se ocultan las notas explicativas de representación de ejes y del límite de 1 minuto; la política de rango continúa aplicada por los controles y validaciones existentes.
- `DateRangeControls` ya no reserva una línea de subtítulo cuando recibe texto vacío.
- En `Cortes por turno` se oculta únicamente dentro del detalle individual el subtítulo técnico sobre apertura/cierre con totalizadores; el resto de usos del componente conserva su comportamiento actual para ser tratado en los incrementales de Revisión diaria/Turnos.
- Se eliminan las propiedades `detailSubtitle` que quedaron sin consumidor en la configuración de Lavadoras/Jarabes.

## Sin cambios

- SQL Server y BOS.
- Sensores, IDs y `operational_key`.
- Factores, unidades y conciliación.
- Cálculos de flujo, volumen y totalizador.
- Histórico global y por módulo.
- Exportaciones PDF, Excel y Excel 5 min.
- KPIs dinámicos del periodo.
- Navegación Anterior/Siguiente/Volver.
- Backend y endpoints.
- CSS y `global.css`.
- Reportes, Revisión diaria, autenticación y Balance de Agua.

## Validación dirigida

- Regresión amplia de incrementales 21–33: 76/76 pruebas frontend aprobadas.
- Regresión focal del detalle: 43/43 pruebas aprobadas.
- Auditor de runtime: 82 archivos alcanzables, 63 archivos de código, 18 CSS y 0 imports relativos sin resolver.
- Backend comparado contra Incremental 32: sin cambios.
- `frontend/src/styles` comparado contra Incremental 32: sin cambios.
- No se ejecutaron suites completas.
