from fastapi import APIRouter, HTTPException

from app.schemas.auth import LoginRequest, LoginResponse

router = APIRouter(prefix='/auth', tags=['auth'])

_DEMO_USERS = {
    'admin': {
        'password': 'demo123',
        'name': 'Admin',
        'role': 'admin',
        'email': 'admin@planta-demo.local',
    },
    'operacion': {
        'password': 'operacion123',
        'name': 'Operación',
        'role': 'viewer',
        'email': 'operacion@planta-demo.local',
    },
}


@router.post('/login', response_model=LoginResponse)
def login(payload: LoginRequest):
    user = _DEMO_USERS.get(payload.username.strip().lower())
    if not user or payload.password != user['password']:
        raise HTTPException(status_code=401, detail='Usuario o contraseña incorrectos')

    return LoginResponse(
        access_token=f"demo-token-{payload.username.strip().lower()}",
        user={
            'username': payload.username.strip().lower(),
            'name': user['name'],
            'role': user['role'],
            'email': user['email'],
        },
    )
