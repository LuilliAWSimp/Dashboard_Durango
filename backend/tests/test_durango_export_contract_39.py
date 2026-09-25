from app.services.water_module_history_pdf_service import build_module_history_pdf


def _payload(chart_type='bar', axis='right'):
    return {
        'module_label': 'Pozos',
        'metric_label': 'Ambos · Volumen por intervalo',
        'aggregation_label': '15 min',
        'start_date': '2026-09-25',
        'end_date': '2026-09-25',
        'range_label': '25/09/2026',
        'selected_names': ['Pozo 1'],
        'left_axis_label': 'Flujo (L/s)',
        'right_axis_label': 'Volumen bombeado (m³)',
        'series': [
            {'key': 'flow_1001', 'name': 'Pozo 1 · Flujo', 'metric': 'flow', 'unit': 'L/s', 'color': '#0ea5e9', 'chart_type': 'line', 'axis': 'left'},
            {'key': 'volume_1001', 'name': 'Pozo 1 · Volumen bombeado', 'metric': 'totalizer', 'unit': 'm³', 'color': '#7c3aed', 'chart_type': chart_type, 'axis': axis},
        ],
        'rows': [
            {'label': '25/09/2026 · 00:00-00:15', 'flow_1001': 2.5, 'volume_1001': 1.2},
            {'label': '25/09/2026 · 00:15-00:30', 'flow_1001': 3.0, 'volume_1001': 1.4},
        ],
    }


def test_module_history_pdf_accepts_explicit_line_bar_axis_contract():
    content, filename = build_module_history_pdf(_payload())
    assert content.startswith(b'%PDF')
    assert filename.endswith('.pdf')


def test_module_history_pdf_accepts_cumulative_line_on_right_axis():
    payload = _payload(chart_type='line', axis='right')
    payload['metric_label'] = 'Ambos · Volumen acumulado progresivo'
    payload['series'][1]['key'] = 'volume_cumulative_1001'
    payload['rows'][0]['volume_cumulative_1001'] = 1.2
    payload['rows'][1]['volume_cumulative_1001'] = 2.6
    content, _ = build_module_history_pdf(payload)
    assert len(content) > 1000
