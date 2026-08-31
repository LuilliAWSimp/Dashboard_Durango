from __future__ import annotations

from io import BytesIO
import math
import re
import unicodedata
from typing import Any

from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


MAX_ROWS = 1500
MAX_SERIES = 12


def _text(value: Any, default: str = '') -> str:
    raw = str(value if value is not None else '').strip()
    return raw or default


def _number(value: Any) -> float | None:
    if value is None or value == '':
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric if math.isfinite(numeric) else None


def _slug(value: str) -> str:
    normalized = unicodedata.normalize('NFD', value)
    ascii_value = ''.join(char for char in normalized if unicodedata.category(char) != 'Mn')
    token = re.sub(r'[^a-zA-Z0-9]+', '-', ascii_value).strip('-').lower()
    return token or 'historico'


def _hex_color(value: Any, fallback: str = '#0ea5e9') -> colors.Color:
    raw = _text(value, fallback)
    try:
        return colors.HexColor(raw)
    except Exception:
        return colors.HexColor(fallback)


def _axis_bounds(values: list[float], *, force_zero: bool = False) -> tuple[float, float]:
    if not values:
        return (0.0, 1.0)
    low = min(values)
    high = max(values)
    if force_zero:
        low = min(0.0, low)
        high = max(0.0, high)
    if math.isclose(low, high, rel_tol=1e-9, abs_tol=1e-9):
        pad = max(abs(low) * 0.1, 1.0)
        return (low - pad, high + pad)
    pad = (high - low) * 0.08
    return (low - pad, high + pad)


def _format_axis(value: float) -> str:
    magnitude = abs(value)
    if magnitude >= 1_000_000:
        return f'{value / 1_000_000:.1f}M'
    if magnitude >= 1_000:
        return f'{value / 1_000:.1f}k'
    if magnitude >= 100:
        return f'{value:.0f}'
    if magnitude >= 10:
        return f'{value:.1f}'
    return f'{value:.2f}'


def _format_value(value: Any) -> str:
    numeric = _number(value)
    if numeric is None:
        return ''
    return f'{numeric:,.4f}'.rstrip('0').rstrip('.')


def _chart_drawing(rows: list[dict[str, Any]], series: list[dict[str, Any]], metric_label: str) -> Drawing:
    width = 748
    height = 292
    plot_left = 58
    plot_right = width - 60
    plot_bottom = 46
    plot_top = height - 30
    plot_width = plot_right - plot_left
    plot_height = plot_top - plot_bottom

    drawing = Drawing(width, height)
    drawing.add(Rect(0, 0, width, height, fillColor=colors.white, strokeColor=colors.HexColor('#cbd5e1'), strokeWidth=0.8, rx=6, ry=6))

    flow_series = [item for item in series if _text(item.get('metric')).lower() == 'flow']
    totalizer_series = [item for item in series if _text(item.get('metric')).lower() == 'totalizer']
    both = bool(flow_series and totalizer_series and metric_label.lower() == 'ambos')

    left_series = flow_series if both else series
    right_series = totalizer_series if both else []

    left_values = [
        numeric
        for item in left_series
        for row in rows
        if (numeric := _number(row.get(_text(item.get('key'))))) is not None
    ]
    right_values = [
        numeric
        for item in right_series
        for row in rows
        if (numeric := _number(row.get(_text(item.get('key'))))) is not None
    ]
    force_zero_left = bool(flow_series) or 'variacion' in metric_label.lower() or 'variación' in metric_label.lower() or both
    left_min, left_max = _axis_bounds(left_values, force_zero=force_zero_left)
    right_min, right_max = _axis_bounds(right_values, force_zero=True)

    grid_color = colors.HexColor('#e2e8f0')
    axis_color = colors.HexColor('#64748b')
    label_color = colors.HexColor('#334155')

    for index in range(6):
        ratio = index / 5
        y = plot_bottom + plot_height * ratio
        drawing.add(Line(plot_left, y, plot_right, y, strokeColor=grid_color, strokeWidth=0.55))
        left_value = left_min + (left_max - left_min) * ratio
        drawing.add(String(plot_left - 7, y - 3, _format_axis(left_value), textAnchor='end', fontName='Helvetica', fontSize=7, fillColor=label_color))
        if right_series:
            right_value = right_min + (right_max - right_min) * ratio
            drawing.add(String(plot_right + 7, y - 3, _format_axis(right_value), textAnchor='start', fontName='Helvetica', fontSize=7, fillColor=colors.HexColor('#7c3aed')))

    drawing.add(Line(plot_left, plot_bottom, plot_left, plot_top, strokeColor=axis_color, strokeWidth=0.8))
    drawing.add(Line(plot_left, plot_bottom, plot_right, plot_bottom, strokeColor=axis_color, strokeWidth=0.8))
    if right_series:
        drawing.add(Line(plot_right, plot_bottom, plot_right, plot_top, strokeColor=colors.HexColor('#7c3aed'), strokeWidth=0.8))

    row_count = max(len(rows), 1)
    tick_indexes = sorted(set(round(index * (row_count - 1) / min(7, max(row_count - 1, 1))) for index in range(min(8, row_count))))
    for index in tick_indexes:
        if index >= len(rows):
            continue
        x = plot_left if row_count == 1 else plot_left + plot_width * index / (row_count - 1)
        label = _text(rows[index].get('label'), _text(rows[index].get('bucket')))
        if len(label) > 18:
            label = label[:18]
        drawing.add(Line(x, plot_bottom, x, plot_bottom - 3, strokeColor=axis_color, strokeWidth=0.6))
        drawing.add(String(x, plot_bottom - 12, label, textAnchor='middle', fontName='Helvetica', fontSize=6.5, fillColor=label_color))

    drawing.add(String(12, (plot_bottom + plot_top) / 2, 'Flujo' if flow_series else 'Valor', textAnchor='middle', fontName='Helvetica-Bold', fontSize=8, fillColor=colors.HexColor('#0369a1'), angle=90))
    if right_series:
        drawing.add(String(width - 12, (plot_bottom + plot_top) / 2, 'Totalizador', textAnchor='middle', fontName='Helvetica-Bold', fontSize=8, fillColor=colors.HexColor('#7c3aed'), angle=90))

    def y_for(value: float, metric: str) -> float:
        use_right = bool(right_series and metric == 'totalizer')
        lower, upper = (right_min, right_max) if use_right else (left_min, left_max)
        if math.isclose(lower, upper):
            return plot_bottom + plot_height / 2
        return plot_bottom + (value - lower) / (upper - lower) * plot_height

    for item in series:
        key = _text(item.get('key'))
        metric = _text(item.get('metric')).lower()
        stroke = _hex_color(item.get('color'))
        previous: tuple[float, float] | None = None
        for index, row in enumerate(rows):
            value = _number(row.get(key))
            if value is None:
                previous = None
                continue
            x = plot_left if row_count == 1 else plot_left + plot_width * index / (row_count - 1)
            y = y_for(value, metric)
            if previous is not None:
                drawing.add(Line(previous[0], previous[1], x, y, strokeColor=stroke, strokeWidth=1.35 if metric == 'flow' else 1.05))
            previous = (x, y)

    return drawing


def build_module_history_pdf(payload: dict[str, Any]) -> tuple[bytes, str]:
    module_label = _text(payload.get('module_label'), 'Modulo')
    metric_label = _text(payload.get('metric_label'), 'Flujo')
    aggregation_label = _text(payload.get('aggregation_label'), '15 min')
    start_date = _text(payload.get('start_date'))
    end_date = _text(payload.get('end_date'), start_date)
    selected_names = [_text(item) for item in (payload.get('selected_names') or []) if _text(item)]
    rows = [item for item in (payload.get('rows') or []) if isinstance(item, dict)][:MAX_ROWS]
    series = [item for item in (payload.get('series') or []) if isinstance(item, dict)][:MAX_SERIES]

    if not rows or not series or not selected_names:
        raise ValueError('El PDF requiere datos visibles, series y al menos un elemento seleccionado.')

    allowed_series = []
    for item in series:
        key = _text(item.get('key'))
        if not key:
            continue
        allowed_series.append({
            'key': key,
            'name': _text(item.get('name'), key),
            'metric': _text(item.get('metric'), 'flow').lower(),
            'unit': _text(item.get('unit')),
            'color': _text(item.get('color'), '#0ea5e9'),
        })
    if not allowed_series:
        raise ValueError('El PDF no recibió series válidas para graficar.')

    buffer = BytesIO()
    page_size = landscape(A4)
    document = SimpleDocTemplate(
        buffer,
        pagesize=page_size,
        rightMargin=10 * mm,
        leftMargin=10 * mm,
        topMargin=9 * mm,
        bottomMargin=9 * mm,
        title=f'Historico operativo - {module_label}',
        author='Dashboard ARCA - Planta Durango',
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('TitleDurango', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=17, leading=20, textColor=colors.HexColor('#0f172a'), spaceAfter=3)
    eyebrow_style = ParagraphStyle('EyebrowDurango', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=7.5, leading=9, textColor=colors.HexColor('#0369a1'), spaceAfter=2)
    meta_style = ParagraphStyle('MetaDurango', parent=styles['Normal'], fontSize=8, leading=10, textColor=colors.HexColor('#475569'))
    header_style = ParagraphStyle('HeaderDurango', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=6.2, leading=7.2, alignment=1, textColor=colors.HexColor('#0f172a'))
    cell_style = ParagraphStyle('CellDurango', parent=styles['Normal'], fontSize=6.2, leading=7.2, alignment=1, textColor=colors.HexColor('#0f172a'))

    story: list[Any] = []
    header = Table([
        [
            [
                Paragraph('DASHBOARD ARCA - PLANTA DURANGO', eyebrow_style),
                Paragraph(f'Historico operativo por modulo - {module_label}', title_style),
                Paragraph(f'{metric_label} - {aggregation_label}', meta_style),
            ],
            Paragraph(f'<b>Rango</b><br/>{start_date} a {end_date}<br/><b>Elementos</b><br/>{", ".join(selected_names)}', meta_style),
        ]
    ], colWidths=[178 * mm, 85 * mm])
    header.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, 0), (-1, -1), 2, colors.HexColor('#0ea5e9')),
    ]))
    story.append(header)
    story.append(Spacer(1, 5 * mm))

    story.append(_chart_drawing(rows, allowed_series, metric_label))
    story.append(Spacer(1, 3 * mm))

    legend_parts = []
    for item in allowed_series:
        legend_parts.append(f'<font color="{item["color"]}">■</font> {item["name"]} ({item["unit"]})')
    story.append(Paragraph(' &nbsp;&nbsp; '.join(legend_parts), meta_style))
    story.append(Spacer(1, 4 * mm))

    columns = [('label', 'Intervalo')] + [(item['key'], f'{item["name"]} ({item["unit"]})') for item in allowed_series]
    table_data = [[Paragraph(label, header_style) for _, label in columns]]
    for row in rows:
        cells = []
        for key, _ in columns:
            value = _text(row.get(key)) if key == 'label' else _format_value(row.get(key))
            cells.append(Paragraph(value or '', cell_style))
        table_data.append(cells)

    available_width = page_size[0] - document.leftMargin - document.rightMargin
    interval_width = 29 * mm
    remaining = max(available_width - interval_width, 40 * mm)
    series_width = remaining / max(len(columns) - 1, 1)
    col_widths = [interval_width] + [series_width] * (len(columns) - 1)

    data_table = LongTable(table_data, repeatRows=1, colWidths=col_widths, hAlign='LEFT')
    data_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e0f2fe')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
        ('GRID', (0, 0), (-1, -1), 0.35, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
    ]))
    story.append(data_table)
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph('El PDF usa la misma muestra visible enviada por la grafica. Los huecos permanecen vacios y no se convierten en cero.', meta_style))

    document.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()

    filename = '_'.join([
        'historico-operativo-durango',
        _slug(module_label),
        _slug(metric_label),
        start_date or 'rango',
        end_date or start_date or 'rango',
        _slug(aggregation_label),
    ]) + '.pdf'
    return pdf_bytes, filename
