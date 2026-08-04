from __future__ import annotations
from datetime import datetime
import unittest
from unittest.mock import patch
from app.services import water_history_service as history
from app.services.water_service import _merge_period

class DurangoHistoryOverviewTests(unittest.TestCase):
    def setUp(self): history._CACHE.clear()
    def test_module_history_uses_confirmed_wells_and_preserves_empty_intervals(self):
        rows=[{'sensor_id':1001,'bucket_start':datetime(2026,8,4,0,0),'samples':15,'flow_avg':10.0,'flow_min':8.0,'flow_max':12.0,'total_open':100.0,'total_close':101.0}]
        with patch.object(history,'_query_15m_multi',return_value=rows),patch.object(history,'query_bos_well_rows',return_value=[]): payload=history.get_water_history_module(module='well',start_date='2026-08-04',end_date='2026-08-04',aggregation='hourly',force_refresh=True)
        self.assertEqual([item['sensor_id'] for item in payload['series']],[1001,1051]);self.assertTrue(payload['series'][0]['has_data']);self.assertFalse(payload['series'][1]['has_data']);self.assertIsNone(payload['series'][1]['points'][0]['flow_avg_lps']);self.assertIsNone(payload['series'][1]['points'][0]['volume_m3'])
    def test_well_module_uses_strict_one_day_bos_fallback(self):
        fallback=[{'operational_ts':datetime(2026,8,4,0,0),'instant_value':4.0,'total_value':200.0},{'operational_ts':datetime(2026,8,4,0,10),'instant_value':5.0,'total_value':201.0}]
        with patch.object(history,'_query_15m_multi',return_value=[]),patch.object(history,'query_bos_well_rows',side_effect=lambda sensor_id,*_:fallback if sensor_id==1051 else []): payload=history.get_water_history_module(module='well',start_date='2026-08-04',end_date='2026-08-04',aggregation='hourly',force_refresh=True)
        pozo2=next(item for item in payload['series'] if item['sensor_id']==1051);self.assertEqual(pozo2['source_status'],'bos_fallback');self.assertTrue(pozo2['has_data'])
    def test_minute_flow_rejects_ranges_longer_than_24_hours(self):
        with self.assertRaisesRegex(ValueError,'24 horas'): history.get_wells_minute_flow(start_datetime='2026-08-04T00:00:00',end_datetime='2026-08-05T00:01:00',force_refresh=True)
    def test_current_reading_is_not_replaced_by_missing_history(self):
        current=[{'sensor_id':1051,'name':'Pozo 2','flow_lps':29.75,'totalizador_m3':93695.94,'estado_comunicacion':'Actualizado','ultima_lectura':'2026-08-04T12:21:00'}]
        period=[{'sensor_id':1051,'name':'Pozo 2','period_m3':None,'period_m3_reliable':False,'activity':'Sin histórico para el periodo','data_status':'no_history','samples':0}]
        merged=_merge_period(current,period)[0];self.assertEqual(merged['current_flow'],29.75);self.assertEqual(merged['current_totalizer_m3'],93695.94);self.assertEqual(merged['communication'],'Actualizado');self.assertEqual(merged['activity'],'Sin histórico para el periodo');self.assertIsNone(merged['period_m3']);self.assertTrue(merged['current_reading_available'])
if __name__=='__main__': unittest.main()
