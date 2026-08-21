from __future__ import annotations

import ipaddress
import logging
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.auth.dependencies import require_roles
from app.auth.service import (
    AccountLockedError,
    DuplicateUserError,
    InactiveUserError,
    InvalidCredentialsError,
    LastAdministratorError,
    UserNotFoundError,
)
from app.config import get_settings
from app.schemas.auth import (
    AuthUser,
    LoginRequest,
    LoginResponse,
    MeResponse,
    PasswordResetRequest,
    SetupStatusResponse,
    UserCreateRequest,
    UserUpdateRequest,
)

router = APIRouter(prefix='/auth', tags=['auth'])
settings = get_settings()
logger = logging.getLogger(__name__)
_admin_required = Depends(require_roles('admin'))


def _client_ip(request: Request) -> str | None:
    # cloudflared conserva CF-Connecting-IP. El backend de Durango normalmente
    # escucha solo en localhost, por lo que este encabezado llega desde el proxy
    # de confianza. Si no existe o es inválido, usamos request.client.host.
    candidate = (request.headers.get('cf-connecting-ip') or '').strip()
    if candidate:
        try:
            return str(ipaddress.ip_address(candidate))
        except ValueError:
            pass
    return request.client.host if request.client else None


def _request_origin(request: Request) -> str:
    origin = (request.headers.get('origin') or '').strip().rstrip('/')
    if origin:
        return origin
    referer = (request.headers.get('referer') or '').strip()
    if not referer:
        return ''
    try:
        parsed = urlsplit(referer)
    except ValueError:
        return ''
    if not parsed.scheme or not parsed.netloc:
        return ''
    return f"{parsed.scheme}://{parsed.netloc}".rstrip('/')


def _cookie_secure_for_request(request: Request) -> tuple[bool, str]:
    """Decide Secure sin depender exclusivamente de Origin/Referer.

    Blue Open Studio puede omitir ambos encabezados. Cuando la peticion llega por
    el proxy local de Vite desde loopback y no hay senales de Cloudflare/HTTPS,
    se trata como acceso HTTP local. El dominio publico conserva Secure.
    """
    origin = _request_origin(request)
    if origin:
        if origin in settings.auth_local_http_origins:
            return False, 'explicit_local_http_origin'
        if origin.lower().startswith('https://'):
            return settings.auth_cookie_secure, 'explicit_https_origin'

    forwarded_proto = (request.headers.get('x-forwarded-proto') or '').split(',')[0].strip().lower()
    if forwarded_proto == 'https':
        return settings.auth_cookie_secure, 'forwarded_https'

    if request.headers.get('cf-connecting-ip') or request.headers.get('cf-ray'):
        return settings.auth_cookie_secure, 'cloudflare'

    client_host = request.client.host if request.client else ''
    try:
        is_loopback = bool(client_host and ipaddress.ip_address(client_host).is_loopback)
    except ValueError:
        is_loopback = client_host.lower() in {'localhost', 'testclient'}

    if not origin and is_loopback and request.url.scheme.lower() == 'http' and forwarded_proto != 'https':
        return False, 'loopback_without_browser_origin'

    return settings.auth_cookie_secure, 'default'


def _set_auth_cookie(
    response: Response,
    *,
    key: str,
    value: str,
    secure: bool,
) -> None:
    cookie_options: dict[str, int] = {}
    if not settings.auth_cookie_session_only:
        cookie_options['max_age'] = settings.auth_session_absolute_hours * 3600
    response.set_cookie(
        key=key,
        value=value,
        httponly=True,
        secure=secure,
        samesite=settings.auth_cookie_samesite,
        path='/',
        **cookie_options,
    )


def _set_session_cookies(
    request: Request,
    response: Response,
    *,
    token: str,
    browser_session: str,
) -> None:
    secure, policy_source = _cookie_secure_for_request(request)
    _set_auth_cookie(response, key=settings.auth_cookie_name, value=token, secure=secure)
    # Fallback HttpOnly para WebBrowser/BOS que no conserva localStorage o no
    # envia X-ARCA-Browser-Session. No sustituye a la cookie principal.
    _set_auth_cookie(
        response,
        key=settings.auth_browser_cookie_name,
        value=browser_session,
        secure=secure,
    )
    logger.info(
        'auth_cookie_policy secure=%s source=%s client=%s origin_present=%s forwarded_proto=%s',
        secure,
        policy_source,
        request.client.host if request.client else 'unknown',
        bool(_request_origin(request)),
        (request.headers.get('x-forwarded-proto') or '').split(',')[0].strip().lower() or 'missing',
    )


@router.get('/setup-status', response_model=SetupStatusResponse)
def setup_status(request: Request):
    return SetupStatusResponse(configured=request.app.state.auth_service.has_admin())


@router.post('/login', response_model=LoginResponse)
def login(payload: LoginRequest, request: Request, response: Response):
    service = request.app.state.auth_service
    if not service.has_admin():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='No hay un administrador configurado. Realice la configuración inicial en el servidor.',
        )
    try:
        session = service.authenticate(
            username=payload.username,
            password=payload.password,
            ip_address=_client_ip(request),
            user_agent=request.headers.get('user-agent'),
        )
    except (InvalidCredentialsError, AccountLockedError, InactiveUserError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Usuario o contraseña incorrectos.') from exc
    _set_session_cookies(
        request,
        response,
        token=session.token,
        browser_session=session.browser_session,
    )
    return LoginResponse(
        user=AuthUser(**session.user),
        browser_session=session.browser_session,
        csrf_token=session.csrf_token,
        expires_at=session.expires_at,
    )


@router.get('/me', response_model=MeResponse)
def me(request: Request):
    session = request.state.auth_session
    return MeResponse(
        user=AuthUser(**session['user']),
        csrf_token=request.app.state.auth_service.csrf_token_for_session(session),
        expires_at=session['expires_at'],
    )


@router.post('/logout')
def logout(request: Request, response: Response):
    request.app.state.auth_service.revoke_session(int(request.state.auth_session['id']))
    secure, _ = _cookie_secure_for_request(request)
    for cookie_name in (settings.auth_cookie_name, settings.auth_browser_cookie_name):
        response.delete_cookie(
            key=cookie_name,
            path='/',
            secure=secure,
            httponly=True,
            samesite=settings.auth_cookie_samesite,
        )
    return {'message': 'Sesión cerrada.'}


@router.get('/users', response_model=list[AuthUser], dependencies=[_admin_required])
def list_users(request: Request):
    return [AuthUser(**user) for user in request.app.state.auth_service.list_users()]


@router.post('/users', response_model=AuthUser, status_code=status.HTTP_201_CREATED, dependencies=[_admin_required])
def create_user(payload: UserCreateRequest, request: Request):
    actor = request.state.auth_user
    try:
        user = request.app.state.auth_service.create_user(
            **payload.model_dump(),
            actor_user_id=int(actor['id']),
            ip_address=_client_ip(request),
        )
    except DuplicateUserError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return AuthUser(**user)


@router.patch('/users/{user_id}', response_model=AuthUser, dependencies=[_admin_required])
def update_user(user_id: int, payload: UserUpdateRequest, request: Request):
    actor = request.state.auth_user
    try:
        user = request.app.state.auth_service.update_user(
            user_id,
            **payload.model_dump(exclude_unset=True),
            actor_user_id=int(actor['id']),
            ip_address=_client_ip(request),
        )
    except UserNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LastAdministratorError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return AuthUser(**user)


@router.post('/users/{user_id}/reset-password', dependencies=[_admin_required])
def reset_password(user_id: int, payload: PasswordResetRequest, request: Request):
    actor = request.state.auth_user
    try:
        request.app.state.auth_service.reset_password(
            user_id,
            payload.password,
            actor_user_id=int(actor['id']),
            ip_address=_client_ip(request),
        )
    except UserNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {'message': 'Contraseña actualizada y sesiones revocadas.'}


@router.post('/users/{user_id}/revoke-sessions', dependencies=[_admin_required])
def revoke_sessions(user_id: int, request: Request):
    actor = request.state.auth_user
    try:
        request.app.state.auth_service.revoke_user_sessions(
            user_id,
            actor_user_id=int(actor['id']),
            ip_address=_client_ip(request),
        )
    except UserNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {'message': 'Sesiones revocadas.'}
