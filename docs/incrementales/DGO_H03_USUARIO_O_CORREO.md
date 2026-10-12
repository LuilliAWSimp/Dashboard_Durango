# DGO-H03 — Acceso con usuario tradicional o correo electrónico

**Planta:** Durango  
**Base requerida:** DGO-H02 sobre DGO-H01 y DGO-C06  
**Guía:** Guía Maestra ARCA V2 (12/10/2026), capítulo 28 / LF11

## Objetivo

El identificador `username` de la SQLite local de autenticación acepta tanto usuarios tradicionales como correos válidos. No se agregó una columna `email`, no se creó otra identidad, ni se modificaron permisos de acceso.

## Contrato

- Usuario tradicional: de 3 a 64 caracteres (`A-Z`, `a-z`, `0-9`, punto, guion o guion bajo).
- Correo: validación formal con `email-validator`, hasta 254 caracteres; admite `+` y dominios compuestos. Se desactiva la verificación de entregabilidad porque el correo es **identificador local** y no implica envío de mensajes.
- Normalización compartida: eliminar espacios alrededor y convertir a minúsculas antes de crear, editar y autenticar.
- Unicidad: índice SQLite existente `users.username UNIQUE COLLATE NOCASE`. Intentos de crear o asignar un identificador utilizado devuelven HTTP 409.
- API: `username` sigue siendo el mismo campo en `POST /api/v1/auth/login`, `POST /api/v1/auth/users` y `PATCH /api/v1/auth/users/{user_id}`.
- Login inválido devuelve el mensaje genérico habitual para no revelar la existencia de una cuenta.
- La pantalla de inicio de sesión y la administración dicen «Usuario o correo»; el identificador se puede editar desde la tabla de Usuarios.
- Las cuentas antiguas siguen funcionando con sus nombres; ninguna se convierte automáticamente a correo.

## Invariantes de identidad y seguridad

Al editar solamente el nombre de usuario:

- Se conserva exactamente el mismo `users.id`.
- Se conserva `password_hash`, rol, nombre visible, estado y privilegios.
- Las sesiones existentes continúan activas porque usan `user_id` (salvo revocaciones que exija otra operación explícita).
- Se registra la operación en `auth_audit` con `username_changed: true` sin guardar la contraseña.
- El identificador anterior deja de autenticar; el nuevo funciona con la contraseña previa.
- Crear, editar y revocar sesiones sigue siendo potestad del administrador, con CSRF requerido.
- No se cambia la política de hash Argon2, expiraciones, cookies HttpOnly, HTTPS, CSRF ni roles.

## Dependencias y archivos

La dependencia `email-validator==2.2.0` **ya estaba declarada** en `backend/requirements.txt`; no se modifican los requisitos ni la versión del esquema SQLite (`PRAGMA user_version = 2`). El script `backend/app/scripts/create_admin.py` utiliza el mismo servicio `AuthService.create_user`, por lo que hereda la validación sin cambiar de ruta.

Código cambiado:

- `backend/app/auth/security.py`: normalización/validación.
- `backend/app/auth/service.py`: creación/actualización y login, manejo de duplicados, auditoría.
- `backend/app/schemas/auth.py`: límites del campo y posibilidad de editarlo.
- `backend/app/api/routes/auth.py`: HTTP 409 para edición duplicada.
- `frontend/src/pages/LoginPage.jsx`: etiqueta y máximo de entrada.
- `frontend/src/pages/UsersPage.tsx`: creación y edición por nombre o correo.
- `backend/tests/test_dgo_h03_user_or_email.py`: pruebas funcionales, HTTP y sesiones.
- `frontend/tests/authH03.test.ts`: contratos de interfaz y cliente API.

## Instalación segura en IPC

1. Verificar que está instalado DGO-H02. H03 es un ZIP **incremental**: extraer archivos en las mismas rutas relativas sobre ese proyecto.
2. Hacer un **respaldo SQLite consistente** de `backend/data/auth.sqlite3` con el mecanismo de copia nativa de SQLite o con el backend detenido. No copiar únicamente `.sqlite3` mientras existan transacciones activas en `-wal`.
3. **No sobrescribir `auth.sqlite3`**, ni el archivo de concesiones, WAL/SHM, `.env` o documentos operativos. Ninguno forma parte de este ZIP.
4. Confirmar que la instalación Python tiene las dependencias de `backend/requirements.txt` y reconstruir frontend según el procedimiento habitual de esa IPC.
5. Reiniciar backend y recargar frontend.
6. Crear un usuario de consulta con correo, validar login, intentar un correo erróneo, editar una cuenta de prueba, observar que mantiene su ID/rol/contraseña y verificar que otro administrador no perdió su sesión.
7. Probar también acceso por nombre tradicional, cuenta duplicada, bloqueo de contraseñas erróneas y acciones de administrador (permisos y CSRF).

## Validación efectuada en entorno local de preparación

- Backend: **228 tests aprobados** con `DB_MODE=sqlite` usando archivo temporal de pruebas; no se consultó SQL Server/BOS ni la IPC real.
- Frontend: **213 tests aprobados** mediante `npm test`.
- Compilación completa de TypeScript/Vite: **pendiente**. Este entorno no dispone de `@types/node` ni `vite/client`; validarla con `npm install` y `npm run build` en el equipo con dependencias.
- Base SQLite de la IPC, autenticación por Cloudflare, visualización en navegador: **pendientes de verificación en instalación real**.

## Fuera de alcance

No se implementa recuperación de contraseña por correo, verificación de propiedad del buzón, SSO, MFA ni notificación automática. No se alteran SQL Server, BOS, Concesiones, datos hidráulicos, sensores, roles o permisos.
