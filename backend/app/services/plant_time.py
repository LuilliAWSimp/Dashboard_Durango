"""Durango plant-clock helpers.

Durango mixes timestamp conventions by source:
- dbo.SensorsBOS_Pozo and dbo.SensorsBOS_Linea expose local plant wall-clock time.
- dbo.SensorsBOS_Lavadoras and dbo.SensorsBOS_Tanque expose UTC.

These helpers keep the conversion explicit so local sources are never shifted by
six hours and UTC sources are converted exactly once.
"""
from __future__ import annotations

from datetime import date, datetime, time, timezone
from typing import Any
from zoneinfo import ZoneInfo

from app.services.durango_capabilities import LOCAL_TIMEZONE

LOCAL_ZONE = ZoneInfo(LOCAL_TIMEZONE)
SOURCE_ZONE = timezone.utc


def parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if value in (None, ''):
        return None
    raw = str(value).strip()
    if raw.endswith('Z'):
        raw = raw[:-1] + '+00:00'
    for candidate in (raw, raw[:19]):
        try:
            return datetime.fromisoformat(candidate)
        except ValueError:
            continue
    return None


def local_now() -> datetime:
    return datetime.now(LOCAL_ZONE)


def local_now_naive() -> datetime:
    return local_now().replace(tzinfo=None)


def _is_local_source(source_timezone: str | None) -> bool:
    normalized = str(source_timezone or 'UTC').strip().lower()
    return normalized in {'local', 'plant', 'localtime', LOCAL_TIMEZONE.lower()}


def source_to_local_naive(value: Any, source_timezone: str | None = 'UTC') -> datetime | None:
    """Normalize a source timestamp to naive Durango local time.

    Naive UTC-source values are interpreted as UTC. Naive local-source values are
    preserved as the plant wall clock. Aware values retain their declared offset.
    """
    parsed = parse_datetime(value)
    if parsed is None:
        return None
    if parsed.tzinfo is not None:
        return parsed.astimezone(LOCAL_ZONE).replace(tzinfo=None)
    if _is_local_source(source_timezone):
        return parsed.replace(tzinfo=None)
    return parsed.replace(tzinfo=SOURCE_ZONE).astimezone(LOCAL_ZONE).replace(tzinfo=None)


def local_to_source_naive(value: datetime, source_timezone: str | None = 'UTC') -> datetime:
    """Convert a Durango-local datetime to the wall clock used by a source."""
    aware = value.replace(tzinfo=LOCAL_ZONE) if value.tzinfo is None else value.astimezone(LOCAL_ZONE)
    if _is_local_source(source_timezone):
        return aware.replace(tzinfo=None)
    return aware.astimezone(SOURCE_ZONE).replace(tzinfo=None)


def source_iso_local(value: Any, source_timezone: str | None = 'UTC') -> str | None:
    parsed = source_to_local_naive(value, source_timezone)
    return parsed.isoformat(timespec='seconds') if parsed is not None else None


def requested_day_end(day: date) -> datetime:
    return datetime.combine(day, time.max)


def effective_local_end(requested_end: datetime, *, now: datetime | None = None) -> datetime:
    """Clamp a requested local end to the current Durango time."""
    current = now or local_now_naive()
    if current.tzinfo is not None:
        current = current.astimezone(LOCAL_ZONE).replace(tzinfo=None)
    requested = requested_end
    if requested.tzinfo is not None:
        requested = requested.astimezone(LOCAL_ZONE).replace(tzinfo=None)
    return min(requested, current)


def is_future_interval(bucket_start: datetime, effective_end: datetime) -> bool:
    return bucket_start >= effective_end
