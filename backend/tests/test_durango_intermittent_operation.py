from __future__ import annotations

from datetime import date, datetime, timedelta
import unittest

from app.services.water_history_service import _build_points
from app.services.water_period_service import build_period_item


START = datetime(2026, 8, 5, 8, 0)
END = START + timedelta(minutes=15)


def minute_rows(flows: list[float], totals: list[float]) -> list[dict[str, object]]:
    return [
        {
            'operational_ts': START + timedelta(minutes=index),
            'instant_value': flow,
            'total_value': totals[index],
        }
        for index, flow in enumerate(flows)
    ]


def aggregate_row(flows: list[float], totals: list[float]) -> dict[str, object]:
    active = [value for value in flows if value > 0]
    return {
        'bucket_start': START,
        'samples': len(flows),
        'active_samples': len(active),
        'flow_avg': sum(flows) / len(flows) if flows else None,
        'flow_active_avg': sum(active) / len(active) if active else None,
        'flow_min': min(flows) if flows else None,
        'flow_max': max(flows) if flows else None,
        'total_open': totals[0] if totals else None,
        'total_close': totals[-1] if totals else None,
    }


class DurangoIntermittentOperationTests(unittest.TestCase):
    def test_case_a_all_zero_is_reliable_off_with_full_coverage(self):
        flows = [0.0] * 15
        totals = [100.0] * 15
        point = _build_points(2002, 'quarter_hour', START, END, [aggregate_row(flows, totals)], minute_rows(flows, totals))[0]

        self.assertEqual(point['samples_received'], 15)
        self.assertEqual(point['samples_expected'], 15)
        self.assertEqual(point['coverage_percent'], 100.0)
        self.assertTrue(point['data_reliable'])
        self.assertEqual(point['data_status'], 'zero_consumption')
        self.assertEqual(point['interval_state'], 'Apagado con datos')
        self.assertEqual(point['volume_m3'], 0.0)
        self.assertEqual(point['flow_avg_lps'], 0.0)

    def test_case_b_partial_activity_keeps_zero_samples_in_interval_average(self):
        flows = [12.0] * 5 + [0.0] * 10
        totals = [100.0] * 14 + [103.6]
        point = _build_points(2002, 'quarter_hour', START, END, [aggregate_row(flows, totals)], minute_rows(flows, totals))[0]

        self.assertEqual(point['coverage_percent'], 100.0)
        self.assertAlmostEqual(point['flow_avg_lps'], 4.0, places=6)
        self.assertAlmostEqual(point['flow_active_avg_lps'], 12.0, places=6)
        self.assertEqual(point['active_minutes'], 5.0)
        self.assertEqual(point['interval_state'], 'Actividad parcial')
        self.assertEqual(point['data_status'], 'partial_activity')
        self.assertAlmostEqual(point['volume_m3'], 3.6, places=6)

    def test_case_c_empty_bucket_is_null_not_zero(self):
        point = _build_points(2002, 'quarter_hour', START, END, [])[0]

        self.assertEqual(point['data_status'], 'no_data')
        self.assertEqual(point['interval_state'], 'Sin registros')
        self.assertEqual(point['samples_received'], 0)
        self.assertIsNone(point['flow_avg_lps'])
        self.assertIsNone(point['volume_m3'])

    def test_case_d_five_of_fifteen_samples_has_partial_coverage(self):
        flows = [0.0] * 5
        totals = [100.0] * 5
        point = _build_points(2002, 'quarter_hour', START, END, [aggregate_row(flows, totals)], minute_rows(flows, totals))[0]

        self.assertEqual(point['samples_received'], 5)
        self.assertEqual(point['samples_expected'], 15)
        self.assertAlmostEqual(point['coverage_percent'], 33.33, places=2)
        self.assertEqual(point['coverage_status'], 'Parcial')
        self.assertFalse(point['data_reliable'])
        self.assertEqual(point['interval_state'], 'Apagado con datos')

    def test_case_e_early_activity_and_current_zero_are_independent(self):
        contract = {'sensor_id': 2002, 'display_name': 'Línea 1', 'group': 'line', 'flow_unit': 'L/s'}
        rows = [
            {'operational_ts': START, 'instant_value': 12.0, 'total_value': 100.0},
            {'operational_ts': START + timedelta(minutes=1), 'instant_value': 12.0, 'total_value': 100.72},
            {'operational_ts': START + timedelta(hours=2), 'instant_value': 0.0, 'total_value': 105.0},
        ]
        item = build_period_item(
            contract,
            rows,
            None,
            date(2026, 8, 5),
            window_start=START,
            window_end=START + timedelta(hours=2, minutes=1),
        )

        self.assertEqual(item['current_flow'], 0.0)
        self.assertEqual(item['current_state'], 'Apagado con datos')
        self.assertEqual(item['period_activity'], 'Con actividad en el periodo')
        self.assertGreater(item['validated_volume_m3'], 0.0)

    def test_case_f_invalid_totalizer_jump_is_not_added(self):
        flows = [0.0] * 15
        totals = [100.0] * 14 + [500.0]
        point = _build_points(1051, 'quarter_hour', START, END, [aggregate_row(flows, totals)], minute_rows(flows, totals))[0]

        self.assertEqual(point['data_status'], 'invalid_totalizer')
        self.assertEqual(point['interval_state'], 'Dato en revisión')
        self.assertEqual(point['validated_volume_m3'], 0.0)
        self.assertGreater(point['discarded_volume_m3'], 0.0)
        self.assertFalse(point['volume_reliable'])

    def test_case_g_current_day_stops_at_the_current_interval(self):
        day_start = datetime(2026, 8, 5, 0, 0)
        day_end = datetime(2026, 8, 6, 0, 0)
        now = datetime(2026, 8, 5, 10, 37)
        points = _build_points(2002, 'quarter_hour', day_start, day_end, [], effective_end_dt=now)

        self.assertEqual(points[-1]['bucket_start'], '2026-08-05T10:30:00')
        self.assertEqual(points[-1]['bucket_end'], '2026-08-05T10:37:00')
        self.assertFalse(any(point['bucket_start'] >= '2026-08-05T11:00:00' for point in points))
        self.assertFalse(any(point['data_status'] == 'future_interval' for point in points))


if __name__ == '__main__':
    unittest.main()
