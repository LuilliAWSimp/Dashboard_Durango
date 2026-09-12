# Durango 18F — Auditoría y corrección de contratos de Reportes/exportaciones

## Objetivo

Revisar las fallas detectadas durante la validación amplia posterior al 18D, separar pruebas desactualizadas de fallas reales y corregir únicamente el contrato de Reportes/exportaciones sin mezclar Balance ni más cambios CSS.

## Hallazgos

- En el árbol acumulado 13–18E se reproducen actualmente 3 fallas dentro del bloque específico de Reportes/exportaciones.
- Una era una discrepancia real: `dailyWaterReportExportService.js` estaba desfasado respecto a `dailyWaterReportExportService.ts`.
  - El runtime puede resolver primero el archivo `.js`.
  - Por ello la exportación HTML podía seguir mostrando terminología anterior, por ejemplo `Volumen validado de líneas`, aunque TypeScript ya usaba `Volumen consumido validado de líneas`.
- Las otras dos fallas eran contratos de prueba obsoletos tras el Incremental 17.
  - Reportes y Resumen ya no escriben literalmente las etiquetas de volumen.
  - Utilizan `operationalVolumeLabel(...)`, de modo que la misma terminología se controla desde un helper compartido.

## Cambios

- Se sincronizó `frontend/src/services/dailyWaterReportExportService.js` con la implementación TypeScript vigente.
- JS y TS vuelven a generar exactamente el mismo HTML para el mismo contrato de reporte.
- Se conservan las etiquetas homologadas:
  - Pozos: `Volumen bombeado validado`.
  - Líneas/Lavadoras/Jarabes: `Volumen consumido validado`.
- Se actualizó `reportesPreview.test.ts` para validar el uso del helper compartido en vez de exigir texto literal duplicado.
- Se mantiene la protección de que Lavadoras y Jarabes sean secciones visibles independientes y que no reaparezca una sección genérica `Flujos`.

## Validación dirigida

- `dailyWaterReportExport.test.ts` + `reportesPreview.test.ts`: 10/10 OK.
- Paridad JS/TS del HTML: OK.
- Clasificación Pozos/Líneas/Lavadoras/Jarabes: OK.
- Cero válido, huecos e intervalos futuros: OK.
- Terminología backend compartida: 1/1 OK.
- No se modificó backend, matemática hidráulica, SQL, scheduler ni CSS.

## Validación amplia

La suite frontend completa deja 6 fallas fuera del alcance de 18F:

- 5 contratos de `durangoThemeToggle.test.ts` todavía leen exclusivamente `global.css`, aunque las reglas ya fueron migradas por 18E a `theme.css` y hojas modulares.
- 1 contrato de `moduleComparison.test.ts` todavía busca `Volumen del periodo (m³)` como literal, aunque desde 17 la etiqueta proviene de `operationalVolumeLabel(...)`.

Son contratos de prueba desactualizados por refactors anteriores; se recomienda corregirlos en un cierre post-refactor separado antes de pasar a Balance.

## Nota de entorno

Las pruebas backend completas de reportes no pudieron recolectarse en este contenedor porque no está instalado `pyodbc`. No se instaló esa dependencia sólo para este incremental. La prueba pura de terminología backend sí ejecutó correctamente.
