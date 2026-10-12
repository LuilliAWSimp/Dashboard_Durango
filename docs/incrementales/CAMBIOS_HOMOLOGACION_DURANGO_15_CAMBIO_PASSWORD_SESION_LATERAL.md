# Incremental 15 - Cambio propio de contrasena + sesion lateral

## Objetivo

Homologar el autoservicio de autenticacion de Durango con la guia maestra: cualquier usuario autenticado (admin, operator o viewer) puede cambiar su propia contrasena desde la sesion lateral, conservando la sesion actual y revocando las demas sesiones del mismo usuario.

## Backend

- Nuevo endpoint `POST /api/v1/auth/change-password`.
- Requiere sesion valida y CSRF por el middleware existente.
- Disponible para admin, operator y viewer sin ampliar otros permisos de escritura.
- Exige la contrasena actual antes de aceptar el cambio.
- Reutiliza la politica vigente de contrasenas: minimo 10 caracteres, al menos una letra y un numero.
- Rechaza reutilizar exactamente la contrasena actual.
- Conserva la sesion desde la que se realiza el cambio.
- Revoca todas las demas sesiones activas del mismo usuario.
- Reinicia contadores de intentos fallidos/bloqueo al completar el cambio.
- Registra auditoria `password_changed` y, cuando falla la contrasena actual, `password_change_rejected`.

## Frontend

- Nueva tarjeta `SESION ACTIVA` en el sidebar.
- Muestra nombre visible, usuario y rol.
- Acciones comunes: Cambiar contrasena y Cerrar sesion.
- En sidebar colapsado mantiene accesos por iconos.
- El cambio de contrasena abre un modal por portal sobre `document.body`.
- El modal bloquea el scroll de fondo, admite Escape/click exterior y conserva acciones visibles.
- Valida confirmacion de contrasena antes de llamar al backend.
- Informa cuantas sesiones adicionales fueron revocadas.
- Usuario/logout dejan de duplicarse en el Header; la responsabilidad queda centralizada en la sesion lateral.

## CSS

- Los estilos nuevos viven en `frontend/src/styles/pages/session-controls.css`.
- No se agregaron reglas a `global.css`.

## Validacion dirigida

- `python -m py_compile` en los archivos backend modificados: OK.
- `tests.test_local_auth` + `tests.test_frontend_auth_contract`: 35 pruebas OK.
- Transpilacion sintactica aislada con TypeScript de JSX/JS/TS modificados: OK.
- No se ejecutaron suites generales hidraulicas porque este incremental no cambia calculos, SQL de proceso, historicos ni reportes.
