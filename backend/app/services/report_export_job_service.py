"""DGO-H01: trabajos de exportacion sin peticiones HTTP prolongadas.

La cola es local a UNA instancia FastAPI. No contiene datos de sensores: los
exportadores existentes siguen siendo la unica fuente de calculo y formato.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger(__name__)

FORMATS = {
    'daily_pdf': ('pdf', 'application/pdf'),
    'daily_excel': ('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    'historical_pdf': ('pdf', 'application/pdf'),
    'historical_excel': ('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
}
FINAL_STATUSES = {'ready', 'failed'}
MAX_JOBS = 8
TTL_SECONDS = 60 * 60
REUSE_SECONDS = 5 * 60


def _job_dir() -> Path:
    root = os.getenv('ARCA_REPORT_JOBS_DIR', '').strip()
    path = Path(root) if root else Path(tempfile.gettempdir()) / 'arca_durango_report_jobs'
    path.mkdir(parents=True, exist_ok=True)
    return path


def validate_options(kind: str, options: dict[str, Any]) -> dict[str, str | None]:
    if kind not in FORMATS:
        raise ValueError('Formato de reporte no disponible.')
    if not isinstance(options, dict):
        raise ValueError('Parámetros de exportación inválidos.')
    extra = set(options) - {'date', 'start_date', 'end_date'}
    if extra:
        raise ValueError('La solicitud incluye parámetros desconocidos.')
    clean: dict[str, str | None] = {}
    for key in ('date', 'start_date', 'end_date'):
        raw = options.get(key)
        if raw is None or raw == '':
            clean[key] = None
            continue
        if not isinstance(raw, str) or len(raw) != 10:
            raise ValueError('Fecha inválida: usa el formato AAAA-MM-DD.')
        try:
            clean[key] = date.fromisoformat(raw).isoformat()
        except ValueError as exc:
            raise ValueError('Fecha inválida: usa el formato AAAA-MM-DD.') from exc
    if clean['date'] and (clean['start_date'] or clean['end_date']):
        raise ValueError('Usa una fecha individual o un rango, no ambos.')
    if bool(clean['start_date']) != bool(clean['end_date']):
        raise ValueError('Indica las dos fechas del rango.')
    if clean['start_date'] and clean['end_date'] and clean['start_date'] > clean['end_date']:
        raise ValueError('La fecha inicial no puede ser posterior a la final.')
    if kind.startswith('historical_'):
        if clean['date']:
            raise ValueError('El histórico completo acepta únicamente rango opcional.')
    return clean


def _export(kind: str, params: dict[str, str | None], on_stage: Callable[[str], None] | None = None) -> tuple[bytes, str]:
    if kind.startswith('daily_'):
        from app.services.water_daily_report_service import (
            build_daily_water_report_excel, build_daily_water_report_pdf, get_daily_water_report,
        )
        report = get_daily_water_report(
            report_date=params['date'], start_date=params['start_date'],
            end_date=params['end_date'], include_history=True, include_shifts=True,
            progress_callback=on_stage,
        )
        if on_stage is not None:
            on_stage('Construyendo archivo PDF' if kind == 'daily_pdf' else 'Construyendo archivo Excel')
        return (build_daily_water_report_pdf(report) if kind == 'daily_pdf'
                else build_daily_water_report_excel(report))
    from app.services.water_historical_export_service import build_full_historical_excel, build_full_historical_pdf
    args = {'start_date': params['start_date'], 'end_date': params['end_date']}
    return (build_full_historical_pdf(**args) if kind == 'historical_pdf'
            else build_full_historical_excel(**args))


class ExportJobManager:
    def __init__(self, exporter: Callable[[str, dict], tuple[bytes, str]] = _export, *, directory: Path | None = None):
        self.exporter = exporter
        self.directory = directory
        self._lock = threading.RLock()
        self._jobs: dict[str, dict[str, Any]] = {}
        self._last_disk_cleanup = 0.0
        # Un worker: evita que varios históricos completos saturen BOS en una IPC.
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='arca-report-export')

    def _base_dir(self) -> Path:
        target = self.directory if self.directory is not None else _job_dir()
        target.mkdir(parents=True, exist_ok=True)
        return target

    def _prune(self) -> None:
        now = time.time()
        # Limpia tambien artefactos huerfanos de reinicios de la IPC.
        if now - self._last_disk_cleanup > 900:
            self._last_disk_cleanup = now
            for path in self._base_dir().iterdir():
                if not path.is_file() or not re.fullmatch(r'[0-9a-f]{32}\.(?:pdf|xlsx|part)', path.name):
                    continue
                try:
                    if now - path.stat().st_mtime > TTL_SECONDS:
                        path.unlink(missing_ok=True)
                except OSError:
                    logger.warning('No se pudo limpiar artefacto de exportación caducado')
        for key, item in list(self._jobs.items()):
            if item['status'] in FINAL_STATUSES and now - item['updated_at'] > TTL_SECONDS:
                if item.get('filepath'):
                    try:
                        Path(item['filepath']).unlink(missing_ok=True)
                    except OSError:
                        logger.warning('No se pudo limpiar artefacto de reporte %s', key)
                self._jobs.pop(key, None)

    def submit(self, owner_id: int, kind: str, options: dict) -> dict[str, Any]:
        params = validate_options(kind, options)
        fingerprint = hashlib.sha256(json.dumps(
            {'owner_id': owner_id, 'kind': kind, 'options': params},
            sort_keys=True, separators=(',', ':'),
        ).encode()).hexdigest()
        with self._lock:
            self._prune()
            now = time.time()
            for job in self._jobs.values():
                if job['fingerprint'] == fingerprint and (job['status'] in {'queued', 'running'} or
                    (job['status'] == 'ready' and now - job['updated_at'] < REUSE_SECONDS)):
                    return self._public(job)
            active = sum(j['status'] in {'queued', 'running'} for j in self._jobs.values())
            if active >= MAX_JOBS:
                raise RuntimeError('Hay demasiadas exportaciones en espera. Intenta más tarde.')
            job_id = uuid.uuid4().hex
            job = {'id': job_id, 'owner_id': owner_id, 'kind': kind, 'params': params,
                   'fingerprint': fingerprint, 'status': 'queued', 'created_at': now,
                   'updated_at': now, 'filename': None, 'filepath': None,
                   'error': None, 'stage': 'En espera', 'started_at': None}
            self._jobs[job_id] = job
            self._executor.submit(self._run, job_id)
            return self._public(job)

    def _run(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job['status'] = 'running'
            job['stage'] = 'Iniciando exportación'
            job['started_at'] = time.time()
            job['updated_at'] = time.time()
            kind, params = job['kind'], dict(job['params'])
        path: Path | None = None
        try:
            if self.exporter is _export:
                def stage(label: str) -> None:
                    with self._lock:
                        job['stage'] = label
                        job['updated_at'] = time.time()
                content, filename = self.exporter(kind, params, on_stage=stage)
            else:
                content, filename = self.exporter(kind, params)
            if not isinstance(content, bytes) or not content:
                raise ValueError('La exportación no produjo un archivo válido.')
            ext, _ = FORMATS[kind]
            with self._lock:
                job['stage'] = 'Guardando archivo terminado'
            path = self._base_dir() / f'{job_id}.{ext}'
            # Solo se publican archivos completos: el navegador nunca lee parciales.
            temporary = path.with_suffix('.part')
            try:
                temporary.write_bytes(content)
                temporary.replace(path)
            finally:
                temporary.unlink(missing_ok=True)
            with self._lock:
                job.update(status='ready', stage='Disponible para descargar', filename=Path(filename).name, filepath=str(path),
                           updated_at=time.time())
        except Exception as exc:
            logger.exception('Exportacion de reporte fallida kind=%s id=%s', kind, job_id)
            if path is not None:
                path.unlink(missing_ok=True)
            with self._lock:
                job.update(status='failed', stage='Error de generación', error=self._error_message(exc), updated_at=time.time())

    @staticmethod
    def _error_message(exc: Exception) -> str:
        # No filtrar cadenas SQL/ODBC/credenciales a los usuarios.
        if isinstance(exc, ValueError):
            return 'No se pudo completar el reporte con los parámetros seleccionados.'
        return 'No fue posible generar el reporte. Revisa la conexión de planta e inténtalo de nuevo.'

    @staticmethod
    def _public(job: dict[str, Any]) -> dict[str, Any]:
        public = {key: job.get(key) for key in ('id', 'kind', 'status', 'stage', 'created_at', 'updated_at', 'filename', 'error')}
        started_at = job.get('started_at')
        now = time.time()
        public['queue_seconds'] = round((started_at or now) - job['created_at'], 1)
        public['work_seconds'] = round(((min(job['updated_at'], now) if job['status'] in FINAL_STATUSES else now) - started_at), 1) if started_at is not None else 0.0
        return public

    def get(self, owner_id: int, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            self._prune()
            job = self._jobs.get(job_id)
            if job is None or job['owner_id'] != owner_id:
                return None
            return self._public(job)

    def result(self, owner_id: int, job_id: str) -> tuple[Path, str, str] | None:
        with self._lock:
            self._prune()
            job = self._jobs.get(job_id)
            if job is None or job['owner_id'] != owner_id or job['status'] != 'ready':
                return None
            if not Path(job['filepath']).is_file():
                return None
            return Path(job['filepath']), str(job['filename']), FORMATS[job['kind']][1]

    def shutdown(self) -> None:
        # No interrumpir exportaciones en curso durante apagado ordenado.
        self._executor.shutdown(wait=False, cancel_futures=True)


manager = ExportJobManager()
