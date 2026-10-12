"""Respaldo diario consistente de la SQLite operativa de concesiones.

No copia los archivos -wal / -shm, usa la API de backup de SQLite y realiza
validacion de integridad antes de publicar una copia fuera del repositorio.
Nunca modifica o reconstruye los registros industriales ni el historico.
"""
from __future__ import annotations

import logging
import os
import sqlite3
import threading
import uuid
from contextlib import closing
from datetime import datetime
from pathlib import Path

from app.services.concession_service import _path

logger = logging.getLogger(__name__)
_BACKUP_LOCK = threading.Lock()
_RETAIN_DAILY = 7


def _backup_directory() -> Path:
    external = os.environ.get('ARCA_CONCESSIONS_BACKUP_DIR', '').strip()
    if external:
        return Path(external).expanduser().resolve()
    # Ubicacion hermana de la carpeta del repositorio en la IPC.
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root.parent / 'ARCA_Durango_Backups' / 'concesiones'


def create_daily_backup(*, day: str | None = None, dest_dir: Path | None = None) -> Path | None:
    """None significa que hoy ya existe un respaldo; nunca borra la base viva.

    Fallar al respaldar NO impide que el dashboard funcione. Errores se registran.
    La copia se crea en un archivo temporal unico y se publica atomicamente.
    """
    with _BACKUP_LOCK:
        source = _path()
        if not source.is_file():
            return None  # No crear nunca una base vacia como supuesto respaldo.
        stamp = day or datetime.now().strftime('%Y-%m-%d')
        # Limitar el nombre a fecha normalizada y no aceptar rutas arbitrarias.
        datetime.strptime(stamp, '%Y-%m-%d')
        directory = (dest_dir or _backup_directory()).resolve()
        repo_root = Path(__file__).resolve().parents[3]
        if directory == repo_root or repo_root in directory.parents:
            raise ValueError('Los respaldos de concesiones deben quedar fuera del repositorio.')
        directory.mkdir(parents=True, exist_ok=True)
        target = directory / f'concessions_{stamp}.sqlite3'
        if target.is_file():
            return None
        temporary = directory / f'.concessions_{stamp}_{os.getpid()}_{uuid.uuid4().hex}.tmp'
        try:
            with closing(sqlite3.connect(str(source), timeout=20)) as origin:
                with closing(sqlite3.connect(str(temporary), timeout=20)) as snapshot:
                    origin.backup(snapshot, pages=128, sleep=0.08)
                    check = snapshot.execute('PRAGMA quick_check').fetchone()
                    if not check or check[0] != 'ok':
                        raise sqlite3.DatabaseError('PRAGMA quick_check fallo en respaldo')
                    tables = {row[0] for row in snapshot.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                    if not {'concessions', 'concession_daily_consumption', 'concession_monthly_consumption'} <= tables:
                        raise sqlite3.DatabaseError('El respaldo no contiene las tablas de concesiones esperadas')
            os.replace(temporary, target)
            # Conservar exclusivamente 7 copias diarias de este proceso, despues de tener copia valida.
            previous = sorted(directory.glob('concessions_????-??-??.sqlite3'), reverse=True)
            for old in previous[_RETAIN_DAILY:]:
                try:
                    old.unlink()
                except OSError:
                    logger.warning('No se pudo depurar respaldo anterior %s', old)
            logger.info('Respaldo SQLite de concesiones guardado: %s', target)
            return target
        finally:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                logger.warning('No se pudo limpiar el archivo temporal %s', temporary)


class _BackupWorker:
    def __init__(self):
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None

    def start(self) -> None:
        if self.thread and self.thread.is_alive():
            return
        self.stop_event.clear()
        self.thread = threading.Thread(target=self._loop, daemon=True, name='concessions-sqlite-backup')
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2)
        self.thread = None

    def _loop(self) -> None:
        if self.stop_event.wait(20):
            return
        while not self.stop_event.is_set():
            try:
                create_daily_backup()
            except Exception:
                logger.exception('No se pudo completar el respaldo diario de concesiones')
            self.stop_event.wait(60 * 60)


_WORKER = _BackupWorker()


def start_concession_backup() -> None:
    _WORKER.start()


def stop_concession_backup() -> None:
    _WORKER.stop()
