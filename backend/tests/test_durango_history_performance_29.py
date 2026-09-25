from __future__ import annotations

import unittest
from unittest.mock import patch

from app.services import water_history_service as history


class DurangoHistoryPerformance29Tests(unittest.TestCase):
    def setUp(self):
        history._CACHE.clear()

    def test_single_element_history_reuses_backend_cache_until_manual_force(self):
        with patch.object(history, 'query_lavadora_rows', return_value={}) as query_lavadoras:
            kwargs = dict(
                module='flow',
                sensor_id='lavadora_vidrio',
                start_date='2026-08-12',
                end_date='2026-08-12',
                aggregation='quarter_hour',
            )
            first = history.get_water_history(**kwargs, force_refresh=False)
            second = history.get_water_history(**kwargs, force_refresh=False)
            refreshed = history.get_water_history(**kwargs, force_refresh=True)

        self.assertIs(first, second)
        self.assertEqual(first['operational_key'], 'lavadora_vidrio')
        self.assertEqual(refreshed['operational_key'], 'lavadora_vidrio')
        self.assertEqual(query_lavadoras.call_count, 2)

    def test_module_history_reuses_backend_cache_until_manual_force(self):
        with patch.object(history, '_query_15m_multi', return_value=[]) as query_history:
            kwargs = dict(
                module='line',
                start_date='2026-08-12',
                end_date='2026-08-12',
                aggregation='quarter_hour',
            )
            first = history.get_water_history_module(**kwargs, force_refresh=False)
            second = history.get_water_history_module(**kwargs, force_refresh=False)
            refreshed = history.get_water_history_module(**kwargs, force_refresh=True)

        self.assertIs(first, second)
        self.assertEqual(refreshed['module'], 'line')
        self.assertEqual(query_history.call_count, 2)

    def test_history_cache_is_bounded(self):
        for index in range(history.MAX_HISTORY_CACHE_ENTRIES + 40):
            history._store_cache(f'test:{index}', {'index': index}, 600)
        self.assertLessEqual(len(history._CACHE), history.MAX_HISTORY_CACHE_ENTRIES)
        self.assertNotIn('test:0', history._CACHE)
        self.assertIn(f'test:{history.MAX_HISTORY_CACHE_ENTRIES + 39}', history._CACHE)


if __name__ == '__main__':
    unittest.main()
