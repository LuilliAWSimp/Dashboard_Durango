from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status

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


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _set_session_cookie(response: Response, token: str) -> None:
    cookie_options = {}
    if not settings.auth_cookie_session_only:
        cookie_options['max_age'] = settings.auth_session_absolute_hours * 3600
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        path='/',
        **cookie_options,
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
    _set_session_cookie(response, session.token)
    return LoginResponse(
        user=AuthUser(**session.user),
        tab_session=session.tab_session,
        csrf_token=session.csrf_token,
        expires_at=session.expires_at,
    )


@router.get('/me', response_model=MeResponse)
def me(request: Request):
    session = request.state.auth_session
    csrf_token = request.app.state.auth_service.csrf_token_for_session(session)
    return MeResponse(
        user=AuthUser(**session['user']),
        csrf_token=csrf_token,
        expires_at=session['expires_at'],
    )


@router.post('/logout')
def logout(request: Request, response: Response):
    request.app.state.auth_service.revoke_session(request.state.auth_session['id'])
    response.delete_cookie(
        key=settings.auth_cookie_name,
        path='/',
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
    )
    return {'message': 'Sesión cerrada.'}


@router.get('/users', response_model=list[AuthUser])
def list_users(request: Request):
    return [AuthUser(**user) for user in request.app.state.auth_service.list_users()]


@router.post('/users', response_model=AuthUser, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreateRequest, request: Request):
    try:
        user = request.app.state.auth_service.create_user(**payload.model_dump())
    except DuplicateUserError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return AuthUser(**user)


@router.patch('/users/{user_id}', response_model=AuthUser)
def update_user(user_id: int, payload: UserUpdateRequest, request: Request):
    try:
        user = request.app.state.auth_service.update_user(
            user_id,
            **payload.model_dump(exclude_unset=True),
        )
    except UserNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LastAdministratorError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return AuthUser(**user)


@router.post('/users/{user_id}/reset-password')
def reset_password(user_id: int, payload: PasswordResetRequest, request: Request):
    try:
        request.app.state.auth_service.reset_password(user_id, payload.password)
    except UserNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {'message': 'Contraseña actualizada y sesiones revocadas.'}


@router.post('/users/{user_id}/revoke-sessions')
def revoke_sessions(user_id: int, request: Request):
    try:
        request.app.state.auth_service.revoke_user_sessions(user_id)
    except UserNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {'message': 'Sesiones revocadas.'}
