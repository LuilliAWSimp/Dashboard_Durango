from __future__ import annotations
from datetime import datetime
import unittest
from unittest.mock import patch
from app.services import water_history_service as history
from app.services.water_service import _merge_period

class DurangoHistoryOverviewTests(unittest.TestCase):
    def setUp(self): history._CACHE.clear()
    def test_module_history_uses_confirmed_wells_and_preserves_empty_intervals(self):
        rows=[{'sensor_id':1001,'bucket_start':datetime(2026,8,5,0,0),'samples':15,'flow_avg':10.0,'flow_min':8.0,'flow_max':12.0,'total_open':100.0,'total_close':109.0}]
        with patch.object(history,'_query_15m_multi',return_value=rows),patch.object(history,'_query_physical_validation_rows',return_value=[]),patch.object(history,'query_bos_well_rows',return_value=[]): payload=history.get_water_history_module(module='well',start_date='2026-08-05',end_date='2026-08-05',aggregation='hourly',force_refresh=True)
        self.assertEqual([item['sensor_id'] for item in payload['series']],[1001,1051]);self.assertTrue(payload['series'][0]['has_data']);self.assertFalse(payload['series'][1]['has_data']);self.assertIsNone(payload['series'][1]['points'][0]['flow_avg_lps']);self.assertIsNone(payload['series'][1]['points'][0]['volume_m3'])
    def test_well_module_uses_strict_one_day_bos_fallback(self):
        fallback=[{'operational_ts':datetime(2026,8,5,0,0),'instant_value':4.0,'total_value':200.0},{'operational_ts':datetime(2026,8,5,0,10),'instant_value':5.0,'total_value':204.0}]
        with patch.object(history,'_query_15m_multi',return_value=[]),patch.object(history,'_query_physical_validation_rows',return_value=[]),patch.object(history,'query_bos_well_rows',side_effect=lambda sensor_id,*_:fallback if sensor_id==1051 else []): payload=history.get_water_history_module(module='well',start_date='2026-08-05',end_date='2026-08-05',aggregation='hourly',force_refresh=True)
        pozo2=next(item for item in payload['series'] if item['sensor_id']==1051);self.assertEqual(pozo2['source_status'],'bos_fallback');self.assertTrue(pozo2['has_data'])
    def test_minute_flow_rejects_ranges_longer_than_24_hours(self):
        with self.assertRaisesRegex(ValueError,'24 horas'): history.get_wells_minute_flow(start_datetime='2026-08-04T00:00:00',end_datetime='2026-08-05T00:01:00',force_refresh=True)
    def test_current_reading_is_not_replaced_by_missing_history(self):
        current=[{'sensor_id':1051,'name':'Pozo 2','flow_lps':29.75,'totalizador_m3':93695.94,'estado_comunicacion':'Actualizado','ultima_lectura':'2026-08-04T12:21:00'}]
        period=[{'sensor_id':1051,'name':'Pozo 2','period_m3':None,'period_m3_reliable':False,'activity':'Sin histórico para el periodo','data_status':'no_history','samples':0}]
        merged=_merge_period(current,period)[0];self.assertEqual(merged['current_flow'],29.75);self.assertEqual(merged['current_totalizer_m3'],93695.94);self.assertEqual(merged['communication'],'Actualizado');self.assertEqual(merged['activity'],'Sin histórico para el periodo');self.assertIsNone(merged['period_m3']);self.assertTrue(merged['current_reading_available'])
    def test_reclassified_line_washer_history_stays_on_readings_minute(self):
        rows=[{'sensor_id':2004,'bucket_start':datetime(2026,8,5,8,0),'samples':15,'active_samples':5,'flow_avg':4.0,'flow_active_avg':12.0,'flow_min':0.0,'flow_max':12.0,'total_open':100.0,'total_close':103.6}]
        with patch.object(history,'_query_15m_multi',return_value=rows) as query_lines,patch.object(history,'query_lavadora_rows',return_value={}) as query_lavadoras,patch.object(history,'query_jarabes_rows',return_value=[]):
            payload=history.get_water_history_module(module='flow',start_date='2026-08-05',end_date='2026-08-05',aggregation='quarter_hour',force_refresh=True)
        query_lines.assert_called_once()
        self.assertEqual(query_lines.call_args.args[0],[2004])
        query_lavadoras.assert_called_once()
        first=payload['series'][0]
        self.assertEqual(first['sensor_id'],2004)
        self.assertEqual(first['name'],'Lavadora Línea 2')
        self.assertEqual(first['source_status'],'readings_minute')
        self.assertEqual(first['points'][32]['flow_avg_lps'],4.0)
        self.assertEqual(first['points'][32]['totalizer_close_m3'],103.6)
if __name__=='__main__': unittest.main()

class DurangoMinuteModuleHistoryTests(unittest.TestCase):
    def setUp(self):
        history._CACHE.clear()

    def test_minute_module_accepts_one_day_and_preserves_observed_totalizer(self):
        raw = [
            {'sensor_id': 1001, 'reading_ts': datetime(2026, 8, 12, 8, 0), 'flow_value': 10.0, 'total_value': 500.0},
            {'sensor_id': 1001, 'reading_ts': datetime(2026, 8, 12, 8, 1), 'flow_value': 0.0, 'total_value': 500.2},
        ]
        with patch.object(history, '_query_minute_history_rows', return_value=raw), patch.object(history, 'query_bos_well_rows', return_value=[]):
            payload = history.get_water_history_module(module='well', start_date='2026-08-12', end_date='2026-08-12', aggregation='minute', force_refresh=True)
        pozo1 = next(item for item in payload['series'] if item['sensor_id'] == 1001)
        point = pozo1['points'][8 * 60]
        self.assertEqual(point['aggregation'], 'minute')
        self.assertEqual(point['flow_avg_lps'], 10.0)
        self.assertEqual(point['totalizer_close_m3'], 500.0)
        self.assertIsNone(point['volume_m3'])

    def test_minute_module_rejects_more_than_one_calendar_day(self):
        with self.assertRaisesRegex(ValueError, 'máximo de 1 día'):
            history.get_water_history_module(module='well', start_date='2026-08-12', end_date='2026-08-13', aggregation='minute', force_refresh=True)
