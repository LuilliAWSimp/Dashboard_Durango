# Incremental 35 — Turnos V2

## Alcance

Homologa la presentación de cortes por turno en Pozos, Líneas, Lavadoras, Jarabes y Revisión diaria sin modificar la matemática de conciliación ni el contrato backend de `/water/shifts`.

## Cambios

- Se separa explícitamente el **estado temporal del corte** del **estado de los datos**.
  - Corte: `Cierre definitivo`, `Corte parcial`, `Pendiente`.
  - Datos: `Datos completos`, `Datos parciales`, `Sin datos`, `Pendiente`.
- `Sin actividad` deja de utilizarse como sustituto de `Sin datos`.
- Un cero real de volumen permanece visible como `0.00 m³` y se considera dato disponible.
- Si existen lecturas pero no puede obtenerse un volumen confiable, se muestra `Sin volumen disponible` y el estado queda como `Datos parciales`.
- `Sin datos` se reserva para ausencia real de lecturas/valores del turno.
- El Turno 3 se presenta como `15:00–00:00 (+1 día)` para hacer explícito el cruce de día.
- Todos los paneles muestran la fecha del turno mediante `Turnos del DD/MM/YYYY`.
- Las cards de turno muestran conjuntamente corte + estado de datos.
- Los disclosures muestran dos badges independientes: estado de datos y estado temporal del corte.
- La tabla detallada renombra `Apertura/Cierre` a `Totalizador inicial/Totalizador final` y agrega `Estado de datos`.
- Revisión diaria retira el subtotal transversal `Total operativo`; conserva Pozos, Líneas, Lavadoras y Jarabes por separado.
- El auto-refresh de Turnos deja de forzar `force_refresh=true`; el refresco manual mantiene la actualización forzada.
- Los estilos del nuevo estado de datos permanecen en `turnos.css`; `global.css` no cambia.

## No se modificó

- Backend.
- SQL Server / BOS.
- Sensores, IDs u `operational_key`.
- Factores, unidades o conciliación.
- Matemática de flujo, volumen o totalizadores.
- Definición backend de horarios de turno.
- Históricos y exportaciones.
- Reportes y correo programado.
- Autenticación.
- Balance de Agua.
- `global.css`.

## Validación dirigida

- Regresión amplia frontend de Incrementales 21–35: `123/123` pruebas aprobadas.
- Regresión focal Turnos/Revisión diaria/CSS: `36/36` pruebas aprobadas.
- Casos explícitos:
  - cero válido => datos completos;
  - ausencia real => sin datos;
  - combinación de datos y huecos => datos parciales;
  - lecturas sin volumen confiable => datos parciales + sin volumen disponible;
  - turno pendiente independiente del estado de datos;
  - Turno 3 con cruce al día siguiente;
  - polling automático sin `force_refresh` y refresco manual forzado.
- Transpilación TypeScript dirigida: 5 archivos sin errores sintácticos.
- Auditor runtime: 83 archivos alcanzables, 64 de código, 18 CSS, 0 imports relativos sin resolver.
- No se ejecutaron suites completas.
- No se realizaron consultas reales a SQL Server ni BOS.
