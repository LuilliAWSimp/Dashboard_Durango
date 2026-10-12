"""Tests del módulo administrativo; no dependen de conectividad BOS."""
from io import BytesIO
from pathlib import Path

import pytest
from reportlab.pdfgen import canvas

from app.services import concession_service as con


def _pdf():
    stream = BytesIO()
    obj = canvas.Canvas(stream)
    obj.drawString(72, 700, 'CONAGUA TITULO DGO100155')
    obj.drawString(72, 680, 'Agua subterranea 460,908.0000 m3')
    obj.showPage()
    obj.save()
    return stream.getvalue()


@pytest.fixture
def data_root(tmp_path, monkeypatch):
    monkeypatch.setattr(con, '_path', lambda: tmp_path / 'concessions.sqlite3')
    monkeypatch.setattr(con, '_document_dir', lambda: tmp_path / 'documents')
    return tmp_path


def test_seed_is_provisional_and_never_invents_extraction(data_root):
    payload = con.list_concessions()
    assert payload['plant_key'] == 'durango'
    assert len(payload['records']) == 2
    assert payload['reference_total_m3'] == 825315
    assert [r['sensor_id'] for r in payload['records']] == [1001, 1051]
    assert all(r['review_state'] == 'provisional' for r in payload['records'])
    assert all(r['extracted_year_m3'] is None and r['remaining_m3'] is None for r in payload['records'])
    assert con.list_concessions()['records'][0]['version'] == 1


def test_manual_change_is_persistent_and_audited(data_root):
    con.list_concessions()
    changed = con.update_concession('pozo_1', {
        'title_number': 'DGO100155', 'annual_volume_m3': 460900,
        'valid_from': None, 'valid_to': None, 'notes': 'Revisar PDF',
    }, 'admin1')
    assert changed['annual_volume_m3'] == 460900
    assert changed['version'] == 2
    assert con.list_concessions()['records'][0]['notes'] == 'Revisar PDF'
    assert con.list_audit('pozo_1')[0]['actor'] == 'admin1'


def test_pdf_requires_admin_confirmation_is_saved_and_not_auto_validated(data_root):
    con.list_concessions()
    document = _pdf()
    preview = con.inspect_pdf(document, 'prorroga.pdf')
    assert 'DGO100155' in preview['title_candidates']
    assert preview['text_detected'] is True
    assert con.list_concessions()['records'][0]['has_document'] is False
    saved = con.attach_document('pozo_1', {
        'title_number': 'DGO100155', 'annual_volume_m3': 460908,
    }, 'admin2', document, 'prorroga.pdf')
    assert saved['has_document'] is True
    assert saved['review_state'] == 'document_attached_pending_validation'
    assert saved['extracted_year_m3'] is None
    path, name = con.document_for('pozo_1')
    assert name == 'prorroga.pdf' and Path(path).read_bytes() == document
    assert len(con.list_audit('pozo_1')) == 1


def test_invalid_file_and_unconfigured_wells_are_rejected(data_root):
    con.list_concessions()
    with pytest.raises(con.ConcessionError):
        con.inspect_pdf(b'%PDF-falso', 'mal.pdf')
    with pytest.raises(con.ConcessionError):
        con.update_concession('pozo_3', {'title_number': 'X'}, 'admin')
    with pytest.raises(con.ConcessionError):
        con.update_concession('pozo_1', {'title_number': '', 'annual_volume_m3': 1}, 'admin')
    with pytest.raises(con.ConcessionError):
        con.update_concession('pozo_1', {'title_number': 'X', 'annual_volume_m3': -1}, 'admin')


def test_require_roles_is_admin_only_for_mutations():
    from fastapi import HTTPException
    from app.auth.dependencies import require_roles
    from types import SimpleNamespace
    authorize = require_roles('admin')
    with pytest.raises(HTTPException) as rejected:
        authorize(SimpleNamespace(state=SimpleNamespace(auth_user={'role': 'operator'})))
    assert rejected.value.status_code == 403
    assert authorize(SimpleNamespace(state=SimpleNamespace(auth_user={'role': 'admin'})))['role'] == 'admin'
