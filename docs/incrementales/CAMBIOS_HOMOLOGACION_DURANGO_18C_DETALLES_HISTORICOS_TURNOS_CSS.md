# Homologación Durango 18C — Detalles + Históricos + Turnos CSS

## Objetivo

Continuar la migración robusta de `global.css` iniciada en 18/18B, separando responsabilidades reales de detalles individuales, históricos operativos y cortes por turno sin rediseñar la interfaz ni alterar contratos hidráulicos.

## Cambios

### Detalles individuales

- Se creó `frontend/src/styles/pages/detalles.css`.
- Se migró el bloque base de detalle técnico que vivía en `global.css`.
- El hero, rango y resumen del detalle ahora exponen scopes semánticos por módulo:
  - `operational-detail-well`
  - `operational-detail-line`
  - `operational-detail-flow`
- El histórico embebido del detalle se identifica como `operational-detail-history`.
- Los overrides finos 11F/11G continúan en `operational-cards-details.css` y cargan después de `detalles.css`, conservando su precedencia.

### Históricos operativos

- Se creó `frontend/src/styles/pages/historicos.css`.
- Se migraron desde `global.css`:
  - selector accesible de agrupación;
  - menú 1m/15m/1h/1d;
  - tooltip histórico de dos columnas;
  - acciones PDF/Excel del histórico modular;
  - control de variación/valor absoluto del totalizador.
- `ModuleHistoryPanel` expone ahora scopes comunes:
  - `operational-history-panel`;
  - `operational-history-well`;
  - `operational-history-line`;
  - `operational-history-flow`.
- `ElementHistoryPanel` y los controles SQL de fecha también exponen scope de histórico.

### Turnos

- Se creó `frontend/src/styles/pages/turnos.css`.
- Se migró el bloque base completo de cortes por turno:
  - panel;
  - selector;
  - cards de resumen;
  - tablas;
  - disclosures;
  - responsive.
- `ShiftConsumptionPanel` expone scopes por módulo/contexto:
  - `operational-shifts-panel`;
  - `operational-shifts-well|line|flow|all`;
  - `operational-shifts-detail`;
  - `operational-shifts-module`;
  - `operational-shifts-review`.

### Cascada

El orden queda:

1. `tokens.css`
2. `global.css`
3. `resumen.css`
4. `operational-modules.css`
5. `detalles.css`
6. `historicos.css`
7. `turnos.css`
8. `operational-cards-details.css`
9. `shared.css`

### Reducción de `global.css`

- Antes de 18C: 8,624 líneas.
- Después de 18C: 8,005 líneas.
- Reducción del incremental: 619 líneas.
- Base previa a la fase CSS: 9,218 líneas.
- Reducción acumulada 18 + 18B + 18C: 1,213 líneas.

La reducción de líneas no es el criterio de éxito; sólo confirma que las responsabilidades se están moviendo realmente.

## Decisión deliberada

Los bloques `11D` y `11E` permanecen todavía en `global.css` porque mezclan en una misma zona:

- Reportes;
- Revisión diaria;
- Turnos;
- controles de fechas;
- históricos;
- Recharts/modo claro.

Se migrarán en 18D junto con Reportes/Revisión para no romper la cascada dividiendo overrides compartidos a ciegas.

También permanecen algunos bloques heredados comprimidos/multifunción para una limpieza posterior cuando pueda demostrarse qué consumidores siguen activos.

## Fuera de alcance

No se modifican:

- backend;
- SQL Server;
- sensores;
- cálculos;
- conciliación `[T0,T1)`;
- horarios de turno;
- reportes o scheduler;
- autenticación;
- Balance de Agua;
- Diagrama Hídrico;
- contenido visible de las gráficas.

## Validación dirigida

- `css-architecture.test.ts`: 6 pruebas OK.
- `operational-presentation.test.ts`: 4 pruebas OK.
- Total dirigido: 10/10 OK.
- Orden de imports verificado.
- Bloques migrados ausentes de `global.css`.
- Scopes semánticos verificados en componentes.
- No se ejecutaron suites generales del dashboard.
