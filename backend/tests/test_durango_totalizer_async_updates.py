from __future__ import annotations

import unittest

from app.services.totalizer_quality import analyze_totalizer_series


class DurangoAsyncTotalizerValidationTests(unittest.TestCase):
    def test_well_start_in_same_minute_as_totalizer_increment_is_valid(self):
        result = analyze_totalizer_series(
            [
                {'timestamp': '2026-08-31T04:19:00', 'total_value': 100662.328125, 'instant_value': 0.0},
                {'timestamp': '2026-08-31T04:20:00', 'total_value': 100663.406250, 'instant_value': 21.24},
                {'timestamp': '2026-08-31T04:21:00', 'total_value': 100664.687500, 'instant_value': 21.48},
            ],
            sensor_id=1001,
            flow_unit='L/s',
            require_flow_validation=True,
        )
        self.assertTrue(result.reliable)
        self.assertEqual(result.discarded_totalizer_events, 0)
        self.assertAlmostEqual(result.validated_volume_m3 or 0.0, 2.359375, places=6)

    def test_small_batched_totalizer_update_with_zero_flow_is_not_discontinuity(self):
        result = analyze_totalizer_series(
            [
                {'timestamp': '2026-08-31T02:17:00', 'total_value': 2374.3798828125, 'instant_value': 0.0},
                {'timestamp': '2026-08-31T02:18:00', 'total_value': 2375.10009765625, 'instant_value': 0.0},
                {'timestamp': '2026-08-31T02:19:00', 'total_value': 2375.10009765625, 'instant_value': 0.0},
            ],
            flow_unit='L/s',
            require_flow_validation=True,
        )
        self.assertTrue(result.reliable)
        self.assertEqual(result.discarded_totalizer_events, 0)
        self.assertAlmostEqual(result.validated_volume_m3 or 0.0, 0.72021484375, places=6)

    def test_flow_validation_disabled_does_not_reject_monotonic_line_totalizer(self):
        result = analyze_totalizer_series(
            [
                {'timestamp': '2026-08-31T12:12:00', 'total_value': 11392.549805, 'instant_value': 0.0},
                {'timestamp': '2026-08-31T12:13:00', 'total_value': 11393.290039, 'instant_value': 0.95},
            ],
            sensor_id=2010,
            flow_unit='L/s',
            require_flow_validation=False,
        )
        self.assertTrue(result.reliable)
        self.assertEqual(result.discarded_totalizer_events, 0)
        self.assertAlmostEqual(result.validated_volume_m3 or 0.0, 0.740234, places=6)

    def test_massive_zero_flow_jump_is_still_rejected(self):
        result = analyze_totalizer_series(
            [
                {'timestamp': '2026-08-31T10:00:00', 'total_value': 1000.0, 'instant_value': 0.0},
                {'timestamp': '2026-08-31T10:01:00', 'total_value': 1010.0, 'instant_value': 0.0},
            ],
            sensor_id=1001,
            flow_unit='L/s',
            require_flow_validation=True,
        )
        self.assertFalse(result.reliable)
        self.assertEqual(result.discarded_totalizer_events, 1)
        self.assertEqual(result.discarded_events[0]['reason'], 'incremento_incompatible_con_flujo_cero')

    def test_totalizer_drop_is_always_rejected(self):
        result = analyze_totalizer_series(
            [
                {'timestamp': '2026-08-31T10:00:00', 'total_value': 1000.0, 'instant_value': 20.0},
                {'timestamp': '2026-08-31T10:01:00', 'total_value': 10.0, 'instant_value': 20.0},
            ],
            sensor_id=1001,
            flow_unit='L/s',
            require_flow_validation=False,
        )
        self.assertFalse(result.reliable)
        self.assertEqual(result.discarded_events[0]['reason'], 'reinicio_o_caida_de_totalizador')


if __name__ == '__main__':
    unittest.main()
