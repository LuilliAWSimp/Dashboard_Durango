# Incremental DGO-C01 — Concesiones documentales (revisión)

## Aplicación

Aplicar **sólo los archivos presentes en el ZIP** sobre la versión original `Dashboard_Durango-test (2)(2).zip` (manteniendo las rutas relativas desde la raíz del proyecto). No sustituye archivos externos ni requiere cambios manuales en SQL Server.

**Instalación de dependencia:** desde `backend/` actualizar dependencias del entorno Python con `requirements.txt` (se añadió `pypdf==5.9.0`). Reiniciar backend y frontend tras aplicar el incremental. La base `backend/data/concessions.sqlite3` y la carpeta de PDFs se crean automáticamente al iniciar FastAPI. Asegurar permisos de lectura/escritura del proceso backend sobre `backend/data/`. Incluir ambos en los respaldos de planta; no incluirlos en repositorios de código. Configuración opcional `CONCESSION_DATABASE_PATH` y `CONCESSION_DOCUMENTS_PATH`.

## Alcance de esta primera revisión

- Ruta visual `Pozos > Concesiones` en el menú, disponible a usuarios autenticados de Durango, con el mismo tema claro/oscuro de la planta.
- Inventario de **2 registros iniciales provisionales**, obtenidos de la fotografía enviada: Pozo 1 (sensor 1001, título DGO100155, 460,908 m³), Pozo 2 (sensor 1051, título DGO118098, 364,407 m³). Las cantidades se **muestran como referencias provisionales**; no se declaran jurídicamente verificadas.
- Cada rol (`admin`, `operator`, `viewer`) puede consultar el mismo registro compartido. Exclusivamente `admin` puede **editar el número, volumen, vigencia y observaciones** y **cargar PDF**; todos los cambios se guardan en el servidor.
- Botón *Administrar*: form editable, selector PDF hasta 10 MB, lectura preliminar de texto con `pypdf`, candidatos de número de título y cifras sin interpretación automática. **Siempre hace falta confirmar los datos mediante Guardar y publicar.** PDFs escaneados sin texto son aceptables, pero requieren captura manual; **no hay OCR** en este incremento.
- El PDF queda almacenado fuera de directorios públicos; se puede descargar desde la ficha. Auditoría de fecha, usuario, cambios anteriores y nuevos, y huella digital de archivos. El último documento adjunto es el visible en la ficha; ampliar consulta/descarga de documentos históricos es trabajo posterior.
- Refresco al volver a enfocar la pestaña y consulta periódica de 30 segundos en la vista; también hay botón Actualizar. No es actualización en tiempo real mediante sockets.
- El módulo administrativo nuevo es **independiente** de la capability existente `concession=false`. La vieja API de concesiones continúa inhabilitada hasta conciliar el origen legal y el histórico BOS. El Balance de Agua y los sensores no se modifican.

## Importante: datos operativos no calculados aún

- Sin documentos completos no se conoce el ciclo/vigencia legal con certeza.
- Por ello **no se calculan** extracción acumulada anual, remanente, porcentaje utilizado ni predicción. Las pantallas muestran explícitamente **Sin conciliar / No calculado**. Esto evita presentar ceros falsos o confundir los totalizadores crudos con el volumen legal reportable.
- Integrar BOS con validación temporal, incrementos de totalizador y cobertura histórica será un incremental posterior, una vez confirmados ciclo y condiciones de los títulos.
- El rótulo m³/año es una referencia inicial basada en el correo recibido; cotejar contra título vigente y su fecha de corte antes de habilitar alarmas regulatorias.

## API

- `GET /api/v1/concessions`: lectura autenticada de registros y aviso de conciliación pendiente.
- `PATCH /api/v1/concessions/{well_key}`: admin; cambios confirmados del formulario.
- `POST /api/v1/concessions/preview-pdf`: admin; lectura sugerida de PDF en memoria, no guarda ni publica.
- `POST /api/v1/concessions/{well_key}/document`: admin; PDF y campos del formulario, guardados juntos.
- `GET /api/v1/concessions/{well_key}/document`: descarga autenticada del PDF actual.
- `GET /api/v1/concessions/{well_key}/audit`: admin; últimos 20 registros.

Todas utilizan el contrato existente de sesión local, CSRF y permisos. Los datos de esta instancia quedan aislados en `plant_key = durango`; **no** se comunica con concesiones de otras plantas.

## Validación recomendada

1. Ingresar como `viewer` u `operator`: poder consultar ambos pozos, pero no visualizar Administrar ni poder modificar mediante API.
2. Ingresar como `admin`: abrir Administrar, modificar una observación, guardar, actualizar la página y comprobar persistencia.
3. Abrir un segundo usuario: los cambios deben aparecer al pulsar Actualizar o, con la vista abierta y enfocada, dentro de 30 s.
4. Seleccionar un PDF con texto: previsualizar sugerencias, **confirmar manualmente** los campos, guardar y descargar el mismo documento.
5. Probar con PDF escaneado (texto no detectable): debe permitir llenado manual. Probar archivo que no sea PDF o supere 10 MB: debe rechazarse.
6. Comprobar modo oscuro/claro, anchos móviles, navegación, sesiones y los módulos originales.
7. No dar por probado un cálculo de consumos ni cumplimiento: expresamente quedan pendientes.

## Pruebas técnicas realizadas

- Backend completo: `DB_MODE=demo PYTHONPATH=backend python -m pytest backend/tests -q` (190 correctas).
- Backend dirigido: `DB_MODE=demo PYTHONPATH=backend python -m pytest backend/tests/test_durango_concessions_incremental.py backend/tests/test_durango_balance_concession_41.py -q` (8 correctas).
- Suite frontend con Node: `node --experimental-strip-types --test frontend/tests/*.test.ts` (196 correctas).
- Contrato de navegación: `node --experimental-strip-types --test frontend/tests/capabilitiesNavigation40.test.ts` (7 correctas).
- Se confirmó que la API registra las seis rutas nuevas y que React TSX transpila sin diagnósticos de sintaxis.
- No se pudo completar `vite build` en este entorno de revisión por falta de dependencias Node descargadas. Debe ejecutarse en el equipo con `frontend/node_modules` instalado antes de publicar.

## Archivos

Incluye exclusivamente 13 rutas nuevas o modificadas (más este MD) relativas a raíz: `backend/app/services/concession_service.py`, `backend/app/api/routes/concessions.py`, `backend/app/main.py`, `backend/app/config.py`, `backend/requirements.txt`, `backend/tests/test_durango_concessions_incremental.py`, `frontend/src/config/plantCapabilities.ts`, `frontend/src/pages/PozosDashboardPage.jsx`, `frontend/src/pages/pozos/sections/ConcesionesSection.tsx`, `frontend/src/services/concessionService.ts`, `frontend/src/styles/pages/concesiones.css`, `frontend/src/main.jsx`, `frontend/tests/capabilitiesNavigation40.test.ts`.

