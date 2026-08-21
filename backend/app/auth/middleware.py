from __future__ import annotations

import logging

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
BROWSER_SESSION_HEADER = "X-ARCA-Browser-Session"
USER_ACTIVITY_HEADER = "X-ARCA-User-Activity"
logger = logging.getLogger(__name__)


class LocalAuthMiddleware(BaseHTTPMiddleware):
    """Valida sesion/CSRF para toda la API y aplica denegacion segura por defecto."""

    def __init__(self, app, *, api_prefix: str, cookie_name: str, csrf_header: str):
        super().__init__(app)
        self.api_prefix = api_prefix.rstrip("/")
        self.cookie_name = cookie_name
        self.csrf_header = csrf_header
        self.public_paths = {
            "/",
            "/health/db",
            f"{self.api_prefix}/auth/login",
            f"{self.api_prefix}/auth/setup-status",
        }
        # Operador solo puede mutar las operaciones explicitamente autorizadas.
        # Cualquier nueva mutacion queda denegada hasta declararla de forma consciente.
        self.operator_mutation_paths = {
            f"{self.api_prefix}/auth/logout",
            f"{self.api_prefix}/water/reports/daily/email",
            f"{self.api_prefix}/email/report",
        }

    async def dispatch(self, request, call_next):
        path = request.url.path
        if request.method == "OPTIONS" or path in self.public_paths:
            return await call_next(request)
        if not path.startswith(self.api_prefix):
            return await call_next(request)

        service = request.app.state.auth_service
        session = service.get_session(
            request.cookies.get(self.cookie_name),
            request.headers.get(BROWSER_SESSION_HEADER),
        )
        if not session:
            return JSONResponse(status_code=401, content={"detail": "Sesión no válida o expirada."})

        user = session["user"]
        request.state.auth_session = session
        request.state.auth_user = user

        if request.headers.get(USER_ACTIVITY_HEADER) == "1":
            service.touch_session(int(session["id"]))

        if request.method not in SAFE_METHODS:
            if not service.validate_csrf(session, request.headers.get(self.csrf_header)):
                return JSONResponse(
                    status_code=403,
                    content={"detail": "La validación de seguridad de la solicitud no es válida."},
                )

            role = str(user.get("role") or "")
            if role == "viewer" and path != f"{self.api_prefix}/auth/logout":
                return JSONResponse(status_code=403, content={"detail": "No cuenta con permisos para esta operación."})
            if role == "operator" and path not in self.operator_mutation_paths:
                return JSONResponse(status_code=403, content={"detail": "No cuenta con permisos para esta operación."})

        return await call_next(request)


class ApiExceptionBoundaryMiddleware(BaseHTTPMiddleware):
    """Convierte errores no controlados dentro de CORS para conservar headers."""

    async def dispatch(self, request, call_next):
        try:
            return await call_next(request)
        except Exception:
            logger.exception("unhandled_request_error path=%s", request.url.path)
            return JSONResponse(status_code=500, content={"detail": "Error interno del servidor."})
