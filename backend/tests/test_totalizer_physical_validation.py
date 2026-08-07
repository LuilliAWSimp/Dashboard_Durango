from __future__ import annotations

from datetime import date, datetime, timedelta
import unittest

from app.services.durango_capabilities import WELLS
from app.services.totalizer_quality import analyze_totalizer_series
from app.services.water_history_service import _build_points
from app.services.water_period_service import build_period_item
from app.services.water_service import _merge_period
from app.services.water_shift_service import _summary
from app.services.water_daily_report_service import _report_row, _report_volume_display


class TotalizerPhysicalValidationTests(unittest.TestCase):
    def test_pozo_1_zero_flow_rejects_massive_jump(self):
        result = analyze_totalizer_series(
            [
                {'timestamp': '2026-08-04T10:32:00', 'total_value': 62043.019531, 'instant_value': 0.0},
                {'timestamp': '2026-08-04T10:33:00', 'total_value': 73136.539063, 'instant_value': 0.0},
            ],
            sensor_id=1001,
            flow_unit='L/s',
            require_flow_validation=True,
        )
        self.assertFalse(result.reliable)
        self.assertTrue(result.has_discontinuities)
        self.assertEqual(result.status, 'invalid_totalizer')
        self.assertAlmostEqual(result.validated_volume_m3 or 0.0, 0.0, places=6)
        self.assertAlmostEqual(result.discarded_volume_m3, 11093.519532, places=6)
        self.assertEqual(result.discarded_totalizer_events, 1)
        self.assertEqual(result.discarded_events[0]['reason'], 'incremento_incompatible_con_flujo_cero')

    def test_pozo_2_flow_volume_rejects_physically_impossible_jump(self):
        result = analyze_totalizer_series(
            [
                {'timestamp': '2026-08-04T10:45:00', 'total_value': 89213.171875, 'instant_value': 30.44},
                {'timestamp': '2026-08-04T10:46:00', 'total_value': 93570.492188, 'instant_value': 30.44},
            ],
            sensor_id=1051,
            flow_unit='L/s',
            require_flow_validation=True,
        )
        event = result.discarded_events[0]
        self.assertFalse(result.reliable)
        self.assertAlmostEqual(event['expected_flow_volume_m3'], 1.8264, places=4)
        self.assertAlmostEqual(result.discarded_volume_m3, 4357.320313, places=6)
        self.assertEqual(event['reason'], 'incremento_incompatible_con_flujo_y_tiempo')

    def test_accumulated_update_coherent_with_15_minutes_of_flow_is_accepted(self):
        start = datetime(2026, 8, 4, 11, 0)
        readings = [
            {
                'timestamp': start + timedelta(minutes=minute),
                'total_value': 100.0 if minute < 15 else 127.0,
                'instant_value': 30.0,
            }
            for minute in range(16)
        ]
        result = analyze_totalizer_series(
            readings,
            sensor_id=1051,
            flow_unit='L/s',
            require_flow_validation=True,
        )
        self.assertTrue(result.reliable)
        self.assertFalse(result.has_discontinuities)
        self.assertAlmostEqual(result.validated_volume_m3 or 0.0, 27.0, places=6)
        self.assertEqual(result.discarded_totalizer_events, 0)

    def test_zero_flow_without_totalizer_change_is_reliable_inactivity(self):
        result = analyze_totalizer_series(
            [
                {'timestamp': '2026-08-04T12:00:00', 'total_value': 500.0, 'instant_value': 0.0},
                {'timestamp': '2026-08-04T12:01:00', 'total_value': 500.0, 'instant_value': 0.0},
            ],
            sensor_id=1001,
            flow_unit='L/s',
            require_flow_validation=True,
        )
        self.assertTrue(result.reliable)
        self.assertEqual(result.status, 'zero_consumption')
        self.assertEqual(result.validated_volume_m3, 0.0)

    def test_totalizer_drop_keeps_partial_validated_volume_but_marks_review(self):
        result = analyze_totalizer_series(
            [
                ('2026-08-04T13:00:00', 100.0, 10.0),
                ('2026-08-04T13:01:00', 100.6, 10.0),
                ('2026-08-04T13:02:00', 2.0, 10.0),
            ],
            sensor_id=1001,
            flow_unit='L/s',
            require_flow_validation=True,
        )
        self.assertFalse(result.reliable)
        self.assertTrue(result.has_discontinuities)
        self.assertAlmostEqual(result.validated_volume_m3 or 0.0, 0.6, places=6)
        self.assertEqual(result.status, 'invalid_totalizer')

    def test_period_item_uses_validated_increment_for_today_accumulated(self):
        rows = [
            {'operational_ts': datetime(2026, 8, 4, 10, 32), 'instant_value': 0.0, 'total_value': 62043.019531},
            {'operational_ts': datetime(2026, 8, 4, 10, 33), 'instant_value': 0.0, 'total_value': 73136.539063},
        ]
        item = build_period_item(WELLS[0], rows, (datetime(2026, 8, 3, 23, 59), 62043.0), date(2026, 8, 4))
        self.assertEqual(item['activity'], 'Sin actividad')
        self.assertEqual(item['validation'], 'Validación parcial')
        self.assertEqual(item['validation_status'], 'partial')
        self.assertFalse(item['period_m3_reliable'])
        self.assertFalse(item['today_accumulated_reliable'])
        self.assertEqual(item['today_accumulated_m3'], 0.0)
        self.assertEqual(item['validated_volume_m3'], 0.0)
        self.assertAlmostEqual(item['discarded_volume_m3'], 11093.519532, places=6)
        self.assertEqual(item['discarded_totalizer_events'], 1)

    def test_history_shift_and_report_keep_the_same_discontinuity_contract(self):
        points = _build_points(
            1001,
            'quarter_hour',
            datetime(2026, 8, 5, 10, 30),
            datetime(2026, 8, 5, 10, 45),
            [
                {
                    'bucket_start': datetime(2026, 8, 5, 10, 30),
                    'samples': 15,
                    'flow_avg': 0.0,
                    'flow_min': 0.0,
                    'flow_max': 0.0,
                    'total_open': 62043.019531,
                    'total_close': 73136.539063,
                }
            ],
        )
        point = points[0]
        self.assertEqual(point['data_status'], 'invalid_totalizer')
        self.assertEqual(point['volume_m3'], 0.0)
        self.assertFalse(point['volume_reliable'])
        self.assertEqual(point['discarded_totalizer_events'], 1)

        rows = [
            {'operational_ts': datetime(2026, 8, 4, 10, 32), 'instant_value': 0.0, 'total_value': 62043.019531},
            {'operational_ts': datetime(2026, 8, 4, 10, 33), 'instant_value': 0.0, 'total_value': 73136.539063},
        ]
        item = build_period_item(WELLS[0], rows, None, date(2026, 8, 4))
        shift_summary = _summary([item])
        self.assertEqual(shift_summary['total_m3'], 0.0)
        self.assertEqual(shift_summary['coverage_available'], 1)
        self.assertEqual(shift_summary['review_count'], 1)

        report_row = _report_row(item)
        self.assertFalse(report_row['volume_reliable'])
        self.assertTrue(report_row['has_discontinuities'])
        self.assertEqual(report_row['activity'], 'Sin actividad')
        self.assertEqual(report_row['validation'], 'Validación parcial')
        self.assertEqual(_report_volume_display(report_row), '0.00 m³')



    def test_valid_accumulated_updates_after_a_discontinuity_are_preserved(self):
        start = datetime(2026, 8, 4, 14, 0)
        readings = []
        for minute in range(46):
            if minute < 15:
                total = 100.0
            elif minute < 30:
                total = 127.0
            elif minute < 45:
                total = 4500.0
            else:
                total = 4527.0
            readings.append({
                'timestamp': start + timedelta(minutes=minute),
                'total_value': total,
                'instant_value': 30.0,
            })
        result = analyze_totalizer_series(
            readings,
            sensor_id=1051,
            flow_unit='L/s',
            require_flow_validation=True,
        )
        self.assertFalse(result.reliable)
        self.assertTrue(result.has_discontinuities)
        self.assertEqual(result.discarded_totalizer_events, 1)
        self.assertAlmostEqual(result.validated_volume_m3 or 0.0, 54.0, places=6)

    def test_current_and_period_well_rows_merge_once_per_confirmed_sensor(self):
        current = [
            {
                'id': 'pozo-1',
                'flow_out_sensor_id': 1001,
                'name': 'Pozo 1',
                'flow_lps': 0.0,
                'totalizador_m3': 73161.03,
                'ultima_lectura': '2026-08-04T12:21:00',
            },
            {
                'id': 'pozo-2',
                'water_sensor_id': 1051,
                'name': 'Pozo 2',
                'flow_lps': 29.75,
                'totalizador_m3': 93695.94,
                'ultima_lectura': '2026-08-04T12:21:00',
            },
        ]
        period = [
            {'sensor_id': 1001, 'name': 'Pozo 1', 'period_m3': 0.0, 'period_m3_reliable': False, 'activity': 'Sin actividad', 'validation': 'Validación parcial'},
            {'sensor_id': 1051, 'name': 'Pozo 2', 'period_m3': 27.0, 'period_m3_reliable': True, 'activity': 'Con actividad', 'validation': 'Validado'},
        ]
        merged = _merge_period(current, period)
        self.assertEqual([row['sensor_id'] for row in merged], [1001, 1051])
        self.assertEqual(len(merged), 2)
        self.assertEqual(merged[0]['current_totalizer_m3'], 73161.03)
        self.assertEqual(merged[1]['period_m3'], 27.0)



if __name__ == '__main__':
    unittest.main()
