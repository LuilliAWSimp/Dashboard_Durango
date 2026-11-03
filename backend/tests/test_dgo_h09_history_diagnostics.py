"""H09: medicion no invasiva del costo de consulta SQL / validacion / procesamiento."""
from __future__ import annotations

import logging
from unittest.mock import patch

from app.services import water_history_service as history


def test_full_history_logs_phase_timings_without_changing_payload(caplog):
    history._CACHE.clear()
    with patch.object(history, '_query_15m_multi_chunked', return_value=[]) as query, \
         patch.object(history, '_query_physical_validation_rows_chunked', return_value=[]) as validation, \
         patch.object(history, 'query_bos_well_rows', return_value=[]), \
         caplog.at_level(logging.INFO, logger=history.__name__):
        payload = history.get_water_history_module(
            module='well', start_date='2026-10-10', end_date='2026-10-11', aggregation='hourly'
        )
    assert query.called and validation.called
    assert payload['flow_only'] is False
    assert 'sql_fuentes_s=' in caplog.text
    assert 'sql_validacion_totalizador_s=' in caplog.text
    assert 'procesamiento_s=' in caplog.text
    assert 'modo=completo' in caplog.text
    history._CACHE.clear()
