# Homologación Durango 14 — Correo programado con hora exacta HH:MM

## Objetivo

Actualizar el correo programado de Durango para separar completamente:

```text
periodo hidráulico
!=
hora de entrega
```

Los periodos siguen siendo fijos y cerrados. La hora únicamente decide cuándo se envía el reporte.

## 24 horas

El periodo continúa siendo el día calendario anterior completo:

```text
11/09/2026 00:00 -> 12/09/2026 00:00
```

Ahora el usuario puede elegir una hora exacta, por ejemplo:

```text
12/09/2026 06:30
-> entrega el reporte completo del 11/09/2026
```

Cambiar `06:30` a `08:15` no modifica el periodo hidráulico.

## 12 horas

Se conservan los dos bloques fijos:

```text
00:00 -> 12:00
12:00 -> 24:00
```

Cada bloque tiene una hora de entrega independiente.

Ejemplo:

```text
00:00 -> 12:00  -> entrega 19:00
12:00 -> 24:00  -> entrega 07:00 del día siguiente
```

Si se configura para un bloque una hora que todavía cae antes de su cierre, el scheduler utiliza la primera ocurrencia de esa hora posterior al cierre. Nunca genera automáticamente un reporte de un periodo abierto.

## Compatibilidad con programaciones anteriores

No es necesario borrar ni recrear la SQLite.

Al iniciar el backend se agregan automáticamente:

```text
send_time_local
send_time_local_2
```

Las programaciones antiguas se migran desde `send_delay_minutes`.

Con el valor histórico de 10 minutos:

```text
24 h -> 00:10
12 h -> 12:10 para 00:00-12:00
        00:10 para 12:00-24:00
```

`send_delay_minutes` permanece como campo de compatibilidad y no se elimina de la base.

## Interfaz

La sección de correo programado ahora queda compacta:

- botón `Nueva programación`;
- lista de programaciones existentes;
- horario visible en cada programación;
- `Editar`;
- `Enviar ahora`;
- `Historial`;
- `Pausar/Activar`;
- `Eliminar`.

Crear y Editar utilizan un modal por portal sobre `document.body` con scroll interno y bloqueo del fondo.

El selector de periodo usa tarjetas explícitas para 24 h y 12 h.

También se agregó CC opcional a la interfaz.

## Historial

La UI reutiliza el endpoint existente:

```text
GET /api/v1/report-email-schedules/{id}/runs
```

para mostrar las últimas ejecuciones con:

- periodo;
- horario programado;
- estado;
- intento;
- finalización;
- adjuntos;
- error cuando exista.

## Persistencia e idempotencia

No se cambia la regla de idempotencia:

```text
schedule_id + period_start + period_end
```

Tampoco se cambia:

- ventana de recuperación;
- reintentos;
- `Enviar ahora` sobre el último periodo cerrado;
- matemática de PDF/Excel;
- generación de reportes;
- configuración SMTP.

## Estilos

Los estilos nuevos del modal se colocaron en una hoja modular:

```text
frontend/src/pages/pozos/components/styles/scheduled-report-email.css
```

No se agregó nuevo CSS a `global.css`.
