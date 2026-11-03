"""API DGO-H01: iniciar, consultar y descargar exportaciones sin timeout HTTP."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.auth.dependencies import current_user
from app.services.report_export_job_service import manager

router = APIRouter(prefix='/water/reports/jobs', tags=['water'])


class ExportJobRequest(BaseModel):
    kind: Literal['daily_pdf', 'daily_excel', 'historical_pdf', 'historical_excel']
    options: dict[str, Any] = Field(default_factory=dict)


@router.post('')
def create_report_job(body: ExportJobRequest, user: dict = Depends(current_user)):
    try:
        return manager.submit(int(user['id']), body.kind, body.options)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc


@router.get('/{job_id}')
def get_report_job(job_id: str, user: dict = Depends(current_user)):
    result = manager.get(int(user['id']), job_id)
    if result is None:
        raise HTTPException(status_code=404, detail='Exportación no encontrada o expirada.')
    return result


@router.get('/{job_id}/download')
def download_report_job(job_id: str, user: dict = Depends(current_user)):
    result = manager.result(int(user['id']), job_id)
    if result is None:
        raise HTTPException(status_code=404, detail='La exportación no está disponible o ha expirado.')
    path, filename, content_type = result
    return FileResponse(path, media_type=content_type, filename=filename)
