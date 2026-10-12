"""Concesiones: lectura autenticada y cambios exclusivos de admin."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.auth.dependencies import current_user, require_roles
from app.services.concession_history_service import get_concession_monthly_history
from app.services.water_history_service import WaterHistoryError
from app.services.concession_service import (
    ConcessionError, attach_document, document_for, inspect_pdf, list_audit,
    list_concessions, update_concession,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix='/concessions', tags=['concessions'], dependencies=[Depends(current_user)])


class EditConcession(BaseModel):
    title_number: str = Field(min_length=1, max_length=100)
    annual_volume_m3: float = Field(gt=0, le=1e12)
    valid_from: str | None = None
    valid_to: str | None = None
    notes: str = Field(default='', max_length=2000)


def _actor(user: dict) -> str:
    return str(user.get('username') or user.get('id') or 'admin')


def _bad(exc: ConcessionError):
    raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get('')
def get_concessions():
    return list_concessions()


@router.get('/history/monthly')
def read_monthly_history(year: int = Query(..., ge=2026, le=2100)):
    """Datos operativos con controles de totalizador, no cierre legal de concesión."""
    try:
        return get_concession_monthly_history(year)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except WaterHistoryError as exc:
        raise HTTPException(status_code=504 if exc.status == 'timeout' else 503,
                            detail='El histórico BOS no está disponible. Inténtelo más tarde.') from exc
    except Exception as exc:
        logger.exception('Error consultando extracciones mensuales de concesiones')
        raise HTTPException(status_code=500, detail='No se pudo consultar la extracción mensual.') from exc


@router.patch('/{well_key}')
def edit_concession(well_key: str, payload: EditConcession, user: dict = Depends(require_roles('admin'))):
    try:
        return update_concession(well_key, payload.model_dump(), _actor(user))
    except ConcessionError as exc:
        _bad(exc)


@router.post('/preview-pdf')
async def preview_pdf(file: UploadFile = File(...), user: dict = Depends(require_roles('admin'))):
    try:
        return inspect_pdf(await file.read(10 * 1024 * 1024 + 1), file.filename or '')
    except ConcessionError as exc:
        _bad(exc)
    finally:
        await file.close()


@router.post('/{well_key}/document')
async def save_pdf(
    well_key: str,
    file: UploadFile = File(...),
    title_number: str = Form(...),
    annual_volume_m3: float = Form(...),
    valid_from: str = Form(''),
    valid_to: str = Form(''),
    notes: str = Form(''),
    user: dict = Depends(require_roles('admin')),
):
    try:
        payload = EditConcession(
            title_number=title_number,
            annual_volume_m3=annual_volume_m3,
            valid_from=valid_from or None,
            valid_to=valid_to or None,
            notes=notes,
        )
        return attach_document(well_key, payload.model_dump(), _actor(user),
                               await file.read(10 * 1024 * 1024 + 1), file.filename or '')
    except ConcessionError as exc:
        _bad(exc)
    finally:
        await file.close()


@router.get('/{well_key}/document')
def download_document(well_key: str):
    try:
        path, name = document_for(well_key)
    except ConcessionError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(path, filename=name, media_type='application/pdf')


@router.get('/{well_key}/audit')
def audit(well_key: str, user: dict = Depends(require_roles('admin'))):
    try:
        return list_audit(well_key)
    except ConcessionError as exc:
        _bad(exc)
