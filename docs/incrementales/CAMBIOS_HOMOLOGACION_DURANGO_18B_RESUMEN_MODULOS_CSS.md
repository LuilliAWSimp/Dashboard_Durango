# Homologacion Durango 18B - Resumen + modulos operativos CSS

## Objetivo

Continuar la migracion robusta iniciada en el Incremental 18, separando responsabilidades visuales reales del Resumen y de los modulos operativos sin redisenar ni mover historicos/turnos antes de su fase propia.

## Cambios

- Se crean `styles/pages/resumen.css` y `styles/pages/operational-modules.css`.
- `DashboardBaseSection` expone el scope `.dashboard-resumen-page`.
- `OperationalModuleSection` expone `.operational-module-page` y un scope derivado por modulo.
- Los wrappers usan `display: contents`, por lo que no agregan una caja nueva al layout.
- Se migran fuera de `global.css` las reglas vivas de:
  - refresco/KPIs del Resumen;
  - alertas operativas embebidas en Resumen;
  - jerarquia clara de Accesos operativos del Resumen (11C);
  - KPIs y cards operativas en modo claro (11B).
- `global.css` pasa de 8,983 a 8,624 lineas.
- No se migran todavia historicos, selectores de agrupacion ni turnos; quedan reservados para 18C.
- No se trasladan bloques antiguos que ya no tienen consumidores activos solo para reducir lineas.

## Arquitectura

Orden de cascada:

1. `tokens.css`
2. `global.css` (legado congelado)
3. `pages/resumen.css`
4. `pages/operational-modules.css`
5. `pages/operational-cards-details.css`
6. `shared.css`

## Validacion dirigida

- 5 pruebas de arquitectura CSS: OK.
- 4 pruebas de presentacion/navegacion existentes: OK.
- Balance de llaves CSS de global/resumen/modulos: OK.
- Los marcadores 11B, 11C y alertas de Resumen ya no permanecen en `global.css`.
- No se ejecutaron suites generales del dashboard.
