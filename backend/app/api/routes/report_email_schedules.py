from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.dependencies import current_user, require_roles
from app.schemas.report_schedule import ReportEmailScheduleCreate, ReportEmailScheduleUpdate
from app.services.report_email_scheduler_service import (
    ReportScheduleError,
    create_report_email_schedule,
    delete_report_email_schedule,
    get_report_email_schedule,
    list_report_email_runs,
    list_report_email_schedules,
    run_report_email_schedule_now,
    update_report_email_schedule,
)

router = APIRouter(
    prefix='/report-email-schedules',
    tags=['report-email-schedules'],
    dependencies=[Depends(require_roles('admin', 'operator'))],
)


@router.get('')
def read_report_email_schedules():
    return list_report_email_schedules()


@router.post('')
def create_schedule(payload: ReportEmailScheduleCreate, user: dict = Depends(current_user)):
    try:
        created_by = str(user.get('username') or user.get('id') or 'authenticated-user')
        return create_report_email_schedule(payload.model_dump(mode='json'), created_by=created_by)
    except ReportScheduleError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get('/{schedule_id}')
def read_schedule(schedule_id: str):
    try:
        return get_report_email_schedule(schedule_id)
    except ReportScheduleError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch('/{schedule_id}')
def update_schedule(schedule_id: str, payload: ReportEmailScheduleUpdate):
    try:
        return update_report_email_schedule(schedule_id, payload.model_dump(mode='json', exclude_unset=True))
    except ReportScheduleError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete('/{schedule_id}')
def delete_schedule(schedule_id: str):
    try:
        delete_report_email_schedule(schedule_id)
    except ReportScheduleError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {'ok': True}


@router.post('/{schedule_id}/run-now')
def run_schedule_now(schedule_id: str):
    try:
        return run_report_email_schedule_now(schedule_id)
    except ReportScheduleError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get('/{schedule_id}/runs')
def read_schedule_runs(schedule_id: str, limit: int = Query(20, ge=1, le=100)):
    try:
        return list_report_email_runs(schedule_id, limit=limit)
    except ReportScheduleError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
