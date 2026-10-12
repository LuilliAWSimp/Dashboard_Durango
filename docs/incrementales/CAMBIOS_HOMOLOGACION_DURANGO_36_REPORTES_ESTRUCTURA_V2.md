# Incremental 36 — Reportes estructura V2

## Objetivo

Alinear la estructura principal de Reportes entre vista previa web, PDF, Excel, HTML y adjuntos de correo sin modificar las fuentes físicas, sensores, SQL Server/BOS ni la matemática conciliada.

## Cambios

- Se agregó un contrato `presentation` al reporte backend con:
  - resumen ejecutivo canónico;
  - orden canónico de módulos;
  - columnas estructurales compartidas.
- El orden común queda:
  1. Resumen.
  2. Pozos.
  3. Líneas.
  4. Lavadoras.
  5. Jarabes.
  6. Turnos/anexos cuando aplican.
- El resumen principal queda en seis bloques:
  - Volumen bombeado de pozos.
  - Volumen consumido de líneas.
  - Volumen consumido de lavadoras.
  - Volumen consumido de Jarabes.
  - Con actividad.
  - Con atención.
- Se retiró de los formatos visibles el subtotal/total operativo transversal para no sumar procesos distintos como una única magnitud de planta.
- Las tablas principales usan la misma estructura:
  - Elemento.
  - Flujo actual (o promedio en bloques programados de 12 h).
  - Totalizador inicial.
  - Totalizador final.
  - Volumen del periodo.
  - Actividad.
  - Estado de datos.
  - Comunicación.
  - Última lectura.
- PDF recorre los módulos desde la misma definición canónica del backend.
- Excel conserva las hojas en el orden `Resumen`, `Pozos`, `Líneas`, `Lavadoras`, `Jarabes`, `Turnos`.
- El anexo de Turnos en PDF/Excel deja de mostrar `Total operativo`.
- Vista HTML ahora solicita también los turnos del reporte completo y los presenta como anexo cuando existen.
- HTML mantiene ausencia real de volumen como `No disponible`; no la convierte en cero.
- Los adjuntos por correo siguen usando los mismos generadores PDF/Excel, por lo que heredan la estructura V2 automáticamente.
- La vista previa web continúa siendo ligera y no descarga históricos/turnos hasta que se solicita un formato completo.
- Se mantuvieron campos backend anteriores de total operativo sólo por compatibilidad interna; ya no forman parte de la estructura visible V2.

## Fuera de alcance

- No se modificó SQL Server.
- No se modificó BOS.
- No se modificaron sensores, IDs, `operational_key`, factores ni unidades.
- No se modificó la conciliación ni la matemática de flujo/volumen/totalizador.
- No se modificaron históricos ni sus agregaciones.
- No se modificó Revisión diaria ni Turnos operativos del dashboard.
- No se modificó el correo programado ni SMTP.
- No se modificó CSS ni `global.css`.
- La limpieza fina de textos técnicos y nomenclatura completa de Reportes queda para los incrementales 37–38.

## Validación dirigida

- Frontend, regresión modernización + Reportes: 121/121 pruebas aprobadas.
- Backend Reportes/PDF/Excel/correo: 12/12 pruebas aprobadas usando SQLite temporal para evitar dependencia local de `pyodbc`.
- `python -m py_compile backend/app/services/water_daily_report_service.py`: aprobado.
- HTML JS y TypeScript producen el mismo contenido: aprobado.
- PDF se genera desde el mismo objeto de reporte: aprobado.
- Excel conserva el orden canónico de hojas: aprobado.
- Adjuntos de correo siguen usando los mismos builders PDF/Excel: aprobado.
- Auditor runtime: 83 archivos alcanzables, 64 de código, 18 CSS, 0 imports relativos sin resolver.
- No se ejecutaron suites completas.
- No se realizaron consultas reales a SQL Server ni BOS.
