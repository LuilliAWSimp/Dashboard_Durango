# Incremental 42 — Cierre CSS V2

## Objetivo

Cerrar la fase de modularización CSS de Durango sin rediseñar la interfaz ni alterar contratos hidráulicos. El trabajo se limita a retirar familias visuales heredadas de módulos ya deshabilitados por capabilities y a mover reglas todavía vivas desde `global.css` hacia su hoja propietaria.

## Cambios

### `global.css`

- Pasa de **4,243** a **1,412 líneas**.
- Continúa cargándose como base heredada congelada.
- Se retiran bloques completos de:
  - Resumen heredado anterior al Resumen V2;
  - pantalla operativa antigua de Pozos;
  - Tanques;
  - Lámparas UV;
  - Concesión;
  - cards SCADA heredadas;
  - tooltip de Balance ya sin consumidor;
  - bloques duplicados de histórico/cards/notificaciones/exportación 5 min ya migrados.
- Ya no contiene selectores específicos de módulos deshabilitados por capabilities.
- Conserva únicamente primitivas/base compartida cuyo retiro no debe hacerse a ciegas.

### Propiedad modular

- `styles/pages/balance.css`
  - base visual viva del Balance;
  - hero y KPIs;
  - diferencia bloqueada;
  - z-index/overflow de su gráfica.
- `styles/pages/operational-modules.css`
  - estructura base de cards operativas;
  - `metric-pair`;
  - encabezado de módulos;
  - acción de card.
- `styles/pages/detalles.css`
  - navegación anterior/siguiente del detalle.
- `styles/pages/historicos.css`
  - notas de periodo;
  - selectores y chips del histórico;
  - tooltips;
  - capas de Recharts;
  - exportación Excel 5 min.
- `styles/pages/turnos.css`
  - selector de turno;
  - controles del rango;
  - capa del panel de turnos.
- `styles/pages/reportes.css`
  - modal de correo manual.
- `styles/pages/resumen.css`
  - responsividad de alertas operativas.
- `styles/shared.css`
  - tabla operativa compartida;
  - estados visuales reutilizados;
  - centro global de notificaciones.

### Protección futura

Se amplía `css-architecture.test.ts` y se agrega `cssClosure42.test.ts` para impedir que vuelvan a `global.css`:

- Concesión;
- Tanques;
- UV;
- Balance específico;
- cards operativas;
- navegación de detalle;
- Excel 5 min;
- modal de correo;
- centro de notificaciones.

La prueba también fija una base V2 menor a 1,600 líneas y verifica llaves balanceadas en todas las hojas modificadas.

## Fuera de alcance

No se modifican:

- backend;
- SQL Server;
- BOS;
- sensores;
- IDs;
- `operational_key`;
- factores;
- unidades;
- cálculos de flujo;
- cálculos de volumen;
- totalizadores;
- conciliación;
- históricos ni su contrato de datos;
- Turnos funcionalmente;
- Revisión diaria funcionalmente;
- Reportes funcionalmente;
- exportaciones funcionalmente;
- autenticación;
- capabilities;
- Balance funcionalmente.

Los componentes legacy todavía existentes en código se retirarán en el incremental dedicado a limpieza de legado; este cambio sólo cierra su presencia visual en el CSS runtime.

## Validación dirigida

- validación focal CSS/consumidores: **48/48**;
- regresión dirigida Incrementales 21–42: **146/146**;
- llaves CSS balanceadas: OK;
- módulos deshabilitados ausentes de `global.css`: OK;
- reglas migradas presentes en hojas propietarias: OK;
- runtime alcanzable: **84 archivos**;
- código runtime: **65 archivos**;
- CSS runtime: **18 hojas**;
- imports relativos sin resolver: **0**;
- backend comparado contra Incremental 41: sin cambios;
- build/typecheck completo no disponible porque el ZIP no incluye `node_modules/.bin/vite` ni `tsc`;
- no se ejecutaron suites completas;
- no se consultó SQL Server ni BOS.
