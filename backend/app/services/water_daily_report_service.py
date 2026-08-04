from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.services.durango_capabilities import LOCAL_TIMEZONE
from app.services.water_period_service import WaterPeriodError, get_period_data
from app.services.water_shift_service import get_shift_consumption_data

LOCAL_ZONE = ZoneInfo(LOCAL_TIMEZONE)


class ReportDataUnavailableError(RuntimeError):
    pass


def _parse_date(value: Any = None) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if value:
        try:
            return datetime.fromisoformat(str(value)[:10]).date()
        except ValueError:
            pass
    return datetime.now(LOCAL_ZONE).date()


def _fmt_number(value: Any, decimals: int = 2) -> str:
    if value is None:
        return 'Sin dato'
    try:
        return f'{float(value):,.{decimals}f}'
    except (TypeError, ValueError):
        return 'Sin dato'


def _fmt_date(value: Any) -> str:
    if not value:
        return 'Sin lectura'
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', ''))
        return parsed.strftime('%d/%m/%Y %H:%M')
    except ValueError:
        return str(value)


def _report_row(item: dict[str, Any]) -> dict[str, Any]:
    closing_m3 = item.get('period_close_m3')
    if closing_m3 is None:
        closing_m3 = item.get('current_totalizer_m3')
    return {
        'name': item.get('name') or item.get('nombre'),
        'flow': item.get('current_flow'),
        'flow_unit': item.get('flow_unit') or 'L/s',
        'opening_m3': item.get('period_open_m3'),
        'closing_m3': closing_m3,
        'volume_m3': item.get('period_m3'),
        'volume_reliable': bool(item.get('period_m3_reliable')),
        'activity': item.get('activity') or 'Sin registros guardados',
        'communication': item.get('communication') or 'Sin lectura',
        'last_update': item.get('last_update'),
        'data_status': item.get('data_status') or 'no_data',
        'samples': item.get('samples') or 0,
    }


def get_daily_water_report(report_date: Any = None, start_date: Any = None, end_date: Any = None) -> dict[str, Any]:
    start_day = _parse_date(start_date or report_date)
    end_day = _parse_date(end_date or report_date or start_day)
    if start_day > end_day:
        start_day, end_day = end_day, start_day
    try:
        period = get_period_data(start_day.isoformat(), end_day.isoformat())
    except WaterPeriodError as exc:
        raise ReportDataUnavailableError(str(exc)) from exc

    wells = [_report_row(item) for item in period['wells']]
    lines = [_report_row(item) for item in period['lines']]
    flows = [_report_row(item) for item in period['flows']]
    summaries = period['summary']
    shifts = get_shift_consumption_data(start_day.isoformat()).get('shifts', []) if start_day == end_day else []
    reliable_total = sum(float(summaries[group]['total_m3'] or 0) for group in ('wells', 'lines', 'flows'))
    review_count = sum(int(summaries[group]['review_count'] or 0) for group in ('wells', 'lines', 'flows'))
    latest = max((str(item.get('last_update') or '') for item in [*wells, *lines, *flows]), default='')
    period_label = start_day.strftime('%d/%m/%Y') if start_day == end_day else f'{start_day:%d/%m/%Y} al {end_day:%d/%m/%Y}'
    return {
        'title': 'Reporte Diario de Control Hídrico Durango',
        'plant': 'Planta Durango',
        'date': end_day.isoformat(),
        'start_date': start_day.isoformat(),
        'end_date': end_day.isoformat(),
        'period_label': period_label,
        'generated_at': datetime.now(LOCAL_ZONE).isoformat(timespec='seconds'),
        'source_status': period.get('source_status'),
        'summary': {
            'well_volume_m3': summaries['wells']['total_m3'],
            'line_volume_m3': summaries['lines']['total_m3'],
            'flow_volume_m3': summaries['flows']['total_m3'],
            'total_operational_m3': round(reliable_total, 6),
            'wells_active': summaries['wells']['active_count'],
            'lines_active': summaries['lines']['active_count'],
            'flows_active': summaries['flows']['active_count'],
            'review_count': review_count,
            'communication': 'Revisar comunicación' if any(item['communication'] != 'Actualizado' for item in [*wells, *lines, *flows]) else 'Actualizado',
            'last_update': latest or None,
        },
        'wells': {'rows': wells, **summaries['wells']},
        'production_lines': {'rows': lines, **summaries['lines']},
        'operational_flows': {'rows': flows, **summaries['flows']},
        'shifts': shifts,
        'shift_breakdown_available': bool(shifts),
        'notes': [
            'Comparativo operativo; clasificación hidráulica pendiente de validación.',
            'Tanques y Concesión permanecen pendientes de validación.',
        ],
    }


def _logo_path() -> Path | None:
    candidates = [
        Path(__file__).resolve().parents[3] / 'frontend' / 'src' / 'assets' / 'arca-continental-logo.png',
        Path(__file__).resolve().parents[3] / 'frontend' / 'src' / 'assets' / 'arca-logo.png',
    ]
    return next((path for path in candidates if path.exists()), None)


def _pdf_table(rows: list[list[Any]], widths: list[float], *, repeat_rows: int = 1) -> Table:
    table = Table(rows, colWidths=widths, repeatRows=repeat_rows, hAlign='CENTER')
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0B6E8E')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7.6),
        ('GRID', (0, 0), (-1, -1), 0.35, colors.HexColor('#9CC4D5')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F1F7FA')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 3.5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3.5),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    return table


def build_daily_water_report_pdf(report: dict[str, Any]) -> tuple[bytes, str]:
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=12 * mm, bottomMargin=12 * mm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('TitleDurango', parent=styles['Title'], alignment=TA_CENTER, fontSize=15, leading=18, textColor=colors.HexColor('#073B4C'))
    heading = ParagraphStyle('HeadingDurango', parent=styles['Heading2'], fontSize=10.5, leading=13, textColor=colors.HexColor('#075985'), spaceBefore=5, spaceAfter=5)
    small = ParagraphStyle('SmallDurango', parent=styles['BodyText'], fontSize=8, leading=10)
    right = ParagraphStyle('RightDurango', parent=small, alignment=TA_RIGHT)
    center = ParagraphStyle('CenterDurango', parent=small, alignment=TA_CENTER)
    story: list[Any] = []
    logo = _logo_path()
    if logo:
        logo_image = Image(str(logo), width=42 * mm, height=14 * mm, kind='proportional')
        logo_image.hAlign = 'CENTER'
        story.append(logo_image)
        story.append(Spacer(1, 4 * mm))
    story.append(Paragraph('Reporte Diario de Control Hídrico Durango', title_style))
    story.append(Paragraph(f"Periodo: {report.get('period_label')} · Generado: {_fmt_date(report.get('generated_at'))}", center))
    story.append(Spacer(1, 4 * mm))

    summary = report['summary']
    story.append(Paragraph('Resumen ejecutivo', heading))
    summary_rows = [
        ['Pozos', 'Líneas', 'Flujos auxiliares', 'Total operativo', 'Datos en revisión'],
        [f"{_fmt_number(summary['well_volume_m3'])} m³", f"{_fmt_number(summary['line_volume_m3'])} m³", f"{_fmt_number(summary['flow_volume_m3'])} m³", f"{_fmt_number(summary['total_operational_m3'])} m³", str(summary['review_count'])],
    ]
    story.append(_pdf_table(summary_rows, [34 * mm, 34 * mm, 38 * mm, 36 * mm, 28 * mm]))

    def add_section(title: str, section: dict[str, Any], first_name: str) -> None:
        story.append(Paragraph(title, heading))
        data: list[list[Any]] = [[first_name, 'Flujo', 'Apertura', 'Cierre', 'Volumen', 'Actividad', 'Comunicación', 'Última actualización']]
        for item in section.get('rows', []):
            data.append([
                Paragraph(str(item['name']), small),
                Paragraph('Sin dato' if item['flow'] is None else f"{_fmt_number(item['flow'])} {item['flow_unit']}", right),
                Paragraph(_fmt_number(item['opening_m3']), right),
                Paragraph(_fmt_number(item['closing_m3']), right),
                Paragraph(str(item['activity']) if item['volume_m3'] is None else f"{_fmt_number(item['volume_m3'])} m³", right),
                Paragraph(str(item['activity']).replace(' en el periodo', ''), center),
                Paragraph(str(item['communication']), center),
                Paragraph(_fmt_date(item['last_update']), center),
            ])
        story.append(_pdf_table(data, [25 * mm, 20 * mm, 20 * mm, 20 * mm, 20 * mm, 28 * mm, 25 * mm, 30 * mm]))

    add_section('Pozos', report['wells'], 'Pozo')
    add_section('Líneas', report['production_lines'], 'Línea')
    add_section('Flujos auxiliares', report['operational_flows'], 'Flujo')

    if report.get('shifts'):
        story.append(PageBreak())
        story.append(Paragraph('Cortes por turno', heading))
        shift_rows = [['Turno', 'Horario', 'Pozos', 'Líneas', 'Flujos auxiliares', 'Total operativo', 'Estado']]
        for shift in report['shifts']:
            summary_shift = shift.get('summary') or {}
            shift_rows.append([
                shift.get('name'), shift.get('schedule'),
                f"{_fmt_number((summary_shift.get('wells') or {}).get('total_m3'))} m³",
                f"{_fmt_number((summary_shift.get('lines') or {}).get('total_m3'))} m³",
                f"{_fmt_number((summary_shift.get('flows') or {}).get('total_m3'))} m³",
                f"{_fmt_number(summary_shift.get('total_operational_m3'))} m³",
                shift.get('cut_status'),
            ])
        story.append(_pdf_table(shift_rows, [22 * mm, 26 * mm, 26 * mm, 26 * mm, 32 * mm, 30 * mm, 28 * mm]))

    for note in report.get('notes') or []:
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(str(note), small))
    doc.build(story)
    filename = f"reporte-diario-control-hidrico-durango-{report.get('start_date')}.pdf"
    return buffer.getvalue(), filename


def _style_sheet(ws) -> None:
    header_fill = PatternFill('solid', fgColor='0B6E8E')
    for cell in ws[1]:
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    ws.freeze_panes = 'A2'
    ws.auto_filter.ref = ws.dimensions
    for column in range(1, ws.max_column + 1):
        width = max(len(str(ws.cell(row=row, column=column).value or '')) for row in range(1, ws.max_row + 1)) + 2
        ws.column_dimensions[get_column_letter(column)].width = min(max(width, 12), 32)


def build_daily_water_report_excel(report: dict[str, Any]) -> tuple[bytes, str]:
    wb = Workbook()
    ws = wb.active
    ws.title = 'Resumen'
    ws.append(['Concepto', 'Valor'])
    summary = report['summary']
    for label, value in [
        ('Planta', report['plant']), ('Periodo', report['period_label']), ('Fecha de generación', datetime.fromisoformat(report['generated_at']).replace(tzinfo=None)),
        ('Volumen de pozos (m³)', summary['well_volume_m3']), ('Volumen de líneas (m³)', summary['line_volume_m3']),
        ('Volumen de flujos auxiliares (m³)', summary['flow_volume_m3']), ('Total operativo (m³)', summary['total_operational_m3']),
        ('Datos en revisión', summary['review_count']), ('Estado de comunicación', summary['communication']),
    ]:
        ws.append([label, value])
    ws['B4'].number_format = 'dd/mm/yyyy hh:mm'
    _style_sheet(ws)

    def add_items_sheet(name: str, rows: list[dict[str, Any]], first_header: str) -> None:
        sheet = wb.create_sheet(name)
        sheet.append([first_header, 'Flujo actual', 'Unidad', 'Totalizador apertura (m³)', 'Totalizador cierre (m³)', 'Volumen del periodo (m³)', 'Actividad', 'Comunicación', 'Última actualización'])
        for item in rows:
            last_update = datetime.fromisoformat(item['last_update']) if item.get('last_update') else None
            sheet.append([item['name'], item['flow'], item['flow_unit'], item['opening_m3'], item['closing_m3'], item['volume_m3'] if item['volume_reliable'] else item['activity'], item['activity'], item['communication'], last_update])
        for row in range(2, sheet.max_row + 1):
            for column in (2, 4, 5, 6):
                if isinstance(sheet.cell(row, column).value, (int, float)):
                    sheet.cell(row, column).number_format = '#,##0.00'
            if isinstance(sheet.cell(row, 9).value, datetime):
                sheet.cell(row, 9).number_format = 'dd/mm/yyyy hh:mm'
        _style_sheet(sheet)

    add_items_sheet('Pozos', report['wells']['rows'], 'Pozo')
    add_items_sheet('Líneas', report['production_lines']['rows'], 'Línea')
    add_items_sheet('Flujos', report['operational_flows']['rows'], 'Flujo auxiliar')

    if report.get('shifts'):
        shifts = wb.create_sheet('Turnos')
        shifts.append(['Turno', 'Horario', 'Pozos (m³)', 'Líneas (m³)', 'Flujos auxiliares (m³)', 'Total operativo (m³)', 'Estado'])
        detail = wb.create_sheet('Detalle turnos')
        detail.append(['Turno', 'Grupo', 'Elemento', 'Apertura (m³)', 'Cierre (m³)', 'Volumen (m³)', 'Flujo promedio', 'Flujo mínimo', 'Flujo máximo', 'Muestras', 'Actividad', 'Estado'])
        for shift in report['shifts']:
            shift_summary = shift.get('summary') or {}
            shifts.append([shift.get('name'), shift.get('schedule'), (shift_summary.get('wells') or {}).get('total_m3'), (shift_summary.get('lines') or {}).get('total_m3'), (shift_summary.get('flows') or {}).get('total_m3'), shift_summary.get('total_operational_m3'), shift.get('cut_status')])
            for group_key, group_name in [('wells', 'Pozos'), ('lines', 'Líneas'), ('flows', 'Flujos auxiliares')]:
                for item in shift.get(group_key) or []:
                    detail.append([shift.get('name'), group_name, item.get('name'), item.get('period_open_m3'), item.get('period_close_m3'), item.get('period_m3') if item.get('period_m3_reliable') else item.get('activity'), item.get('flow_avg'), item.get('flow_min'), item.get('flow_max'), item.get('samples'), item.get('activity'), shift.get('cut_status')])
        _style_sheet(shifts)
        _style_sheet(detail)

    output = BytesIO()
    wb.save(output)
    filename = f"reporte-diario-control-hidrico-durango-{report.get('start_date')}.xlsx"
    return output.getvalue(), filename
