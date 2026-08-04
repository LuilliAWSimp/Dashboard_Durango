"""Durango plant-clock helpers.

The operational sources currently expose timestamps in UTC while the dashboard
contract is expressed in the local plant clock.  This module centralizes the
conversion and the rule that current-day queries may never extend beyond the
local plant time.
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


def source_to_local_naive(value: Any) -> datetime | None:
    """Convert a source timestamp to naive Durango local time.

    Naive values from the operational sources are interpreted as UTC.  Aware
    values retain their declared offset and are converted to the plant zone.
    """
    parsed = parse_datetime(value)
    if parsed is None:
        return None
    aware = parsed.replace(tzinfo=SOURCE_ZONE) if parsed.tzinfo is None else parsed
    return aware.astimezone(LOCAL_ZONE).replace(tzinfo=None)


def local_to_source_naive(value: datetime) -> datetime:
    """Convert a naive/aware Durango-local datetime to naive UTC for SQL bounds."""
    aware = value.replace(tzinfo=LOCAL_ZONE) if value.tzinfo is None else value.astimezone(LOCAL_ZONE)
    return aware.astimezone(SOURCE_ZONE).replace(tzinfo=None)


def source_iso_local(value: Any) -> str | None:
    parsed = source_to_local_naive(value)
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
