from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import logging
from typing import Any, Iterable

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TotalizerAnalysis:
    volume_m3: float | None
    opening_m3: float | None
    closing_m3: float | None
    status: str
    reliable: bool
    discarded_events: tuple[dict[str, Any], ...] = ()


def _number(value: Any) -> float | None:
    if value is None or value == '':
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
            return datetime.fromisoformat(candidate)
        except ValueError:
            continue
    return None


def _normalized_points(readings: Iterable[dict[str, Any] | tuple[Any, Any]]) -> list[tuple[datetime, float]]:
    points: list[tuple[datetime, float]] = []
    for position, reading in enumerate(readings):
        if isinstance(reading, tuple):
            raw_time, raw_value = reading
        else:
            raw_time = (
                reading.get('timestamp')
                or reading.get('reading_ts')
                or reading.get('ts_local')
                or reading.get('ts_minute')
            )
            raw_value = reading.get('total_value')
            if raw_value is None:
                raw_value = reading.get('totalizer')
        value = _number(raw_value)
        if value is None or value < 0:
            continue
        parsed_time = _timestamp(raw_time) or datetime.min.replace(microsecond=min(position, 999999))
        points.append((parsed_time, value))

    points.sort(key=lambda item: item[0])
    if any(value > 0 for _, value in points):
        # Los ceros intermedios entre lecturas positivas se consideran pérdidas
        # temporales de lectura, no un reinicio confirmado del totalizador.
        points = [(stamp, value) for stamp, value in points if value > 0]
    return points


def _event(sensor_id: int | None, stamp: datetime, previous: float, current: float, reason: str) -> dict[str, Any]:
    event = {
        'sensor_id': sensor_id,
        'timestamp': stamp.isoformat(timespec='seconds'),
        'previous': previous,
        'current': current,
        'difference': round(current - previous, 6),
        'reason': reason,
    }
    logger.warning(
        'totalizer event sensor=%s timestamp=%s previous=%s current=%s difference=%s reason=%s',
        sensor_id,
        event['timestamp'],
        previous,
        current,
        event['difference'],
        reason,
    )
    return event


def analyze_totalizer_series(
    readings: Iterable[dict[str, Any] | tuple[Any, Any]],
    *,
    sensor_id: int | None = None,
) -> TotalizerAnalysis:
    """Calculate a defensible period delta without summing accumulated readings.

    The analyzer removes intermittent zero readings when positive totalizers exist,
    requires an opening and closing value, and marks any real decrease/restart as
    non-reliable. It deliberately avoids plant-specific recovery assumptions.
    """
    points = _normalized_points(readings)
    if not points:
        return TotalizerAnalysis(None, None, None, 'no_data', False)
    if len(points) < 2:
        only_value = points[0][1]
        return TotalizerAnalysis(None, only_value, only_value, 'insufficient_samples', False)

    discarded: list[dict[str, Any]] = []
    previous = points[0][1]
    for stamp, current in points[1:]:
        if current < previous:
            discarded.append(_event(sensor_id, stamp, previous, current, 'reinicio_o_caida_de_totalizador'))
        previous = current

    opening = points[0][1]
    closing = points[-1][1]
    if discarded or closing < opening:
        return TotalizerAnalysis(
            None,
            opening,
            closing,
            'invalid_totalizer',
            False,
            tuple(discarded),
        )

    volume = round(closing - opening, 6)
    return TotalizerAnalysis(
        volume,
        opening,
        closing,
        'operational' if volume > 0 else 'zero_consumption',
        True,
        tuple(discarded),
    )
