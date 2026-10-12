from __future__ import annotations

import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from app.services import water_history_service as history


class DurangoHistoryLongRanges30Tests(unittest.TestCase):
    def setUp(self):
        history._CACHE.clear()

    def test_chunk_policy_bounds_7_15_and_30_day_ranges(self):
        start = datetime(2026, 8, 12)
        seven_days = history._history_query_windows(start, start + timedelta(days=7), 'quarter_hour')
        fifteen_days = history._history_query_windows(start, start + timedelta(days=15), 'hourly')
        thirty_days = history._history_query_windows(start, start + timedelta(days=30), 'daily')

        self.assertEqual(len(seven_days), 4)
        self.assertEqual(len(fifteen_days), 5)
        self.assertEqual(len(thirty_days), 5)
        self.assertTrue(all(end > begin for begin, end in seven_days + fifteen_days + thirty_days))

    def test_hourly_module_history_splits_sql_reads_without_changing_contract(self):
        with patch.object(history, '_query_15m_multi', return_value=[]) as query_history:
            payload = history.get_water_history_module(
                module='line',
                start_date='2026-08-12',
                end_date='2026-08-26',
                aggregation='hourly',
                force_refresh=True,
            )

        self.assertEqual(payload['aggregation'], 'hourly')
        self.assertEqual(payload['start_date'], '2026-08-12')
        self.assertEqual(payload['end_date'], '2026-08-26')
        self.assertEqual(query_history.call_count, 5)
        windows = [(call.args[1], call.args[2]) for call in query_history.call_args_list]
        self.assertEqual(windows[0][0], datetime(2026, 8, 12))
        self.assertEqual(windows[-1][1], datetime(2026, 8, 27))
        for (_, previous_end), (next_start, _) in zip(windows, windows[1:]):
            self.assertEqual(previous_end, next_start)

    def test_single_element_hourly_history_uses_the_same_bounded_windows(self):
        with patch.object(history, '_query_15m', return_value=[]) as query_history:
            payload = history.get_water_history(
                module='line',
                sensor_id=2002,
                start_date='2026-08-12',
                end_date='2026-08-26',
                aggregation='hourly',
                force_refresh=True,
            )

        self.assertEqual(payload['aggregation'], 'hourly')
        self.assertEqual(query_history.call_count, 5)
        windows = [(call.args[1], call.args[2]) for call in query_history.call_args_list]
        for (_, previous_end), (next_start, _) in zip(windows, windows[1:]):
            self.assertEqual(previous_end, next_start)

    def test_lavadoras_long_range_is_read_in_bounded_windows_and_merged(self):
        start = datetime(2026, 8, 12)
        end = start + timedelta(days=7)

        def fake_query(chunk_start, chunk_end):
            return {
                'lavadora_vidrio': [{'operational_ts': chunk_start, 'instant_value': 1.0, 'total_value': 10.0}],
                'lavadora_ref_pet': [{'operational_ts': chunk_end - timedelta(minutes=1), 'instant_value': 2.0, 'total_value': 20.0}],
            }

        with patch.object(history, 'query_lavadora_rows', side_effect=fake_query) as query_lavadoras:
            rows = history._query_lavadora_rows_chunked(start, end, 'quarter_hour')

        self.assertEqual(query_lavadoras.call_count, 4)
        self.assertEqual(len(rows['lavadora_vidrio']), 4)
        self.assertEqual(len(rows['lavadora_ref_pet']), 4)
        self.assertEqual(rows['lavadora_vidrio'][0]['operational_ts'], start)

    def test_physical_validation_keeps_existing_31_day_safety_bound(self):
        start = datetime(2026, 8, 12)
        with patch.object(history, '_query_physical_validation_rows', return_value=[]) as query_validation:
            rows = history._query_physical_validation_rows_chunked([1001, 1051], start, start + timedelta(days=32))
        self.assertEqual(rows, [])
        query_validation.assert_not_called()

    def test_physical_validation_is_chunked_inside_allowed_window(self):
        start = datetime(2026, 8, 12)
        with patch.object(history, '_query_physical_validation_rows', return_value=[]) as query_validation:
            history._query_physical_validation_rows_chunked([1001, 1051], start, start + timedelta(days=30))
        self.assertEqual(query_validation.call_count, 5)


if __name__ == '__main__':
    unittest.main()
