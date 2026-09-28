from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from threading import Event, Lock
import time
import unittest
from unittest.mock import patch

from app.services import water_period_service as service


class DurangoPeriodInflight46CTests(unittest.TestCase):
    def setUp(self):
        service._PERIOD_CACHE.clear()
        service._PERIOD_REQUEST_LOCKS.clear()

    def tearDown(self):
        service._PERIOD_CACHE.clear()
        service._PERIOD_REQUEST_LOCKS.clear()

    @patch.object(service, 'SENSOR_ITEMS', [])
    @patch.object(service, 'WELLS', [])
    @patch.object(service, 'get_jarabes_period_items', return_value=[])
    @patch.object(service, 'get_lavadora_period_items', return_value=[])
    @patch.object(service, 'query_previous_closes', return_value={})
    @patch.object(service, 'local_now_naive', return_value=datetime(2026, 9, 28, 9, 58, 0))
    def test_identical_concurrent_period_requests_share_one_sql_calculation(
        self,
        _now_mock,
        _previous_mock,
        _lavadoras_mock,
        _jarabes_mock,
    ):
        started = Event()
        release = Event()
        counter_lock = Lock()
        query_calls = {'count': 0}

        def slow_query(*_args, **_kwargs):
            with counter_lock:
                query_calls['count'] += 1
            started.set()
            release.wait(timeout=2)
            return []

        with patch.object(service, 'query_readings_window', side_effect=slow_query):
            with ThreadPoolExecutor(max_workers=2) as executor:
                first_future = executor.submit(service.get_period_data, '2026-09-28', '2026-09-28')
                self.assertTrue(started.wait(timeout=1))
                second_future = executor.submit(service.get_period_data, '2026-09-28', '2026-09-28')
                time.sleep(0.05)
                self.assertFalse(second_future.done())
                release.set()
                first = first_future.result(timeout=2)
                second = second_future.result(timeout=2)

        self.assertEqual(query_calls['count'], 1)
        self.assertEqual(first, second)
        self.assertEqual(len(service._PERIOD_CACHE), 1)

    @patch.object(service, 'SENSOR_ITEMS', [])
    @patch.object(service, 'WELLS', [])
    @patch.object(service, 'get_jarabes_period_items', return_value=[])
    @patch.object(service, 'get_lavadora_period_items', return_value=[])
    @patch.object(service, 'query_previous_closes', return_value={})
    @patch.object(service, 'query_readings_window', return_value=[])
    @patch.object(service, 'local_now_naive', return_value=datetime(2026, 9, 28, 9, 58, 0))
    def test_force_refresh_keeps_recalculation_semantics(
        self,
        _now_mock,
        query_mock,
        _previous_mock,
        _lavadoras_mock,
        _jarabes_mock,
    ):
        service.get_period_data('2026-09-28', '2026-09-28')
        service.get_period_data('2026-09-28', '2026-09-28', force_refresh=True)

        self.assertEqual(query_mock.call_count, 2)


if __name__ == '__main__':
    unittest.main()
