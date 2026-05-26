"""Goal-gap opportunity focus endpoint for the main sales dashboard."""

import calendar
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

import cache
from auth import get_current_user
from constants import CACHE_TTL_HOUR, CACHE_TTL_SHORT
from database import get_db
from models import User
from routers.advisor_targets_achievement import get_target_achievement
from routers.opportunity_scoring import build_goal_gap_focus
from sf_client import sf_query_all
from shared import (
    VALID_LINES,
    get_owner_map,
    is_sales_agent,
    line_filter_opp as _line_filter,
)

router = APIRouter()


@router.get("/api/sales/opportunities/goal-focus")
def goal_focus_opportunities(
    line: str = "Travel",
    metric: str = Query("commission", pattern="^(commission|bookings)$"),
    advisor_name: Optional[str] = Query(None),
    limit: int = Query(8, ge=3, le=20),
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deals most likely to close the current monthly target gap."""
    if line not in VALID_LINES:
        line = 'Travel'

    today = date.today()
    month_start = today.replace(day=1)
    month_end = today.replace(day=calendar.monthrange(today.year, today.month)[1])
    achievement = get_target_achievement(
        line=line,
        advisor_name=advisor_name,
        start_date=month_start.isoformat(),
        end_date=today.isoformat(),
        _user=_user,
        db=db,
    )
    company = _achievement_company(achievement, advisor_name)
    target, actual, comm_rate = _target_values(company, achievement, metric, line)
    gap = max(float(target or 0) - float(actual or 0), 0)
    if gap <= 0:
        return _empty_response(line, metric, target, actual, month_start, month_end)

    owner_map = get_owner_map()
    cache_key = f"goal_focus_opps_{line}_{metric}_{advisor_name or 'company'}_{today.isoformat()}"
    records = cache.cached_query(
        cache_key,
        lambda: _fetch_focus_opps(line, metric, advisor_name, today, comm_rate, owner_map),
        ttl=CACHE_TTL_SHORT,
        disk_ttl=CACHE_TTL_HOUR,
    )
    focus = build_goal_gap_focus(records, gap, today, owner_map=owner_map, limit=limit)

    return {
        'line': line,
        'metric': metric,
        'target': round(target),
        'actual': round(actual),
        'month_start': month_start.isoformat(),
        'month_end': month_end.isoformat(),
        **focus,
    }


def _achievement_company(achievement: dict, advisor_name: Optional[str]) -> dict:
    company = (achievement.get('current_month') or {}).get('company') or {}
    if advisor_name and achievement.get('advisors'):
        return achievement['advisors'][0].get('monthly') or company
    return company


def _target_values(company: dict, achievement: dict, metric: str, line: str) -> tuple[float, float, float]:
    if metric == 'bookings':
        return (
            company.get('bookings_target') or company.get('target') or 0,
            company.get('bookings_actual') or company.get('actual') or 0,
            1.0,
        )
    return (
        company.get('target') or 0,
        company.get('commission_actual') or company.get('actual') or 0,
        (achievement.get('comm_rate') or 100) / 100 if line == 'Travel' else 1.0,
    )


def _empty_response(line: str, metric: str, target: float, actual: float, month_start: date, month_end: date) -> dict:
    return {
        'line': line,
        'metric': metric,
        'target': round(target),
        'actual': round(actual),
        'gap': 0,
        'coverage_amount': 0,
        'coverage_pct': 100,
        'expected_value': 0,
        'available_count': 0,
        'opportunities': [],
        'month_start': month_start.isoformat(),
        'month_end': month_end.isoformat(),
        'message': 'Monthly target is already met.',
    }


def _fetch_focus_opps(
    line: str,
    metric: str,
    advisor_name: Optional[str],
    today: date,
    comm_rate: float,
    owner_map: dict[str, str],
) -> list[dict]:
    # 30 days back (catch recently overdue) + 90 days forward (3 months)
    opp_start = (today - timedelta(days=30)).isoformat()
    opp_end   = (today + timedelta(days=90)).isoformat()
    lf = _line_filter(line)
    records = sf_query_all(f"""
        SELECT Id, Name, Amount, StageName, Probability, ForecastCategory,
               CloseDate, CreatedDate, LastActivityDate, PushCount,
               LastStageChangeDate, OwnerId, RecordTypeId,
               Earned_Commission_Amount__c
        FROM Opportunity
        WHERE IsClosed = false AND {lf}
          AND Amount != null
          AND CloseDate >= {opp_start}
          AND CloseDate <= {opp_end}
        ORDER BY Amount DESC
        LIMIT 500
    """)
    return [
        {**r, 'GoalValue': (r.get('Amount') or 0) if metric == 'bookings' else (r.get('Amount') or 0) * comm_rate}
        for r in records
        if _include_owner(r, line, advisor_name, owner_map)
    ]


def _include_owner(r: dict, line: str, advisor_name: Optional[str], owner_map: dict[str, str]) -> bool:
    owner = owner_map.get(r.get('OwnerId', ''), '')
    if advisor_name:
        return owner.lower() == advisor_name.lower()
    return is_sales_agent(owner, line)
