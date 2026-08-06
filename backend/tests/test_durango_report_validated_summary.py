from __future__ import annotations

import unittest
from io import BytesIO
from unittest.mock import patch

from openpyxl import load_workbook

from app.services.water_daily_report_service import (
    SUMMARY_NOTE,
    build_daily_water_report_excel,
    build_daily_water_report_pdf,
    get_daily_water_report,
)


def period_item(
    name: str,
    *,
    validated: float | None,
    reliable: bool,
    discarded: float = 0.0,
    discontinuity: bool = False,
    activity: str = 'Con actividad en el periodo',
) -> dict:
    return {
        'name': name,
        'current_flow': 12.5,
        'flow_unit': 'L/s',
        'period_open_m3': 100.0,
        'period_close_m3': 200.0,
        'period_m3': validated,
        'period_m3_reliable': reliable,
        'validated_volume_m3': validated,
        'discarded_volume_m3': discarded,
        'discarded_totalizer_events': 1 if discontinuity else 0,
        'has_discontinuities': discontinuity,
        'activity': activity,
        'communication': 'Actualizado',
        'last_update': '2026-08-04T13:10:00',
        'data_status': 'invalid_totalizer' if discontinuity else 'operational',
        'samples': 60,
    }


class DurangoReportValidatedSummaryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.period = {
            'wells': [
                period_item('Pozo 1', validated=0.67, reliable=False, discarded=11093.519532, discontinuity=True, activity='Dato en revisión'),
                period_item('Pozo 2', validated=174.98, reliable=False, discarded=4357.320313, discontinuity=True, activity='Dato en revisión'),
            ],
            'lines': [
                period_item('Línea 1', validated=24.21, reliable=False, discarded=500.0, discontinuity=True, activity='Dato en revisión'),
                period_item('Línea 2', validated=0.0, reliable=True, activity='Sin actividad en el periodo'),
            ],
            'flows': [
                period_item('Lavadora Vidrio', validated=None, reliable=False, activity='Sin registros guardados'),
                period_item('Lavadora Ref Pet', validated=None, reliable=False, activity='Sin registros guardados'),
            ],
            'summary': {
                'wells': {'total_m3': None, 'active_count': 0, 'review_count': 2},
                'lines': {'total_m3': 0.0, 'active_count': 0, 'review_count': 1},
                'flows': {'total_m3': 0.0, 'active_count': 0, 'review_count': 0},
            },
            'source_status': 'readings_minute',
        }

    def build_report(self) -> dict:
        with patch('app.services.water_daily_report_service.get_period_data', return_value=self.period), patch(
            'app.services.water_daily_report_service.get_shift_consumption_data', return_value={'shifts': []}
        ):
            return get_daily_water_report('2026-08-04')

    def test_summary_includes_partial_validated_volume_but_not_discarded_events(self) -> None:
        report = self.build_report()
        summary = report['summary']
        self.assertAlmostEqual(summary['well_validated_volume_m3'], 175.65, places=6)
        self.assertAlmostEqual(summary['line_validated_volume_m3'], 24.21, places=6)
        self.assertIsNone(summary['flow_validated_volume_m3'])
        self.assertAlmostEqual(summary['total_validated_operational_m3'], 199.86, places=6)
        self.assertAlmostEqual(summary['discarded_volume_m3'], 15950.839845, places=6)
        self.assertEqual(summary['review_count'], 3)
        self.assertEqual(summary['note'], SUMMARY_NOTE)
        self.assertEqual(report['notes'], [])

    def test_excel_uses_numeric_validated_values_and_same_summary(self) -> None:
        report = self.build_report()
        content, _ = build_daily_water_report_excel(report)
        workbook = load_workbook(BytesIO(content), data_only=False)
        summary_sheet = workbook['Resumen']
        summary_values = {summary_sheet.cell(row, 1).value: summary_sheet.cell(row, 2).value for row in range(2, summary_sheet.max_row + 1)}
        self.assertAlmostEqual(summary_values['Volumen validado de pozos (m³)'], 175.65, places=6)
        self.assertAlmostEqual(summary_values['Volumen validado de líneas (m³)'], 24.21, places=6)
        self.assertIsNone(summary_values['Volumen validado de lavadoras (m³)'])
        self.assertAlmostEqual(summary_values['Total validado operativo (m³)'], 199.86, places=6)
        wells_sheet = workbook['Pozos']
        self.assertIsInstance(wells_sheet['F2'].value, (int, float))
        self.assertAlmostEqual(wells_sheet['F2'].value, 0.67, places=6)
        self.assertAlmostEqual(wells_sheet['G2'].value, 11093.519532, places=6)
        self.assertEqual(wells_sheet['H2'].value, 'Volumen validado parcial')

    def test_pdf_is_generated_from_same_report_object(self) -> None:
        report = self.build_report()
        content, filename = build_daily_water_report_pdf(report)
        self.assertTrue(content.startswith(b'%PDF'))
        self.assertEqual(filename, 'reporte-diario-control-hidrico-durango-2026-08-04.pdf')


if __name__ == '__main__':
    unittest.main()
