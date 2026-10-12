from __future__ import annotations

from datetime import date
import unittest

from app.services import water_period_service as service


class DurangoPeriodRefresh46ETests(unittest.TestCase):
    def test_current_period_cache_expires_before_shared_sixty_second_poll(self):
        today = date(2026, 9, 28)
        self.assertEqual(service._period_cache_ttl(today, today, today), 50)
        self.assertLess(service.PERIOD_TTL_CURRENT_SECONDS, 60)

    def test_closed_period_keeps_long_cache(self):
        today = date(2026, 9, 28)
        closed = date(2026, 9, 27)
        self.assertEqual(
            service._period_cache_ttl(closed, closed, today),
            service.PERIOD_TTL_HISTORICAL_SECONDS,
        )


if __name__ == '__main__':
    unittest.main()
