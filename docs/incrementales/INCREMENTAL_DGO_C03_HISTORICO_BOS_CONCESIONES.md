# DGO-C03 | Extracción operativa real en Concesiones

**Base:** aplicar exclusivamente sobre el proyecto que ya contiene DGO-C01 y DGO-C02.

## Objetivo

Sustituir el marcador vacío «Sin histórico mensual conciliado» por mediciones operativas reales de los pozos Durango y enriquecer el análisis visual. No se introducen consumos ficticios, permisos nuevos, cambios a sensores ni saldos legales presuntos.

## Contrato de datos

- `GET /api/v1/concessions/history/monthly?year=2026` (requiere sesión autenticada).
- Reutiliza `get_water_history_module(module='well', aggregation='daily')`, que ya verifica incrementos del totalizador físico.
- Los dos pozos usan los sensores existentes BOS `1001` y `1051`.
- El histórico comienza, como mínimo, desde `DURANGO_SCADA_CUTOVER_LOCAL`, actualmente `2026-08-04 18:16`; no se reinterpretan lecturas anteriores sin validación.
- Para cada mes: `volume_m3`, `status` (`available`, `partial`, `no_data`, `outside_window`), días confiables, excluidos, faltantes y cobertura estimada.
- Volúmenes sin verificación (`volume_reliable` falso), ausentes, negativos o no finitos se excluyen. Se muestran como periodos parciales/no disponibles, **nunca como consumo cero**.
- La extracción anual que se muestra es suma **operativa del periodo con lecturas**, no un cierre anual legal. Si no hay ningún mes con datos, el acumulado es `null`.
- No se calculan `remaining_m3` ni `usage_percent` regulatorio, porque falta validar el ciclo/vigencia de los títulos y la cobertura total de ese ciclo.
- Si no hay conexión histórica, se presenta error y botón Reintentar. No se sustituye por un gráfico simulado.

## Visualización

- Extracción mensual: barras por mes, media de meses con mediciones (no cuota legal), estados parciales y tooltips de cobertura.
- Curva acumulada: solo meses observados, con huecos cuando falta información.
- Tarjetas: extracción operativa observada por pozo, manteniendo las barras de participación del volumen autorizado como concepto independiente.
- KPI: extracción operativa del año seleccionado, calculada con el mismo endpoint.
- Panel del pozo: extracción operativa, comparación porcentual *orientativa* contra la cuota y saldo legal pendiente de verificar.
- Selector de año de 2026 hasta el año actual. Actualización periódica cada 5 minutos; el botón Actualizar datos fuerza una nueva consulta a la API existente (sin `force_refresh` de SQL) y a Concesiones.
- Modo claro/oscuro y responsive propios de Concesiones.

## Verificación dirigida

1. Con BOS accesible e históricos, entrar a Concesiones: tras cargar, aparecen barras reales en meses con volúmenes confiables para Pozo 1/Pozo 2.
2. Cambiar de pozo, de año y a «Cuotas autorizadas»: no se mezclan porcentajes documentales con el consumo.
3. Simular caída de la fuente histórica: debe mostrarse error, no volúmenes inventados.
4. Verificar meses anteriores al corte SCADA, futuro y falta de muestras: sin barras, sin cero artificial.
5. Confirmar que Administrar, PDF, historial de cambios, autenticación y visibilidad por roles del C01 permanecen funcionales.
6. Validar en navegador de planta la compilación de Vite, estilos oscuro/claro, rendimiento de consulta y números cruzados con Histórico de Pozos. **Estas verificaciones remotas no se pudieron ejecutar en el entorno de empaquetado.**

## Pruebas locales

- 193 pruebas de backend aprobadas usando SQLite de pruebas y mocks para el histórico.
- 204 pruebas de frontend aprobadas (`node --experimental-strip-types --test`).
- La sintaxis TS/TSX se verificó por transpilation de TypeScript. `npm ci` y compilación final de Vite no disponibles por falta de dependencias en caché y sin acceso de descarga; validar en entorno del usuario.
- **No existe acceso a BOS real en el entorno de entrega**. La visualización de cifras en producción depende de que el histórico diario de Durango responda.

## Archivos del incremental

- `backend/app/services/concession_history_service.py` (nuevo)
- `backend/app/api/routes/concessions.py` (modificado)
- `backend/tests/test_durango_concessions_c03_history.py` (nuevo)
- `frontend/src/services/concessionService.ts` (modificado)
- `frontend/src/pages/pozos/sections/ConcesionesSection.tsx` (modificado)
- `frontend/src/styles/pages/concesiones.css` (modificado)
- `frontend/src/utils/durangoConcessionOperational.ts` (nuevo)
- `frontend/tests/concesionesOperationalDgoC03.test.ts` (nuevo)
- `frontend/tests/concesionesVisualDgoC02.test.ts` (actualizado por cambio legítimo de expectativa en C03)
- `docs/incrementales/INCREMENTAL_DGO_C03_HISTORICO_BOS_CONCESIONES.md` (nuevo)

## No cambia

- SQLite de concesiones (ninguna migración).
- Base de usuarios, roles y cookies.
- Tablas BOS/SQL Server, mapeo de sensores ni cortes SCADA vigentes.
- Mecánica de PDF, bitácora administrativa, balance y demás secciones.
