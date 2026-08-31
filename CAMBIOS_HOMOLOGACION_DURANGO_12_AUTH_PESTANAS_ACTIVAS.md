# Homologación Durango 12 — Autenticación: pestañas activas y cierre de sesión por navegador

## Objetivo

Cerrar el último pendiente general de autenticación de Durango sin rehacer su sistema existente.

El comportamiento esperado queda así:

1. Varias pestañas del Dashboard pueden compartir la misma sesión.
2. Recargar una pestaña no cierra la sesión.
3. Logout, `401`, expiración o revocación se sincronizan entre pestañas.
4. Si se cierran **todas** las pestañas del Dashboard, al abrir una vista nueva debe solicitar login otra vez.
5. Una cookie principal o auxiliar remanente no debe bastar para recuperar la sesión HTTPS sin el binding activo del frontend.
6. Blue Open Studio / WebBrowser HTTP local conserva su compatibilidad especial.

---

## Estado previo

Durango ya tenía:

- SQLite local `backend/data/auth.sqlite3`;
- roles `admin`, `operator`, `viewer`;
- cookie principal HttpOnly `arca_dgo_session`;
- browser binding `arca_dgo_browser_session`;
- CSRF;
- `BroadcastChannel`;
- sincronización por `storage`;
- `X-ARCA-Browser-Session`;
- `X-ARCA-Local-Session` para BOS/local;
- `X-ARCA-User-Activity` sólo tras actividad humana;
- expiración idle/absoluta;
- logout y 401 sincronizados.

Faltaba el registro de pestañas activas y había un detalle importante: en HTTPS el middleware podía aceptar la cookie auxiliar de navegador aunque el frontend ya hubiera perdido/limpiado su browser session. Eso impedía garantizar el comportamiento “cerrar todas las pestañas → nuevo login”.

---

## Registro de pestañas activas

Se agregó el mapa compartido:

```text
arca_dgo_active_tabs
```

Cada pestaña registra un identificador propio con timestamp.

Valores homologados:

```text
ACTIVE_TAB_HEARTBEAT_MS = 5_000
ACTIVE_TAB_TTL_MS       = 20_000
```

Ejemplo conceptual:

```json
{
  "dgo-lx8...": 1788200000000,
  "dgo-p2m...": 1788200003400
}
```

Cada 5 segundos la pestaña actualiza su timestamp. Antes de usar el mapa se eliminan entradas con más de 20 segundos sin heartbeat.

---

## Apertura de una nueva pestaña

Al iniciar el cliente:

1. se leen las pestañas registradas;
2. se eliminan entradas vencidas;
3. se determina si la vista es continuidad/recarga de la misma pestaña;
4. si no existe ninguna pestaña viva y todavía hay una browser session guardada, se limpia el estado de autenticación local antes de que `App` intente `/auth/me`;
5. se registra la nueva pestaña;
6. comienza el heartbeat.

Resultado:

```text
cerrar todas las pestañas
        ↓
mapa activo queda vacío
        ↓
abrir Dashboard otra vez
        ↓
se limpia browser_session local
        ↓
no se envía X-ARCA-Browser-Session
        ↓
Login
```

---

## Recarga de la misma pestaña

Para no convertir `F5` en logout se agregó una identidad temporal de pestaña mediante `sessionStorage`:

```text
arca_dgo_active_tab_id
arca_dgo_tab_reloading
```

Al salir de la vista se retira la pestaña del mapa compartido y se deja una marca en `sessionStorage`.

Si el mismo contexto vuelve inmediatamente por reload, se reutiliza el identificador y se restaura el heartbeat sin limpiar la sesión.

`sessionStorage` desaparece cuando la pestaña se destruye, por lo que una vista nueva no hereda este comportamiento como una sesión viva normal.

---

## Endurecimiento del backend HTTPS

En navegador normal, con:

```env
AUTH_REQUIRE_BROWSER_SESSION=true
```

el middleware ahora requiere que el browser binding llegue por:

```text
X-ARCA-Browser-Session
```

La cookie auxiliar `arca_dgo_browser_session` por sí sola **no sustituye** al header en HTTPS.

Antes:

```text
arca_dgo_session cookie
+
arca_dgo_browser_session cookie
=
sesión aceptada
```

Ahora, en web normal:

```text
arca_dgo_session cookie
+
X-ARCA-Browser-Session válido
=
sesión aceptada
```

pero:

```text
arca_dgo_session cookie
+
arca_dgo_browser_session cookie solamente
=
401
```

Esto es necesario porque las cookies HttpOnly pueden sobrevivir mientras el navegador siga abierto y no pueden ser limpiadas directamente por JavaScript.

---

## Multi-pestaña

El browser session sigue compartido mediante `localStorage`.

Por tanto:

```text
Pestaña A inicia sesión
        ↓
localStorage guarda browser_session + CSRF
        ↓
Pestaña B abre mientras A está activa
        ↓
ve una pestaña viva
        ↓
conserva browser_session
        ↓
/auth/me
        ↓
sesión restaurada
```

No se genera un browser binding diferente por pestaña.

---

## Logout / 401

No cambia el patrón existente.

```text
Logout en pestaña A
        ↓
clearAuthSession
        ↓
BroadcastChannel / storage
        ↓
A y B vuelven a Login
```

Un `401` tiene el mismo efecto.

---

## Blue Open Studio / WebBrowser

El control de pestañas activas se aplica al navegador web normal.

BOS/local conserva:

```text
AUTH_BOS_LOCAL_COMPAT_MODE=true
X-ARCA-Local-Session
cookie/header local autorizado
```

En HTTP local autorizado el backend puede seguir relajando el browser binding adicional porque algunos WebBrowser embebidos no implementan `localStorage`, `sessionStorage` o `BroadcastChannel` de forma confiable.

Esto no abre esa excepción al dominio público HTTPS.

---

## Archivos modificados

### Backend

```text
backend/app/auth/middleware.py
backend/tests/test_local_auth.py
backend/tests/test_frontend_auth_contract.py
```

### Frontend

```text
frontend/src/services/api.js
frontend/src/services/api.ts
```

Se modificaron **ambas variantes JS/TS** porque el proyecto conserva las dos y Vite puede resolver la variante JS en runtime.

### Documentación

```text
docs/AUTENTICACION_LOCAL_DURANGO.md
CAMBIOS_HOMOLOGACION_DURANGO_12_AUTH_PESTANAS_ACTIVAS.md
```

---

## No se modificó

- `.env` real;
- usuarios;
- contraseñas;
- SQLite real de autenticación;
- SQL Server;
- sensores;
- mapeos;
- reportes;
- SMTP;
- correo programado;
- turnos;
- reglas hidráulicas;
- tema visual.

No se requieren variables nuevas de entorno. Se mantiene:

```env
AUTH_REQUIRE_BROWSER_SESSION=true
```

---

## Pruebas automatizadas

Se agregó una regresión backend que comprueba:

1. cookie principal + cookie auxiliar sin header → `401` en web normal;
2. mismo request con `X-ARCA-Browser-Session` correcto → `200`;
3. múltiples pestañas siguen compartiendo sesión;
4. BOS/local continúa funcionando sin exigir el binding moderno.

También se amplió el contrato frontend para comprobar:

```text
arca_dgo_active_tabs
ACTIVE_TAB_TTL_MS = 20_000
ACTIVE_TAB_HEARTBEAT_MS = 5_000
pagehide/pageshow
sincronización JS/TS
```

---

## Prueba manual recomendada

### Caso 1 — dos pestañas

1. iniciar sesión;
2. abrir una segunda pestaña del Dashboard;
3. confirmar que no pide login;
4. navegar en ambas.

Esperado: ambas funcionan.

### Caso 2 — cerrar una sola pestaña

1. tener A y B abiertas;
2. cerrar A;
3. seguir usando B.

Esperado: B sigue autenticada.

### Caso 3 — cerrar todas

1. iniciar sesión;
2. cerrar todas las pestañas de Durango;
3. abrir nuevamente `https://durango.dashboardrsrc.com.mx`.

Esperado: aparece Login.

### Caso 4 — F5

1. iniciar sesión;
2. presionar `F5` en la misma pestaña.

Esperado: la sesión continúa.

### Caso 5 — logout sincronizado

1. abrir dos pestañas;
2. cerrar sesión desde una;
3. cambiar a la otra.

Esperado: ambas quedan fuera de sesión.

### Caso 6 — BOS/local

Abrir el Dashboard desde el WebBrowser local usado por Durango.

Esperado: el modo compatible sigue autenticando correctamente y no depende del mapa moderno de pestañas.
