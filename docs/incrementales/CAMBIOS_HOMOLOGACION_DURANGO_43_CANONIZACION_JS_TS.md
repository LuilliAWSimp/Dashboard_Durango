# Incremental 43 - Canonizacion JS/TS - Durango

## Objetivo

Eliminar pares duplicados `.js/.ts` y `.jsx/.tsx` sin cambiar el comportamiento del runtime. La variante que ya estaba alcanzable desde `main.jsx` permanece como fuente canonica. Cuando ambas variantes estaban fuera del runtime, se conserva la version TypeScript/TSX para no duplicar legado antes del Incremental 44.

## Resultado

- Pares duplicados antes: 30.
- Pares duplicados despues: 0.
- Archivos de codigo en `frontend/src` antes: 130.
- Archivos de codigo en `frontend/src` despues: 100.
- Se eliminaron 30 archivos duplicados.
- El runtime conserva exactamente las variantes que ya ejecutaba antes del cambio.
- Los archivos fuera del runtime conservan una sola variante tipada.

## Fuentes runtime preservadas

- `frontend/src/components/BrandLogo.jsx`
- `frontend/src/components/Header.jsx`
- `frontend/src/components/KpiCard.jsx`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/pages/LoginPage.jsx`
- `frontend/src/services/api.js`
- `frontend/src/services/authService.js`
- `frontend/src/services/dailyWaterReportExportService.js`
- `frontend/src/services/waterExportService.js`
- `frontend/src/services/waterReportService.js`
- `frontend/src/services/waterService.js`

## Fuentes tipadas preservadas fuera del runtime

Se conserva una unica version `.ts/.tsx` de las familias heredadas de componentes generales, multi-planta, energia y mocks. Su existencia no implica que sean modulos activos; su eliminacion funcional queda para el Incremental 44.

## Ajustes de pruebas

- Las pruebas de Reportes apuntan a la fuente canonica `dailyWaterReportExportService.js`.
- La prueba de tema valida un solo `Sidebar.jsx` canonico.
- La prueba de Turnos busca sus estilos en `turnos.css`, donde viven desde el Incremental 42.
- La prueba de Balance busca su CSS en `balance.css`.
- Las pruebas backend de autenticacion dejan de exigir paridad `api.js/api.ts` y `authService.js/authService.ts`; ahora verifican fuente canonica unica.
- El control de rol admin se valida en `plantCapabilities.ts`, donde se centralizo desde el Incremental 40.
- Se actualizo una expectativa heredada de HTML que ya fallaba en el Incremental 42: valida cero real, hueco grafico y exclusion de futuro sin exigir el copy retirado en el Incremental 38.

## Aplicacion del incremental

Como un ZIP incremental normal no puede borrar archivos ya existentes, se incluyen:

- `ELIMINAR_ARCHIVOS_INCREMENTAL_43.txt`
- `APLICAR_ELIMINACIONES_43.ps1`

Despues de copiar el contenido del ZIP en la raiz del repositorio, ejecutar el script desde esa misma raiz para registrar los borrados en Git/GitHub Desktop. El script solo procesa las rutas exactas listadas en el manifiesto y rechaza rutas fuera del repositorio.

## Validacion

- Suite frontend completa: 182/182 pruebas.
- Contrato frontend de autenticacion inspeccionado desde backend: 11/11 pruebas.
- Auditor runtime: 84 archivos alcanzables, 65 de codigo, 18 CSS, 0 imports relativos sin resolver.
- Pares JS/TS y JSX/TSX: 0.
- Parser TypeScript sobre los 100 archivos de codigo restantes: 0 errores sintacticos.
- `tsc -p frontend/tsconfig.json --noEmit` se detiene por dependencias no instaladas en este ZIP: `node` y `vite/client`; no reporto errores de la canonizacion antes de ese bloqueo.
- Backend de produccion: sin cambios.
- CSS: sin cambios.
- No se consulto SQL Server ni BOS.
