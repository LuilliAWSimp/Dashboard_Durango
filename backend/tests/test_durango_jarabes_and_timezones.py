from __future__ import annotations

from datetime import date, datetime, timedelta
import unittest
from unittest.mock import patch

from app.services.durango_capabilities import (
    JARABES,
    JARABES_CHANNEL_CUTOVER_LOCAL,
    JARABES_CHANNEL_CUTOVER_UTC,
    JARABES_CURRENT_SENSOR_ID,
    JARABES_LEGACY_SENSOR_ID,
    JARABES_SOURCE_SEGMENTS,
    LAVADORAS,
    LINES,
    WELLS,
    item_contract,
    normalize_flow_lps,
    source_timezone_for_identity,
)
from app.services.durango_jarabes_service import get_current_jarabes, normalize_jarabes_rows, query_jarabes_rows
from app.services.durango_lavadoras_service import build_lavadora_period_item
from app.services.plant_time import local_to_source_naive, source_to_local_naive
import app.services.water_history_service as history_service


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None


class _FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def execute(self, sql, params=None):
        self.calls.append((str(sql), dict(params or {})))
        return _Rows(self.responses.pop(0) if self.responses else [])


class DurangoJarabesAndTimezoneTests(unittest.TestCase):
    def setUp(self):
        history_service._CACHE.clear()

    def test_source_timezones_match_observed_bos_tables(self):
        self.assertEqual(source_timezone_for_identity(1001), 'America/Mexico_City')
        self.assertEqual(source_timezone_for_identity(2006), 'America/Mexico_City')
        self.assertEqual(source_timezone_for_identity('lavadora_vidrio'), 'UTC')
        self.assertEqual(source_timezone_for_identity(3010), 'UTC')
        self.assertEqual(source_timezone_for_identity(3004), 'UTC')
        self.assertEqual(source_timezone_for_identity('jarabes'), 'UTC')
        self.assertEqual(WELLS[0]['source_timestamp_timezone'], 'America/Mexico_City')
        self.assertEqual(LINES[0]['source_timestamp_timezone'], 'America/Mexico_City')
        self.assertEqual(LAVADORAS[0]['source_timestamp_timezone'], 'UTC')
        self.assertEqual(JARABES[0]['source_timestamp_timezone'], 'UTC')

    def test_local_bos_timestamp_is_not_shifted(self):
        local_stamp = datetime(2026, 8, 7, 10, 13, 0)
        self.assertEqual(
            source_to_local_naive(local_stamp, 'America/Mexico_City'),
            local_stamp,
        )
        self.assertEqual(
            local_to_source_naive(local_stamp, 'America/Mexico_City'),
            local_stamp,
        )

    def test_utc_bos_timestamp_is_converted_exactly_once(self):
        utc_stamp = datetime(2026, 8, 7, 16, 13, 0)
        local_stamp = datetime(2026, 8, 7, 10, 13, 0)
        self.assertEqual(source_to_local_naive(utc_stamp, 'UTC'), local_stamp)
        self.assertEqual(local_to_source_naive(local_stamp, 'UTC'), utc_stamp)

    def test_jarabes_current_contract_uses_sensor_3004_slot_1(self):
        self.assertEqual(JARABES_CHANNEL_CUTOVER_UTC, datetime(2026, 8, 11, 19, 40, 29))
        self.assertEqual(JARABES_CHANNEL_CUTOVER_LOCAL, datetime(2026, 8, 11, 13, 40, 29))
        self.assertEqual(JARABES[0]['sensor_id'], JARABES_CURRENT_SENSOR_ID)
        self.assertEqual(JARABES[0]['source_key'], 'TANQUE_FLOW_IN[1]')
        self.assertEqual(JARABES[0]['slot_index'], 1)
        self.assertEqual(JARABES[0]['instant_column'], 'TANQUE_FLOW_IN_1_instant_value')
        self.assertEqual(JARABES[0]['total_column'], 'TANQUE_FLOW_IN_1_total_value')
        self.assertEqual(JARABES[0]['flow_encoding'], 'ieee754_float32_bits_in_numeric')
        self.assertEqual(item_contract(JARABES_LEGACY_SENSOR_ID)['operational_key'], 'jarabes')
        self.assertEqual(item_contract('jarabes')['sensor_id'], JARABES_CURRENT_SENSOR_ID)

    def test_jarabes_integer_like_float_bits_are_reinterpreted(self):
        self.assertAlmostEqual(normalize_flow_lps(3004, 1064303552), 0.9375, delta=0.01)
        self.assertAlmostEqual(normalize_flow_lps('jarabes', 1085044480), 5.39, delta=0.02)
        # Alias temporal de entrada: el histórico 3010 usa la misma normalización operativa.
        self.assertAlmostEqual(normalize_flow_lps(3010, 1064303552), 0.9375, delta=0.01)
        # Valores de ingeniería ya normales permanecen sin reinterpretarse.
        self.assertAlmostEqual(normalize_flow_lps(3004, 0.95), 0.95, places=6)
        self.assertEqual(normalize_flow_lps(3004, 0), 0.0)

    def test_jarabes_period_uses_current_identity_and_m3_totalizer(self):
        start = datetime(2026, 8, 12, 10, 14, 0)
        rows = [
            {'operational_ts': start, 'instant_value': 1.0, 'total_value': 4475.8798828125},
            {'operational_ts': start + timedelta(minutes=1), 'instant_value': 1.0, 'total_value': 4475.9398828125},
            {'operational_ts': start + timedelta(minutes=2), 'instant_value': 1.0, 'total_value': 4475.9998828125},
        ]
        item = build_lavadora_period_item(JARABES[0], rows, date(2026, 8, 12))
        self.assertEqual(item['sensor_id'], 3004)
        self.assertEqual(item['name'], 'Jarabes')
        self.assertEqual(item['source_table'], 'dbo.SensorsBOS_Tanque')
        self.assertAlmostEqual(item['period_m3'], 0.12, places=6)
        self.assertEqual(item['data_status'], 'operational')

    def test_jarabes_normalization_accepts_both_sides_of_cutover_as_one_series(self):
        rows = normalize_jarabes_rows([
            {
                'source_timestamp': datetime(2026, 8, 11, 19, 40, 28),
                'source_sensor_id': 3010,
                'raw_flow': 1064303552,
                'total_value': 4475.68017578125,
            },
            {
                'source_timestamp': datetime(2026, 8, 11, 19, 40, 29),
                'source_sensor_id': 3004,
                'raw_flow': 0.95,
                'total_value': 4475.8798828125,
            },
        ])
        self.assertEqual(len(rows), 2)
        self.assertEqual([row['sensor_id'] for row in rows], [3004, 3004])
        self.assertEqual([row['source_sensor_id'] for row in rows], [3010, 3004])
        self.assertEqual([row['source_key'] for row in rows], ['TANQUE_FLOW_IN[4]', 'TANQUE_FLOW_IN[1]'])
        self.assertEqual([row['operational_key'] for row in rows], ['jarabes', 'jarabes'])
        self.assertEqual(rows[0]['operational_ts'], datetime(2026, 8, 11, 13, 40, 28))
        self.assertEqual(rows[1]['operational_ts'], datetime(2026, 8, 11, 13, 40, 29))
        self.assertAlmostEqual(rows[0]['instant_value'], 0.9375, delta=0.01)
        self.assertAlmostEqual(rows[1]['instant_value'], 0.95, places=6)
        self.assertAlmostEqual(rows[1]['total_value'], 4475.8798828125, places=6)

    def test_query_jarabes_rows_only_queries_intersecting_segments(self):
        fake = _FakeSession([
            [{
                'source_timestamp': datetime(2026, 8, 11, 19, 40, 28),
                'source_sensor_id': 3010,
                'raw_flow': 1064303552,
                'total_value': 4475.68017578125,
            }],
            [{
                'source_timestamp': datetime(2026, 8, 11, 19, 40, 29),
                'source_sensor_id': 3004,
                'raw_flow': 0.95,
                'total_value': 4475.8798828125,
            }],
        ])
        rows = query_jarabes_rows(
            datetime(2026, 8, 11, 13, 40, 28),
            datetime(2026, 8, 11, 13, 40, 30),
            session=fake,
        )
        self.assertEqual(len(fake.calls), 2)
        self.assertIn('TANQUE_FLOW_IN_4_instant_value', fake.calls[0][0])
        self.assertIn('TANQUE_FLOW_IN_1_instant_value', fake.calls[1][0])
        self.assertEqual(fake.calls[0][1]['start_utc'], datetime(2026, 8, 11, 19, 40, 28))
        self.assertEqual(fake.calls[0][1]['end_utc'], datetime(2026, 8, 11, 19, 40, 29))
        self.assertEqual(fake.calls[1][1]['start_utc'], datetime(2026, 8, 11, 19, 40, 29))
        self.assertEqual(fake.calls[1][1]['end_utc'], datetime(2026, 8, 11, 19, 40, 30))
        self.assertEqual([row['operational_ts'] for row in rows], [
            datetime(2026, 8, 11, 13, 40, 28),
            datetime(2026, 8, 11, 13, 40, 29),
        ])
        self.assertEqual(len({row['operational_ts'] for row in rows}), 2)

    def test_current_jarabes_reads_only_slot_1(self):
        fake = _FakeSession([[{
            'source_timestamp': datetime(2026, 8, 12, 19, 40, 29),
            'source_sensor_id': 3004,
            'raw_flow': 0.0,
            'total_value': 4670.0498046875,
            'segment_sensor_id': 3004,
            'segment_slot_index': 1,
            'segment_source_key': 'TANQUE_FLOW_IN[1]',
        }]])
        items = get_current_jarabes(session=fake)
        self.assertEqual(len(fake.calls), 1)
        self.assertIn('TANQUE_FLOW_IN_1_instant_value', fake.calls[0][0])
        self.assertNotIn('TANQUE_FLOW_IN_4_instant_value', fake.calls[0][0])
        self.assertEqual(items[0]['sensor_id'], 3004)
        self.assertEqual(items[0]['operational_key'], 'jarabes')
        self.assertEqual(items[0]['current_totalizer_m3'], 4670.0498046875)

    def test_individual_history_accepts_legacy_alias_but_returns_current_sensor(self):
        jarabes_rows = [
            {'operational_ts': datetime(2026, 8, 12, 10, 0), 'instant_value': 1.0, 'total_value': 100.0},
            {'operational_ts': datetime(2026, 8, 12, 10, 1), 'instant_value': 1.0, 'total_value': 100.1},
        ]
        with patch.object(history_service, 'query_jarabes_rows', return_value=jarabes_rows) as query_mock:
            payload = history_service.get_water_history(
                module='flow',
                sensor_id=3010,
                start_date='2026-08-12',
                end_date='2026-08-12',
                aggregation='quarter_hour',
                force_refresh=True,
            )
        query_mock.assert_called_once()
        self.assertEqual(payload['sensor_id'], 3004)
        self.assertEqual(payload['operational_key'], 'jarabes')
        self.assertEqual(payload['source_status'], 'dbo.SensorsBOS_Tanque')
        self.assertTrue(payload['points'])

    def test_flow_module_history_contains_one_jarabes_series_with_current_sensor(self):
        jarabes_rows = [
            {'operational_ts': datetime(2026, 8, 12, 10, 0), 'instant_value': 1.0, 'total_value': 100.0},
            {'operational_ts': datetime(2026, 8, 12, 10, 1), 'instant_value': 1.0, 'total_value': 100.1},
        ]
        with patch.object(history_service, '_query_15m_multi', return_value=[]), \
             patch.object(history_service, 'query_lavadora_rows', return_value={}), \
             patch.object(history_service, 'query_jarabes_rows', return_value=jarabes_rows):
            payload = history_service.get_water_history_module(
                module='flow',
                start_date='2026-08-12',
                end_date='2026-08-12',
                aggregation='quarter_hour',
                force_refresh=True,
            )
        jarabes_series = [series for series in payload['series'] if series['operational_key'] == 'jarabes']
        self.assertEqual(len(jarabes_series), 1)
        self.assertEqual(jarabes_series[0]['sensor_id'], 3004)
        self.assertEqual(jarabes_series[0]['name'], 'Jarabes')

    def test_jarabes_segments_document_only_historical_3010_reference(self):
        self.assertEqual(JARABES_SOURCE_SEGMENTS[0]['sensor_id'], 3010)
        self.assertEqual(JARABES_SOURCE_SEGMENTS[0]['source_key'], 'TANQUE_FLOW_IN[4]')
        self.assertEqual(JARABES_SOURCE_SEGMENTS[1]['sensor_id'], 3004)
        self.assertEqual(JARABES_SOURCE_SEGMENTS[1]['source_key'], 'TANQUE_FLOW_IN[1]')


if __name__ == '__main__':
    unittest.main()
