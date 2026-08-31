from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any, Iterable


@dataclass(frozen=True)
class IntervalReading:
    timestamp: datetime
    total_value: float | None
    instant_value: float | None
    source: str | None = None

    def payload(self) -> dict[str, Any]:
        return {
            'timestamp': self.timestamp.isoformat(timespec='seconds'),
            'total_value': self.total_value,
            'instant_value': self.instant_value,
            'source': self.source,
        }


@dataclass(frozen=True)
class IntervalReconciliation:
    start: datetime
    end: datetime
    previous_valid_reading: IntervalReading | None
    first_period_reading: IntervalReading | None
    last_period_reading: IntervalReading | None
    opening_m3: float | None
    closing_m3: float | None
    opening_source: str
    missing_previous_reading: bool
    boundary_complete: bool
    samples_received: int

    def payload(self) -> dict[str, Any]:
        result = asdict(self)
        result['start'] = self.start.isoformat(timespec='seconds')
        result['end'] = self.end.isoformat(timespec='seconds')
        result['previous_valid_reading'] = (
            self.previous_valid_reading.payload() if self.previous_valid_reading else None
        )
        result['first_period_reading'] = (
            self.first_period_reading.payload() if self.first_period_reading else None
        )
        result['last_period_reading'] = (
            self.last_period_reading.payload() if self.last_period_reading else None
        )
        return result


def _number(value: Any) -> float | None:
    if value in (None, ''):
        return None
    try:
        parsed = float(str(value).replace(',', '').strip())
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def _timestamp(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if value in (None, ''):
        return None
    raw = str(value).replace('Z', '').strip()
    for candidate in (raw, raw[:19]):
        try:
            return datetime.fromisoformat(candidate).replace(tzinfo=None)
        except ValueError:
            continue
    return None


def _reading_from_mapping(row: dict[str, Any]) -> IntervalReading | None:
    stamp = _timestamp(
        row.get('timestamp')
        or row.get('operational_ts')
        or row.get('reading_ts')
        or row.get('ts_local')
        or row.get('ts_minute')
        or row.get('bucket_start')
    )
    if stamp is None:
        return None
    total = _number(row.get('total_value'))
    if total is None:
        total = _number(row.get('totalizer'))
    if total is None:
        total = _number(row.get('total_close'))
    flow = _number(row.get('instant_value'))
    if flow is None:
        flow = _number(row.get('flow_value'))
    if flow is None:
        flow = _number(row.get('flow_avg'))
    return IntervalReading(
        timestamp=stamp,
        total_value=total,
        instant_value=flow,
        source=str(row.get('source') or row.get('period_source') or '') or None,
    )


def _external_previous(previous: Any) -> IntervalReading | None:
    if previous is None:
        return None
    if isinstance(previous, IntervalReading):
        return previous
    if isinstance(previous, dict):
        return _reading_from_mapping(previous)
    if isinstance(previous, (tuple, list)):
        stamp = _timestamp(previous[0] if len(previous) > 0 else None)
        total = _number(previous[1] if len(previous) > 1 else None)
        flow = _number(previous[2] if len(previous) > 2 else None)
        if stamp is None:
            return None
        return IntervalReading(stamp, total, flow, 'previous_query')
    return None


def _valid_totalizer(reading: IntervalReading | None) -> bool:
    return bool(reading is not None and reading.total_value is not None and reading.total_value > 0)


def reconcile_interval(
    rows: Iterable[dict[str, Any]],
    *,
    start: datetime,
    end: datetime,
    previous_reading: Any = None,
) -> IntervalReconciliation:
    """Resolve the canonical half-open interval [start, end).

    The opening boundary is the last valid totalizer strictly before ``start``.
    Period samples are only rows with ``start <= ts < end``. The opening
    reading is context and is never counted as a period sample.

    This function intentionally does not decide whether a totalizer increment
    is physically valid. That remains the responsibility of
    ``totalizer_quality.analyze_totalizer_series``.
    """
    if end < start:
        start, end = end, start

    normalized = [item for row in rows if (item := _reading_from_mapping(dict(row))) is not None]
    normalized.sort(key=lambda item: item.timestamp)

    previous_candidates = [item for item in normalized if item.timestamp < start and _valid_totalizer(item)]
    supplied_previous = _external_previous(previous_reading)
    if _valid_totalizer(supplied_previous) and supplied_previous.timestamp < start:
        previous_candidates.append(supplied_previous)
    previous_valid = max(previous_candidates, key=lambda item: item.timestamp) if previous_candidates else None

    period_rows = [item for item in normalized if start <= item.timestamp < end]
    first_period = period_rows[0] if period_rows else None
    last_period = period_rows[-1] if period_rows else None
    closing_candidates = [item for item in period_rows if _valid_totalizer(item)]
    closing = closing_candidates[-1] if closing_candidates else None

    missing_previous = previous_valid is None
    boundary_complete = bool(previous_valid is not None and closing is not None and period_rows)
    opening_source = 'previous_valid_reading' if previous_valid is not None else (
        'first_period_reading' if first_period is not None else 'no_data'
    )

    return IntervalReconciliation(
        start=start,
        end=end,
        previous_valid_reading=previous_valid,
        first_period_reading=first_period,
        last_period_reading=last_period,
        opening_m3=previous_valid.total_value if previous_valid else None,
        closing_m3=closing.total_value if closing else None,
        opening_source=opening_source,
        missing_previous_reading=missing_previous,
        boundary_complete=boundary_complete,
        samples_received=len(period_rows),
    )
