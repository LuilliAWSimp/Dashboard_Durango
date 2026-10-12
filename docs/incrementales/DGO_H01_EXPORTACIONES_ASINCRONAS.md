# Durango DGO-H01 — Exportaciones PDF y Excel en segundo plano

**Base de aplicación:** DGO-C06 (C01 → C02 → C03 → C04 → C04A → C05 → C06).  
**Fuente documental:** Guía Maestra Única ARCA V2, apartados 18.6–18.7, 15.9 y 37.  
**Alcance:** únicamente exportaciones **PDF y Excel** de Reportes (día/rango e histórico completo).

## Problema y solución

Las descargas normales accedían a `GET /water/reports/daily/pdf`, `.../excel`, `.../historical/pdf` o `.../historical/excel`; la petición permanecía abierta durante toda la consulta a BOS y el render. Cloudflare Tunnel puede cancelar una respuesta larga (p. ej. 120 s). La nueva UI inicia un trabajo con POST, consulta estado cada tres segundos y descarga el archivo terminado mediante GET.

**Los endpoints síncronos anteriores permanecen para compatibilidad, pero la interfaz normal usa los jobs.** No se modifican fórmulas, periodos, sensores, SQL, datasets ni plantillas.

## Nuevos endpoints

Rutas bajo el prefijo de API del proyecto, normalmente `/api/v1`:

```http
POST /api/v1/water/reports/jobs
Content-Type: application/json
X-CSRF-Token: <valor ya gestionado por el frontend>

{"kind":"daily_pdf","options":{"date":"2026-10-12"}}
```

`kind` acepta `daily_pdf`, `daily_excel`, `historical_pdf`, `historical_excel`. Para rangos diarios usar `start_date`, `end_date`; para histórico completo, el rango es opcional. No usar a la vez `date` y `start_date/end_date`.

Respuesta: `id`, `kind`, `status` (`queued`, `running`, `ready`, `failed`), fechas, `filename` y `error` seguro.

```http
GET /api/v1/water/reports/jobs/{id}
GET /api/v1/water/reports/jobs/{id}/download
```

El `download` sólo responde cuando el archivo está listo. El backend verifica **la identidad del dueño** en las dos rutas GET, y usa UUID aleatorio sin aceptar rutas arbitrarias desde el navegador.

## Usuarios y seguridad

- `admin`, `operator` y `viewer` siguen pudiendo generar y descargar reportes como antes.
- **Sólo** `POST /water/reports/jobs` se autoriza al `viewer` como creación operativa no administrativa; no se amplían otros permisos.
- Todas las solicitudes siguen exigiendo sesión; el POST exige además CSRF.
- El servidor entrega archivos únicamente al propietario del job.
- Los detalles SQL/ODBC y las credenciales no se incluyen en mensajes de fallo al usuario.

## Procesamiento y archivos temporales

- Cola en memoria de **un solo worker** para no lanzar exportaciones largas simultáneas contra BOS.
- Hasta 8 trabajos activos o en cola; peticiones idénticas de la misma cuenta reutilizan el trabajo; un resultado listo puede reutilizarse por 5 minutos.
- Archivos terminados: directorio temporal del sistema operativo, subcarpeta `arca_durango_report_jobs`, **fuera del repositorio**.
- Variable opcional `ARCA_REPORT_JOBS_DIR`: permite configurar una ubicación temporal fuera del proyecto en una unidad con espacio suficiente. Dar permiso de escritura al usuario del backend.
- Archivos de jobs completos expiran en una hora; se limpian bajo demanda, también si quedaron huérfanos por reinicio. No son respaldos ni fuente permanente.
- Si se reinicia el backend, **los trabajos en memoria se pierden**, no las bases SQLite, concesiones ni los históricos BOS. Repetir la descarga si fue interrumpida.
- Se asume una única instancia/proceso backend en la IPC. Para múltiples workers/servidores, migrar la cola a un estado compartido (SQLite/Redis) antes de escalar.

## Despliegue IPC

1. Confirmar copia actual del proyecto **con DGO-C06** y respaldar los datos locales, principalmente `backend/data/concessions.sqlite3`, así como los documentos privados.
2. Copiar encima las rutas de este incremental; nunca reemplazar las bases `auth.sqlite3`/`concessions.sqlite3`.
3. Reiniciar el backend para registrar el router `/water/reports/jobs` y reiniciar/recompilar el frontend.
4. Entrar a Reportes; probar PDF y Excel de un día y un rango, luego Excel y PDF histórico completo.
5. Abrir DevTools/Red: comprobar un POST corto, varios GET de estado y finalmente un GET de archivo. La generación lenta NO debe generar una petición de 120 s abierta.
6. Probar por dominio Cloudflare y por acceso local; comprobar `viewer`, `operator` y `admin`.

**Dependencias:** ninguna Python o JavaScript nueva. Utiliza FastAPI/Starlette, biblioteca estándar `concurrent.futures` y Axios existente.

## No se modifica

- SQL Server/BOS, sensores ni fórmula de totalizadores.
- Calidad de datos y contratos físicos.
- SQLite de autenticación/concesiones, su sincronización, sus respaldos ni `.gitignore` de C06.
- Reporte de correo programado o envío manual, **vista HTML** y **preview** (siguen su flujo actual).
- PDF/Excel individual de históricos de cards (se atiende en otro incremental si supera timeout).

## Limitaciones explícitas

- Es una solución al **timeout por HTTP**, no acelera por sí sola los cálculos SQL pesados.
- Si el frontend se refresca mientras se procesa el job, el trabajo continúa en la IPC; al volver a pulsar el mismo formato y rango la API reutiliza el job activo de esa misma cuenta.
- Descargar archivos extremadamente grandes podría requerir optimización adicional del streaming/almacenamiento o límites de archivo del proxy.
- Las pruebas automatizadas ejecutadas sin BOS real no certifican tiempos de producción ni sustituyen la validación por Cloudflare.

## Validación dirigida (comprobada en entorno de elaboración)

- Nueva cola: deduplicación, finalización, descarga, permisos por dueño, fallos seguros, validación de fechas.
- Viewer autorizado para iniciar exportación con CSRF, prohibido en otras mutaciones.
- Regresiones frontend de filtros aplicados, flujo por jobs, preview HTML sin alteraciones.
- Backend en `DB_MODE=demo`: **210** pruebas aprobadas.
- Frontend Node test runner: **208** pruebas aprobadas.
- `tsc` / build Vite completos **no disponibles** en este entorno por falta de dependencias npm instaladas; realizar verificación en IPC.

## Archivos incluidos

```text
backend/app/services/report_export_job_service.py
backend/app/api/routes/report_jobs.py
backend/app/main.py
backend/app/auth/middleware.py
backend/tests/test_dgo_h01_report_jobs.py
frontend/src/services/reportExportJobService.js
frontend/src/services/waterReportService.js
frontend/src/services/waterHistoricalExportService.ts
frontend/src/pages/pozos/sections/ReportesSection.tsx
frontend/src/styles/pages/reportes.css
frontend/tests/exportContract39.test.ts
frontend/tests/reportesPreview.test.ts
frontend/tests/reportJobsH01.test.ts
docs/incrementales/DGO_H01_EXPORTACIONES_ASINCRONAS.md
```
