from __future__ import annotations

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
TAB_SESSION_HEADER = "X-ARCA-Tab-Session"


class LocalAuthMiddleware(BaseHTTPMiddleware):
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

    async def dispatch(self, request, call_next):
        path = request.url.path
        if request.method == "OPTIONS" or path in self.public_paths:
            return await call_next(request)
        if not path.startswith(self.api_prefix):
            return await call_next(request)

        service = request.app.state.auth_service
        session = service.get_session(
            request.cookies.get(self.cookie_name),
            request.headers.get(TAB_SESSION_HEADER),
        )
        if not session:
            return JSONResponse(status_code=401, content={"detail": "Sesión no válida o expirada."})

        user = session["user"]
        request.state.auth_session = session
        request.state.auth_user = user

        if path.startswith(f"{self.api_prefix}/auth/users") and user["role"] != "admin":
            return JSONResponse(status_code=403, content={"detail": "No cuenta con permisos para esta operación."})

        email_paths = {
            f"{self.api_prefix}/water/reports/daily/email",
            f"{self.api_prefix}/email/report",
        }
        if path in email_paths and user["role"] not in {"admin", "operator"}:
            return JSONResponse(status_code=403, content={"detail": "No cuenta con permisos para enviar reportes."})

        if request.method not in SAFE_METHODS:
            if user["role"] == "viewer" and path != f"{self.api_prefix}/auth/logout":
                return JSONResponse(status_code=403, content={"detail": "No cuenta con permisos para esta operación."})
            if path.startswith(f"{self.api_prefix}/water/sources") and user["role"] != "admin":
                return JSONResponse(status_code=403, content={"detail": "No cuenta con permisos para administrar fuentes."})
            if not service.validate_csrf(session, request.headers.get(self.csrf_header)):
                return JSONResponse(status_code=403, content={"detail": "La validación de seguridad de la solicitud no es válida."})

        return await call_next(request)
