from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile

from app.schemas.export import DailyWaterReportEmailRequest
from app.schemas.water import WaterDashboardPayload, WaterSourceActivateResponse, WaterSourceInfo, WaterSourceValidation
from app.services.email_service import EmailDeliveryError, EmailNotConfiguredError, ensure_smtp_configured, send_email_with_bytes_attachment
from app.services.water_daily_report_service import ReportDataUnavailableError, build_daily_water_report_excel, build_daily_water_report_pdf, get_daily_water_report
from app.services.water_history_service import WaterHistoryError, get_water_history, get_water_history_module, get_wells_minute_flow
from app.services.water_service import WATER_SECTION_META, get_water_dashboard_payload, get_water_report_catalog
from app.services.water_shift_service import get_shift_consumption_data
from app.services.water_source_service import activate_source, list_sources, read_upload_json, register_upload, validate_source_data

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/water', tags=['water'])


@router.get('/dashboard/{section}', response_model=WaterDashboardPayload)
def read_water_dashboard(
    section: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    period: Optional[str] = Query(None),
    include_history: bool = Query(False),
    include_energy_water: bool = Query(False),
    force_refresh: bool = Query(False),
):
    if section not in WATER_SECTION_META:
        raise HTTPException(status_code=404, detail='Sección hídrica no encontrada')
    return get_water_dashboard_payload(section, start_date, end_date, period, include_history, include_energy_water, force_refresh)


@router.get('/history')
def read_water_history(
    module: str = Query(..., pattern='^(well|line|flow)$'),
    sensor_id: int = Query(..., gt=0),
    start_date: str = Query(...),
    end_date: str = Query(...),
    aggregation: str = Query(..., pattern='^(quarter_hour|hourly|daily)$'),
    force_refresh: bool = Query(False),
):
    try:
        return get_water_history(module=module, sensor_id=sensor_id, start_date=start_date, end_date=end_date, aggregation=aggregation, force_refresh=force_refresh)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except WaterHistoryError as exc:
        raise HTTPException(status_code=504 if exc.status == 'timeout' else 503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception('No fue posible construir el histórico hídrico: %s', exc)
        raise HTTPException(status_code=500, detail='No fue posible consultar el histórico de planta.') from exc


@router.get('/history/module')
def read_water_history_module(module: str = Query(..., pattern='^(well|line|flow)$'), start_date: str = Query(...), end_date: str = Query(...), aggregation: str = Query(..., pattern='^(quarter_hour|hourly|daily)$'), force_refresh: bool = Query(False)):
    try:
        return get_water_history_module(module=module, start_date=start_date, end_date=end_date, aggregation=aggregation, force_refresh=force_refresh)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except WaterHistoryError as exc:
        raise HTTPException(status_code=504 if exc.status == 'timeout' else 503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception('No fue posible construir el histórico por módulo: %s', exc)
        raise HTTPException(status_code=500, detail='No fue posible consultar el histórico por módulo.') from exc


@router.get('/wells/minute-flow')
def read_wells_minute_flow(start_datetime: str = Query(...), end_datetime: str = Query(...), force_refresh: bool = Query(False)):
    try:
        return get_wells_minute_flow(start_datetime=start_datetime, end_datetime=end_datetime, force_refresh=force_refresh)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception('No fue posible consultar el flujo minuto a minuto de pozos: %s', exc)
        raise HTTPException(status_code=500, detail='No fue posible consultar el flujo minuto a minuto de pozos.') from exc


@router.get('/shifts')
def read_water_shifts(date: Optional[str] = Query(None), shift: str = Query('all', pattern='^(all|shift_1|shift_2|shift_3)$'), force_refresh: bool = Query(False)):
    try:
        payload = get_shift_consumption_data(date, force_refresh=force_refresh)
    except Exception as exc:
        logger.exception('No fue posible consultar los cortes por turno: %s', exc)
        raise HTTPException(status_code=500, detail='No fue posible consultar los cortes por turno.') from exc
    payload['selected_shift'] = shift
    if shift != 'all':
        payload['selected'] = next((item for item in payload.get('shifts', []) if item.get('id') == shift), None)
    return payload


@router.get('/reports/catalog', response_model=list[str])
def read_water_report_catalog():
    return get_water_report_catalog()


def _report_or_error(date: str | None, start_date: str | None, end_date: str | None):
    try:
        return get_daily_water_report(report_date=date, start_date=start_date, end_date=end_date)
    except ReportDataUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception('No fue posible generar el reporte diario: %s', exc)
        raise HTTPException(status_code=500, detail='No fue posible generar el reporte diario.') from exc


@router.get('/reports/daily')
def read_daily_water_report(date: Optional[str] = Query(None), start_date: Optional[str] = Query(None), end_date: Optional[str] = Query(None)):
    return _report_or_error(date, start_date, end_date)


@router.get('/reports/daily/pdf')
def download_daily_water_report_pdf(date: Optional[str] = Query(None), start_date: Optional[str] = Query(None), end_date: Optional[str] = Query(None)):
    report = _report_or_error(date, start_date, end_date)
    content, filename = build_daily_water_report_pdf(report)
    return Response(content=content, media_type='application/pdf', headers={'Content-Disposition': f'attachment; filename="{filename}"'})


@router.get('/reports/daily/excel')
def download_daily_water_report_excel(date: Optional[str] = Query(None), start_date: Optional[str] = Query(None), end_date: Optional[str] = Query(None)):
    report = _report_or_error(date, start_date, end_date)
    content, filename = build_daily_water_report_excel(report)
    return Response(content=content, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={'Content-Disposition': f'attachment; filename="{filename}"'})


@router.post('/reports/daily/email')
def email_daily_water_report(request: DailyWaterReportEmailRequest):
    try:
        ensure_smtp_configured()
    except EmailNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    report = _report_or_error(request.date, request.start_date, request.end_date)
    try:
        pdf_bytes, filename = build_daily_water_report_pdf(report)
        subject = request.subject or f"Reporte Diario de Control Hídrico Durango - {report.get('period_label')}"
        message = request.message or 'Se adjunta el Reporte Diario de Control Hídrico Durango generado desde el dashboard.'
        result = send_email_with_bytes_attachment(to=request.to, cc=request.cc, subject=subject, message=message, attachment_bytes=pdf_bytes, filename=filename, maintype='application', subtype='pdf')
    except EmailDeliveryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception('No fue posible generar o enviar el reporte: %s', exc)
        raise HTTPException(status_code=500, detail='No fue posible generar el PDF para adjuntarlo al correo.') from exc
    return {'status': 'smtp_accepted', 'message': result.message, 'message_id': result.message_id, 'attachment': filename}


@router.get('/sources', response_model=list[WaterSourceInfo])
def read_water_sources():
    return list_sources()


@router.post('/sources/validate', response_model=WaterSourceValidation)
async def validate_water_source(file: UploadFile = File(...)):
    return validate_source_data(await read_upload_json(file))


@router.post('/sources/upload', response_model=WaterSourceInfo)
async def upload_water_source(file: UploadFile = File(...), activate: bool = True):
    return await register_upload(file, activate=activate)


@router.post('/sources/{source_id}/activate', response_model=WaterSourceActivateResponse)
def activate_water_source(source_id: str):
    source = activate_source(source_id)
    return WaterSourceActivateResponse(active_source=source, message='Fuente hídrica activada')
