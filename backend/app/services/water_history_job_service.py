"""DGO-H07: consultas del historico por modulo como trabajos cortos de HTTP.

No crea una base de datos adicional ni cambia el analizador hidraulico.
La cola vive en el proceso FastAPI de la IPC y deduplica solicitudes iguales
por usuario; las exportaciones y GET historicos existentes no se alteran.
"""
from __future__ import annotations

import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

from app.services.water_history_service import _validate_module_request, get_water_history_module

logger = logging.getLogger(__name__)
MAX_ACTIVE_JOBS = 8
MAX_SAVED_JOBS = 32
FINISHED_TTL_SECONDS = 10 * 60
REUSE_SECONDS = 5 * 60


class ModuleHistoryJobManager:
    def __init__(self, loader: Callable[..., dict[str, Any]] | None = None):
        self._loader = loader or get_water_history_module
        self._lock = threading.RLock()
        self._jobs: dict[str, dict[str, Any]] = {}
        # Una consulta historica a la vez, sin presionar SQL Server desde cada cliente.
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='dgo-history')

    def _prune(self, now: float) -> None:
        for job_id, job in list(self._jobs.items()):
            if job['status'] in {'ready', 'failed'} and now - job['updated_at'] >= FINISHED_TTL_SECONDS:
                del self._jobs[job_id]
        # Evitar crecimiento sin limite si muchos usuarios exploran periodos.
        completed = sorted((item for item in self._jobs.values() if item['status'] in {'ready', 'failed'}),
                           key=lambda item: item['updated_at'])
        for job in completed[:max(0, len(self._jobs) - MAX_SAVED_JOBS)]:
            self._jobs.pop(job['id'], None)

    @staticmethod
    def _public(job: dict[str, Any]) -> dict[str, Any]:
        return {key: job.get(key) for key in ('id', 'status', 'created_at', 'updated_at', 'error')}

    def submit(self, *, owner_id: int, module: str, start_date: str, end_date: str, aggregation: str, force_refresh: bool = False, flow_only: bool = False) -> dict[str, Any]:
        parsed_module, parsed_agg, start, end = _validate_module_request(module, start_date, end_date, aggregation)
        options = dict(module=parsed_module, start_date=start.isoformat(), end_date=end.isoformat(), aggregation=parsed_agg, flow_only=bool(flow_only))
        fingerprint = (owner_id, *(options.values()))
        with self._lock:
            now = time.time()
            self._prune(now)
            for job in self._jobs.values():
                if job['fingerprint'] != fingerprint:
                    continue
                # Un refresco forzado puede unirse a la consulta activa, pero
                # cuando ya termino inicia un trabajo realmente nuevo.
                if job['status'] in {'queued', 'running'} or (
                    not force_refresh and job['status'] == 'ready' and now - job['updated_at'] < REUSE_SECONDS
                ):
                    return self._public(job)
            active_count = sum(job['status'] in {'queued', 'running'} for job in self._jobs.values())
            if active_count >= MAX_ACTIVE_JOBS:
                raise RuntimeError('Hay varias consultas historicas en proceso. Intenta nuevamente en unos minutos.')
            job_id = uuid.uuid4().hex
            job = dict(id=job_id, owner_id=owner_id, fingerprint=fingerprint, options=options,
                       force_refresh=force_refresh, status='queued', created_at=now,
                       updated_at=now, result=None, error=None)
            self._jobs[job_id] = job
            self._executor.submit(self._run, job_id)
            return self._public(job)

    def _run(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job['status'] = 'running'
            job['updated_at'] = time.time()
            options = dict(job['options'])
            force_refresh = job['force_refresh']
        started = time.monotonic()
        try:
            result = self._loader(**options, force_refresh=force_refresh)
            with self._lock:
                job.update(result=result, status='ready', updated_at=time.time())
            logger.info('Historico modular terminado module=%s range=%s..%s seconds=%.2f',
                        options['module'], options['start_date'], options['end_date'], time.monotonic()-started)
        except Exception as exc:
            logger.exception('Historico modular fallido module=%s range=%s..%s elapsed=%.2f',
                             options['module'], options['start_date'], options['end_date'], time.monotonic()-started)
            # No exponer SQL, cadenas de conexion u ODBC en el cliente.
            from app.services.water_history_service import WaterHistoryError
            if isinstance(exc, WaterHistoryError):
                message = 'La consulta a SQL Server no se pudo completar. Comprueba la conexión y vuelve a intentar.'
            else:
                message = 'No se pudo completar la consulta historica de planta.'
            with self._lock:
                job.update(status='failed', error=message, updated_at=time.time())

    def get(self, *, owner_id: int, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            self._prune(time.time())
            job = self._jobs.get(job_id)
            if job is None or job['owner_id'] != owner_id:
                return None
            return self._public(job)

    def result(self, *, owner_id: int, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            self._prune(time.time())
            job = self._jobs.get(job_id)
            if job is None or job['owner_id'] != owner_id or job['status'] != 'ready':
                return None
            return job['result']

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)


manager = ModuleHistoryJobManager()
