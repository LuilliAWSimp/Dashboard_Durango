# Incremental 31 — Resumen ejecutivo V2

## Alcance

Se simplifica el Resumen de Durango para priorizar información operativa útil y retirar bloques redundantes o técnicamente ambiguos, sin modificar datos, contratos ni cálculos hidráulicos.

## Cambios

- Se elimina el bloque `Accesos operativos`; la navegación lateral ya cubre esa función.
- Se elimina el KPI `Subtotal validado` porque suma corrientes/procesos distintos y puede inducir una lectura ejecutiva de doble conteo.
- Se elimina el KPI técnico `Revisión / cobertura parcial` como protagonista del Resumen.
- Los cuatro KPIs separados de flujo actual se consolidan en `Elementos con flujo actual`.
- Se agrega `Alertas activas`, con indicación de alertas críticas cuando existen.
- Se conservan separados los volúmenes de Pozos, Líneas, Lavadoras y Jarabes.
- Los volúmenes dejan de mostrar `validado` en la etiqueta visible; la fuente de datos no cambia.
- Se mantiene `Última actualización` como indicador de frescura.
- Se simplifica el texto de cabecera para evitar terminología interna como `Snapshot` y `conciliado`.
- El comparativo se renombra a `Comparativo de volumen por módulo` y usa `Fecha seleccionada` en vez de `Día actual`.
- `Cobertura` pasa a `Datos`, con copy más operativo (`x/y con datos`).
- Se conservan el histórico global, comparativos y alertas.

## Fuera de alcance

No se modifican SQL Server, BOS, sensores, IDs, factores, unidades, conciliación, cálculos, endpoints, históricos, exportaciones, módulos, Balance, Reportes, Revisión diaria, Turnos, autenticación ni CSS. `global.css` permanece sin cambios.

## Validación dirigida

- `summaryExecutive31.test.ts`: 6 pruebas.
- Regresiones seleccionadas de histórico global, módulos, rendimiento, rangos largos, alertas y arquitectura CSS.
- Total dirigido: 50 pruebas aprobadas.
- Auditor runtime: 82 archivos alcanzables, 63 archivos de código, 18 CSS, 0 imports relativos sin resolver.
- No se ejecutaron suites completas.
