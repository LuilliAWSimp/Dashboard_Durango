# Incremental 24 — Exportaciones completas del histórico global

## Objetivo

Completar la paridad de exportación del histórico operativo compartido de Durango, manteniendo separadas:

- la exportación Excel de la vista visible;
- la exportación PDF de la vista visible;
- la exportación técnica Excel cada 5 minutos.

## Cambios

- `ModuleHistoryPanel` incorpora **Excel 5 min** junto a **Excel** y **PDF**.
- Excel y PDF continúan respetando:
  - módulo/vista física;
  - elementos visibles;
  - rango;
  - agrupación;
  - métrica;
  - modo del totalizador.
- Excel 5 min es independiente de la agrupación visible y conserva su límite técnico de **3 días calendario**.
- Excel 5 min exporta todos los elementos actualmente visibles/seleccionados en un solo archivo.
- Para Durango, los elementos sin `sensor_id` numérico pueden exportarse mediante su `operational_key`, por ejemplo:
  - `lavadora_vidrio`;
  - `lavadora_ref_pet`.
- Se agregó `GET /api/v1/water/history/five-minute/module/excel` sin retirar ni cambiar el endpoint individual existente.
- El nuevo XLSX por módulo contiene:
  - hoja `Resumen`;
  - una hoja por elemento seleccionado;
  - rango local;
  - intervalos generados;
  - intervalos reportables;
  - intervalos sin datos;
  - subtotal de volumen reportable;
  - detalle conciliado de cada bloque de 5 minutos.
- El nombre físico de la vista se conserva en el archivo, por ejemplo `Lavadoras` o `Jarabes`, aunque ambos utilicen internamente el contrato backend `flow`.
- No se modificó `global.css` ni se agregaron estilos nuevos: se reutiliza la convención verde existente para Excel.

## No se modificó

- SQL Server;
- BOS;
- sensores o IDs;
- factores de escala;
- unidades;
- conciliación hidráulica;
- reglas de apertura/cierre;
- cálculo de flujo/volumen/totalizador;
- endpoint individual `/water/history/five-minute/excel`;
- Revisión diaria;
- Turnos;
- Reportes diarios;
- autenticación;
- Balance de Agua;
- `global.css`.

## Validación dirigida

Frontend:

- `moduleHistoryExports24.test.ts`: 5 pruebas.
- regresión 21/22/23 + arquitectura CSS: 21 pruebas.
- total dirigido frontend: 26 pruebas, todas correctas.

Backend:

- `test_durango_module_five_minute_export_24.py`: 3 pruebas.
- regresión `test_durango_five_minute_export.py`: 3 pruebas.
- total dirigido backend: 6 pruebas, todas correctas.
- `py_compile` de servicio, ruta y prueba: correcto.
- XLSX multielemento abierto y validado con `openpyxl`: correcto.

Runtime:

- 78 archivos frontend alcanzables;
- 59 archivos JS/TS/JSX/TSX;
- 18 hojas CSS;
- 0 imports relativos sin resolver.

`npm run typecheck` continúa bloqueado por dependencias ausentes en el ZIP fuente (`@types/node` y `vite/client`); no aparecieron errores de sintaxis adicionales antes de ese bloqueo.

No se ejecutaron suites completas y no se consultó SQL Server/BOS.
