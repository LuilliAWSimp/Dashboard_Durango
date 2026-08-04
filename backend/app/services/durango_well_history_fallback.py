"""Fallback histórico acotado para los dos pozos confirmados de Durango."""
from __future__ import annotations

from datetime import datetime, timedelta
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.database import SessionLocal
from app.services.durango_capabilities import WELLS
from app.services.water_bos_service import _bos_value, _row_to_dict

logger = logging.getLogger(__name__)
MAX_BOS_WELL_ROWS = 2_000


def _num(value: Any) -> float | None:
    if value in (None, ''):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def _dt(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if value in (None, ''):
        return None
    raw = str(value).replace('Z', '')
    for candidate in (raw, raw[:19]):
        try:
            return datetime.fromisoformat(candidate).replace(tzinfo=None)
        except ValueError:
            continue
    return None


def _well_index(sensor_id: int) -> int | None:
    for index, contract in enumerate(WELLS):
        if int(contract['sensor_id']) == int(sensor_id):
            return index
    return None


def _extract_row(row: dict[str, Any], sensor_id: int, index: int) -> dict[str, Any] | None:
    stamp = _dt(row.get('time_stamp') or row.get('timestamp'))
    if stamp is None:
        return None
    flow_out = _num(_bos_value(row, 'POZO_FLOW_OUT', index, 'instant_value', None))
    flow_in = _num(_bos_value(row, 'POZO_FLOW_IN', index, 'instant_value', None))
    flows = [value for value in (flow_out, flow_in) if value is not None]
    flow = max(flows) if flows else None
    total_out = _num(_bos_value(row, 'POZO_FLOW_OUT', index, 'total_value', None))
    total_in = _num(_bos_value(row, 'POZO_FLOW_IN', index, 'total_value', None))
    totals = [value for value in (total_out, total_in) if value is not None and value > 0]
    total = max(totals) if totals else None
    quality = _num(_bos_value(row, 'POZO_FLOW_OUT', index, 'quality', None))
    if quality is None:
        quality = _num(_bos_value(row, 'POZO_FLOW_IN', index, 'quality', None))
    if flow is None and total is None and quality is None:
        return None
    return {
        'sensor_id': int(sensor_id),
        'operational_ts': stamp,
        'instant_value': flow,
        'total_value': total,
        'quality': quality,
        'source': 'dbo.SensorsBOS_Pozo',
        'period_source': 'bos_fallback',
    }


def query_bos_well_rows(sensor_id: int, start_dt: datetime, end_dt: datetime, *, max_rows: int = MAX_BOS_WELL_ROWS) -> list[dict[str, Any]]:
    index = _well_index(sensor_id)
    if index is None or end_dt <= start_dt or end_dt - start_dt > timedelta(days=1):
        return []
    limit = max(1, min(int(max_rows or MAX_BOS_WELL_ROWS), MAX_BOS_WELL_ROWS))
    sql = text(f"""
        SELECT TOP ({limit}) *
        FROM dbo.SensorsBOS_Pozo
        WHERE Time_Stamp >= :start_dt
          AND Time_Stamp < :end_dt
        ORDER BY Time_Stamp ASC
    """)
    try:
        with SessionLocal() as session:
            rows = [_row_to_dict(row) for row in session.execute(sql, {'start_dt': start_dt, 'end_dt': end_dt}).fetchall()]
    except SQLAlchemyError as exc:
        logger.exception('Durango well BOS fallback failed sensor=%s: %s', sensor_id, exc)
        return []
    normalized = [_extract_row(row, sensor_id, index) for row in rows if row]
    return [row for row in normalized if row is not None]
