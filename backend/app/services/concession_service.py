"""Catálogo documental de concesiones de una sola planta (Durango).

No declara consumo legal ni interpreta el totalizador BOS como extracción anual.
El almacenamiento local es distinto de auth.sqlite3 y de SQL Server.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from app.config import get_settings

_PLANT = 'durango'
_WELLS = {
    'pozo_1': ('Pozo 1', 1001, 'DGO100155', 460908.0),
    'pozo_2': ('Pozo 2', 1051, 'DGO118098', 364407.0),
}
_LOCK = threading.RLock()
_MAX_PDF = 10 * 1024 * 1024


class ConcessionError(ValueError):
    pass


def _path() -> Path:
    configured = Path(get_settings().concession_database_path).expanduser()
    return configured if configured.is_absolute() else Path(__file__).resolve().parents[2] / configured


def _document_dir() -> Path:
    configured = Path(get_settings().concession_documents_path).expanduser()
    return configured if configured.is_absolute() else Path(__file__).resolve().parents[2] / configured


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def _connect():
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=20)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    conn.execute('PRAGMA busy_timeout=20000')
    return conn


def initialize_concessions() -> None:
    with _LOCK, _connect() as conn:
        conn.execute('PRAGMA journal_mode=WAL')
        conn.executescript('''
          CREATE TABLE IF NOT EXISTS concessions (
            plant_key TEXT NOT NULL,
            well_key TEXT NOT NULL,
            well_name TEXT NOT NULL,
            sensor_id INTEGER NOT NULL,
            title_number TEXT NOT NULL,
            annual_volume_m3 REAL NOT NULL CHECK (annual_volume_m3 > 0),
            valid_from TEXT NULL,
            valid_to TEXT NULL,
            notes TEXT NOT NULL DEFAULT '',
            provenance TEXT NOT NULL DEFAULT 'fotografia_correo',
            review_state TEXT NOT NULL DEFAULT 'provisional',
            document_name TEXT NULL,
            document_storage_name TEXT NULL,
            document_sha256 TEXT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            updated_by TEXT NOT NULL DEFAULT 'sistema',
            updated_at TEXT NOT NULL,
            PRIMARY KEY (plant_key, well_key)
          );
          CREATE TABLE IF NOT EXISTS concession_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plant_key TEXT NOT NULL,
            well_key TEXT NOT NULL,
            action TEXT NOT NULL,
            actor TEXT NOT NULL,
            details_json TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
        ''')
        for key, (name, sensor, title, volume) in _WELLS.items():
            conn.execute('''INSERT OR IGNORE INTO concessions
              (plant_key, well_key, well_name, sensor_id, title_number, annual_volume_m3, updated_at)
              VALUES (?,?,?,?,?,?,?)''', (_PLANT, key, name, sensor, title, volume, _now()))
        conn.commit()
    if os.name == 'posix':
        try:
            _path().chmod(0o600)
        except OSError:
            pass


def _record(row):
    item = dict(row)
    item['has_document'] = bool(item.pop('document_storage_name', None))
    item.pop('document_sha256', None)
    item['extracted_year_m3'] = None
    item['remaining_m3'] = None
    item['usage_percent'] = None
    item['measurement_status'] = 'pending_legal_period_and_historical_reconciliation'
    return item


def list_concessions():
    initialize_concessions()
    with _connect() as conn:
        rows = conn.execute('SELECT * FROM concessions WHERE plant_key=? ORDER BY sensor_id', (_PLANT,)).fetchall()
    return {
        'plant_key': _PLANT,
        'records': [_record(row) for row in rows],
        'reference_total_m3': sum(float(row['annual_volume_m3']) for row in rows),
        'legal_period_confirmed': False,
        'message': 'Volúmenes documentales provisionales. Extracción acumulada y remanente sin conciliar con BOS.',
    }


def _validated_key(key):
    if key not in _WELLS:
        raise ConcessionError('El pozo no pertenece al catálogo de Durango.')
    return key


def _save(key: str, payload: dict, actor: str, *, pdf: bytes | None = None, filename: str = ''):
    _validated_key(key)
    changes = dict(payload)
    allowed = {'title_number', 'annual_volume_m3', 'valid_from', 'valid_to', 'notes'}
    if not changes.keys() <= allowed:
        raise ConcessionError('El formulario contiene campos no permitidos.')
    if not changes and pdf is None:
        raise ConcessionError('No se recibieron cambios.')
    for field in ('title_number', 'notes'):
        if field in changes and changes[field] is not None:
            changes[field] = str(changes[field]).strip()
    if 'title_number' in changes and not changes['title_number']:
        raise ConcessionError('El número de título es obligatorio.')
    if 'annual_volume_m3' in changes:
        try:
            changes['annual_volume_m3'] = float(changes['annual_volume_m3'])
        except (ValueError, TypeError):
            raise ConcessionError('El volumen debe ser numérico.') from None
        if not 0 < changes['annual_volume_m3'] <= 1e12:
            raise ConcessionError('El volumen debe ser positivo y razonable.')
    for field in ('valid_from', 'valid_to'):
        if field in changes and changes[field]:
            try:
                datetime.strptime(changes[field], '%Y-%m-%d')
            except (TypeError, ValueError):
                raise ConcessionError('Las fechas deben estar en formato AAAA-MM-DD.') from None
        elif field in changes:
            changes[field] = None
    if pdf is not None:
        inspect_pdf(pdf, filename)  # exigir PDF estructuralmente legible; las páginas escaneadas sí se aceptan

    with _LOCK, _connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute('SELECT * FROM concessions WHERE plant_key=? AND well_key=?', (_PLANT, key)).fetchone()
        if row is None:
            raise ConcessionError('Concesión no encontrada.')
        new = dict(row)
        new.update(changes)
        if new['valid_from'] and new['valid_to'] and new['valid_from'] > new['valid_to']:
            raise ConcessionError('La vigencia final no puede anteceder a la inicial.')
        storage_name = None
        if pdf is not None:
            folder = _document_dir()
            folder.mkdir(parents=True, exist_ok=True)
            storage_name = f'{uuid.uuid4().hex}.pdf'
            with (folder / storage_name).open('xb') as handle:
                handle.write(pdf)
            if os.name == 'posix':
                try:
                    (folder / storage_name).chmod(0o600)
                except OSError:
                    pass
            new['document_name'] = Path(filename.replace('\\', '/')).name[:180]
            new['document_storage_name'] = storage_name
            new['document_sha256'] = hashlib.sha256(pdf).hexdigest()
            new['review_state'] = 'document_attached_pending_validation'
            new['provenance'] = 'pdf_adjuntado_admin'
        elif changes:
            new['provenance'] = 'captura_admin' if not row['document_storage_name'] else row['provenance']
        new['version'] = int(row['version']) + 1
        new['updated_at'] = _now()
        new['updated_by'] = actor[:100]
        updates = {field: new[field] for field in [*allowed, 'document_name', 'document_storage_name', 'document_sha256', 'review_state', 'provenance', 'version', 'updated_at', 'updated_by']}
        try:
            conn.execute('UPDATE concessions SET ' + ', '.join(f'{k}=?' for k in updates) + ' WHERE plant_key=? AND well_key=?',
                         [*updates.values(), _PLANT, key])
            old_values = {field: row[field] for field in changes}
            detail = {'previous_values': old_values, 'new_values': changes,
                      'document': new['document_name'] if pdf is not None else None,
                      'document_sha256': new['document_sha256'] if pdf is not None else None}
            conn.execute('INSERT INTO concession_audit (plant_key,well_key,action,actor,details_json,created_at) VALUES (?,?,?,?,?,?)',
                         (_PLANT, key, 'attach_pdf' if pdf is not None else 'edit', actor, json.dumps(detail, ensure_ascii=False), _now()))
            conn.commit()
        except Exception:
            if storage_name:
                (_document_dir() / storage_name).unlink(missing_ok=True)
            raise
    return _record(new)


def update_concession(key: str, payload: dict, actor: str):
    return _save(key, payload, actor)


def attach_document(key: str, payload: dict, actor: str, pdf: bytes, filename: str):
    return _save(key, payload, actor, pdf=pdf, filename=filename)


def document_for(key: str):
    _validated_key(key)
    initialize_concessions()
    with _connect() as conn:
        row = conn.execute('SELECT document_storage_name,document_name FROM concessions WHERE plant_key=? AND well_key=?', (_PLANT, key)).fetchone()
    if not row or not row['document_storage_name']:
        raise ConcessionError('No existe un documento adjunto.')
    stored = row['document_storage_name']
    if not re.fullmatch(r'[a-f0-9]{32}\.pdf', stored):
        raise ConcessionError('Referencia del documento inválida.')
    path = _document_dir() / stored
    if not path.is_file():
        raise ConcessionError('El documento no está disponible en el servidor.')
    return path, row['document_name']


def list_audit(key: str):
    _validated_key(key)
    initialize_concessions()
    with _connect() as conn:
        rows = conn.execute('''SELECT action,actor,details_json,created_at FROM concession_audit
          WHERE plant_key=? AND well_key=? ORDER BY id DESC LIMIT 20''', (_PLANT, key)).fetchall()
    return [dict(action=row['action'], actor=row['actor'], details=json.loads(row['details_json']), created_at=row['created_at']) for row in rows]


def check_pdf(content: bytes, filename: str):
    if not filename.lower().endswith('.pdf') or not content.lstrip()[:5] == b'%PDF-':
        raise ConcessionError('Seleccione un documento PDF válido.')
    if len(content) > _MAX_PDF:
        raise ConcessionError('El PDF supera el máximo de 10 MB.')
    if len(content) < 30:
        raise ConcessionError('El PDF está incompleto.')


def inspect_pdf(content: bytes, filename: str):
    """Sugiere referencias, nunca autoriza publicación automática de cifras."""
    check_pdf(content, filename)
    try:
        from pypdf import PdfReader
        reader = PdfReader(BytesIO(content), strict=False)
        if reader.is_encrypted:
            raise ConcessionError('No se admiten PDF protegidos con contraseña.')
        if len(reader.pages) > 100:
            raise ConcessionError('El PDF contiene demasiadas páginas para esta revisión.')
        text = '\n'.join((page.extract_text() or '') for page in reader.pages[:20])
    except ConcessionError:
        raise
    except Exception as exc:
        raise ConcessionError('No se pudo leer este PDF. Revise el archivo o capture manualmente los datos.') from exc
    titles = list(dict.fromkeys(re.findall(r'\bDGO\s*\d{5,12}\b', text.upper())))[:10]
    # Los números se muestran como referencias, no se asocian automáticamente al campo legal.
    volume_candidates = list(dict.fromkeys(re.findall(r'\b\d{1,3}(?:[, ]\d{3})+(?:\.\d{1,4})?\b', text)))[:12]
    return {
        'pages': len(reader.pages),
        'text_detected': bool(text.strip()),
        'title_candidates': titles,
        'number_candidates': volume_candidates,
        'excerpt': text[:2400],
        'notice': 'Lectura orientativa. Confirme título, volumen, vigencia y pozo antes de guardar. Sin OCR para PDF escaneados.'
    }
