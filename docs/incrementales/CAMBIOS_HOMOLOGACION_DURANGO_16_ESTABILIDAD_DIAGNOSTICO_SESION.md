# Incremental 16 - Estabilidad y diagnostico de sesion

## Objetivo

Evitar cierres de sesion falsos causados por respuestas 401 aisladas, perdida temporal de storage del navegador o heartbeats atrasados, y dejar un diagnostico preciso en backend cuando una sesion realmente sea rechazada.

## Cambios

- Un 401 de una peticion operativa ya no ejecuta logout inmediato.
- El frontend confirma primero el estado real mediante `/auth/me`.
- Solo un 401 confirmado por `/auth/me` limpia la sesion y regresa al login.
- Red, timeout o 5xx durante la confirmacion no se convierten en logout.
- Las confirmaciones simultaneas de sesion se deduplican para evitar multiples `/auth/me` en paralelo.
- El registro de pestañas/heartbeat deja de tener autoridad para invalidar sesiones.
- El TTL del registro de pestañas se amplia a 120 s y el heartbeat a 15 s; estos valores solo sirven para limpiar registros antiguos.
- `/auth/me` puede recuperar `browser_session` desde la cookie HttpOnly auxiliar si el storage del navegador se perdio; las rutas operativas siguen exigiendo `X-ARCA-Browser-Session`.
- La restauracion inicial de sesion hace hasta 3 intentos cortos ante errores transitorios.
- Si la restauracion falla por red/5xx, se muestra una opcion de reintento en lugar de interpretar la falla como expiracion.
- El backend registra `auth_session_rejected reason=...` con causas concretas.

## Razones de diagnostico incluidas

- `session_cookie_missing`
- `session_not_found`
- `session_revoked`
- `user_inactive`
- `session_token_mismatch`
- `browser_session_missing`
- `browser_session_mismatch`
- `session_absolute_expired`
- `session_idle_expired`

## Politica de duracion

Este incremental no cambia la politica actual de expiracion de Durango. Los valores continúan siendo configurables mediante `AUTH_SESSION_IDLE_HOURS` y `AUTH_SESSION_ABSOLUTE_HOURS`.

## Archivos modificados

- `backend/app/api/routes/auth.py`
- `backend/app/auth/middleware.py`
- `backend/app/auth/service.py`
- `backend/app/schemas/auth.py`
- `backend/tests/test_local_auth.py`
- `backend/tests/test_frontend_auth_contract.py`
- `frontend/src/App.jsx`
- `frontend/src/services/api.js`
- `frontend/src/services/api.ts`
- `frontend/src/services/authService.js`
- `frontend/src/services/authService.ts`

## Validacion dirigida

- Sintaxis Python de auth: OK.
- Sintaxis `api.js` y `authService.js`: OK.
- Transpilacion sintactica de `api.ts`, `authService.ts` y `App.jsx`: OK.
- Recuperacion de browser session mediante `/auth/me`: OK.
- Rutas operativas siguen rechazando ausencia de binding: OK.
- Diagnostico de browser session ausente/incorrecta: OK.
- Diagnostico de sesion revocada: OK.
- Diagnostico de expiracion idle/absoluta: OK.
- Polling automatico sigue sin renovar actividad humana: OK.
- 36 pruebas de autenticacion/frontend auth: OK.
- No se ejecutaron suites hidraulicas generales porque no se modificaron calculos, SQL de proceso, historicos ni reportes.
