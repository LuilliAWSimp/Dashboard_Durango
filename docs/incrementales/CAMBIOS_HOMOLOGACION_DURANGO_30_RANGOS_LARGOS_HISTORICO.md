# Durango 30 — Rangos largos del histórico

## Objetivo

Reducir el riesgo de timeouts y lecturas SQL excesivamente largas al consultar históricos de 7, 15 y 30 días, conservando exactamente el mismo contrato hidráulico y las mismas reglas de agrupación ya homologadas.

## Cambios

- Las lecturas históricas se dividen en ventanas contiguas según granularidad:
  - 1 minuto: 1 día;
  - 15 minutos: 2 días;
  - 1 hora: 3 días;
  - 1 día: 7 días.
- La consulta SQL numérica conserva su preagregación a 15 minutos antes de que Python consolide a hora/día.
- El mismo esquema de ventanas aplica a consultas de un elemento y comparativas de módulo.
- Lavadoras y Jarabes se leen también por ventanas y luego se recomponen cronológicamente.
- La validación física de pozos conserva el límite existente de 31 días y se lee en ventanas máximas de 7 días; el cambio no amplía ese contrato.
- Frontend centraliza la política de rango/granularidad en `historyRangePolicy.ts`.
- Para un rango activo, las granularidades no soportadas quedan deshabilitadas.
- Al aplicar un rango largo dentro del detalle se promueve automáticamente a una granularidad válida antes de consultar backend.
- Se actualizaron regresiones anteriores para admitir atributos futuros en las opciones del selector y la política temporal centralizada.

## Sin cambios

- SQL Server / estructura SQL.
- BOS.
- sensores, IDs u `operational_key`.
- factores de escala y unidades.
- conciliación, calidad o matemática de volumen/totalizador.
- endpoints públicos.
- PDF, Excel y Excel 5 min.
- Reportes, Revisión diaria, Turnos, autenticación o Balance.
- CSS y `global.css`.

## Validación

- Frontend dirigido: 63 pruebas aprobadas.
- Backend dirigido: 35 pruebas aprobadas.
- `py_compile` del servicio y test nuevo: aprobado.
- Auditor runtime: 82 archivos alcanzables, 63 de código, 18 CSS, 0 imports relativos rotos.
- Regresión ampliada adicional: 31 aprobadas y 2 fallos preexistentes confirmados también sobre la base del Incremental 29; no pertenecen al alcance del 30.
- No se ejecutaron suites completas ni consultas a SQL Server/BOS.
