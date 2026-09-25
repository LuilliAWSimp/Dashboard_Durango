# Durango 18D — Revisión diaria + Reportes + overrides mixtos CSS

## Objetivo

Continuar la migración arquitectónica de `global.css` sin rediseñar pantallas, separando las responsabilidades de Revisión diaria y Reportes y retirando los overrides mixtos 11D/11E del archivo global.

## Cambios

- Se creó `frontend/src/styles/pages/revision-diaria.css`.
  - Migra la familia completa base de Revisión diaria.
  - Migra los ajustes de espaciado y responsive específicos.
  - Recibe los overrides de modo claro de 11D correspondientes a Revisión diaria.
  - `RevisionDiariaSection` expone ahora `.daily-review-page` como frontera semántica con `display: contents`.

- Se creó `frontend/src/styles/pages/reportes.css`.
  - Migra la estructura base de Reportes.
  - Migra el layout institucional actual de `durango-report-page`.
  - Migra la presentación de correo programado existente.
  - Migra la tarjeta de histórico completo de planta.
  - Recibe los overrides 11D propios de los KPIs/resumen de Reportes.

- Se dividió el antiguo bloque mixto 11D.
  - Reportes -> `reportes.css`.
  - Revisión diaria -> `revision-diaria.css`.
  - Turnos -> `turnos.css`.

- Se retiró el bloque mixto 11E de `global.css`.
  - El contrato compartido de controles claros -> `shared.css`.
  - Los selectores propios de históricos/gráficas -> `historicos.css`.
  - El selector visual de turno -> `turnos.css`.

- Se actualizó el orden de imports en `main.jsx` para conservar la cascada modular.
- Se actualizó `styles/README.md` con las nuevas responsabilidades.
- Se reforzó `css-architecture.test.ts` para impedir que las familias 11D/11E regresen a `global.css`.

## Resultado de global.css

- Antes de 18D: 8,005 líneas.
- Después de 18D: 5,952 líneas.
- Reducción 18D: 2,053 líneas.
- Inicio de la fase CSS: 9,218 líneas.
- Reducción acumulada 18 + 18B + 18C + 18D: 3,266 líneas.

La reducción de líneas no es el criterio de éxito principal. El objetivo es que cada responsabilidad tenga un destino conocido y que el archivo global deje de recibir correcciones locales por costumbre.

## Pendiente consciente para 18E

Todavía existen selectores de Reportes/correo dentro de bloques heredados de tema claro 11/11A. No se movieron a ciegas porque comparten reglas con Shell, Sidebar, Header, Usuarios y otros estados globales. Se revisarán en el cierre 18E junto con Shell/Auth/Usuarios y la limpieza residual de `global.css`.

## Validación dirigida

- `css-architecture.test.ts` + `operational-presentation.test.ts`: 11/11 OK.
- Balance de llaves CSS: OK.
- `RevisionDiariaSection.tsx`: sin diagnósticos sintácticos de parseo TypeScript/TSX.
- `main.jsx`: sin diagnósticos sintácticos de parseo.
- Marcadores 11D/11E: ya no aparecen en `global.css`.
- No se modificaron cálculos hidráulicos, servicios API, SQL ni contratos de datos.

Nota: durante una invocación accidentalmente más amplia de pruebas frontend aparecieron fallas ya existentes en contratos de exportación/preview que no dependen de los archivos CSS/TSX de este incremental. No se corrigieron aquí para no mezclar responsabilidades.
