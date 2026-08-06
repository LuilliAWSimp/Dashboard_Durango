from __future__ import annotations

from datetime import date, datetime
import unittest

from app.services.durango_capabilities import (
    CAPABILITIES,
    ACTIVE_MODULES,
    ALL_ITEMS,
    DURANGO_SCADA_CUTOVER_LOCAL,
    DURANGO_SCADA_CUTOVER_UTC,
    LAVADORAS,
    LINES,
    WELLS,
    clamp_to_validated_segment,
    normalize_flow_lps,
)
from app.services.durango_lavadoras_service import (
    _query_rows,
    build_lavadora_period_item,
    normalize_lavadora_rows,
)
from app.services.water_bos_service import _build_lines


class _Result:
    def fetchall(self):
        return []


class _Session:
    def __init__(self):
        self.calls = []

    def execute(self, statement, params):
        self.calls.append((str(statement), params))
        return _Result()


class DurangoScadaCutoverTests(unittest.TestCase):
    def test_operational_contract_contains_only_confirmed_sources(self):
        self.assertEqual([(item['sensor_id'], item['source_key']) for item in WELLS], [
            (1001, 'POZO_FLOW_OUT[0]'),
            (1051, 'POZO_FLOW_OUT[1]'),
        ])
        self.assertEqual([item['sensor_id'] for item in LINES], [2002, 2004, 2006, 2008, 2010])
        self.assertEqual([item['operational_key'] for item in LAVADORAS], [
            'lavadora_vidrio',
            'lavadora_ref_pet',
        ])
        self.assertTrue(all(item['sensor_id'] is None for item in LAVADORAS))
        self.assertEqual(len(LINES), 5)
        self.assertEqual(len(LAVADORAS), 2)
        self.assertFalse({3002, 3004, 3006, 3010} & {item.get('sensor_id') for item in ALL_ITEMS})
        self.assertNotIn('Tanques', ACTIVE_MODULES)
        self.assertFalse(CAPABILITIES['tanks'])

    def test_pozo_one_flow_is_converted_but_totalizer_contract_is_not(self):
        self.assertAlmostEqual(normalize_flow_lps(1001, 103.53), 28.758333, places=6)
        self.assertAlmostEqual(normalize_flow_lps(1051, 30.20), 30.20)
        self.assertEqual(WELLS[0]['totalizer_unit'], 'm3')
        self.assertEqual(WELLS[1]['totalizer_unit'], 'm3')

    def test_cutover_is_same_in_local_and_utc_contracts(self):
        self.assertEqual(DURANGO_SCADA_CUTOVER_LOCAL, datetime(2026, 8, 4, 18, 16))
        self.assertEqual(DURANGO_SCADA_CUTOVER_UTC, datetime(2026, 8, 5, 0, 16))
        start, end, legacy_only, crosses = clamp_to_validated_segment(
            datetime(2026, 8, 4, 0, 0), datetime(2026, 8, 5, 0, 0)
        )
        self.assertEqual(start, DURANGO_SCADA_CUTOVER_LOCAL)
        self.assertEqual(end, datetime(2026, 8, 5, 0, 0))
        self.assertFalse(legacy_only)
        self.assertTrue(crosses)

    def test_lavadora_timestamp_is_converted_from_utc_once(self):
        grouped = normalize_lavadora_rows([{
            'source_timestamp': datetime(2026, 8, 5, 0, 16),
            'lavadora_vidrio_flow': 2.0,
            'lavadora_vidrio_total': 100.0,
            'lavadora_ref_pet_flow': 1.0,
            'lavadora_ref_pet_total': 200.0,
        }])
        self.assertEqual(
            grouped['lavadora_vidrio'][0]['operational_ts'],
            datetime(2026, 8, 4, 18, 16),
        )

    def test_lavadora_columns_match_the_confirmed_slots(self):
        self.assertEqual(
            [(item['source_key'], item['instant_column'], item['total_column']) for item in LAVADORAS],
            [
                ('LAVADORAS_0', 'LAVADORAS_0_instant_value', 'LAVADORAS_0_total_value'),
                ('LAVADORAS_1', 'LAVADORAS_1_instant_value', 'LAVADORAS_1_total_value'),
            ],
        )

    def test_line_slots_ignore_inherited_swapped_identifiers(self):
        row = {'time_stamp': datetime(2026, 8, 5, 0, 20)}
        reported_ids = [2002, 2006, 2004, 2008, 2010]
        for index, reported_id in enumerate(reported_ids):
            row[f'linea_flow_in_{index}_sensor_id'] = reported_id
            row[f'linea_flow_in_{index}_instant_value'] = float(index + 1)
            row[f'linea_flow_in_{index}_total_value'] = 100.0 + index
        lines = _build_lines(row, {})
        self.assertEqual([item['sensor_id'] for item in lines], [2002, 2004, 2006, 2008, 2010])
        self.assertEqual([item['name'] for item in lines], [
            'Línea 1', 'Línea 2', 'Línea 3', 'Línea 4', 'Línea 5',
        ])

    def test_lavadoras_share_one_bounded_query_with_utc_parameters(self):
        session = _Session()
        _query_rows(
            datetime(2026, 8, 4, 18, 16),
            datetime(2026, 8, 4, 19, 16),
            session=session,
        )
        self.assertEqual(len(session.calls), 1)
        sql, params = session.calls[0]
        self.assertIn('dbo.SensorsBOS_Lavadoras', sql)
        self.assertIn('LAVADORAS_0_instant_value', sql)
        self.assertIn('LAVADORAS_1_instant_value', sql)
        self.assertEqual(params['start_utc'], datetime(2026, 8, 5, 0, 16))
        self.assertEqual(params['end_utc'], datetime(2026, 8, 5, 1, 16))

    def test_stable_washer_is_zero_and_incrementing_washer_has_validated_volume(self):
        stamps = [
            datetime(2026, 8, 5, 0, 0),
            datetime(2026, 8, 5, 0, 1),
            datetime(2026, 8, 5, 0, 2),
        ]
        stable = [
            {'operational_ts': stamp, 'instant_value': 0.0, 'total_value': 100.0}
            for stamp in stamps
        ]
        moving = [
            {'operational_ts': stamp, 'instant_value': 1.0, 'total_value': 200.0 + index * 0.06}
            for index, stamp in enumerate(stamps)
        ]
        stable_item = build_lavadora_period_item(LAVADORAS[0], stable, date(2026, 8, 5))
        moving_item = build_lavadora_period_item(LAVADORAS[1], moving, date(2026, 8, 5))
        self.assertEqual(stable_item['period_m3'], 0.0)
        self.assertEqual(stable_item['data_status'], 'zero_consumption')
        self.assertAlmostEqual(moving_item['period_m3'], 0.12, places=6)
        self.assertEqual(moving_item['data_status'], 'operational')


if __name__ == '__main__':
    unittest.main()
