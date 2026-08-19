# Autenticación local — Dashboard ARCA Durango

Durango usa una base local independiente de usuarios en SQLite. No comparte usuarios con otras plantas y no utiliza SQL Server/BOS para autenticación.

## Base local

Ruta por defecto:

```text
backend/data/auth.sqlite3
```

La base se inicializa automáticamente al arrancar FastAPI si no existe. El archivo real de SQLite no debe versionarse ni incluirse en entregas de código.

## Crear el primer administrador

Desde la carpeta `backend`, con el entorno virtual activo:

```bash
python -m app.scripts.create_admin
```

El comando solicita:

- usuario;
- nombre visible;
- contraseña;
- confirmación de contraseña.

La contraseña no se imprime y debe tener al menos 10 caracteres, una letra y un número. No existen usuarios ni contraseñas predeterminados.

## Variables recomendadas

Agregar manualmente al `.env` real de Durango, sin reemplazar credenciales existentes:

```env
AUTH_DATABASE_PATH=data/auth.sqlite3
AUTH_COOKIE_NAME=arca_dgo_session
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SESSION_ONLY=true
AUTH_COOKIE_SAMESITE=lax
AUTH_SESSION_IDLE_HOURS=8
AUTH_SESSION_ABSOLUTE_HOURS=12
AUTH_REQUIRE_TAB_SESSION=true
AUTH_MAX_FAILED_ATTEMPTS=5
AUTH_LOCK_MINUTES=15
AUTH_CSRF_HEADER=X-CSRF-Token
ALLOWED_ORIGINS=https://durango.dashboardrsrc.com.mx,http://localhost:5173,http://127.0.0.1:5173
```

En producción HTTPS debe conservarse `AUTH_COOKIE_SECURE=true`. Para desarrollo local por HTTP únicamente puede usarse `AUTH_COOKIE_SECURE=false` en el `.env` local.

## CORS y URL del frontend

El backend debe aceptar credenciales desde los orígenes explícitos de Durango:

```text
https://durango.dashboardrsrc.com.mx
http://localhost:5173
http://127.0.0.1:5173
```

No usar `*` porque la autenticación depende de cookie HTTP-only y `allow_credentials=true`.

Si el frontend y el backend se sirven bajo el mismo dominio/reverse proxy, el frontend puede usar la ruta relativa por defecto `/api/v1`. Para desarrollo local con Vite, el proxy envía `/api` a `http://127.0.0.1:8000`. Si se define `VITE_API_BASE_URL`, debe apuntar al backend real y conservar HTTPS cuando se accede desde `https://durango.dashboardrsrc.com.mx`.

## Sesiones y pestañas

La sesión principal vive en una cookie HTTP-only llamada `arca_dgo_session`. El navegador comparte la cookie entre pestañas. El frontend sólo guarda un identificador auxiliar de sesión de navegador y el CSRF necesario para solicitudes mutables; no guarda el token principal fuera de la cookie.

Abrir otra pestaña debe restaurar la sesión existente. Logout, expiración, revocación o respuesta 401 limpian el estado auxiliar y sacan todas las pestañas.

## Respaldo y recuperación

Para respaldar:

1. detener el backend;
2. copiar `backend/data/auth.sqlite3` a una ubicación protegida;
3. reiniciar el backend.

Para restaurar:

1. detener el backend;
2. colocar el archivo restaurado en `backend/data/auth.sqlite3`;
3. verificar permisos del archivo;
4. reiniciar el backend.

Si se pierde la base, cree una base nueva y un primer administrador con `python -m app.scripts.create_admin`.
