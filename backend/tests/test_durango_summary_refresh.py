from __future__ import annotations

from datetime import date
import unittest

from app.services.durango_capabilities import current_flow_threshold_for_sensor
from app.services.water_history_service import _history_cache_ttl
from app.services.water_period_service import (
    PERIOD_TTL_CURRENT_SECONDS,
    PERIOD_TTL_HISTORICAL_SECONDS,
    _period_cache_ttl,
    summarize_period_items,
)


class DurangoSummaryRefreshTests(unittest.TestCase):
    def test_partial_validated_volume_is_included_in_summary_and_review(self):
        summary = summarize_period_items([
            {
                'sensor_id': 2002,
                'validated_volume_m3': 24.21,
                'has_discontinuities': True,
                'data_status': 'invalid_totalizer',
                'current_flow': 5.03,
                'communication': 'Actualizado',
                'communication_status': 'operational',
            },
            {
                'sensor_id': 2006,
                'validated_volume_m3': 0.0,
                'has_discontinuities': False,
                'data_status': 'zero_consumption',
                'current_flow': 0.0,
                'communication': 'Actualizado',
                'communication_status': 'operational',
            },
        ])
        self.assertEqual(summary['total_m3'], 24.21)
        self.assertEqual(summary['active_count'], 1)
        self.assertEqual(summary['inactive_count'], 1)
        self.assertEqual(summary['current_flow_count'], 1)
        self.assertEqual(summary['review_count'], 1)
        self.assertTrue(summary['has_partial_volume'])
        self.assertEqual(summary['coverage_available'], 2)

    def test_current_flow_and_period_activity_are_independent(self):
        summary = summarize_period_items([
            {
                'sensor_id': 2002,
                'validated_volume_m3': 12.0,
                'has_discontinuities': False,
                'data_status': 'operational',
                'current_flow': 0.0,
                'communication': 'Actualizado',
                'communication_status': 'operational',
            },
            {
                'sensor_id': 2006,
                'validated_volume_m3': 0.0,
                'has_discontinuities': False,
                'data_status': 'zero_consumption',
                'current_flow': current_flow_threshold_for_sensor(2006) + 0.1,
                'communication': 'Actualizado',
                'communication_status': 'operational',
            },
        ])
        self.assertEqual(summary['active_count'], 1)
        self.assertEqual(summary['current_flow_count'], 1)

    def test_missing_samples_are_not_converted_to_reliable_zero(self):
        summary = summarize_period_items([
            {
                'operational_key': 'lavadora_vidrio',
                'sensor_id': None,
                'validated_volume_m3': None,
                'data_status': 'no_history',
                'current_flow': None,
                'communication': 'Sin lectura',
                'communication_status': 'no_data',
            },
        ])
        self.assertIsNone(summary['total_m3'])
        self.assertEqual(summary['coverage_available'], 0)
        self.assertEqual(summary['no_history_count'], 1)
        self.assertEqual(summary['coverage_status'], 'No disponible')

    def test_cache_policy_is_short_for_today_and_long_for_closed_history(self):
        today = date(2026, 8, 4)
        self.assertEqual(_period_cache_ttl(today, today, today), PERIOD_TTL_CURRENT_SECONDS)
        self.assertEqual(_period_cache_ttl(date(2026, 8, 1), date(2026, 8, 3), today), PERIOD_TTL_HISTORICAL_SECONDS)
        self.assertEqual(_history_cache_ttl(today, today, today), 60)
        self.assertEqual(_history_cache_ttl(date(2026, 8, 1), date(2026, 8, 3), today), 600)


if __name__ == '__main__':
    unittest.main()
