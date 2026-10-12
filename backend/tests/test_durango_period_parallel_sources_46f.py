from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from threading import Event, Lock
import unittest
from unittest.mock import patch

from app.services import water_period_service as service


class DurangoPeriodParallelSources46FTests(unittest.TestCase):
    def setUp(self):
        service._PERIOD_CACHE.clear()
        service._PERIOD_REQUEST_LOCKS.clear()

    def tearDown(self):
        service._PERIOD_CACHE.clear()
        service._PERIOD_REQUEST_LOCKS.clear()

    @patch.object(service, 'SENSOR_ITEMS', [])
    @patch.object(service, 'WELLS', [])
    @patch.object(service, 'query_previous_closes', return_value={})
    @patch.object(service, 'local_now_naive', return_value=datetime(2026, 9, 28, 11, 5, 0))
    def test_cold_period_starts_primary_lavadoras_and_jarabes_concurrently(
        self,
        _now_mock,
        _previous_mock,
    ):
        started = Event()
        release = Event()
        counter_lock = Lock()
        counter = {'value': 0}

        def mark_started():
            with counter_lock:
                counter['value'] += 1
                if counter['value'] == 3:
                    started.set()
            release.wait(timeout=2)

        def slow_primary(*_args, **_kwargs):
            mark_started()
            return []

        def slow_lavadoras(*_args, **_kwargs):
            mark_started()
            return []

        def slow_jarabes(*_args, **_kwargs):
            mark_started()
            return []

        with (
            patch.object(service, 'query_readings_window', side_effect=slow_primary),
            patch.object(service, 'get_lavadora_period_items', side_effect=slow_lavadoras),
            patch.object(service, 'get_jarabes_period_items', side_effect=slow_jarabes),
            ThreadPoolExecutor(max_workers=1) as executor,
        ):
            future = executor.submit(service.get_period_data, '2026-09-28', '2026-09-28')
            concurrent_start = started.wait(timeout=0.75)
            release.set()
            payload = future.result(timeout=3)

        self.assertTrue(concurrent_start, 'Las tres familias deben iniciar antes de liberar cualquiera de ellas.')
        self.assertEqual(counter['value'], 3)
        self.assertEqual(payload['items'], [])

    @patch.object(service, 'SENSOR_ITEMS', [])
    @patch.object(service, 'WELLS', [])
    @patch.object(service, 'query_previous_closes', return_value={})
    @patch.object(service, 'query_readings_window', return_value=[])
    @patch.object(service, 'local_now_naive', return_value=datetime(2026, 9, 28, 11, 5, 0))
    def test_parallel_join_preserves_lavadoras_then_jarabes_payload_order(
        self,
        _now_mock,
        _query_mock,
        _previous_mock,
    ):
        lavadora = {'id': 'lavadora', 'module': 'flow', 'validated_volume_m3': 1.0}
        jarabes = {'id': 'jarabes', 'module': 'flow', 'validated_volume_m3': 2.0}

        with (
            patch.object(service, 'get_lavadora_period_items', return_value=[lavadora]),
            patch.object(service, 'get_jarabes_period_items', return_value=[jarabes]),
        ):
            payload = service.get_period_data('2026-09-28', '2026-09-28')

        self.assertEqual([item['id'] for item in payload['items']], ['lavadora', 'jarabes'])
        self.assertEqual(payload['summary']['flows']['validated_volume_m3'], 3.0)


if __name__ == '__main__':
    unittest.main()
