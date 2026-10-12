from __future__ import annotations

from datetime import datetime
import unittest
from unittest.mock import patch

from app.services import water_period_service as service


class DurangoPeriodCache46BTests(unittest.TestCase):
    def setUp(self):
        service._PERIOD_CACHE.clear()

    def tearDown(self):
        service._PERIOD_CACHE.clear()

    @patch.object(service, 'SENSOR_ITEMS', [])
    @patch.object(service, 'WELLS', [])
    @patch.object(service, 'get_jarabes_period_items', return_value=[])
    @patch.object(service, 'get_lavadora_period_items', return_value=[])
    @patch.object(service, 'query_previous_closes', return_value={})
    @patch.object(service, 'query_readings_window', return_value=[])
    @patch.object(service, 'local_now_naive')
    def test_current_period_reuses_cache_across_minute_boundary(
        self,
        now_mock,
        query_mock,
        _previous_mock,
        _lavadoras_mock,
        _jarabes_mock,
    ):
        clock = {'now': datetime(2026, 9, 28, 9, 43, 50)}
        now_mock.side_effect = lambda: clock['now']

        first = service.get_period_data('2026-09-28', '2026-09-28')
        clock['now'] = datetime(2026, 9, 28, 9, 44, 10)
        second = service.get_period_data('2026-09-28', '2026-09-28')

        self.assertEqual(query_mock.call_count, 1)
        self.assertEqual(first['effective_end_at'], '2026-09-28T09:43:50')
        self.assertEqual(second['effective_end_at'], first['effective_end_at'])
        self.assertEqual(len(service._PERIOD_CACHE), 1)

    @patch.object(service, 'SENSOR_ITEMS', [])
    @patch.object(service, 'WELLS', [])
    @patch.object(service, 'get_jarabes_period_items', return_value=[])
    @patch.object(service, 'get_lavadora_period_items', return_value=[])
    @patch.object(service, 'query_previous_closes', return_value={})
    @patch.object(service, 'query_readings_window', return_value=[])
    @patch.object(service, 'local_now_naive')
    def test_manual_force_refresh_still_recomputes_period(
        self,
        now_mock,
        query_mock,
        _previous_mock,
        _lavadoras_mock,
        _jarabes_mock,
    ):
        clock = {'now': datetime(2026, 9, 28, 9, 43, 50)}
        now_mock.side_effect = lambda: clock['now']

        service.get_period_data('2026-09-28', '2026-09-28')
        clock['now'] = datetime(2026, 9, 28, 9, 44, 10)
        refreshed = service.get_period_data('2026-09-28', '2026-09-28', force_refresh=True)

        self.assertEqual(query_mock.call_count, 2)
        self.assertEqual(refreshed['effective_end_at'], '2026-09-28T09:44:10')
        self.assertEqual(len(service._PERIOD_CACHE), 1)


if __name__ == '__main__':
    unittest.main()
