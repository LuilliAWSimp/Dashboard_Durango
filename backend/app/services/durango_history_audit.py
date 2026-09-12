"""Auditoria historica de solo lectura para Dashboard ARCA Durango.

Este modulo no modifica datos ni cambia la logica operativa del dashboard.
Su objetivo es producir un diagnostico reproducible antes de homologar
conciliacion, historicos, reportes y coberturas.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Any, Iterable
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.database import SessionLocal
from app.services.durango_capabilities import (
    DURANGO_SCADA_CUTOVER_LOCAL,
    JARABES_CHANNEL_CUTOVER_LOCAL,
    JARABES_SOURCE_SEGMENTS,
    LAVADORAS,
    LINE_FLOWS,
    LINES,
    LOCAL_TIMEZONE,
    POZO_1_FLOW_CALIBRATION_CUTOFF_LOCAL,
    WELLS,
)
from app.services.plant_time import local_now_naive, source_to_local_naive

LOCAL_ZONE = ZoneInfo(LOCAL_TIMEZONE)
DEFAULT_COVERAGE_THRESHOLD = 95.0


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None).isoformat(sep=' ', timespec='seconds')
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _dt(value: Any) -> datetime | None:
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


def _number(value: Any) -> float | None:
    if value in (None, ''):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def _source_to_local(value: Any, source_timezone: str) -> datetime | None:
    return source_to_local_naive(value, source_timezone)


def _object_exists(session: Any, object_name: str) -> bool:
    try:
        return bool(
            session.execute(
                text("SELECT CASE WHEN OBJECT_ID(:name, 'U') IS NULL THEN 0 ELSE 1 END"),
                {'name': object_name},
            ).scalar()
        )
    except SQLAlchemyError:
        return False


def _expected_minutes_for_day(day: date, *, audit_start: datetime, audit_end: datetime) -> int:
    day_start = datetime.combine(day, time.min)
    day_end = day_start + timedelta(days=1)
    effective_start = max(day_start, audit_start)
    effective_end = min(day_end, audit_end)
    if effective_end <= effective_start:
        return 0
    return max(int((effective_end - effective_start).total_seconds() // 60), 1)


def _date_range(start: date, end: date) -> Iterable[date]:
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def _status_for_coverage(samples: int, expected: int, threshold: float) -> str:
    if expected <= 0:
        return 'outside_window'
    if samples <= 0:
        return 'missing'
    pct = samples * 100.0 / expected
    if pct >= threshold:
        return 'complete'
    return 'partial'


def _iot_contracts() -> list[dict[str, Any]]:
    # Lavadoras y Jarabes tienen fuente BOS dedicada y se auditan aparte.
    return [*WELLS, *LINES, *LINE_FLOWS]


def _iot_summary(session: Any, contracts: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    sensor_ids = [int(item['sensor_id']) for item in contracts if item.get('sensor_id') is not None]
    if not sensor_ids or not _object_exists(session, 'iot.readings_minute'):
        return {}
    placeholders = ','.join(str(sensor_id) for sensor_id in sorted(set(sensor_ids)))
    sql = text(f"""
        SELECT
            sensor_id,
            MIN(COALESCE(ts_local, ts_minute, inserted_at)) AS first_physical,
            MAX(COALESCE(ts_local, ts_minute, inserted_at)) AS last_physical,
            COUNT_BIG(*) AS samples,
            MIN(CASE
                WHEN TRY_CONVERT(float, instant_value) IS NOT NULL
                 AND TRY_CONVERT(float, instant_value) <> 0
                THEN COALESCE(ts_local, ts_minute, inserted_at)
            END) AS first_nonzero_flow,
            MIN(CASE
                WHEN TRY_CONVERT(float, total_value) IS NOT NULL
                 AND TRY_CONVERT(float, total_value) > 0
                THEN COALESCE(ts_local, ts_minute, inserted_at)
            END) AS first_positive_totalizer
        FROM iot.readings_minute
        WHERE sensor_id IN ({placeholders})
        GROUP BY sensor_id
        ORDER BY sensor_id
    """)
    rows = session.execute(sql).fetchall()
    return {str(int(row._mapping['sensor_id'])): dict(row._mapping) for row in rows}


def _iot_daily_counts(
    session: Any,
    contracts: list[dict[str, Any]],
    start_local: datetime,
    end_local: datetime,
) -> dict[str, dict[date, int]]:
    sensor_ids = [int(item['sensor_id']) for item in contracts if item.get('sensor_id') is not None]
    if not sensor_ids or not _object_exists(session, 'iot.readings_minute'):
        return {}
    placeholders = ','.join(str(sensor_id) for sensor_id in sorted(set(sensor_ids)))
    sql = text(f"""
        SELECT
            sensor_id,
            CAST(COALESCE(ts_local, ts_minute, inserted_at) AS date) AS reading_day,
            COUNT_BIG(*) AS samples
        FROM iot.readings_minute
        WHERE sensor_id IN ({placeholders})
          AND COALESCE(ts_local, ts_minute, inserted_at) >= :start_local
          AND COALESCE(ts_local, ts_minute, inserted_at) < :end_local
        GROUP BY sensor_id, CAST(COALESCE(ts_local, ts_minute, inserted_at) AS date)
        ORDER BY reading_day, sensor_id
    """)
    grouped: dict[str, dict[date, int]] = defaultdict(dict)
    for row in session.execute(sql, {'start_local': start_local, 'end_local': end_local}).fetchall():
        mapped = row._mapping
        grouped[str(int(mapped['sensor_id']))][mapped['reading_day']] = int(mapped['samples'] or 0)
    return grouped


def _lavadora_summary(session: Any, contract: dict[str, Any]) -> dict[str, Any]:
    table = str(contract['table'])
    if not _object_exists(session, table):
        return {'error': f'No existe {table}.'}
    instant_column = str(contract['instant_column'])
    total_column = str(contract['total_column'])
    sql = text(f"""
        SELECT
            MIN(Time_Stamp) AS first_physical,
            MAX(Time_Stamp) AS last_physical,
            COUNT_BIG(*) AS samples,
            MIN(CASE
                WHEN TRY_CONVERT(float, {instant_column}) IS NOT NULL
                 AND TRY_CONVERT(float, {instant_column}) <> 0
                THEN Time_Stamp
            END) AS first_nonzero_flow,
            MIN(CASE
                WHEN TRY_CONVERT(float, {total_column}) IS NOT NULL
                 AND TRY_CONVERT(float, {total_column}) > 0
                THEN Time_Stamp
            END) AS first_positive_totalizer
        FROM {table}
        WHERE Time_Stamp >= :cutover_utc
    """)
    cutover_utc = DURANGO_SCADA_CUTOVER_LOCAL.replace(tzinfo=LOCAL_ZONE).astimezone(ZoneInfo('UTC')).replace(tzinfo=None)
    row = session.execute(sql, {'cutover_utc': cutover_utc}).fetchone()
    return dict(row._mapping) if row else {}


def _lavadora_daily_counts(
    session: Any,
    contract: dict[str, Any],
    start_local: datetime,
    end_local: datetime,
) -> dict[date, int]:
    table = str(contract['table'])
    if not _object_exists(session, table):
        return {}
    instant_column = str(contract['instant_column'])
    total_column = str(contract['total_column'])
    start_utc = start_local.replace(tzinfo=LOCAL_ZONE).astimezone(ZoneInfo('UTC')).replace(tzinfo=None)
    end_utc = end_local.replace(tzinfo=LOCAL_ZONE).astimezone(ZoneInfo('UTC')).replace(tzinfo=None)
    # Mexico City no usa DST en el contrato actual, pero la ventana se convierte
    # con zoneinfo. El agrupamiento usa el offset del inicio de cada ventana.
    offset_minutes = int((start_local.replace(tzinfo=LOCAL_ZONE).utcoffset() or timedelta()).total_seconds() // 60)
    sql = text(f"""
        WITH normalized AS (
            SELECT
                CAST(DATEADD(minute, :offset_minutes, Time_Stamp) AS date) AS reading_day,
                CASE
                    WHEN TRY_CONVERT(float, {instant_column}) IS NOT NULL
                      OR TRY_CONVERT(float, {total_column}) IS NOT NULL
                    THEN 1 ELSE 0
                END AS sample_ok
            FROM {table}
            WHERE Time_Stamp >= :start_utc
              AND Time_Stamp < :end_utc
        )
        SELECT
            reading_day,
            SUM(sample_ok) AS samples
        FROM normalized
        GROUP BY reading_day
        ORDER BY reading_day
    """)
    result: dict[date, int] = {}
    for row in session.execute(
        sql,
        {'offset_minutes': offset_minutes, 'start_utc': start_utc, 'end_utc': end_utc},
    ).fetchall():
        result[row._mapping['reading_day']] = int(row._mapping['samples'] or 0)
    return result


def _jarabes_segment_summary(session: Any, segment: dict[str, Any]) -> dict[str, Any]:
    table = 'dbo.SensorsBOS_Tanque'
    if not _object_exists(session, table):
        return {'error': f'No existe {table}.'}
    sensor_column = str(segment['sensor_column'])
    instant_column = str(segment['instant_column'])
    total_column = str(segment['total_column'])
    where = [
        'Time_Stamp >= :start_utc',
        f'(TRY_CONVERT(int, {sensor_column}) = :sensor_id OR TRY_CONVERT(int, {sensor_column}) IS NULL)',
    ]
    params: dict[str, Any] = {
        'start_utc': segment.get('start_utc') or datetime(1900, 1, 1),
        'sensor_id': int(segment['sensor_id']),
    }
    if segment.get('end_utc') is not None:
        where.append('Time_Stamp < :end_utc')
        params['end_utc'] = segment['end_utc']
    sql = text(f"""
        SELECT
            MIN(Time_Stamp) AS first_physical,
            MAX(Time_Stamp) AS last_physical,
            COUNT_BIG(*) AS samples,
            MIN(CASE
                WHEN TRY_CONVERT(float, {instant_column}) IS NOT NULL
                 AND TRY_CONVERT(float, {instant_column}) <> 0
                THEN Time_Stamp
            END) AS first_nonzero_flow,
            MIN(CASE
                WHEN TRY_CONVERT(float, {total_column}) IS NOT NULL
                 AND TRY_CONVERT(float, {total_column}) > 0
                THEN Time_Stamp
            END) AS first_positive_totalizer
        FROM {table}
        WHERE {' AND '.join(where)}
    """)
    row = session.execute(sql, params).fetchone()
    return dict(row._mapping) if row else {}


def _jarabes_daily_counts(
    session: Any,
    start_local: datetime,
    end_local: datetime,
) -> dict[date, int]:
    table = 'dbo.SensorsBOS_Tanque'
    if not _object_exists(session, table):
        return {}
    start_utc = start_local.replace(tzinfo=LOCAL_ZONE).astimezone(ZoneInfo('UTC')).replace(tzinfo=None)
    end_utc = end_local.replace(tzinfo=LOCAL_ZONE).astimezone(ZoneInfo('UTC')).replace(tzinfo=None)
    offset_minutes = int((start_local.replace(tzinfo=LOCAL_ZONE).utcoffset() or timedelta()).total_seconds() // 60)
    merged: dict[date, int] = defaultdict(int)
    for segment in JARABES_SOURCE_SEGMENTS:
        segment_start = max(start_utc, segment.get('start_utc') or datetime.min)
        segment_end = min(end_utc, segment.get('end_utc') or datetime.max)
        if segment_end <= segment_start:
            continue
        sensor_column = str(segment['sensor_column'])
        instant_column = str(segment['instant_column'])
        total_column = str(segment['total_column'])
        sql = text(f"""
            WITH normalized AS (
                SELECT
                    CAST(DATEADD(minute, :offset_minutes, Time_Stamp) AS date) AS reading_day,
                    CASE
                        WHEN TRY_CONVERT(float, {instant_column}) IS NOT NULL
                          OR TRY_CONVERT(float, {total_column}) IS NOT NULL
                        THEN 1 ELSE 0
                    END AS sample_ok
                FROM {table}
                WHERE Time_Stamp >= :start_utc
                  AND Time_Stamp < :end_utc
                  AND (TRY_CONVERT(int, {sensor_column}) = :sensor_id OR TRY_CONVERT(int, {sensor_column}) IS NULL)
            )
            SELECT
                reading_day,
                SUM(sample_ok) AS samples
            FROM normalized
            GROUP BY reading_day
            ORDER BY reading_day
        """)
        for row in session.execute(
            sql,
            {
                'offset_minutes': offset_minutes,
                'start_utc': segment_start,
                'end_utc': segment_end,
                'sensor_id': int(segment['sensor_id']),
            },
        ).fetchall():
            merged[row._mapping['reading_day']] += int(row._mapping['samples'] or 0)
    return dict(merged)


def _merge_jarabes_summaries(segment_summaries: list[dict[str, Any]]) -> dict[str, Any]:
    clean = [item for item in segment_summaries if item and not item.get('error')]
    if not clean:
        return {'error': 'No fue posible leer los segmentos de Jarabes.'}
    first_values = [_dt(item.get('first_physical')) for item in clean]
    last_values = [_dt(item.get('last_physical')) for item in clean]
    flow_values = [_dt(item.get('first_nonzero_flow')) for item in clean]
    total_values = [_dt(item.get('first_positive_totalizer')) for item in clean]
    return {
        'first_physical': min((value for value in first_values if value), default=None),
        'last_physical': max((value for value in last_values if value), default=None),
        'samples': sum(int(item.get('samples') or 0) for item in clean),
        'first_nonzero_flow': min((value for value in flow_values if value), default=None),
        'first_positive_totalizer': min((value for value in total_values if value), default=None),
    }


def _coverage_rows(
    counts: dict[date, int],
    *,
    audit_start: datetime,
    audit_end: datetime,
    threshold: float,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for day in _date_range(audit_start.date(), (audit_end - timedelta(microseconds=1)).date()):
        expected = _expected_minutes_for_day(day, audit_start=audit_start, audit_end=audit_end)
        samples = int(counts.get(day, 0))
        pct = round(samples * 100.0 / expected, 2) if expected else 0.0
        rows.append({
            'day': day.isoformat(),
            'samples': samples,
            'expected_samples': expected,
            'coverage_percent': pct,
            'status': _status_for_coverage(samples, expected, threshold),
        })
    return rows


def _known_cutovers() -> list[dict[str, Any]]:
    return [
        {
            'key': 'scada_general',
            'label': 'Corte general SCADA / inicio del segmento validado',
            'local': _iso(DURANGO_SCADA_CUTOVER_LOCAL),
            'scope': 'planta',
        },
        {
            'key': 'pozo_1_flow_calibration',
            'label': 'Pozo 1 cambia de flujo raw m3/h a L/s',
            'local': _iso(POZO_1_FLOW_CALIBRATION_CUTOFF_LOCAL),
            'scope': 'pozo_1',
        },
        {
            'key': 'jarabes_channel_cutover',
            'label': 'Jarabes cambia de TANQUE_FLOW_IN[4] / 3010 a TANQUE_FLOW_IN[1] / 3004',
            'local': _iso(JARABES_CHANNEL_CUTOVER_LOCAL),
            'scope': 'jarabes',
        },
    ]


def run_history_audit(
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    coverage_threshold: float = DEFAULT_COVERAGE_THRESHOLD,
) -> dict[str, Any]:
    """Run the read-only historical audit and return a serializable payload."""
    now = local_now_naive()
    audit_start = datetime.combine(start_date or DURANGO_SCADA_CUTOVER_LOCAL.date(), time.min)
    if audit_start.date() == DURANGO_SCADA_CUTOVER_LOCAL.date():
        audit_start = max(audit_start, DURANGO_SCADA_CUTOVER_LOCAL)
    requested_end = end_date or now.date()
    audit_end = datetime.combine(requested_end + timedelta(days=1), time.min)
    if requested_end >= now.date():
        audit_end = min(audit_end, now.replace(second=0, microsecond=0) + timedelta(minutes=1))
    if audit_end <= audit_start:
        raise ValueError('El fin de auditoria debe ser posterior al inicio.')

    elements: list[dict[str, Any]] = []
    with SessionLocal() as session:
        iot_contracts = _iot_contracts()
        iot_summaries = _iot_summary(session, iot_contracts)
        iot_counts = _iot_daily_counts(session, iot_contracts, audit_start, audit_end)

        for contract in iot_contracts:
            key = str(contract['operational_key'])
            sensor_id = int(contract['sensor_id'])
            summary = iot_summaries.get(str(sensor_id), {})
            elements.append({
                'operational_key': key,
                'name': str(contract['display_name']),
                'module': str(contract['group']),
                'sensor_id': sensor_id,
                'source': 'iot.readings_minute',
                'source_timezone': str(contract.get('source_timestamp_timezone') or LOCAL_TIMEZONE),
                'first_physical_local': _iso(_source_to_local(summary.get('first_physical'), str(contract.get('source_timestamp_timezone') or LOCAL_TIMEZONE))),
                'last_physical_local': _iso(_source_to_local(summary.get('last_physical'), str(contract.get('source_timestamp_timezone') or LOCAL_TIMEZONE))),
                'first_nonzero_flow_local': _iso(_source_to_local(summary.get('first_nonzero_flow'), str(contract.get('source_timestamp_timezone') or LOCAL_TIMEZONE))),
                'first_positive_totalizer_local': _iso(_source_to_local(summary.get('first_positive_totalizer'), str(contract.get('source_timestamp_timezone') or LOCAL_TIMEZONE))),
                'samples_total': int(summary.get('samples') or 0),
                'validated_segment_from_local': _iso(DURANGO_SCADA_CUTOVER_LOCAL),
                'coverage': _coverage_rows(
                    iot_counts.get(str(sensor_id), {}),
                    audit_start=audit_start,
                    audit_end=audit_end,
                    threshold=coverage_threshold,
                ),
            })

        for contract in LAVADORAS:
            summary = _lavadora_summary(session, contract)
            key = str(contract['operational_key'])
            source_timezone = str(contract.get('source_timestamp_timezone') or 'UTC')
            counts = _lavadora_daily_counts(session, contract, audit_start, audit_end)
            elements.append({
                'operational_key': key,
                'name': str(contract['display_name']),
                'module': 'flow',
                'sensor_id': None,
                'source': str(contract['table']),
                'source_timezone': source_timezone,
                'first_physical_local': _iso(_source_to_local(summary.get('first_physical'), source_timezone)),
                'last_physical_local': _iso(_source_to_local(summary.get('last_physical'), source_timezone)),
                'first_nonzero_flow_local': _iso(_source_to_local(summary.get('first_nonzero_flow'), source_timezone)),
                'first_positive_totalizer_local': _iso(_source_to_local(summary.get('first_positive_totalizer'), source_timezone)),
                'samples_total': int(summary.get('samples') or 0),
                'validated_segment_from_local': _iso(DURANGO_SCADA_CUTOVER_LOCAL),
                'error': summary.get('error'),
                'coverage': _coverage_rows(
                    counts,
                    audit_start=audit_start,
                    audit_end=audit_end,
                    threshold=coverage_threshold,
                ),
            })

        segment_summaries = [_jarabes_segment_summary(session, segment) for segment in JARABES_SOURCE_SEGMENTS]
        jarabes_summary = _merge_jarabes_summaries(segment_summaries)
        jarabes_counts = _jarabes_daily_counts(session, audit_start, audit_end)
        elements.append({
            'operational_key': 'jarabes',
            'name': 'Jarabes',
            'module': 'flow',
            'sensor_id': 3004,
            'sensor_aliases': [3010, 3004],
            'source': 'dbo.SensorsBOS_Tanque',
            'source_timezone': 'UTC',
            'first_physical_local': _iso(_source_to_local(jarabes_summary.get('first_physical'), 'UTC')),
            'last_physical_local': _iso(_source_to_local(jarabes_summary.get('last_physical'), 'UTC')),
            'first_nonzero_flow_local': _iso(_source_to_local(jarabes_summary.get('first_nonzero_flow'), 'UTC')),
            'first_positive_totalizer_local': _iso(_source_to_local(jarabes_summary.get('first_positive_totalizer'), 'UTC')),
            'samples_total': int(jarabes_summary.get('samples') or 0),
            'validated_segment_from_local': _iso(DURANGO_SCADA_CUTOVER_LOCAL),
            'channel_cutover_local': _iso(JARABES_CHANNEL_CUTOVER_LOCAL),
            'error': jarabes_summary.get('error'),
            'coverage': _coverage_rows(
                jarabes_counts,
                audit_start=audit_start,
                audit_end=audit_end,
                threshold=coverage_threshold,
            ),
        })

    problem_days: dict[str, list[dict[str, Any]]] = {}
    for element in elements:
        problems = [row for row in element['coverage'] if row['status'] in {'partial', 'missing'}]
        problem_days[str(element['operational_key'])] = problems

    return {
        'plant': 'Durango',
        'generated_at_local': _iso(now),
        'timezone': LOCAL_TIMEZONE,
        'audit_window': {
            'start_local': _iso(audit_start),
            'end_local_exclusive': _iso(audit_end),
            'coverage_threshold_percent': float(coverage_threshold),
        },
        'known_cutovers': _known_cutovers(),
        'contract_recommendation': {
            'validated_history_start_local': _iso(DURANGO_SCADA_CUTOVER_LOCAL),
            'rule': 'No relabelar ni mezclar datos anteriores al corte general de SCADA con el segmento validado posterior.',
            'pozo_1_flow_rule': 'Antes del corte de calibracion dividir el flujo raw entre 3.6; desde el corte usar L/s directo.',
            'jarabes_rule': 'Conservar una identidad operativa y resolver el canal fisico por segmento temporal.',
        },
        'elements': elements,
        'problem_days': problem_days,
    }


def render_audit_markdown(payload: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append('# Auditoria historica ARCA - Durango')
    lines.append('')
    lines.append(f"Generado: {payload.get('generated_at_local')} ({payload.get('timezone')})")
    window = payload.get('audit_window') or {}
    lines.append(f"Ventana: `{window.get('start_local')}` a `{window.get('end_local_exclusive')}` [fin exclusivo].")
    lines.append('')
    lines.append('## Cortes conocidos')
    lines.append('')
    lines.append('| Corte | Fecha local | Alcance |')
    lines.append('|---|---|---|')
    for item in payload.get('known_cutovers') or []:
        lines.append(f"| {item.get('label')} | {item.get('local')} | {item.get('scope')} |")
    lines.append('')
    lines.append('## Inicio y disponibilidad por elemento')
    lines.append('')
    lines.append('| Elemento | Fuente | Primer registro | Primer flujo != 0 | Primer totalizador > 0 | Muestras |')
    lines.append('|---|---|---|---|---|---:|')
    for item in payload.get('elements') or []:
        lines.append(
            '| {name} | {source} | {first} | {flow} | {total} | {samples} |'.format(
                name=item.get('name'),
                source=item.get('source'),
                first=item.get('first_physical_local') or 'Sin datos',
                flow=item.get('first_nonzero_flow_local') or 'Sin dato',
                total=item.get('first_positive_totalizer_local') or 'Sin dato',
                samples=item.get('samples_total') or 0,
            )
        )
    lines.append('')
    lines.append('## Cobertura incompleta')
    lines.append('')
    threshold = float(window.get('coverage_threshold_percent') or DEFAULT_COVERAGE_THRESHOLD)
    lines.append(f"Se listan dias con cobertura menor a {threshold:.2f}% o sin registros.")
    lines.append('')
    for item in payload.get('elements') or []:
        problems = [row for row in item.get('coverage') or [] if row.get('status') in {'partial', 'missing'}]
        if not problems:
            continue
        lines.append(f"### {item.get('name')}")
        lines.append('')
        lines.append('| Dia | Muestras | Esperadas | Cobertura | Estado |')
        lines.append('|---|---:|---:|---:|---|')
        for row in problems:
            label = 'Sin registros' if row.get('status') == 'missing' else 'Cobertura parcial'
            lines.append(
                f"| {row.get('day')} | {row.get('samples')} | {row.get('expected_samples')} | "
                f"{row.get('coverage_percent'):.2f}% | {label} |"
            )
        lines.append('')
    lines.append('## Interpretacion para la homologacion')
    lines.append('')
    recommendation = payload.get('contract_recommendation') or {}
    lines.append(f"- Inicio del segmento validado: `{recommendation.get('validated_history_start_local')}`.")
    lines.append(f"- {recommendation.get('rule')}")
    lines.append(f"- Pozo 1: {recommendation.get('pozo_1_flow_rule')}")
    lines.append(f"- Jarabes: {recommendation.get('jarabes_rule')}")
    lines.append('- Un dia sin registros debe conservarse como hueco; nunca convertirse en 0 m3.')
    lines.append('- Un dia parcial debe conservar su porcentaje de cobertura cuando se use en comparativos o reportes.')
    lines.append('')
    return '\n'.join(lines)
