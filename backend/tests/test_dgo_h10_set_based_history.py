"""H10: executable SQL contract tests using only Python's standard library.

Run from backend: python -m unittest discover -s tests -p 'test_dgo_h10*.py'
SQLite executes the real window/grouping/filter SQL after adapting only T-SQL
date/conversion/TOP syntax. This checks semantics, NOT a SQL Server query plan,
driver integration or production latency. No operational source is replaced.
"""
from __future__ import annotations

import ast
from collections import defaultdict
from datetime import datetime, timedelta
import logging
from pathlib import Path
import random
import sqlite3
import sys
from types import SimpleNamespace
import unittest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))


def load_history():
    path = BACKEND / 'app/services/water_history_service.py'
    tree = ast.parse(path.read_text(encoding='utf-8'))
    # Load actual domain code without starting an ODBC engine or requiring an
    # installed web stack. Source adapters are provided by this test harness.
    excluded = {
        'sqlalchemy', 'sqlalchemy.exc', 'app.database',
        'app.services.durango_lavadoras_service',
        'app.services.durango_jarabes_service',
        'app.services.durango_well_history_fallback',
        'app.services.water_bos_service',
    }
    tree.body = [node for node in tree.body
                 if not (isinstance(node, ast.ImportFrom) and node.module in excluded)]
    namespace = {'__name__': 'h10_isolated_history', 'text': str,
                 'SQLAlchemyError': sqlite3.Error, 'OperationalError': sqlite3.OperationalError}
    exec(compile(tree, str(path), 'exec'), namespace)
    return namespace


def number(value):
    try:
        return float(value) if value is not None else None
    except (ValueError, TypeError):
        return None


BUCKET = "DATEADD(minute, (DATEDIFF(minute, CONVERT(datetime2, '20000101'), reading_ts) / 15) * 15, CONVERT(datetime2, '20000101'))"


class SqlSession:
    def __init__(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.execute("ATTACH DATABASE ':memory:' AS iot")
        self.db.execute('CREATE TABLE iot.readings_minute (sensor_id INTEGER, ts_local TEXT, ts_minute TEXT, instant_value TEXT, total_value TEXT)')
        self.db.create_function('try_float', 1, number)
        self.db.create_function('quarter_bucket', 1, lambda value: datetime.fromisoformat(value).replace(
            minute=(datetime.fromisoformat(value).minute // 15) * 15, second=0, microsecond=0).isoformat(' '))
        self.statements = []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, statement, params=None):
        self.statements.append(statement)
        if 'OBJECT_ID' in statement:
            return SimpleNamespace(scalar=lambda: 1)
        sql = statement.replace(BUCKET, 'quarter_bucket(reading_ts)')
        sql = sql.replace('TRY_CONVERT(float, ', 'try_float(')
        if 'TOP (:max_rows)' in sql:
            sql = sql.replace('TOP (:max_rows)', '') + ' LIMIT :max_rows'
        values = {key: value.isoformat(' ') if isinstance(value, datetime) else value
                  for key, value in (params or {}).items()}
        rows = self.db.execute(sql, values).fetchall()
        return SimpleNamespace(fetchall=lambda: [SimpleNamespace(_mapping=dict(row)) for row in rows])

    def insert(self, rows):
        self.db.executemany('INSERT INTO iot.readings_minute VALUES (?, ?, ?, ?, ?)', rows)


class SetBasedHistoryH10Tests(unittest.TestCase):
    def setUp(self):
        quality_log = logging.getLogger('app.services.totalizer_quality')
        previous_level = quality_log.level
        quality_log.setLevel(logging.ERROR)
        self.addCleanup(quality_log.setLevel, previous_level)
        self.history = load_history()
        self.session = SqlSession()
        self.history['SessionLocal'] = lambda: self.session
        self.start = datetime(2026, 8, 11, 12)
        self.end = self.start + timedelta(hours=1)
        self.rows = []

    def tearDown(self):
        self.session.db.close()

    def add(self, sensor, minute, flow, total, *, fallback=False, other_clock=None):
        stamp = (self.start + timedelta(minutes=minute)).isoformat(' ')
        row = (sensor, None if fallback else stamp, stamp if fallback else other_clock, flow, total)
        self.rows.append(row)
        self.session.insert([row])

    def reference(self, ids, start=None, end=None):
        """Independent original TOP(1) ordering contract, including nonpositive fallback."""
        groups = defaultdict(list)
        for sensor, local, minute, raw_flow, raw_total in self.rows:
            stamp = datetime.fromisoformat(local or minute) if local or minute else None
            if sensor not in ids or stamp is None or not (start or self.start) <= stamp < (end or self.end):
                continue
            flow, total = number(raw_flow), number(raw_total)
            if sensor == 1001 and stamp < datetime(2026, 8, 11, 12, 15) and flow is not None:
                flow *= 1 / 3.6
            bucket = stamp.replace(minute=stamp.minute // 15 * 15, second=0, microsecond=0)
            groups[sensor, bucket].append((stamp, flow, total))
        result = []
        for (sensor, bucket), rows in sorted(groups.items()):
            flows = [flow for _, flow, _ in rows if flow is not None]
            active = [flow for flow in flows if flow > 0]
            totals = [(stamp, total) for stamp, _, total in rows if total is not None]
            preferred = [(stamp, total) for stamp, total in totals if total > 0] or totals
            result.append(dict(sensor_id=sensor, bucket_start=bucket,
                samples=sum(flow is not None or total is not None for _, flow, total in rows),
                active_samples=len(active), flow_avg=sum(flows)/len(flows) if flows else None,
                flow_active_avg=sum(active)/len(active) if active else None,
                flow_min=min(flows) if flows else None, flow_max=max(flows) if flows else None,
                total_open=min(preferred)[1] if preferred else None,
                total_close=max(preferred)[1] if preferred else None))
        return result

    def query(self, ids=(1001, 2002), start=None, end=None):
        return self.history['_query_15m_multi'](list(ids), start or self.start, end or self.end)

    def assertRowsEqual(self, actual, expected):
        self.assertEqual(len(actual), len(expected))
        for left, right in zip(actual, expected):
            self.assertEqual(left.keys(), right.keys())
            for key, value in right.items():
                if isinstance(value, float):
                    self.assertAlmostEqual(left[key], value, places=9, msg=key)
                else:
                    self.assertEqual(left[key], value, key)

    def test_positive_boundaries_ignore_null_zero_and_negative_endpoints(self):
        for minute, total in enumerate([None, 0, 100, 102, 99, 105, -1, 0, None]):
            self.add(2002, minute, 8, total)
        row = self.query()[0]
        self.assertEqual((row['total_open'], row['total_close']), (100, 105))
        self.assertRowsEqual(self.query(), self.reference([1001, 2002]))

    def test_nonpositive_only_bucket_preserves_fallback(self):
        for minute, total in enumerate([None, -4, 0, -2, None]):
            self.add(2002, minute, 0, total)
        self.assertEqual((self.query()[0]['total_open'], self.query()[0]['total_close']), (-4, -2))

    def test_flow_only_and_all_null_buckets_are_retained(self):
        self.add(2002, 1, 12, None)
        self.add(2002, 2, 'invalid', 'invalid')
        self.add(2002, 16, None, None)
        rows = self.query()
        self.assertRowsEqual(rows, self.reference([2002]))
        self.assertEqual([r['samples'] for r in rows], [1, 0])
        self.assertTrue(all(r['total_open'] is None and r['total_close'] is None for r in rows))

    def test_local_clock_priority_null_fallback_and_half_open_bounds(self):
        self.add(2002, -1, 9, 1, other_clock=self.start.isoformat(' '))
        self.add(2002, 0, 1, 10, other_clock=self.end.isoformat(' '))
        self.add(2002, 1, 2, 11, fallback=True)
        self.add(2002, 60, 99, 900, fallback=True)
        self.add(9999, 2, 99, 999)
        self.assertRowsEqual(self.query(), self.reference([1001, 2002]))
        self.assertEqual(self.query()[0]['samples'], 2)

    def test_pozo1_calibration_on_both_sides_of_cutoff_without_double_conversion(self):
        self.add(1001, 14, 36, 100)
        self.add(1001, 15, 36, 101, fallback=True)
        self.add(2002, 14, 36, 400)
        self.assertRowsEqual(self.query(), self.reference([1001, 2002]))
        self.assertEqual([r['flow_avg'] for r in self.query()], [10, 36, 36])

    def test_single_sensor_contract_matches_module_without_sensor_column(self):
        self.add(2002, 0, 8, 10)
        self.add(2002, 10, 9, 11)
        actual = self.history['_query_15m'](2002, self.start, self.end)
        expected = [{k: v for k, v in row.items() if k != 'sensor_id'} for row in self.reference([2002])]
        self.assertRowsEqual(actual, expected)

    def test_minute_and_physical_validation_preserve_raw_totals_and_calibration(self):
        self.add(1001, 14, 36, 100, fallback=True)
        self.add(1001, 15, 36, 999999)
        self.add(1001, 16, 0, 0)
        minute = self.history['_query_minute_history_rows']([1001], self.start, self.end)
        physical = self.history['_query_physical_validation_rows']([1001], self.start, self.end)
        self.assertEqual([r['flow_value'] for r in minute], [10, 36, 0])
        self.assertEqual([r['instant_value'] for r in physical], [10, 36, 0])
        self.assertEqual([r['total_value'] for r in physical], [100, 999999, 0])
        self.history['MAX_PHYSICAL_VALIDATION_ROWS'] = 2
        self.assertEqual(len(self.history['_query_physical_validation_rows']([1001], self.start, self.end)), 2)

    def test_empty_period_and_empty_sensor_selection(self):
        self.assertEqual(self.query(), [])
        self.assertEqual(self.query(ids=()), [])
        self.assertEqual(self.query(end=self.start), [])

    def test_randomized_twelve_days_keep_quarter_checkpoints_and_chunk_boundaries(self):
        rng = random.Random(1010)
        for sensor in [1001, 1051, 2002, 2006, 2008, 2010]:
            for minute in range(0, 12 * 24 * 60, 7):
                self.add(sensor, minute, rng.choice([0, 9, 18, None, 'bad']),
                         rng.choice([None, 0, -1, 100 + minute / 10]), fallback=minute % 5 == 0)
        end = self.start + timedelta(days=12)
        ids = [1001, 1051, 2002, 2006, 2008, 2010]
        actual = self.history['_query_15m_multi_chunked'](ids, self.start, end, 'daily')
        expected = self.reference(ids, end=end)
        self.assertRowsEqual(sorted(actual, key=lambda r: (r['sensor_id'], r['bucket_start'])), expected)
        # Exercise the actual unchanged volume/coverage pipeline at all three scales.
        for aggregation in ['quarter_hour', 'hourly', 'daily']:
            for sensor in ids:
                left = self.history['_build_points'](sensor, aggregation, self.start, end,
                    [r for r in actual if r['sensor_id'] == sensor], [], effective_end_dt=end)
                right = self.history['_build_points'](sensor, aggregation, self.start, end,
                    [r for r in expected if r['sensor_id'] == sensor], [], effective_end_dt=end)
                self.assertEqual(left, right)

    def test_sql_uses_bound_sensors_and_no_correlated_boundary_scan(self):
        self.query()
        sql = self.session.statements[-1]
        self.assertNotIn('OUTER APPLY', sql.upper())
        self.assertNotIn('COALESCE(reading.ts_local', sql)
        self.assertIn('reading.ts_local IS NULL', sql)
        self.assertIn('reading.ts_minute >= :start_dt', sql)
        self.assertIn('ROW_NUMBER() OVER', sql)
        self.assertIn('IN (:sensor_0, :sensor_1)', sql)


if __name__ == '__main__':
    unittest.main()
