# Incremental 21 — Histórico operativo global V2

## Objetivo

Actualizar el histórico del Resumen de Durango al patrón global actual sin modificar la matemática hidráulica ni retirar todavía la gráfica heredada minuto a minuto de Pozos.

## Cambios

- El histórico principal del Resumen ahora funciona como una consulta histórica independiente del periodo general del dashboard.
- Se agregaron controles propios `Desde`, `Hasta`, `Actualizar` y `Restablecer`.
- El selector global separa físicamente las vistas de Durango en:
  - Pozos;
  - Líneas;
  - Lavadoras;
  - Jarabes.
- Lavadoras y Jarabes conservan el contrato backend `flow`; la separación se realiza con los catálogos reales definidos en `DURANGO_CAPABILITIES`, sin crear módulos SQL/BOS ficticios.
- Se mantienen las métricas:
  - Flujo;
  - Totalizador;
  - Ambos.
- Se mantienen los modos de totalizador:
  - Variación del periodo;
  - Valor absoluto.
- Se mantienen las agrupaciones:
  - 1 minuto;
  - 15 minutos;
  - 1 hora;
  - 1 día.
- Cuando el rango seleccionado excede la granularidad permitida por el backend, el frontend eleva automáticamente la agrupación a una compatible antes de consultar:
  - 1 minuto: máximo 1 día;
  - 15 minutos: máximo 7 días;
  - 1 hora: máximo 31 días;
  - 1 día: rangos largos permitidos por el contrato actual.
- PDF y Excel siguen usando exactamente el rango, módulo/vista, elementos, métrica y agrupación visibles.
- El rango histórico conserva polling sólo cuando incluye el día actual.
- Los estilos nuevos se agregaron a `historicos.css`, con soporte claro/oscuro y responsive.
- `WellsMinuteFlowPanel` se conserva temporalmente para que el Incremental 22 pueda retirarlo de forma aislada una vez validado este reemplazo funcional.

## Alcance protegido

No se modificó:

- SQL Server;
- BOS;
- sensores o IDs;
- factores/unidades;
- conciliación;
- cálculo de flujo, totalizador o volumen;
- endpoints backend;
- límites backend de agrupación;
- Reportes;
- Revisión diaria;
- Turnos;
- autenticación;
- Balance de Agua;
- `global.css`.

## Validación dirigida

- `operationalHistoryGlobal21.test.ts`: 5/5.
- regresión `moduleComparison.test.ts`: 8/8.
- regresión `css-architecture.test.ts`: 8/8.
- Se comprobó que `global.css` no recibió reglas nuevas.
- El intento de `npm run typecheck` no pudo completarse porque el ZIP fuente no incluye las dependencias instaladas (`@types/node` / `vite/client`). No se interpreta como fallo funcional del incremental.
- No se ejecutaron suites completas.

## Archivos modificados

- `frontend/src/pages/pozos/components/ModuleHistoryPanel.tsx`
- `frontend/src/pages/pozos/sections/DashboardBaseSection.tsx`
- `frontend/src/styles/pages/historicos.css`
- `frontend/tests/css-architecture.test.ts`
- `frontend/tests/operationalHistoryGlobal21.test.ts`
- `CAMBIOS_HOMOLOGACION_DURANGO_21_HISTORICO_OPERATIVO_GLOBAL_V2.md`
