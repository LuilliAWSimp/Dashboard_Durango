# Incremental 38 - Limpieza visual y de textos de Reportes

## Objetivo

Cerrar la limpieza de presentación de Reportes después de los Incrementales 36 y 37, retirando lenguaje técnico/interno de la interfaz y de los formatos exportados sin modificar cálculos, fuentes físicas ni contratos de datos.

## Cambios realizados

- Pantalla de Reportes:
  - se retiraron referencias visibles a datos crudos/conciliados, cobertura técnica, SQL Server, fuentes internas y cambios de sensores;
  - `Histórico completo de planta` se presenta como una exportación operativa, sin detallar implementación interna;
  - la vista previa elimina la línea `Fuente: Revisión diaria conciliada / periodo conciliado`;
  - la nota del resumen utiliza lenguaje operativo y explica únicamente el significado de `No disponible`;
  - los mensajes técnicos de conexión se filtran antes de mostrarse al usuario.
- Estados visibles:
  - `Validado` -> `Datos completos`;
  - revisión/cobertura parcial -> `Datos parciales`;
  - ausencia real -> `Sin datos`;
  - lecturas existentes sin volumen confiable -> `Sin volumen disponible`.
- HTML:
  - las gráficas dejan de usar `Volumen validado por elemento` y emplean la función física del módulo (`Volumen bombeado/consumido por elemento`);
  - se eliminan notas sobre fuente conciliada, cero/hueco y eventos descartados;
  - fondo general blanco y alternancia azul clara en tablas, evitando superficie gris global.
- PDF:
  - resumen con nota operativa y estado de datos;
  - tablas con los mismos estados de datos que web/HTML/Excel;
  - gráficas de volumen usan nomenclatura física por módulo;
  - `Cortes administrativos...` se sustituye por una descripción operativa breve.
- Excel:
  - Resumen: `Estado de datos` sustituye `Cobertura del reporte` y se elimina `Criterio de cálculo` técnico;
  - módulos: `Estado de datos` usa etiquetas operativas;
  - históricos: `Disponibilidad (%)`, `Volumen del intervalo (m³)`, `Actividad del intervalo` y traducción de códigos internos de estado;
  - detalle de turnos: `Totalizador apertura`, `Totalizador al cierre`, `Volumen del turno`, `Estado de datos` y `Corte`.
- Se mantiene intacto el contrato interno (`validated_volume_m3`, quality/data status) para no modificar la lógica hidráulica; sólo se traduce en la capa de presentación.

## Validación dirigida

- Frontend focal Reportes/Revisión/Turnos/CSS: 42/42 pruebas.
- Regresión frontend Incrementales 21-38 seleccionada: 118/118 pruebas.
- Backend Reportes 36-38 con SQLite temporal: 15/15 pruebas.
- `py_compile` de `water_daily_report_service.py`: correcto.
- Paridad del HTML generado por JS/TS: correcta.
- Auditor runtime: 83 archivos alcanzables, 64 archivos de código, 18 CSS, 0 imports relativos sin resolver.
- PDF de control generado y renderizado a 5 páginas: sin recortes/empalmes y con estados `Datos completos`, `Datos parciales`, `Sin volumen disponible` y `Sin datos` visibles correctamente.
- No se ejecutaron suites completas.
- No se consultó SQL Server ni BOS.

## Fuera de alcance

- SQL Server / BOS / sensores / IDs / factores / unidades.
- Cálculos de flujo, volumen, totalizadores o conciliación.
- Estructura y fechas de Reportes ya cerradas en 36-37.
- SMTP, programación de correos y autenticación.
- `global.css` y hojas CSS del dashboard.
