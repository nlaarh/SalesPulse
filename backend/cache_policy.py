"""Date-aware cache TTL policy for sales data sources.

Completed periods are effectively immutable for dashboard purposes, while the
current month can still change in Salesforce and Power BI. Keep that distinction
centralized so both data sources use the same refresh posture.
"""

from __future__ import annotations

import re
from datetime import date

from constants import CACHE_TTL_DAY, CACHE_TTL_HOUR

CURRENT_PERIOD_TTL = 600
CURRENT_PERIOD_DISK_TTL = CACHE_TTL_HOUR
HISTORICAL_PERIOD_TTL = CACHE_TTL_DAY
HISTORICAL_PERIOD_DISK_TTL = CACHE_TTL_DAY * 90

_ISO_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


def _current_month_start(today: date | None = None) -> date:
    now = today or date.today()
    return date(now.year, now.month, 1)


def _extract_date_range(cache_key: str) -> tuple[date, date] | None:
    matches = _ISO_DATE_RE.findall(cache_key)
    if len(matches) < 2:
        return None
    try:
        return date.fromisoformat(matches[-2]), date.fromisoformat(matches[-1])
    except ValueError:
        return None


def is_historical_range(cache_key: str, today: date | None = None) -> bool:
    date_range = _extract_date_range(cache_key)
    if not date_range:
        return False
    _, end_date = date_range
    return end_date < _current_month_start(today)


def is_current_range(cache_key: str, today: date | None = None) -> bool:
    date_range = _extract_date_range(cache_key)
    if not date_range:
        return False
    _, end_date = date_range
    return end_date >= _current_month_start(today)


def resolve_cache_ttls(
    cache_key: str,
    ttl: int,
    disk_ttl: int,
    today: date | None = None,
) -> tuple[int, int]:
    """Return effective TTLs for a cache key containing an explicit date range."""
    if ttl < 0 or disk_ttl < 0:
        return ttl, disk_ttl
    if is_historical_range(cache_key, today):
        return max(ttl, HISTORICAL_PERIOD_TTL), max(disk_ttl, HISTORICAL_PERIOD_DISK_TTL)
    if is_current_range(cache_key, today):
        return min(ttl, CURRENT_PERIOD_TTL), min(disk_ttl, CURRENT_PERIOD_DISK_TTL)
    return ttl, disk_ttl
