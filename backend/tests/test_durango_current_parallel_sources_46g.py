from __future__ import annotations

from threading import Barrier, Lock

from app.services import water_bos_service as service


class _DummySession:
    def __init__(self, token: int):
        self.token = token

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_current_snapshot_starts_four_independent_sources_concurrently(monkeypatch):
    rendezvous = Barrier(4, timeout=2)
    session_lock = Lock()
    session_counter = {'value': 0}
    seen_sessions: set[int] = set()
    started: list[str] = []

    def fake_session_local():
        with session_lock:
            session_counter['value'] += 1
            return _DummySession(session_counter['value'])

    def mark_started(label: str, session):
        started.append(label)
        seen_sessions.add(session.token)
        rendezvous.wait()

    def fake_latest(session, table_name, *_args, **_kwargs):
        label = 'pozos' if 'Pozo' in table_name else 'lineas'
        mark_started(label, session)
        return {'source': label}

    def fake_lavadoras(*, session):
        mark_started('lavadoras', session)
        return [{'source': 'lavadoras'}]

    def fake_jarabes(*, session):
        mark_started('jarabes', session)
        return [{'source': 'jarabes'}]

    monkeypatch.setattr(service, 'SessionLocal', fake_session_local)
    monkeypatch.setattr(service, '_safe_latest_row', fake_latest)
    monkeypatch.setattr(service, 'get_current_lavadoras', fake_lavadoras)
    monkeypatch.setattr(service, 'get_current_jarabes', fake_jarabes)

    pozo, linea, lavadoras, jarabes, errors = service._load_current_snapshot_sources_parallel()

    assert set(started) == {'pozos', 'lineas', 'lavadoras', 'jarabes'}
    assert len(seen_sessions) == 4
    assert pozo == {'source': 'pozos'}
    assert linea == {'source': 'lineas'}
    assert lavadoras == [{'source': 'lavadoras'}]
    assert jarabes == [{'source': 'jarabes'}]
    assert errors == 0


def test_current_snapshot_preserves_required_source_error_count(monkeypatch):
    session_lock = Lock()
    session_counter = {'value': 0}

    def fake_session_local():
        with session_lock:
            session_counter['value'] += 1
            return _DummySession(session_counter['value'])

    def fake_latest(_session, table_name, _start=None, _end=None, error_counter=None):
        if error_counter is not None:
            error_counter['count'] = 1
        return None

    monkeypatch.setattr(service, 'SessionLocal', fake_session_local)
    monkeypatch.setattr(service, '_safe_latest_row', fake_latest)
    monkeypatch.setattr(service, 'get_current_lavadoras', lambda **_kwargs: [])
    monkeypatch.setattr(service, 'get_current_jarabes', lambda **_kwargs: [])

    _pozo, _linea, _lavadoras, _jarabes, errors = service._load_current_snapshot_sources_parallel()

    assert errors == 2
