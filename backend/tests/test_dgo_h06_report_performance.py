"""DGO-H06: concurrencia acotada, reporte inalterado y progreso de trabajos."""
from __future__ import annotations

import threading
import time

from app.services import water_daily_report_service as service
from app.services.report_export_job_service import ExportJobManager


def test_report_history_reads_three_sources_once_with_bounded_parallelism(monkeypatch):
    lock = threading.Lock()
    active = 0
    maximum = 0
    calls = []

    def fake_history(module, *_):
        nonlocal active, maximum
        with lock:
            active += 1
            maximum = max(maximum, active)
            calls.append(module)
        time.sleep(0.015)
        with lock:
            active -= 1
        if module == 'flow':
            return {'series': [
                {'operational_key': 'lavadora_a', 'points': [{'flow_avg': 0}]},
                {'operational_key': 'jarabes', 'points': [{'flow_avg': 0}]},
            ]}
        return {'series': []}

    monkeypatch.setattr(service, '_report_history', fake_history)
    result = service._load_report_history(service.date(2026, 10, 1), service.date(2026, 10, 12), 'daily')
    assert sorted(calls) == ['flow', 'line', 'well']
    assert 1 <= maximum <= 2
    assert set(result) == {'flows', 'wells', 'lines', 'washers', 'jarabes'}
    assert len(result['washers']['series']) == 0  # clave no registrada en Durango
    assert len(result['jarabes']['series']) == 1
    assert len(result['flows']['series']) == 2


def test_job_status_reports_stage_and_times_without_sensitive_details(tmp_path):
    go = threading.Event()
    started = threading.Event()

    def exporter(kind, params):
        started.set()
        assert go.wait(2)
        return b'%PDF-test', 'durango.pdf'

    manager = ExportJobManager(exporter, directory=tmp_path)
    try:
        job = manager.submit(50, 'daily_pdf', {'start_date': '2026-10-01', 'end_date': '2026-10-12'})
        assert 'stage' in job and job['queue_seconds'] >= 0
        assert started.wait(1)
        live = manager.get(50, job['id'])
        assert live['status'] == 'running'
        assert live['stage'] == 'Iniciando exportación'
        assert live['work_seconds'] >= 0
        assert manager.get(51, job['id']) is None
        go.set()
        for _ in range(150):
            result = manager.get(50, job['id'])
            if result['status'] == 'ready':
                break
            time.sleep(.01)
        assert result['status'] == 'ready'
        assert result['stage'] == 'Disponible para descargar'
        assert result['work_seconds'] >= 0
    finally:
        go.set()
        manager.shutdown()
