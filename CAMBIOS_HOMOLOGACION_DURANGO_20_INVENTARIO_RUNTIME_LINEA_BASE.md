# Incremental 20 — Inventario runtime y línea base de Durango

## Objetivo

Establecer una línea base reproducible antes de modernizar históricos, detalles, reportes y limpiar legado. Este incremental no modifica el comportamiento del dashboard.

## Cambios

- Se agregó `tools/audit_runtime_baseline.py` para seguir imports relativos desde el entrypoint real `frontend/src/main.jsx` usando el orden de resolución compatible con Vite para extensiones JS/TS/JSX/TSX.
- El auditor registra:
  - archivos frontend alcanzables desde `main.jsx`;
  - hojas CSS cargadas por el runtime;
  - rutas declaradas en `App.jsx`;
  - pares `.js/.ts` y `.jsx/.tsx`, indicando cuál variante está alcanzable hoy;
  - literales de API encontrados en código frontend alcanzable;
  - routers montados por `backend/app/main.py`;
  - rutas declaradas por esos routers;
  - imports relativos sin resolver.
- Se generó `docs/RUNTIME_BASELINE_DURANGO_20.md` como fotografía técnica del estado actual.
- Hallazgos de línea base:
  - 79 archivos alcanzables desde `main.jsx`;
  - 60 archivos de código JS/TS/JSX/TSX alcanzables;
  - 18 hojas CSS alcanzables;
  - 0 imports relativos sin resolver;
  - los pares activos más sensibles (`Header`, `Sidebar`, `LoginPage`, `api`, `authService`, `waterService`, `waterReportService`, `waterExportService`, `dailyWaterReportExportService`) resuelven actualmente a la variante `.js/.jsx`;
  - `WellsMinuteFlowPanel.tsx` está confirmado dentro del runtime actual;
  - existen componentes, servicios y routers heredados que no se eliminan todavía: se revisarán en los incrementales de canonización y limpieza profunda.
- Se documentó que `global.css` permanece congelado como base heredada durante esta etapa.

## Alcance protegido

No se modificó:

- SQL Server;
- BOS;
- sensores, IDs, unidades o factores de escala;
- cálculos de flujo/totalizador/volumen;
- conciliación o calidad;
- endpoints existentes;
- autenticación/sesiones;
- polling;
- reportes/exportaciones;
- Balance de Agua;
- `global.css` ni ninguna hoja CSS;
- componentes de runtime.

## Validación dirigida

- `python -m py_compile tools/audit_runtime_baseline.py`.
- Generación reproducible del inventario dos veces y comparación byte a byte.
- Verificación del grafo: 0 imports relativos sin resolver.
- Revisión manual de entrypoints `frontend/src/main.jsx`, `frontend/src/App.jsx` y `backend/app/main.py`.
- No se ejecutaron suites completas ni se hizo conexión a SQL Server/BOS porque el incremental es exclusivamente de inventario estático.
