from __future__ import annotations

from datetime import datetime
import unittest
from unittest.mock import patch

from app.services.plant_time import effective_local_end, local_to_source_naive, source_to_local_naive
from app.services.water_history_service import _build_points, get_wells_minute_flow


class DurangoFutureIntervalTests(unittest.TestCase):
    def test_utc_source_is_normalized_to_durango_local_time(self):
        self.assertEqual(
            source_to_local_naive(datetime(2026, 8, 4, 19, 1)),
            datetime(2026, 8, 4, 13, 1),
        )
        self.assertEqual(
            local_to_source_naive(datetime(2026, 8, 4, 13, 1)),
            datetime(2026, 8, 4, 19, 1),
        )

    def test_requested_end_is_clamped_to_local_now(self):
        now = datetime(2026, 8, 4, 13, 6)
        requested = datetime(2026, 8, 5, 0, 0)
        self.assertEqual(effective_local_end(requested, now=now), now)

    def test_future_history_buckets_are_not_generated(self):
        start = datetime(2026, 8, 5, 0, 0)
        end = datetime(2026, 8, 6, 0, 0)
        now = datetime(2026, 8, 5, 13, 6)
        rows = [{
            'bucket_start': datetime(2026, 8, 5, 17, 15),
            'samples': 15,
            'flow_avg': 2.5,
            'flow_min': 2.0,
            'flow_max': 3.0,
            'total_open': 100.0,
            'total_close': 101.0,
        }]
        points = _build_points('lavadora_vidrio', 'quarter_hour', start, end, rows, effective_end_dt=now)
        self.assertTrue(points)
        self.assertTrue(all(point['bucket_start'] < '2026-08-05T13:06:00' for point in points))
        self.assertFalse(any(point['data_status'] == 'future_interval' for point in points))
        self.assertFalse(any(point['bucket_start'] == '2026-08-05T17:15:00' for point in points))

    @patch('app.services.water_history_service.query_bos_well_rows', return_value=[])
    @patch('app.services.water_history_service._query_minute_rows')
    @patch('app.services.water_history_service.local_now_naive')
    def test_minute_flow_ends_at_now_without_future_points(self, now_mock, query_mock, _fallback_mock):
        now_mock.return_value = datetime(2026, 8, 5, 13, 6)
        query_mock.return_value = [
            {'sensor_id': 1001, 'reading_ts': datetime(2026, 8, 5, 13, 5), 'flow_value': 10.0},
            {'sensor_id': 1001, 'reading_ts': datetime(2026, 8, 5, 17, 15), 'flow_value': 99.0},
        ]
        payload = get_wells_minute_flow(
            start_datetime='2026-08-05T13:00:00',
            end_datetime='2026-08-05T13:10:00',
            force_refresh=True,
        )
        series = next(item for item in payload['series'] if item['sensor_id'] == 1001)
        by_time = {point['timestamp']: point for point in series['points']}
        self.assertEqual(by_time['2026-08-05T13:05:00']['flow_value'], 10.0)
        self.assertNotIn('2026-08-05T13:06:00', by_time)
        self.assertFalse(any(point['data_status'] == 'future_interval' for point in series['points']))


if __name__ == '__main__':
    unittest.main()

class DurangoPeriodClampTests(unittest.TestCase):
    @patch('app.services.water_period_service.get_jarabes_period_items', return_value=[])
    @patch('app.services.water_period_service.get_lavadora_period_items', return_value=[])
    @patch('app.services.water_period_service.query_bos_well_rows', return_value=[])
    @patch('app.services.water_period_service.query_previous_closes', return_value={})
    @patch('app.services.water_period_service.query_readings_window', return_value=[])
    @patch('app.services.water_period_service.local_now_naive')
    def test_current_day_period_query_stops_at_local_now(self, now_mock, query_mock, _previous_mock, _fallback_mock, _lavadoras_mock, _jarabes_mock):
        from app.services.water_period_service import get_period_data

        now_mock.return_value = datetime(2026, 8, 5, 13, 6)
        payload = get_period_data('2026-08-05', '2026-08-05')
        self.assertEqual(query_mock.call_args.args[2], datetime(2026, 8, 5, 13, 6))
        self.assertEqual(payload['effective_end_at'], '2026-08-05T13:06:00')
        self.assertTrue(payload['has_future_intervals'])
        self.assertIsNone(payload['summary']['wells']['total_m3'])
