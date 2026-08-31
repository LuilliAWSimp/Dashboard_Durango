from __future__ import annotations

from datetime import datetime
import unittest

from app.services.water_interval_reconciliation import reconcile_interval
from app.services.water_quality import classify_water_quality


class DurangoIntervalReconciliationTests(unittest.TestCase):
    def test_opening_is_previous_reading_and_not_period_sample(self):
        start = datetime(2026, 8, 12, 0, 0)
        end = datetime(2026, 8, 12, 0, 15)
        rows = [
            {'operational_ts': datetime(2026, 8, 11, 23, 59), 'total_value': 100.0, 'instant_value': 2.0},
            {'operational_ts': datetime(2026, 8, 12, 0, 0), 'total_value': 100.1, 'instant_value': 2.0},
            {'operational_ts': datetime(2026, 8, 12, 0, 14), 'total_value': 101.0, 'instant_value': 2.0},
            {'operational_ts': datetime(2026, 8, 12, 0, 15), 'total_value': 999.0, 'instant_value': 2.0},
        ]
        result = reconcile_interval(rows, start=start, end=end)
        self.assertEqual(result.opening_m3, 100.0)
        self.assertEqual(result.closing_m3, 101.0)
        self.assertEqual(result.samples_received, 2)
        self.assertTrue(result.boundary_complete)
        self.assertEqual(result.opening_source, 'previous_valid_reading')

    def test_missing_previous_boundary_is_explicit(self):
        result = reconcile_interval(
            [{'operational_ts': datetime(2026, 8, 12, 0, 1), 'total_value': 10.0, 'instant_value': 0.0}],
            start=datetime(2026, 8, 12, 0, 0),
            end=datetime(2026, 8, 12, 0, 15),
        )
        self.assertTrue(result.missing_previous_reading)
        self.assertFalse(result.boundary_complete)
        self.assertIsNone(result.opening_m3)
        self.assertEqual(result.opening_source, 'first_period_reading')

    def test_quality_contract_distinguishes_zero_partial_and_review(self):
        zero = classify_water_quality(
            samples_received=15, samples_expected=15, coverage_percent=100,
            volume_m3=0.0, volume_reliable=True, boundary_complete=True,
        )
        partial = classify_water_quality(
            samples_received=5, samples_expected=15, coverage_percent=33.33,
            volume_m3=2.0, volume_reliable=True, boundary_complete=True,
        )
        review = classify_water_quality(
            samples_received=15, samples_expected=15, coverage_percent=100,
            volume_m3=2.0, volume_reliable=False, boundary_complete=False,
        )
        self.assertEqual(zero.quality_label, 'Cero válido')
        self.assertEqual(partial.quality_label, 'Cobertura parcial')
        self.assertEqual(review.quality_label, 'Dato en revisión')


if __name__ == '__main__':
    unittest.main()
