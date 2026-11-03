# DGO-V00 — Auditoría y depuración segura de Durango

**Fecha:** 03/11/2026  
**Base exacta:** `Dashboard_Durango-test(3).zip` (archivo completo entregado por usuario).  
**Siguiente etapa prevista:** DGO-V01, contrato visual LF16 (cambios de paleta y componentes).  
**Tipo:** Incremental estricto de código + auditoría, **sin rediseño**.

## Alcance y resultado

Esta primera entrega retira exclusivamente duplicaciones y definiciones cuyo efecto final fue contrastado; **no hace una eliminación masiva** del CSS anterior. El ZIP de base ya incluía eliminaciones históricas de código no alcanzable (incrementales 43–45), así que se contrastó el runtime actual en vez de suponer que todos los archivos antiguos están muertos.

1. **CSS (`global.css`)**: se retiran cuatro reglas redundantes (`.summary-stack`, `.circuit-card-subtitle`, `.full-width-card`, `.wide-fit`) porque existen reglas posteriores que conservan todas las propiedades efectivas.
2. **CSS (`login.css`)**: se elimina la definición previa de `.login-hint` sobreescrita por otra y una repetición exacta del ajuste de `.login-brand`; se conservan las demás reglas activas de login.
3. **CSS (`shell.css`)**: se unifican dos definiciones de `.user-chip` en una sola regla; se conserva **`display:flex`**, que era el valor final real en la cascada original.
4. **React (`PozosDashboardPage.jsx`)**: se eliminan `pieColors`, `axisColor`, `gridColor` y `emptyChartRange`, todos declarados sin referencias en el componente. No se elimina el uso real de importaciones, rutas o secciones.
5. **Control preventivo:** prueba automatizada `cleanupV00.test.ts` para comprobar selectores conservados y rutas operativas presentes.
6. **Higiene del repositorio:** se excluyen futuros `build.log` y `build2.log` en `.gitignore`; un script PowerShell optativo permite retirar **solo los dos logs antiguos exactos** de la base, previa comprobación SHA-256, y nunca los elimina por defecto.

## Auditoría y comprobaciones

| Comprobación | Resultado |
|---|---|
| Archivos frontend alcanzables desde `main.jsx` | **91**, antes y después |
| Archivos de código frontend alcanzables | **71**, antes y después |
| Hojas CSS importadas | **19**, antes y después |
| Imports relativos sin resolver | **0**, antes y después |
| Pares JS/TS duplicados detectados en `src` | **0** |
| Verificación CSS de propiedad/valor final, por selector y contexto `@media` | **Sin diferencias** en los 3 CSS editados |
| Bloques de reglas CSS eliminados | **7** (4 global + 2 login + 1 shell) |
| Constantes/función no utilizadas eliminadas | **4** |
| Pruebas dirigidas de V00 | **2 aprobadas** |
| Comparación de alcance API/routers | Sin archivos de servicios/rutas modificados |
| SQL Server / BOS / SMTP real | No conectado, no probado |
| Build de Vite y QA visual de navegador | No comprobados en este entorno (dependencias `node_modules` ausentes) |

### Advertencia sobre pruebas anteriores, preexistente

La suite frontend del ZIP base **ya presentaba 2 fallos de 227 pruebas** al ejecutar `npm test` **antes de cambiar nada**:

- `visualAndReportsH06.test.ts`: espera que `module-history-range-panel` esté dentro de una cadena de toolbar; ese contrato textual cambió en los incrementales posteriores.
- `visualAndReportsH06.test.ts`: espera el identificador `recentModuleQueries`, ausente del código actual tras optimizaciones de históricos.

Estos fallos **no fueron provocados por V00**. Se conservan sin modificación en este incremental; deberán revisarse contra el comportamiento actual en la fase de históricos. No afirmar que la suite completa está en verde.

## Archivos añadidos o modificados

| Ruta | Acción |
|---|---|
| `.gitignore` | Modificado: ignorar logs de build raíz |
| `frontend/src/styles/global.css` | Modificado: deduplicar cuatro bloques |
| `frontend/src/styles/pages/login.css` | Modificado: deduplicar dos bloques |
| `frontend/src/styles/pages/shell.css` | Modificado: unificar `.user-chip` |
| `frontend/src/pages/PozosDashboardPage.jsx` | Modificado: retirar definiciones no usadas |
| `frontend/tests/cleanupV00.test.ts` | Nuevo: pruebas de regresión de limpieza |
| `tools/Limpieza_Durango_V00.ps1` | Nuevo: limpieza optativa de dos logs con verificación SHA-256 |
| `docs/incrementales/DGO_V00_AUDITORIA_DEPURACION_SEGURA.md` | Nuevo: este informe |

**Importante:** No se incluyen archivos de SQLite, `.env`, exportaciones o backups. No se añaden instrucciones para borrar bases de datos. El ZIP conserva rutas desde la raíz y no contiene una carpeta contenedora.

## Archivos no retirados y por qué

- **`frontend/src/styles/global.css`**: sigue importado por `main.jsx` y contiene primitivas utilizadas; se depuró de forma selectiva. Su consolidación restante corresponde a DGO-V01–V09, por pantalla.
- **Componentes/rutas de Concesiones y Balance**: existen dependencias y rutas reales, incluso si aún faltan datos o validación física; no son eliminables por el simple hecho de no estar plenamente configurados.
- **`backend/data/concessions.sqlite3` y `-wal/-shm`**: pueden contener información administrativa persistente; se conservan sin abrir/modificar.
- **`backend/exports/`**: son archivos generados que pueden corresponder a reportes históricos; no se borran sin política de retención aprobada.
- **`backend/energy_dashboard.db`**: no hay evidencia suficiente en esta auditoría para declararla desechable sin revisar inicialización, dependencias y uso real.
- **Logs raíz `build.log` / `build2.log`**: son artefactos de compilaciones antiguas incluidos en la base. La eliminación es opcional y se hace únicamente con los hashes exactos del ZIP inspeccionado.

## Aplicación en Windows

1. Hacer respaldo del proyecto de Durango que corresponda a la base compartida.
2. Extraer `Incremental_DGO_V00_Depuracion_Segura.zip` **sobre la raíz del proyecto**; aceptar reemplazar los archivos incluidos.
3. Ejecutar la prueba nueva o la suite completa desde `frontend`:

   ```powershell
   npm test
   ```

   Los dos fallos preexistentes descritos arriba pueden seguir apareciendo hasta que se revisen por separado.

4. Reiniciar frontend o volver a compilar si se publica una versión de producción; **backend no requiere reinicio por este incremental**.
5. Verificar menú, login, Resumen, cambio de tema y navegación de secciones. El aspecto visual **no debe cambiar** por V00.
6. **Opcional:** para ver qué logs antiguos pueden retirarse, desde la raíz de Durango:

   ```powershell
   .\tools\Limpieza_Durango_V00.ps1
   ```

   Para borrarlos voluntariamente solo si su hash coincide con el ZIP base:

   ```powershell
   .\tools\Limpieza_Durango_V00.ps1 -Aplicar
   ```

   Si los logs ya están versionados en Git, `.gitignore` no los desvincula por sí solo: confirmar los cambios en GitHub Desktop. Si los logs se modificaron, el script **no los elimina**.

## Limitaciones

Auditoría estática realizada sin acceso al SQL Server, BOS, SMTP, navegador de producción ni sesiones de usuarios. El chequeo de propiedades CSS finales no reemplaza una comparación visual real: verificar el aspecto en la PC de planta antes de avanzar a DGO-V01. El script PowerShell no se ejecutó aquí por no disponer de PowerShell en el entorno de análisis.

**Commit sugerido:** `chore(durango): DGO-V00 depuracion segura de CSS y codigo sin uso`
