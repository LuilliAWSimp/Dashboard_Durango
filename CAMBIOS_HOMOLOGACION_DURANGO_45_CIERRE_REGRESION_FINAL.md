# Incremental 45 — Cierre dirigido / regresión final

## Objetivo

Cerrar la homologación de Durango sin introducir funcionalidad nueva, ejecutando regresión completa, corrigiendo expectativas de prueba obsoletas y dejando documentación de proyecto alineada con el runtime final.

## Cambios

- Se corrigieron dos pruebas backend heredadas que no representaban el contrato actual:
  - Reportes ahora prueba el adaptador canónico de Revisión diaria en lugar de una dependencia de Turnos ya retirada del servicio de Reportes.
  - Una discontinuidad de totalizador se espera como `Dato en revisión` / `review`, no como `Validado`.
- `tools/audit_runtime_baseline.py` deja de fijar “Incremental 20”:
  - admite `--incremental`;
  - infiere el incremental desde `RUNTIME_BASELINE_DURANGO_<id>.md` cuando es posible;
  - actualiza las decisiones del auditor al estado post-canonización/limpieza.
- Se genera `docs/RUNTIME_BASELINE_DURANGO_45.md` con el estado final real.
- Se agrega `docs/CIERRE_HOMOLOGACION_DURANGO_45.md` con validación final y pendientes externos.
- Se actualiza `README.md` para describir únicamente los módulos y contratos reales de Durango.
- Se actualiza `CAMBIOS_DURANGO_MODERNIZACION.md`, retirando mapeos y notas antiguas que ya no corresponden al runtime final.

## Alcance de producción

No se modificó lógica de producción del frontend ni del backend.

No se modificaron:

- SQL Server;
- BOS;
- sensores;
- IDs;
- `operational_key`;
- factores/unidades;
- flujo/volumen/totalizadores;
- conciliación;
- históricos;
- Turnos;
- Revisión diaria;
- Reportes;
- exportaciones;
- SMTP;
- autenticación;
- capabilities;
- Balance;
- CSS;
- `global.css`.

## Validación

- Frontend completo: 185/185.
- Backend completo en SQLite aislado: 172/172.
- Parser TypeScript: 64 archivos, 0 errores sintácticos.
- Runtime: 83 archivos alcanzables, 64 de código, 18 CSS, 0 imports relativos sin resolver.
- Código frontend huérfano: 0.
- Pares JS/TS duplicados: 0.
- `compileall` backend/app + backend/tests: correcto.
- Importación FastAPI y rutas críticas: correcta.
- `npm run typecheck`: bloqueado por ausencia de `frontend/node_modules` (`node`, `vite/client`).
- No se consultó SQL Server/BOS real.

## Pendientes externos

- Balance físico oficial.
- Datos legales de Concesión.
- Smoke test contra SQL Server/BOS real.
- Prueba SMTP real y ejecución programada en la PC de planta.
