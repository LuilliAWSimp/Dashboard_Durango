from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import logging
from typing import Any, Iterable, Sequence

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TotalizerValidationConfig:
    """Central tolerances for physical totalizer validation.

    The limits are deliberately expressed in engineering terms instead of as a
    fixed maximum increment. This allows delayed/accumulated totalizer updates
    to be accepted when they are coherent with the flow and elapsed time.
    """

    totalizer_noise_tolerance_m3: float = 0.001
    absolute_volume_tolerance_m3: float = 3.0
    relative_volume_tolerance: float = 0.40
    zero_flow_expected_threshold_m3: float = 0.05
    # Small totalizer updates can arrive asynchronously with respect to the
    # instantaneous flow sample. Keep the tolerance aligned with the general
    # absolute engineering tolerance so normal batched PLC updates are not
    # classified as discontinuities.
    zero_flow_increment_tolerance_m3: float = 3.0
    max_flow_gap_seconds: float = 300.0
    minimum_flow_coverage_ratio: float = 0.50


DEFAULT_VALIDATION_CONFIG = TotalizerValidationConfig()


@dataclass(frozen=True)
class TotalizerAnalysis:
    volume_m3: float | None
    opening_m3: float | None
    closing_m3: float | None
    status: str
    reliable: bool
    validated_volume_m3: float | None = None
    discarded_volume_m3: float = 0.0
    discarded_totalizer_events: int = 0
    has_discontinuities: bool = False
    discarded_events: tuple[dict[str, Any], ...] = ()
    flow_validation_available: bool = False

    @property
    def volume_reliable(self) -> bool:
        return self.reliable


@dataclass(frozen=True)
class _Reading:
    timestamp: datetime
    total_value: float | None
    instant_value: float | None


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
            return datetime.fromisoformat(candidate).replace(tzinfo=None)
        except ValueError:
            continue
    return None


def _tuple_parts(reading: Sequence[Any]) -> tuple[Any, Any, Any]:
    raw_time = reading[0] if len(reading) > 0 else None
    raw_total = reading[1] if len(reading) > 1 else None
    raw_flow = reading[2] if len(reading) > 2 else None
    return raw_time, raw_total, raw_flow


def _normalized_readings(readings: Iterable[dict[str, Any] | Sequence[Any]]) -> list[_Reading]:
    normalized: list[_Reading] = []
    for position, reading in enumerate(readings):
        if isinstance(reading, dict):
            raw_time = (
                reading.get('timestamp')
                or reading.get('reading_ts')
                or reading.get('operational_ts')
                or reading.get('ts_local')
                or reading.get('ts_minute')
                or reading.get('bucket_start')
            )
            raw_total = reading.get('total_value')
            if raw_total is None:
                raw_total = reading.get('totalizer')
            if raw_total is None:
                raw_total = reading.get('total_open')
            raw_flow = reading.get('instant_value')
            if raw_flow is None:
                raw_flow = reading.get('flow_value')
            if raw_flow is None:
                raw_flow = reading.get('flow_avg')
            if raw_flow is None:
                raw_flow = reading.get('flow_lps')
        else:
            raw_time, raw_total, raw_flow = _tuple_parts(reading)

        stamp = _timestamp(raw_time) or datetime.min.replace(microsecond=min(position, 999999))
        total_value = _number(raw_total)
        flow_value = _number(raw_flow)
        if total_value is not None and total_value < 0:
            total_value = None
        if flow_value is not None and flow_value < 0:
            flow_value = None
        normalized.append(_Reading(stamp, total_value, flow_value))

    normalized.sort(key=lambda item: item.timestamp)
    has_positive_totalizer = any((item.total_value or 0) > 0 for item in normalized)
    if has_positive_totalizer:
        # Keep the flow sample and timestamp, but ignore an isolated zero as a
        # totalizer reading. This avoids losing flow coverage during a temporary
        # zero communication value.
        normalized = [
            _Reading(item.timestamp, None if item.total_value == 0 else item.total_value, item.instant_value)
            for item in normalized
        ]
    return normalized


def _normalized_unit(flow_unit: str | None) -> str:
    return str(flow_unit or '').strip().lower().replace(' ', '').replace('³', '3')


def _flow_volume_m3(flow_value: float, seconds: float, flow_unit: str | None) -> float | None:
    unit = _normalized_unit(flow_unit)
    if unit in {'l/s', 'lps', 'litros/s', 'litro/s'}:
        return max(flow_value, 0.0) * seconds / 1000.0
    if unit in {'m3/h', 'm3h', 'm3/hr'}:
        return max(flow_value, 0.0) * seconds / 3600.0
    return None


def _event(
    *,
    sensor_id: int | None,
    stamp: datetime,
    previous: float,
    current: float,
    expected_volume_m3: float | None,
    elapsed_seconds: float,
    reason: str,
) -> dict[str, Any]:
    increment = current - previous
    event = {
        'sensor_id': sensor_id,
        'timestamp': stamp.isoformat(timespec='seconds'),
        'previous_totalizer_m3': round(previous, 6),
        'new_totalizer_m3': round(current, 6),
        'increment_m3': round(increment, 6),
        'expected_flow_volume_m3': None if expected_volume_m3 is None else round(expected_volume_m3, 6),
        'elapsed_seconds': round(max(elapsed_seconds, 0.0), 3),
        'reason': reason,
        # Backward-compatible aliases used by existing diagnostics.
        'previous': round(previous, 6),
        'current': round(current, 6),
        'difference': round(increment, 6),
    }
    logger.warning(
        'totalizer discard sensor=%s timestamp=%s previous=%s current=%s increment=%s expected_flow_volume=%s elapsed_seconds=%s reason=%s',
        sensor_id,
        event['timestamp'],
        event['previous_totalizer_m3'],
        event['new_totalizer_m3'],
        event['increment_m3'],
        event['expected_flow_volume_m3'],
        event['elapsed_seconds'],
        reason,
    )
    return event


def _is_increment_compatible(
    increment_m3: float,
    expected_volume_m3: float,
    *,
    config: TotalizerValidationConfig,
) -> bool:
    if expected_volume_m3 <= config.zero_flow_expected_threshold_m3:
        return increment_m3 <= config.zero_flow_increment_tolerance_m3
    tolerance = max(
        config.absolute_volume_tolerance_m3,
        expected_volume_m3 * config.relative_volume_tolerance,
    )
    return abs(increment_m3 - expected_volume_m3) <= tolerance


def analyze_totalizer_series(
    readings: Iterable[dict[str, Any] | Sequence[Any]],
    *,
    sensor_id: int | None = None,
    flow_unit: str | None = None,
    require_flow_validation: bool = False,
    config: TotalizerValidationConfig = DEFAULT_VALIDATION_CONFIG,
) -> TotalizerAnalysis:
    """Validate totalizer increments against integrated flow.

    Positive totalizer updates are evaluated one by one. The expected volume is
    integrated from the registered flow since the previous totalizer update.
    This accepts coherent accumulated updates and discards physically impossible
    jumps without relying on a fixed maximum increment.
    """

    rows = _normalized_readings(readings)
    total_indexes = [index for index, row in enumerate(rows) if row.total_value is not None]
    if not total_indexes:
        return TotalizerAnalysis(None, None, None, 'no_data', False)

    first_index = total_indexes[0]
    first = rows[first_index]
    opening = first.total_value
    if opening is None:
        return TotalizerAnalysis(None, None, None, 'no_data', False)

    total_observations = 1
    last_total = opening
    closing = opening
    last_total_update_ts = first.timestamp
    previous_row = first
    expected_since_update = 0.0
    covered_flow_seconds = 0.0
    validated_volume = 0.0
    discarded_volume = 0.0
    discarded: list[dict[str, Any]] = []
    flow_validation_seen = False
    accepted_change_count = 0

    for row in rows[first_index + 1:]:
        elapsed_sample = max((row.timestamp - previous_row.timestamp).total_seconds(), 0.0)
        if 0 < elapsed_sample <= config.max_flow_gap_seconds:
            # The SCADA totalizer and instantaneous flow are not guaranteed to
            # update in the same acquisition cycle. Using only the previous
            # flow sample creates a one-minute phase bias at starts/stops. A
            # trapezoidal estimate is symmetric and remains conservative when
            # only one endpoint has flow data.
            endpoint_flows = [
                value
                for value in (previous_row.instant_value, row.instant_value)
                if value is not None
            ]
            if endpoint_flows:
                representative_flow = sum(endpoint_flows) / len(endpoint_flows)
                integrated = _flow_volume_m3(representative_flow, elapsed_sample, flow_unit)
                if integrated is not None:
                    expected_since_update += integrated
                    covered_flow_seconds += elapsed_sample
                    flow_validation_seen = True
        previous_row = row

        if row.total_value is None:
            continue
        total_observations += 1
        closing = row.total_value
        increment = row.total_value - last_total
        if abs(increment) <= config.totalizer_noise_tolerance_m3:
            continue

        elapsed_since_update = max((row.timestamp - last_total_update_ts).total_seconds(), 0.0)
        coverage_ratio = covered_flow_seconds / elapsed_since_update if elapsed_since_update > 0 else 0.0
        physical_validation_available = (
            _flow_volume_m3(0.0, 1.0, flow_unit) is not None
            and covered_flow_seconds > 0
            and coverage_ratio >= config.minimum_flow_coverage_ratio
        )

        reject_reason: str | None = None
        if increment < -config.totalizer_noise_tolerance_m3:
            reject_reason = 'reinicio_o_caida_de_totalizador'
        elif require_flow_validation and not physical_validation_available:
            reject_reason = 'flujo_insuficiente_para_validar_incremento'
        elif require_flow_validation and physical_validation_available and not _is_increment_compatible(
            increment,
            expected_since_update,
            config=config,
        ):
            if expected_since_update <= config.zero_flow_expected_threshold_m3:
                reject_reason = 'incremento_incompatible_con_flujo_cero'
            else:
                reject_reason = 'incremento_incompatible_con_flujo_y_tiempo'

        if reject_reason is not None:
            discarded.append(_event(
                sensor_id=sensor_id,
                stamp=row.timestamp,
                previous=last_total,
                current=row.total_value,
                expected_volume_m3=expected_since_update if physical_validation_available else None,
                elapsed_seconds=elapsed_since_update,
                reason=reject_reason,
            ))
            if increment > 0:
                discarded_volume += increment
        else:
            validated_volume += max(increment, 0.0)
            if increment > config.totalizer_noise_tolerance_m3:
                accepted_change_count += 1

        # Rebase after every observed totalizer change. A rejected discontinuity
        # must not poison all later, physically coherent increments.
        last_total = row.total_value
        last_total_update_ts = row.timestamp
        expected_since_update = 0.0
        covered_flow_seconds = 0.0

    if total_observations < 2:
        return TotalizerAnalysis(
            None,
            opening,
            closing,
            'insufficient_samples',
            False,
            validated_volume_m3=None,
            discarded_volume_m3=round(discarded_volume, 6),
            discarded_totalizer_events=len(discarded),
            has_discontinuities=bool(discarded),
            discarded_events=tuple(discarded),
            flow_validation_available=flow_validation_seen,
        )

    validated_volume = round(validated_volume, 6)
    discarded_volume = round(discarded_volume, 6)
    has_discontinuities = bool(discarded)
    reliable = not has_discontinuities
    if has_discontinuities:
        status = 'invalid_totalizer'
    elif validated_volume > config.totalizer_noise_tolerance_m3 or accepted_change_count > 0:
        status = 'operational'
    else:
        status = 'zero_consumption'

    return TotalizerAnalysis(
        validated_volume,
        opening,
        closing,
        status,
        reliable,
        validated_volume_m3=validated_volume,
        discarded_volume_m3=discarded_volume,
        discarded_totalizer_events=len(discarded),
        has_discontinuities=has_discontinuities,
        discarded_events=tuple(discarded),
        flow_validation_available=flow_validation_seen,
    )
