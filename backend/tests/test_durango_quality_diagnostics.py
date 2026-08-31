from app.services.water_quality import build_quality_diagnostic


def test_quality_diagnostic_explains_totalizer_flow_mismatch():
    result = build_quality_diagnostic(
        quality_status='review',
        coverage_percent=100.0,
        boundary_complete=True,
        missing_previous_reading=False,
        closing_m3=101.0,
        volume_m3=1.0,
        volume_reliable=False,
        discarded_events=[{
            'timestamp': '2026-08-31T09:42:00',
            'previous_totalizer_m3': 100.0,
            'new_totalizer_m3': 104.5,
            'increment_m3': 4.5,
            'expected_flow_volume_m3': 0.4,
            'elapsed_seconds': 60.0,
            'reason': 'incremento_incompatible_con_flujo_y_tiempo',
        }],
    )
    assert result['quality_reason_code'] == 'TOTALIZER_FLOW_MISMATCH'
    assert result['quality_details']['timestamp'] == '2026-08-31T09:42:00'
    assert result['quality_details']['increment_m3'] == 4.5


def test_quality_diagnostic_explains_missing_opening():
    result = build_quality_diagnostic(
        quality_status='review',
        coverage_percent=100.0,
        boundary_complete=False,
        missing_previous_reading=True,
        closing_m3=101.0,
        volume_m3=None,
        volume_reliable=False,
        discarded_events=[],
    )
    assert result['quality_reason_code'] == 'MISSING_OPENING_READING'


def test_quality_diagnostic_does_not_relabel_validated_volume():
    result = build_quality_diagnostic(
        quality_status='validated',
        coverage_percent=100.0,
        boundary_complete=True,
        missing_previous_reading=False,
        closing_m3=101.0,
        volume_m3=1.0,
        volume_reliable=True,
        discarded_events=[],
    )
    assert result['quality_reason_code'] == 'VALIDATED'
