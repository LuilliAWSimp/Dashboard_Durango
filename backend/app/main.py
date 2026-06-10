from sqlalchemy import text
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.email import router as email_router
from app.api.routes.export import router as export_router
from app.api.routes.plants import router as plants_router
from app.api.routes.water import router as water_router
from app.api.routes.water_export import router as water_export_router
from app.config import get_settings
from app.database import Base, SessionLocal, engine
from app.services.seed_service import seed_if_empty

settings = get_settings()
app = FastAPI(title=settings.app_name, debug=settings.debug)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(auth_router, prefix=settings.api_v1_prefix)
app.include_router(dashboard_router, prefix=settings.api_v1_prefix)
app.include_router(export_router, prefix=settings.api_v1_prefix)
app.include_router(email_router, prefix=settings.api_v1_prefix)
app.include_router(plants_router, prefix=settings.api_v1_prefix)
app.include_router(water_router, prefix=settings.api_v1_prefix)
app.include_router(water_export_router, prefix=settings.api_v1_prefix)


@app.on_event('startup')
def on_startup():
    if settings.db_mode.lower() == 'demo':
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            seed_if_empty(db)
        finally:
            db.close()


@app.get('/')
def root():
    return {
        'message': 'ARCA CONTINENTAL Energy API running',
        'db_mode': settings.db_mode,
        'sqlserver_source_mode': settings.sqlserver_source_mode,
    }


@app.get('/health/db')
def db_health():
    with engine.connect() as conn:
        conn.execute(text('SELECT 1'))
    return {'ok': True}
