"""Aggregated dashboard payloads to reduce frontend request fan-out."""

import logging
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import cache
from auth import get_current_user
from cache_policy import is_historical_range, resolve_cache_ttls
from database import get_db
from models import User
from shared import VALID_LINES, resolve_dates as _resolve_dates
from constants import CACHE_TTL_SHORT, CACHE_TTL_DAY

router = APIRouter()
log = logging.getLogger('sales.dashboard')


def _call_or(default, label: str, fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except Exception as exc:
        log.warning("dashboard component '%s' failed: %s", label, exc)
        return default


def _dashboard_cache_key(line: str, period: int, sd: str, ed: str, yoy_year: int) -> str:
    return f"advisor_dashboard_{line}_{period}_{sd}_{ed}_{yoy_year}"


def _component_cache_keys(line: str, sd: str, ed: str, yoy_year: int) -> list[str]:
    today = date.today().isoformat()
    return [
        f"advisor_summary_v2_{line}_{sd}_{ed}",
        f"advisor_leaderboard_v3_{line}_{sd}_{ed}",
        f"perf_insights_v2_{line}_{sd}_{ed}",
        f"perf_funnel_{line}_{sd}_{ed}",
        f"leads_volume_{line}_{sd}_{ed}",
        f"agent_close_speed_{line}_{sd}_{ed}",
        f"advisor_branch_monthly_v2_{line}_{sd}_{ed}",
        f"advisor_yoy_{line}_{yoy_year}_{today}",
        f"pipeline_slipping_v2_{line}_{today}",
    ]


def _invalidate_dashboard_scope(
    cache_key: str,
    line: str,
    sd: str,
    ed: str,
    yoy_year: int,
    allow_source_refresh: bool = True,
):
    cache.invalidate(cache_key)
    if not allow_source_refresh:
        return
    for key in _component_cache_keys(line, sd, ed, yoy_year):
        cache.invalidate(key)


def _with_meta(payload: dict, cache_key: str, ttl: int, source: str) -> dict:
    return {
        **payload,
        "meta": {
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "ttl_seconds": ttl,
            "source": source,
            "cache_key": cache_key,
        },
    }


def _build_dashboard_payload(line: str, period: int, start_date, end_date, yoy_year, user, db) -> dict:
    from routers.sales_advisor import (
        advisor_summary,
        advisor_leaderboard,
        advisor_yoy,
        advisor_branch_monthly,
    )
    from routers.sales_performance import performance_funnel, performance_insights
    from routers.sales_pipeline import pipeline_slipping
    from routers.sales_leads import leads_volume, agent_close_speed
    from routers.advisor_targets import get_targets
    from routers.advisor_targets_achievement import get_target_achievement

    from concurrent.futures import ThreadPoolExecutor, as_completed

    try:
        summary = advisor_summary(line, period, start_date, end_date)
    except Exception as exc:
        raise HTTPException(status_code=503, detail='Salesforce data unavailable') from exc

    branch_default = {"branches": [], "period_months": [], "line": line}

    # SF tasks — all independent, run concurrently
    sf_tasks = {
        "leaderboard":  (advisor_leaderboard,     [line, period, start_date, end_date]),
        "insights":     (performance_insights,    [line, period, start_date, end_date]),
        "yoy":          (advisor_yoy,             [line, yoy_year]),
        "funnel":       (performance_funnel,      [line, period, start_date, end_date]),
        "slipping":     (pipeline_slipping,       [line]),
        "leads_volume": (leads_volume,            [line, period, start_date, end_date]),
        "close_speed":  (agent_close_speed,       [line, period, start_date, end_date]),
    }
    if line == 'Travel':
        sf_tasks["branch_monthly"] = (advisor_branch_monthly, [line, period, start_date, end_date])

    defaults = {
        "leaderboard":    {"advisors": []},
        "insights":       {"insights": []},
        "yoy":            {},
        "funnel":         {},
        "slipping":       {"deals": []},
        "leads_volume":   {"by_source": []},
        "close_speed":    {},
        "targets":        {"targets": [], "upload": None},
        "achievement":    None,
        "branch_monthly": branch_default,
    }
    results = dict(defaults)

    with ThreadPoolExecutor(max_workers=min(len(sf_tasks), 10)) as executor:
        future_to_key = {
            executor.submit(fn, *args): key
            for key, (fn, args) in sf_tasks.items()
        }
        for future in as_completed(future_to_key):
            key = future_to_key[future]
            try:
                results[key] = future.result()
            except Exception as exc:
                log.warning("dashboard component '%s' failed: %s", key, exc)

    # DB-backed tasks — SQLAlchemy sessions are not thread-safe; run sequentially
    results["targets"] = _call_or({"targets": [], "upload": None}, "targets", get_targets, user, db)
    results["achievement"] = _call_or(None, "achievement", get_target_achievement, line, None, start_date, end_date, user, db)

    return {"summary": summary, **results}


@router.get("/api/sales/advisors/dashboard")
def advisor_dashboard(
    line: str = "Travel",
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    yoy_year: Optional[int] = Query(None),
    force_refresh: bool = Query(False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the advisor dashboard data in one HTTP response.

    The component functions keep their existing cache keys, so this endpoint
    reduces request pressure without creating a second source of truth.
    """
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    resolved_yoy_year = yoy_year or date.today().year
    cache_key = _dashboard_cache_key(line, period, sd, ed, resolved_yoy_year)
    ttl, disk_ttl = resolve_cache_ttls(cache_key, CACHE_TTL_SHORT, CACHE_TTL_DAY)

    if force_refresh:
        can_refresh_sources = (
            not is_historical_range(cache_key)
            or getattr(user, 'role', None) in ('admin', 'superadmin')
        )
        _invalidate_dashboard_scope(
            cache_key,
            line,
            sd,
            ed,
            resolved_yoy_year,
            allow_source_refresh=can_refresh_sources,
        )
    else:
        cached = cache.get(cache_key)
        if cached is not None:
            return {**cached, "meta": {**cached.get("meta", {}), "source": "cache"}}

    def fetch():
        payload = _build_dashboard_payload(line, period, start_date, end_date, resolved_yoy_year, user, db)
        return _with_meta(payload, cache_key, ttl, "live")

    return cache.cached_query(cache_key, fetch, ttl=ttl, disk_ttl=disk_ttl)


def warm_advisor_dashboard(line: str, period: int = 12):
    """Warm the aggregate dashboard payload used by the frontend."""
    from database import SessionLocal

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.is_active == True).order_by(User.id).first()  # noqa: E712
        return advisor_dashboard(
            line=line,
            period=period,
            start_date=None,
            end_date=None,
            yoy_year=None,
            force_refresh=False,
            user=user,
            db=db,
        )
    finally:
        db.close()
