# Autenticación local — Dashboard ARCA Durango

Durango usa una base local de autenticación totalmente independiente de otras plantas. SQL Server/BOS sigue dedicado únicamente a los datos industriales.

## Arquitectura

- Usuarios y sesiones: `backend/data/auth.sqlite3`.
- Contraseñas: Argon2.
- Sesión principal: cookie HTTP-only `arca_dgo_session`.
- CSRF estable durante la sesión.
- Vínculo auxiliar de navegador compartido entre pestañas; el token principal nunca se guarda en JavaScript.
- Roles: `admin`, `operator`, `viewer`.
- Expiración por inactividad humana: 8 horas.
- Expiración absoluta: 12 horas.
- Bloqueo: 5 intentos fallidos durante 15 minutos.
- Sesiones revocables y auditoría administrativa básica en SQLite.

La base se crea automáticamente al iniciar el backend. No existe ningún usuario o contraseña predeterminados.

## Dependencia nueva

Desde `backend`, con el entorno virtual activo:

```powershell
python -m pip install -r requirements.txt
```

La dependencia adicional es `argon2-cffi`.

## Configuración recomendada

Agregar al `.env` real de Durango únicamente si no existen ya estas variables. No reemplazar credenciales industriales o SMTP.

```env
AUTH_DATABASE_PATH=data/auth.sqlite3
AUTH_COOKIE_NAME=arca_dgo_session
AUTH_BROWSER_COOKIE_NAME=arca_dgo_browser_session
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SESSION_ONLY=true
AUTH_COOKIE_SAMESITE=lax
AUTH_SESSION_IDLE_HOURS=8
AUTH_SESSION_ABSOLUTE_HOURS=12
AUTH_REQUIRE_BROWSER_SESSION=true
AUTH_MAX_FAILED_ATTEMPTS=5
AUTH_LOCK_MINUTES=15
AUTH_CSRF_HEADER=X-CSRF-Token
ALLOWED_ORIGINS=https://durango.dashboardrsrc.com.mx,http://localhost:5173,http://127.0.0.1:5173,http://100.102.159.109:5173
AUTH_LOCAL_HTTP_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://100.102.159.109:5173
```

`AUTH_REQUIRE_TAB_SESSION` se acepta temporalmente como alias de compatibilidad, pero el nombre recomendado es `AUTH_REQUIRE_BROWSER_SESSION`.

### HTTPS, BOS WebBrowser y acceso local

- Dominio real `https://durango.dashboardrsrc.com.mx`: la cookie permanece `Secure`.
- `http://localhost:5173`, `http://127.0.0.1:5173` y la IP LAN autorizada pueden usar una cookie host-only sin `Secure` exclusivamente para esa sesión HTTP local.
- No es necesario cambiar globalmente `AUTH_COOKIE_SECURE=false`; producción conserva `AUTH_COOKIE_SECURE=true`.
- La excepción HTTP se limita a `AUTH_LOCAL_HTTP_ORIGINS`; no acepta comodines.

Esto permite que el widget WebBrowser de Blue Open Studio abra `http://localhost:5173` sin quedar atrapado en Login por rechazo de una cookie `Secure`. Además, el backend emite un binding auxiliar HttpOnly (`arca_dgo_browser_session`) y lo acepta como fallback cuando el WebBrowser no conserva `localStorage` o no envía `X-ARCA-Browser-Session`. El token principal continúa exclusivamente en `arca_dgo_session`.

Si BOS omite `Origin` y `Referer`, el backend detecta el proxy local por loopback siempre que no existan señales de Cloudflare/HTTPS. En ese caso únicamente esa sesión local HTTP usa cookies sin `Secure`; el dominio público sigue usando `Secure`.

Con Cloudflare + Vite, el navegador accede por HTTPS al frontend y Vite puede seguir proxyando `/api` hacia `http://127.0.0.1:8000`.

## Crear el primer administrador

Desde `backend`:

```powershell
.\.venv\Scripts\activate
python -m app.scripts.create_admin
```

El comando solicita usuario, nombre visible y contraseña/confirmación con entrada oculta. La contraseña requiere al menos 10 caracteres, una letra y un número.

El endpoint `/api/v1/auth/setup-status` sólo informa si existe un administrador; no permite crearlo remotamente.

## Roles

| Función | Admin | Operador | Consulta |
| --- | --- | --- | --- |
| Dashboard e históricos | Sí | Sí | Sí |
| Generar/descargar reportes | Sí | Sí | Sí |
| Enviar correo | Sí | Sí | No |
| Administrar usuarios | Sí | No | No |
| Administrar fuentes | Sí | No | No |

Las restricciones se validan también en backend. Un botón oculto en frontend no sustituye la autorización del servidor.

## Varias pestañas

La cookie HTTP-only se comparte por el navegador. El frontend comparte únicamente el vínculo auxiliar de navegador y el CSRF mediante `localStorage`, eventos `storage` y `BroadcastChannel`.

- Pestañas nuevas restauran `/auth/me` automáticamente.
- `/auth/me` no rota el CSRF.
- Un `401`, logout, expiración o revocación sincroniza la salida de todas las pestañas.
- El polling de fondo no renueva por sí solo el límite de inactividad; sólo solicitudes cercanas a interacción humana marcan actividad.

## CORS

Orígenes admitidos explícitamente:

- `https://durango.dashboardrsrc.com.mx`
- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://100.102.159.109:5173`

No se usa `*` porque las solicitudes llevan credenciales. CORS es la capa exterior de usuario y cubre también respuestas 401, 403, 422 y errores 500 transformados por el boundary interno. `OPTIONS` no exige sesión ni CSRF.

## Respaldo

Con el backend activo puede usarse la API de backup de SQLite mediante el script incluido:

```powershell
python -m app.scripts.backup_auth
```

Por defecto crea un archivo en `backend/data/backups/`.

Para restaurar:

1. detener FastAPI;
2. respaldar el archivo actual;
3. colocar la copia elegida como `backend/data/auth.sqlite3`;
4. iniciar FastAPI;
5. validar login y `/auth/me`.

`auth.sqlite3`, WAL/SHM y respaldos locales están ignorados por Git y no deben incluirse en ZIP de código.

## Migración desde el login anterior

No se migran tokens Bearer ni usuarios demo. Al desplegar esta versión:

1. instalar dependencias;
2. iniciar una vez el backend para crear SQLite;
3. crear el primer administrador por consola;
4. reiniciar frontend/backend si estaban abiertos;
5. iniciar sesión con la cuenta nueva.

El frontend elimina las claves antiguas `siem_demo_token` y `siem_demo_user` del almacenamiento del navegador.
