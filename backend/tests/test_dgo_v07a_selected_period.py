"""DGO-V07A: el archivo generado debe corresponder a las fechas solicitadas."""
from unittest.mock import patch
import pytest

from app.services.report_export_job_service import _export, validate_options


def test_daily_jobs_reject_missing_dates_without_falling_back_to_today():
    for kind in ('daily_pdf', 'daily_excel'):
        with pytest.raises(ValueError, match='periodo'):
            validate_options(kind, {})
        with pytest.raises(ValueError, match='periodo'):
            validate_options(kind, {'date': '', 'start_date': None, 'end_date': None})
        assert validate_options(kind, {'start_date': '2026-10-01', 'end_date': '2026-10-31'}) == {
            'date': None, 'start_date': '2026-10-01', 'end_date': '2026-10-31',
        }


def test_wrong_period_report_is_rejected_before_generating_pdf_or_excel():
    import app.services.water_daily_report_service as module
    old_report = {'start_date': '2026-11-03', 'end_date': '2026-11-03'}
    filters = {'date': None, 'start_date': '2026-10-01', 'end_date': '2026-10-31'}
    for kind in ('daily_pdf', 'daily_excel'):
        with (patch.object(module, 'get_daily_water_report', return_value=old_report) as get_report,
              patch.object(module, 'build_daily_water_report_pdf') as build_pdf,
              patch.object(module, 'build_daily_water_report_excel') as build_excel):
            with pytest.raises(RuntimeError, match='periodo solicitado'):
                _export(kind, filters)
            assert get_report.call_args.kwargs['start_date'] == '2026-10-01'
            assert get_report.call_args.kwargs['end_date'] == '2026-10-31'
            build_pdf.assert_not_called()
            build_excel.assert_not_called()


def test_correct_period_reaches_existing_pdf_builder_unchanged():
    import app.services.water_daily_report_service as module
    report = {'start_date': '2026-10-01', 'end_date': '2026-10-31'}
    filters = {'date': None, 'start_date': '2026-10-01', 'end_date': '2026-10-31'}
    with (patch.object(module, 'get_daily_water_report', return_value=report),
          patch.object(module, 'build_daily_water_report_pdf', return_value=(b'%PDF-test', 'octubre.pdf')) as builder):
        assert _export('daily_pdf', filters) == (b'%PDF-test', 'octubre.pdf')
        builder.assert_called_once_with(report)
