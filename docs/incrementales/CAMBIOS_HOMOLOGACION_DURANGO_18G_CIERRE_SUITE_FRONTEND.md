# Durango 18G — Contratos de prueba post-refactor y cierre de suite frontend

## Objetivo

Cerrar los falsos negativos restantes después de la modularización CSS 18–18E y de la centralización de terminología del Incremental 17, sin alterar código de producción.

## Hallazgos

La suite frontend completa tenía 6 fallas:

1. cinco pruebas de tema claro todavía leían exclusivamente `styles/global.css`, aunque desde 18E el contrato transversal vive en `styles/theme.css` y los overrides específicos están en `shared.css` / `pages/historicos.css`;
2. una prueba del histórico esperaba el texto literal `Volumen del periodo (m³)`, aunque desde el Incremental 17 la etiqueta se genera mediante `operationalVolumeLabel(module, { scope: 'period' })`.

No se encontró una regresión visual o funcional asociada a esas seis fallas.

## Cambios

- `durangoThemeToggle.test.ts` ahora valida cada responsabilidad en su archivo propietario:
  - tema general / sidebar / superficies / KPIs / contraste → `theme.css`;
  - controles compartidos 11E → `shared.css`;
  - gráficos, selectores y agrupación del histórico → `pages/historicos.css`.
- `moduleComparison.test.ts` ya no exige una cadena fija para el volumen del modo Ambos; valida que `ModuleHistoryPanel` use el helper común `operationalVolumeLabel(...)`.
- Las pruebas conservan la misma intención funcional y ahora también protegen la arquitectura CSS modular.

## Validación

- Suite frontend completa: **62/62 pruebas OK**.
- No se modificó código de producción.
- No se ejecutaron suites backend/hidráulicas porque este incremental sólo corrige contratos de prueba frontend.
