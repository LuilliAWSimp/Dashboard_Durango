from __future__ import annotations

from datetime import date, datetime
import unittest
from unittest.mock import patch

from app.services.durango_capabilities import (
    CAPABILITIES,
    ACTIVE_MODULES,
    ALL_ITEMS,
    DURANGO_SCADA_CUTOVER_LOCAL,
    DURANGO_SCADA_CUTOVER_UTC,
    POZO_1_FLOW_CALIBRATION_CUTOFF_LOCAL,
    FLOWS,
    JARABES,
    LAVADORAS,
    LINE_FLOWS,
    LINE_SOURCE_ITEMS,
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
from app.services.water_bos_service import (
    _build_lines,
    _build_wells,
    _status_from_values,
    get_bos_water_dashboard_payload,
)
from app.services.water_history_service import _localized_rows


class _Result:
    def fetchall(self):
        return []


class _Session:
    def __init__(self):
        self.calls = []

    def execute(self, statement, params):
        self.calls.append((str(statement), params))
        return _Result()


class _DashboardSession:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False


class DurangoScadaCutoverTests(unittest.TestCase):
    def test_status_accepts_optional_and_string_values(self):
        self.assertEqual(_status_from_values(28.76, None, None)[:3], (True, 'Encendido', 'normal'))
        self.assertEqual(_status_from_values(0, None, None)[:3], (False, 'Apagado', 'idle'))
        self.assertEqual(_status_from_values(None, None, 12.5)[:3], (True, 'Encendido', 'normal'))
        self.assertEqual(_status_from_values(None, None, None)[:3], (False, 'Apagado', 'idle'))
        self.assertEqual(_status_from_values('30.20', None, None)[:3], (True, 'Encendido', 'normal'))
        self.assertEqual(_status_from_values(None, None, None)[3:], ('Normal', 'normal'))

    def test_build_wells_uses_only_flow_out_when_flow_in_is_disabled(self):
        row = {
            'time_stamp': datetime(2026, 8, 5, 0, 20),
            'pozo_flow_out_0_sensor_id': 1001,
            'pozo_flow_out_0_instant_value': 103.536,
            'pozo_flow_out_0_total_value': 1500.0,
        }

        wells = _build_wells(
            row,
            catalog={},
            locations={},
            energy_water={},
            latest_quality_by_sensor={},
            sql_now=datetime(2026, 8, 5, 0, 20),
        )

        pozo_one = [item for item in wells if item['sensor_id'] == 1001]
        self.assertEqual(len(pozo_one), 1)
        self.assertAlmostEqual(pozo_one[0]['flujo_salida'], 28.76, places=6)
        self.assertIsNone(pozo_one[0]['flujo_entrada'])
        self.assertIsNone(pozo_one[0]['flow_in_sensor_id'])
        self.assertEqual(pozo_one[0]['status'], 'Encendido')
        self.assertEqual(
            [sensor['id'] for sensor in pozo_one[0]['sensors'] if sensor['type'] == 'FLOW_OUT'],
            ['1001'],
        )
        published_sensor_ids = {
            sensor['id']
            for well in wells
            for sensor in well.get('sensors', [])
        }
        self.assertFalse({'1002', '1052'} & published_sensor_ids)

    def test_fast_dashboard_service_supports_disabled_flow_in(self):
        pozo_row = {
            'time_stamp': datetime(2026, 8, 5, 0, 20),
            'pozo_flow_out_0_sensor_id': 1001,
            'pozo_flow_out_0_instant_value': 103.536,
            'pozo_flow_out_0_total_value': 1500.0,
        }

        def latest_row(_session, table, *_args, **_kwargs):
            return pozo_row if table == 'dbo.SensorsBOS_Pozo' else None

        with (
            patch('app.services.water_bos_service.SessionLocal', return_value=_DashboardSession()),
            patch('app.services.water_bos_service._sql_now', return_value=datetime(2026, 8, 5, 0, 20)),
            patch('app.services.water_bos_service._safe_latest_row', side_effect=latest_row),
            patch('app.services.water_bos_service.get_current_lavadoras', return_value=[]),
            patch('app.services.water_bos_service.get_current_jarabes', return_value=[]),
            patch('app.services.water_bos_service._sensor_catalog', return_value={}),
            patch('app.services.water_bos_service._well_locations', return_value={}),
            patch('app.services.water_bos_service._latest_quality_by_sensor', return_value={}),
        ):
            payload = get_bos_water_dashboard_payload(
                include_history=False,
                include_energy_water=False,
                force_refresh=True,
            )

        self.assertIsNotNone(payload)
        pozo_one = [item for item in payload['wells'] if item['sensor_id'] == 1001]
        self.assertEqual(len(pozo_one), 1)
        self.assertAlmostEqual(pozo_one[0]['flujo_salida'], 28.76, places=6)
        self.assertIsNone(pozo_one[0]['flujo_entrada'])
        self.assertNotIn(1002, {item.get('sensor_id') for item in payload['wells']})
        self.assertNotIn(1052, {item.get('sensor_id') for item in payload['wells']})

    def test_dashboard_reclassifies_2004_without_changing_its_line_source(self):
        line_row = {'time_stamp': datetime(2026, 8, 5, 0, 20)}
        for index, sensor_id in enumerate((2002, 2004, 2006, 2008, 2010)):
            line_row[f'linea_flow_in_{index}_sensor_id'] = sensor_id
            line_row[f'linea_flow_in_{index}_instant_value'] = float(index)
            line_row[f'linea_flow_in_{index}_total_value'] = 100.0 + index

        def latest_row(_session, table, *_args, **_kwargs):
            return line_row if table == 'dbo.SensorsBOS_Linea' else None

        with (
            patch('app.services.water_bos_service.SessionLocal', return_value=_DashboardSession()),
            patch('app.services.water_bos_service._sql_now', return_value=datetime(2026, 8, 5, 0, 20)),
            patch('app.services.water_bos_service._safe_latest_row', side_effect=latest_row),
            patch('app.services.water_bos_service.get_current_lavadoras', return_value=[]),
            patch('app.services.water_bos_service.get_current_jarabes', return_value=[]),
            patch('app.services.water_bos_service._sensor_catalog', return_value={}),
            patch('app.services.water_bos_service._well_locations', return_value={}),
            patch('app.services.water_bos_service._latest_quality_by_sensor', return_value={}),
        ):
            payload = get_bos_water_dashboard_payload(force_refresh=True)

        self.assertEqual([item['sensor_id'] for item in payload['production_lines']], [2002, 2006, 2008, 2010])
        self.assertEqual([item['sensor_id'] for item in payload['flows']], [2004])
        self.assertEqual(payload['flows'][0]['name'], 'Lavadora Línea 2')
        self.assertEqual(payload['flows'][0]['operational_key'], 'lavadora_linea_2')
        self.assertEqual(payload['flows'][0]['module'], 'flow')
        self.assertEqual(payload['flows'][0]['source_key'], 'LINEA_FLOW_IN[1]')

    def test_operational_contract_contains_only_confirmed_sources(self):
        self.assertEqual([(item['sensor_id'], item['source_key']) for item in WELLS], [
            (1001, 'POZO_FLOW_OUT[0]'),
            (1051, 'POZO_FLOW_OUT[1]'),
        ])
        self.assertEqual([item['sensor_id'] for item in LINES], [2002, 2006, 2008, 2010])
        self.assertEqual([(item['sensor_id'], item['display_name']) for item in LINE_FLOWS], [(2004, 'Lavadora Línea 2')])
        self.assertEqual([item['sensor_id'] for item in LINE_SOURCE_ITEMS], [2002, 2004, 2006, 2008, 2010])
        self.assertEqual([item['operational_key'] for item in LAVADORAS], [
            'lavadora_vidrio',
            'lavadora_ref_pet',
        ])
        self.assertTrue(all(item['sensor_id'] is None for item in LAVADORAS))
        self.assertEqual(len(LINES), 4)
        self.assertEqual(len(LAVADORAS), 2)
        self.assertEqual([(item['sensor_id'], item['source_key']) for item in JARABES], [(3010, 'TANQUE_FLOW_IN[4]')])
        self.assertEqual([item['operational_key'] for item in FLOWS], ['lavadora_linea_2', 'lavadora_vidrio', 'lavadora_ref_pet', 'jarabes'])
        self.assertEqual(len({item['operational_key'] for item in ALL_ITEMS}), len(ALL_ITEMS))
        self.assertFalse({3002, 3004, 3006} & {item.get('sensor_id') for item in ALL_ITEMS})
        self.assertIn(3010, {item.get('sensor_id') for item in ALL_ITEMS})
        self.assertNotIn('Tanques', ACTIVE_MODULES)
        self.assertFalse(CAPABILITIES['tanks'])

    def test_pozo_one_flow_uses_temporal_calibration_contract(self):
        self.assertEqual(POZO_1_FLOW_CALIBRATION_CUTOFF_LOCAL, datetime(2026, 8, 11, 12, 15))
        self.assertAlmostEqual(normalize_flow_lps(1001, 74.70, datetime(2026, 8, 11, 12, 14)), 20.75, places=6)
        self.assertAlmostEqual(normalize_flow_lps(1001, 20.56, datetime(2026, 8, 11, 12, 15)), 20.56, places=6)
        self.assertAlmostEqual(normalize_flow_lps(1001, 20.76, datetime(2026, 8, 11, 12, 16)), 20.76, places=6)
        self.assertAlmostEqual(normalize_flow_lps(1051, 30.20, datetime(2026, 8, 11, 12, 16)), 30.20)

    def test_pozo_one_zero_flow_remains_valid_after_calibration_cutoff(self):
        self.assertEqual(normalize_flow_lps(1001, 0, datetime(2026, 8, 11, 12, 25)), 0.0)

    def test_pozo_one_totalizer_contract_is_not_normalized_like_flow(self):
        self.assertEqual(WELLS[0]['totalizer_unit'], 'm3')
        self.assertEqual(WELLS[1]['totalizer_unit'], 'm3')
        self.assertEqual(WELLS[0]['flow_calibration_cutoff_local'], '2026-08-11T12:15:00')
        self.assertEqual(WELLS[0]['post_cutoff_raw_flow_unit'], 'L/s')

    def test_pozo_one_history_crossing_calibration_cutoff_has_no_artificial_drop(self):
        samples = [
            (datetime(2026, 8, 11, 12, 14), 74.70),
            (datetime(2026, 8, 11, 12, 15), 20.56),
            (datetime(2026, 8, 11, 12, 16), 20.76),
        ]
        normalized = [normalize_flow_lps(1001, raw, stamp) for stamp, raw in samples]
        self.assertEqual([round(value, 2) for value in normalized if value is not None], [20.75, 20.56, 20.76])
        self.assertLess(max(normalized) - min(normalized), 0.25)

    def test_pozo_one_aggregated_rows_crossing_cutoff_use_per_sample_normalization(self):
        rows = _localized_rows([
            {'sensor_id': 1001, 'reading_ts': datetime(2026, 8, 11, 12, 14), 'flow_value': 74.70},
            {'sensor_id': 1001, 'reading_ts': datetime(2026, 8, 11, 12, 15), 'flow_value': 20.56},
            {'sensor_id': 1001, 'reading_ts': datetime(2026, 8, 11, 12, 16), 'flow_value': 20.76},
        ], 'reading_ts')
        values = [row['flow_value'] for row in rows]
        self.assertEqual([round(value, 2) for value in values if value is not None], [20.75, 20.56, 20.76])
        self.assertAlmostEqual(sum(values) / len(values), (20.75 + 20.56 + 20.76) / 3, places=6)

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
            'Línea 1', 'Lavadora Línea 2', 'Línea 3', 'Línea 4', 'Línea 5',
        ])
        self.assertEqual([item['module'] for item in lines], ['line', 'flow', 'line', 'line', 'line'])

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
