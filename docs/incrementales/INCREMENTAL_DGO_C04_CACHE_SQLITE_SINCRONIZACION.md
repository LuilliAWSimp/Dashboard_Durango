# DGO-C04 | Cache SQLite y sincronizacion historica de concesiones

## Aplicacion y alcance

Aplicar **sobre DGO-C03** conservando las rutas relativas del ZIP. Incluye exclusivamente archivos nuevos o modificados.

**Arquitectura validada por el cliente:** Planta Durango ejecuta el backend y la base local en una sola IPC. Los usuarios acceden mediante el dominio expuesto con Cloudflare Tunnel, que no interviene en el procesamiento industrial.

- **SQL Server/BOS:** fuente original de lecturas, sin escrituras ni cambios de esquema.
- **SQLite `backend/data/concessions.sqlite3`:** titulos existentes mas cache de consumos y estado del procesamiento.
- **FastAPI:** una tarea automatica del backend calcula el historial por dia, reanudable tras reinicio, independiente de peticiones web.
- **Cloudflare Tunnel:** el navegador recibe exclusivamente resumenes locales, sin esperar una consulta anual de SQL Server.

## Nuevas tablas, creadas automaticamente por FastAPI

- `concession_daily_consumption`: `plant_key`, `well_key`, dia, volumen fiable (`NULL` si no verificable), muestras recibidas y esperadas, fecha de proceso. Clave unica planta+pozo+dia.
- `concession_monthly_consumption`: mes/ano/pozo, volumen, dias validos, excluidos, sin datos, cobertura y estado; actualizado transaccionalmente.
- `concession_sync_state`: cursor durable de carga inicial, estado, errores, reintentos, bloqueo para prevenir doble ejecucion en procesos simultaneos y reconstrucciones manuales.

Las tablas se crean con `CREATE TABLE IF NOT EXISTS`; **nunca se borran concesiones, documentos ni usuarios existentes**. No empaquetamos archivos `.sqlite3`.

## Sincronizacion

1. El servidor inicia la carga desde el corte SCADA documentado de Durango: **2026-08-04**.
2. Consulta **un solo dia** de `get_water_history_module(module='well', aggregation='daily')` por trabajo. Por dia recupera ambos sensores BOS (1001 y 1051) y conserva los controles existentes del totalizador.
3. Guarda el resultado por dia y recalcula totales mensuales a partir de los dias guardados, sin inventar valores para dias sin cobertura.
4. Avanza el cursor solo despues de confirmar escrituras exitosas en SQLite. Si falla BOS, no salta el dia, guarda estado de error y reintenta tras dos minutos; los usuarios pueden continuar consultando registros previos.
5. Terminada la carga inicial, vuelve a revisar el dia en curso y el anterior aproximadamente cada 15 minutos (ajustable). El proceso no requiere que haya usuarios conectados.
6. La actualizacion mensual es un UPSERT idempotente: no duplica volumen al reintentar dias.

**Importante:** la primera carga puede durar varios minutos o mas, dependiendo del rendimiento real de SQL Server. Nunca bloquea la pagina web. Un dia especialmente lento aun puede retrasar el avance de la sincronizacion; no hay garantia de tiempo de carga inicial.

## Nuevos y modificados endpoints

- `GET /api/v1/concessions/history/monthly?year=2026`: lee **solo SQLite** y entrega el mismo esquema mensual C03 mas el objeto `sync` (dias procesados/esperados, avance, ultima actualizacion, error y estado). No dispara historicos BOS.
- `POST /api/v1/concessions/history/rebuild`: **solo admin**, JSON `{"start_date":"2026-10-06","end_date":"2026-10-12"}`. Encola de 1 a 31 dias dentro del corte SCADA disponible. Respuesta inmediata, lectura diferida.

El boton de administrador **Reprocesar 7 dias** envia el segundo endpoint. Los usuarios `operator`/`viewer` solo consultan.

## Pantalla

Nuevo panel de sincronizacion con porcentaje de dias procesados, fecha de la ultima actualizacion, errores seguros y boton de reproceso. La grafica mensual y acumulada se llenan progresivamente desde SQLite. Los dias sin registros y los excluidos no se tratan como consumo cero. Las cuotas/documentos siguen provisionales.

**No se habilita cumplimiento legal ni remanente**: faltan PDF, fechas oficiales de vigencia y la conciliacion legal completa del ciclo.

## Configuracion opcional en `.env` de la IPC

```dotenv
CONCESSION_SYNC_ENABLED=true
CONCESSION_SYNC_REFRESH_MINUTES=15
```

Por defecto esta activado para `DB_MODE=sqlserver`; en `demo` no se pone a consultar BOS. No se requiere configurar SQL Server Management Studio, crear tablas manualmente, instalar un servicio adicional ni cambiar Cloudflare Tunnel.

## Instalacion y validacion dirigida

1. Aplicar el ZIP sobre DGO-C03, manteniendo rutas y sin reemplazar las bases de datos de `backend/data/`.
2. Respaldar con procedimiento **consistente de SQLite** (API backup de SQLite o detener backend para copiar DB y archivos WAL) tanto `auth.sqlite3` como `concessions.sqlite3`, y respaldar `data/concessions/documents/`.
3. Reiniciar FastAPI/servicio backend y reconstruir/reiniciar el frontend segun despliegue de la IPC.
4. Abrir Concesiones como admin; verificar que la pantalla responda rapido aunque el estado inicial diga "Recuperando históricos" y que avance el contador mientras la IPC permanece funcionando.
5. Confirmar que los datos del Pozo 1 y Pozo 2 coinciden con Historico de Pozos para dias validos, y que no se crearon consumos ficticios para dias sin lecturas.
6. Pulsar "Reprocesar 7 dias"; verificar el progreso, la ausencia de duplicados y la lectura por parte de usuarios no admin.
7. Reiniciar el backend durante la carga y confirmar que reanude desde su ultimo dia confirmado.

**Limitaciones de validacion de entrega:** no se pudo probar conectividad al SQL Server/IPC del cliente ni compilar Vite completo sin todas las dependencias Node instaladas. Se ejecutaron pruebas automatizadas aisladas con DB_MODE=demo y comprobacion sintactica de TSX/TS.
