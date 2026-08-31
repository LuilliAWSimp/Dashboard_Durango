from __future__ import annotations

import unittest
from unittest.mock import patch

from app.services.water_daily_review_service import get_daily_water_review


def _item(name: str, module: str, volume: float | None, quality: str = 'validated'):
    reliable = quality in {'validated', 'valid_zero'}
    return {
        'name': name,
        'module': module,
        'operational_key': name.lower().replace(' ', '_'),
        'reconciled_open_m3': 100.0,
        'reconciled_close_m3': 100.0 + float(volume or 0),
        'reconciled_validated_volume_m3': volume,
        'reconciled_volume_reliable': reliable,
        'reconciled_discarded_volume_m3': 0.0,
        'reconciled_discarded_totalizer_events': 0,
        'reconciled_has_discontinuities': False,
        'quality_data_status': 'zero_consumption' if quality == 'valid_zero' else quality,
        'quality_status': quality,
        'quality_label': 'Cero válido' if quality == 'valid_zero' else 'Validado' if quality == 'validated' else 'Dato en revisión',
        'active_samples': 0 if not volume else 5,
        'current_flow': 0.0,
        'communication_status': 'operational',
        'coverage_percent': 100.0,
    }


class DurangoDailyReviewTests(unittest.TestCase):
    @patch('app.services.water_daily_review_service.get_shift_consumption_data')
    @patch('app.services.water_daily_review_service.get_period_data')
    def test_review_prefers_reconciled_volume_and_boundaries(self, period_mock, shifts_mock):
        period_mock.return_value = {
            'source_status': 'operational',
            'validated_segment_start': '2026-08-31T00:00:00',
            'crosses_scada_cutover': False,
            'has_future_intervals': False,
            'wells': [_item('Pozo 1', 'well', 12.5)],
            'lines': [_item('Línea 1', 'line', 0.0, 'valid_zero')],
            'flows': [_item('Jarabes', 'flow', None, 'review')],
        }
        shifts_mock.return_value = {'shifts': []}
        payload = get_daily_water_review('2026-08-31', include_comparatives=False)
        self.assertEqual(payload['wells'][0]['period_open_m3'], 100.0)
        self.assertEqual(payload['wells'][0]['period_close_m3'], 112.5)
        self.assertEqual(payload['wells'][0]['validated_volume_m3'], 12.5)
        self.assertEqual(payload['production_lines'][0]['activity'], 'Sin actividad')
        self.assertIsNone(payload['flows'][0]['validated_volume_m3'])
        self.assertEqual(payload['flows'][0]['validation'], 'Dato en revisión')
        self.assertEqual(payload['summary']['subtotal_validated_m3'], 12.5)
        self.assertFalse(payload['summary']['coverage_complete'])


if __name__ == '__main__':
    unittest.main()
