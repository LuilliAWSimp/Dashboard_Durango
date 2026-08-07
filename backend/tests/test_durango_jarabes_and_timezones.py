from __future__ import annotations

from datetime import date, datetime, timedelta
import unittest

from app.services.durango_capabilities import (
    JARABES,
    LAVADORAS,
    LINES,
    WELLS,
    normalize_flow_lps,
    source_timezone_for_identity,
)
from app.services.durango_jarabes_service import normalize_jarabes_rows
from app.services.durango_lavadoras_service import build_lavadora_period_item
from app.services.plant_time import local_to_source_naive, source_to_local_naive


class DurangoJarabesAndTimezoneTests(unittest.TestCase):
    def test_source_timezones_match_observed_bos_tables(self):
        self.assertEqual(source_timezone_for_identity(1001), 'America/Mexico_City')
        self.assertEqual(source_timezone_for_identity(2006), 'America/Mexico_City')
        self.assertEqual(source_timezone_for_identity('lavadora_vidrio'), 'UTC')
        self.assertEqual(source_timezone_for_identity(3010), 'UTC')
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

    def test_jarabes_integer_like_float_bits_are_reinterpreted(self):
        self.assertAlmostEqual(normalize_flow_lps(3010, 1064303552), 0.9375, delta=0.01)
        self.assertAlmostEqual(normalize_flow_lps(3010, 1085044480), 5.39, delta=0.02)
        # Future SCADA fix: already-normalized engineering values must remain untouched.
        self.assertAlmostEqual(normalize_flow_lps(3010, 0.95), 0.95, places=6)

    def test_jarabes_period_uses_normalized_flow_and_m3_totalizer(self):
        start = datetime(2026, 8, 7, 10, 14, 0)
        rows = [
            {'operational_ts': start, 'instant_value': 1.0, 'total_value': 4225.00},
            {'operational_ts': start + timedelta(minutes=1), 'instant_value': 1.0, 'total_value': 4225.06},
            {'operational_ts': start + timedelta(minutes=2), 'instant_value': 1.0, 'total_value': 4225.12},
        ]
        item = build_lavadora_period_item(JARABES[0], rows, date(2026, 8, 7))
        self.assertEqual(item['sensor_id'], 3010)
        self.assertEqual(item['name'], 'Jarabes')
        self.assertEqual(item['source_table'], 'dbo.SensorsBOS_Tanque')
        self.assertAlmostEqual(item['period_m3'], 0.12, places=6)
        self.assertEqual(item['data_status'], 'operational')

    def test_jarabes_normalization_uses_utc_timestamp_and_keeps_totalizer_m3(self):
        rows = normalize_jarabes_rows([{
            'source_timestamp': datetime(2026, 8, 7, 16, 14, 48),
            'sensor_id': 3010,
            'raw_flow': 1064303552,
            'total_value': 4225.47998046875,
        }])
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row['sensor_id'], 3010)
        self.assertEqual(row['operational_key'], 'jarabes')
        self.assertEqual(row['operational_ts'], datetime(2026, 8, 7, 10, 14, 48))
        self.assertAlmostEqual(row['instant_value'], 0.9375, delta=0.01)
        self.assertAlmostEqual(row['total_value'], 4225.47998046875, places=6)
        self.assertEqual(row['source'], 'dbo.SensorsBOS_Tanque')


if __name__ == '__main__':
    unittest.main()
