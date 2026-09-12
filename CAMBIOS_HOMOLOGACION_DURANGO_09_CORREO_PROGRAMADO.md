# Homologación Durango 09 — Correo programado automático 12 h / 24 h

## Objetivo

Agregar a **Reportes** una programación persistente de correo que reutiliza los reportes conciliados existentes de Durango, sin crear una segunda matemática hidráulica.

La programación es una función de planta y queda restringida a los roles:

- `admin`: consultar, crear, pausar, activar, eliminar y ejecutar ahora.
- `operator`: consultar, crear, pausar, activar, eliminar y ejecutar ahora.
- `viewer`: sin acceso. El backend responde `403` incluso si se intenta invocar la API manualmente.

La autorización se aplica en dos capas:

1. Dependencias de rol de FastAPI en `/api/v1/report-email-schedules`.
2. `LocalAuthMiddleware`, donde el prefijo de mutaciones de correo programado está permitido explícitamente para `operator`.

## Funcionamiento 24 h

La opción **24 h · día anterior completo** trabaja por día calendario cerrado, no por “últimas 24 horas”.

Ejemplo:

```text
04/09/2026 00:00 ─────────────── 05/09/2026 00:00
                         cierre del día 4
                                ↓
                       05/09/2026 00:10
                                ↓
                 correo con reporte del 04/09
```

El retraso predeterminado es de 10 minutos para permitir que lleguen las últimas muestras del periodo.

El reporte de 24 h reutiliza directamente:

```python
get_daily_water_report(
    report_date=<día anterior>,
    include_history=True,
    include_shifts=True,
)
```

Por lo tanto PDF y Excel conservan la misma conciliación, calidad, cobertura y cortes por turno que el Reporte Diario manual.

## Funcionamiento 12 h

La opción **12 h · dos bloques diarios** usa bloques fijos:

```text
00:00 ─────── 12:00  → envío 12:10
12:00 ─────── 24:00  → envío 00:10 del día siguiente
```

No son ventanas móviles.

El bloque 12 h se construye desde el Histórico operativo conciliado de 15 minutos:

```text
Histórico modular 15 min
        ↓
filtrar [T0,T1)
        ↓
Pozos / Líneas / Lavadoras / Jarabes
        ↓
calidad y cobertura del bloque
        ↓
PDF / Excel
```

Se respetan las reglas específicas ya vigentes de Durango:

- corte SCADA del 04/08/2026 18:16;
- normalización histórica del Pozo 1;
- identidad lógica de Jarabes y su cambio de canal;
- Lavadoras BOS;
- huecos como ausencia de datos, nunca como `0 m³`;
- totalizadores asíncronos conforme a la corrección 08B.

Si un bloque no tiene todas sus fronteras/intervalos confiables, el reporte conserva **Cobertura parcial / Dato en revisión / Sin datos** en lugar de certificar un volumen completo.

## Formatos

Cada programación permite:

- PDF;
- Excel;
- PDF + Excel.

Para 12 h los nombres distinguen el bloque:

```text
reporte-control-hidrico-durango-12h-2026-09-04-00-12.pdf
reporte-control-hidrico-durango-12h-2026-09-04-12-24.pdf
```

Lo mismo aplica al `.xlsx`.

## Destinatarios

La interfaz acepta varios destinatarios separados por coma o punto y coma.

La API valida los correos mediante `EmailStr` y permite hasta 20 destinatarios y 20 CC por programación.

## Persistencia

Las programaciones se guardan en una SQLite local independiente:

```text
backend/data/report_email_schedules.sqlite3
```

Tablas:

```text
report_email_schedules
report_email_runs
```

La base conserva:

- nombre;
- activo/pausado;
- periodo 12 h / 24 h;
- formatos;
- destinatarios y CC;
- retraso de cierre;
- asunto/mensaje opcionales;
- usuario creador;
- fecha de creación/actualización;
- ejecuciones;
- intentos;
- errores;
- Message-ID SMTP;
- adjuntos generados.

La SQLite y sus archivos WAL/SHM están excluidos de Git y **no deben incluirse en incrementales**.

## Idempotencia

Existe una restricción única por:

```text
schedule_id + period_start + period_end
```

Esto evita enviar dos veces el mismo periodo si el backend se reinicia.

Ejemplo:

```text
Programación A
04/09 00:00 → 05/09 00:00
```

Si ese periodo ya tiene estado `sent`, el scheduler no lo vuelve a enviar automáticamente.

## Reintentos

Valores predeterminados:

```text
Máximo de intentos: 3
Espera entre reintentos: 10 min
```

Un error SMTP queda registrado en `report_email_runs.error_message`.

## Recuperación después de un apagado

Ventana predeterminada:

```text
36 horas
```

Ejemplo:

```text
00:10 → debía enviarse el reporte
00:00–07:00 → backend apagado
07:00 → vuelve a iniciar FastAPI
        ↓
el scheduler detecta el periodo pendiente
        ↓
lo procesa si sigue dentro de la ventana de recuperación
```

Una programación recién creada no recupera periodos cuya fecha de envío era anterior a su creación.

## Enviar ahora

Cada programación incluye **Enviar ahora**.

Para 24 h usa el último día calendario completamente cerrado.

Para 12 h usa el último bloque cerrado:

- si ahora es después de las 12:00 → bloque 00:00–12:00 de hoy;
- si ahora es antes de las 12:00 → bloque 12:00–24:00 de ayer.

El envío manual ignora únicamente el retraso de 10 minutos; no ignora la idempotencia. Si el mismo periodo ya fue enviado, responde como omitido.

## Scheduler

El scheduler inicia junto con FastAPI y se detiene durante `shutdown`.

Por defecto revisa programaciones cada 30 segundos.

No es necesario mantener abierto el navegador. Sí es necesario que el backend esté ejecutándose para realizar el envío; si estaba apagado se aplica la recuperación descrita arriba.

## API

```text
GET    /api/v1/report-email-schedules
POST   /api/v1/report-email-schedules
GET    /api/v1/report-email-schedules/{id}
PATCH  /api/v1/report-email-schedules/{id}
DELETE /api/v1/report-email-schedules/{id}
POST   /api/v1/report-email-schedules/{id}/run-now
GET    /api/v1/report-email-schedules/{id}/runs
```

Todas requieren sesión autenticada y rol `admin` u `operator`.

## Variables opcionales

No es obligatorio modificar `.env`; existen valores predeterminados. Si se requiere ajustar el comportamiento:

```text
REPORT_SCHEDULE_DATABASE_PATH=data/report_email_schedules.sqlite3
REPORT_EMAIL_SCHEDULER_ENABLED=true
REPORT_EMAIL_SCHEDULER_POLL_SECONDS=30
REPORT_EMAIL_SEND_DELAY_MINUTES=10
REPORT_EMAIL_CATCHUP_HOURS=36
REPORT_EMAIL_MAX_ATTEMPTS=3
REPORT_EMAIL_RETRY_MINUTES=10
```

Las variables SMTP existentes de Durango se reutilizan sin cambios.

## Archivos del incremental

### Nuevos

```text
backend/app/api/routes/report_email_schedules.py
backend/app/schemas/report_schedule.py
backend/app/services/report_email_scheduler_service.py
backend/app/services/water_scheduled_report_service.py
frontend/src/pages/pozos/components/ScheduledReportEmailPanel.tsx
frontend/src/services/reportEmailScheduleService.ts
CAMBIOS_HOMOLOGACION_DURANGO_09_CORREO_PROGRAMADO.md
```

### Modificados

```text
.gitignore
backend/app/auth/middleware.py
backend/app/config.py
backend/app/main.py
backend/app/services/water_daily_report_service.py
frontend/src/pages/pozos/sections/ReportesSection.tsx
frontend/src/styles/global.css
```

## Qué no se modificó

- `.env` real;
- credenciales SMTP;
- SQL Server;
- sensores;
- mapeos físicos;
- turnos;
- autenticación SQLite existente;
- reglas del Pozo 1;
- remapeo histórico de Jarabes;
- conciliación 01–08B.

## Prueba recomendada

1. Reiniciar backend después de aplicar el incremental.
2. Entrar como `admin` u `operator`.
3. Abrir **Reportes → Programar correo**.
4. Crear una programación 24 h con un correo de prueba y PDF + Excel.
5. Presionar **Enviar ahora**.
6. Confirmar que llegan ambos adjuntos y que corresponden al último día cerrado.
7. Crear una programación 12 h.
8. Presionar **Enviar ahora** y verificar el bloque indicado en asunto, periodo y nombre de archivo.
9. Pausar y comprobar que `Próximo envío` desaparece.
10. Entrar como `viewer` y verificar que la administración queda bloqueada; una llamada directa a la API debe responder `403`.

## Commit sugerido

```text
feat(durango): agregar correo programado de reportes 12h y 24h
```
