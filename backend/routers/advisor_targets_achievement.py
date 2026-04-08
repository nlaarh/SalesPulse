"""Advisor Targets — achievement endpoint (extracted from advisor_targets_monthly)."""

import logging
import calendar
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models import MonthlyAdvisorTarget, User
from auth import get_current_user
from shared import get_owner_map

from routers.advisor_targets_monthly import (
    _get_comm_rate_accurate,
    _sf_advisors_with_bookings,
    _ensure_advisor_targets,
    _ensure_monthly_targets,
)

router = APIRouter()
log = logging.getLogger('salesinsight.targets')


@router.get("/api/targets/achievement")
def get_target_achievement(
    line: str = "Travel",
    advisor_name: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lightweight achievement data for dashboard progress bars."""
    from shared import WON_STAGES, line_filter_opp
    from sf_client import sf_query_all
    import cache

    today = date.today()
    year = today.year
    month = today.month
    day = today.day
    days_in_month = calendar.monthrange(year, month)[1]
    lf = line_filter_opp(line)

    # Parse optional period dates; default to current month
    try:
        p_start = date.fromisoformat(start_date) if start_date else date(year, month, 1)
        p_end   = date.fromisoformat(end_date)   if end_date   else today
    except ValueError:
        p_start = date(year, month, 1)
        p_end   = today

    # Clamp period to the current year for target look-ups
    p_year = p_end.year  # use the year the period ends in
    p_start_clamped = max(p_start, date(p_year, 1, 1))

    # Which months (1-12) in p_year are covered by the period?
    period_months = [
        m for m in range(1, 13)
        if date(p_year, m, calendar.monthrange(p_year, m)[1]) >= p_start_clamped
        and date(p_year, m, 1) <= p_end
    ]
    if not period_months:
        period_months = [p_end.month]

    # Pace for the period bar: elapsed days / total period days
    period_total_days = max((p_end - p_start).days + 1, 1)
    elapsed_days = max((min(today, p_end) - p_start).days + 1, 0)
    period_pace = round(elapsed_days / period_total_days * 100, 1)

    # Labels for the period bar
    period_month_num  = period_months[0] if len(period_months) == 1 else None
    period_day_label  = (f"Day {day}/{days_in_month}" if len(period_months) == 1
                         else f"{elapsed_days}/{period_total_days} days")


    # Get current + prior year data. Use prior year's commission rate (most complete)
    cur_records = _sf_advisors_with_bookings(line, p_year, cache, sf_query_all, WON_STAGES, lf)
    py_records = _sf_advisors_with_bookings(line, p_year - 1, cache, sf_query_all, WON_STAGES, lf)
    comm_rate = _get_comm_rate_accurate(line, p_year - 1, cache, sf_query_all, WON_STAGES, lf)

    all_names: dict[str, str] = {}
    for r in cur_records + py_records:
        name = (r.get('Name') or '').strip()
        if name:
            all_names[name.lower()] = name

    advisor_ids = _ensure_advisor_targets(db, list(all_names.values()))
    prior_earnings: dict[str, float] = {}
    for r in py_records:
        name = (r.get('Name') or '').strip().lower()
        rev = r.get('rev', 0) or 0
        if name:
            prior_earnings[name] = round(rev * comm_rate) if line == 'Travel' else rev

    _ensure_monthly_targets(db, p_year, advisor_ids, prior_earnings)

    monthly_rows = db.query(MonthlyAdvisorTarget).filter(
        MonthlyAdvisorTarget.year == p_year).all()
    monthly_map: dict[int, dict[int, float]] = {}
    for mr in monthly_rows:
        monthly_map.setdefault(mr.advisor_target_id, {})[mr.month] = mr.target_amount

    # Fetch actuals for the full year (Jan 1 → today) so both bars can be computed
    ytd_key = f"achievement_ytd_{line}_{p_year}_{month}_{day}"
    def fetch_ytd():
        rows = sf_query_all(f"""
            SELECT OwnerId, CALENDAR_MONTH(CloseDate) mo,
                   SUM(Amount) rev, SUM(Earned_Commission_Amount__c) comm
            FROM Opportunity
            WHERE {WON_STAGES} AND {lf}
              AND CloseDate >= {p_year}-01-01 AND CloseDate <= {today.isoformat()}
              AND Amount != null
            GROUP BY OwnerId, CALENDAR_MONTH(CloseDate)
        """)
        owner_map = get_owner_map()
        return [{**r, 'Name': owner_map.get(r.get('OwnerId', ''), '')} for r in rows]
    ytd_records = cache.cached_query(ytd_key, fetch_ytd, ttl=900, disk_ttl=21600)

    # Store both bookings and commission actuals per advisor per month
    actuals_map: dict[str, dict[int, dict]] = {}
    for r in ytd_records:
        name = (r.get('Name') or '').strip().lower()
        if not name:
            continue
        rev = r.get('rev', 0) or 0
        sf_comm = r.get('comm', 0) or 0
        # Derive commission from bookings if SF field is missing
        derived_comm = round(rev * comm_rate) if line == 'Travel' else rev
        final_comm = round(sf_comm) if sf_comm and sf_comm > 100 else derived_comm
        actuals_map.setdefault(name, {})[r.get('mo', 0)] = {
            'bookings': round(rev),
            'commission': final_comm,
        }

    def _sum_actual(abm: dict, months, key: str) -> float:
        return sum((abm.get(m) or {}).get(key, 0) for m in months)

    # Build results — "period" bar uses period_months; "yearly" bar uses YTD (Jan → today)
    ytd_months = range(1, month + 1)
    advisor_results = []
    co_period_target = co_period_actual_comm = co_period_actual_book = 0.0
    co_year_target = co_year_actual_comm = co_year_actual_book = 0.0

    for name_lower, display_name in all_names.items():
        at_id = advisor_ids.get(name_lower)
        if not at_id:
            continue
        tbm = monthly_map.get(at_id, {})
        abm = actuals_map.get(name_lower, {})

        # Period bar (respects selected date range)
        p_target       = sum(tbm.get(m, 0) for m in period_months)
        p_actual_comm  = _sum_actual(abm, period_months, 'commission')
        p_actual_book  = _sum_actual(abm, period_months, 'bookings')

        # Yearly bar (always YTD: Jan → current month)
        y_target       = sum(tbm.get(m, 0) for m in range(1, 13))
        y_actual_comm  = _sum_actual(abm, ytd_months, 'commission')
        y_actual_book  = _sum_actual(abm, ytd_months, 'bookings')
        completed_target = sum(tbm.get(m, 0) for m in range(1, month))
        y_pace = round(completed_target / y_target * 100, 1) if y_target > 0 else 0

        co_period_target      += p_target
        co_period_actual_comm += p_actual_comm
        co_period_actual_book += p_actual_book
        co_year_target        += y_target
        co_year_actual_comm   += y_actual_comm
        co_year_actual_book   += y_actual_book

        # Bookings targets = commission targets ÷ comm_rate
        p_book_target = round(p_target / comm_rate) if comm_rate > 0 and p_target > 0 else p_target
        y_book_target = round(y_target / comm_rate) if comm_rate > 0 and y_target > 0 else y_target

        advisor_results.append({
            'name': display_name,
            'monthly': {
                'target': p_target,
                'bookings_target': p_book_target,
                'actual': p_actual_comm,
                'bookings_actual': p_actual_book,
                'commission_actual': p_actual_comm,
                'achievement_pct': round(p_actual_comm / p_target * 100, 1) if p_target > 0 else None,
            },
            'yearly': {
                'target': y_target,
                'bookings_target': y_book_target,
                'actual': y_actual_comm,
                'bookings_actual': y_actual_book,
                'commission_actual': y_actual_comm,
                'achievement_pct': round(y_actual_comm / y_target * 100, 1) if y_target > 0 else None,
                'pace_pct': y_pace,
            },
        })

    if advisor_name:
        advisor_results = [a for a in advisor_results if a['name'].lower() == advisor_name.lower()]

    co_completed = sum(
        sum(monthly_map.get(advisor_ids.get(n, 0), {}).get(m, 0) for m in range(1, month))
        for n in all_names
    )
    yearly_pace = round(co_completed / co_year_target * 100, 1) if co_year_target > 0 else 0

    return {
        'comm_rate': round(comm_rate * 100, 1),
        'current_month': {
            'month': period_month_num or period_months[-1],
            'year': p_year,
            'day_of_month': day, 'days_in_month': days_in_month,
            'pace_pct': period_pace,
            'period_months': period_months,
            'period_label': period_day_label,
            'company': {
                'target': co_period_target,
                'bookings_target': round(co_period_target / comm_rate) if comm_rate > 0 and co_period_target > 0 else co_period_target,
                'actual': co_period_actual_comm,
                'bookings_actual': round(co_period_actual_book),
                'commission_actual': round(co_period_actual_comm),
                'achievement_pct': round(co_period_actual_comm / co_period_target * 100, 1) if co_period_target > 0 else None,
            },
        },
        'yearly': {
            'year': p_year, 'month_of_year': month,
            'pace_pct': yearly_pace,
            'company': {
                'target': co_year_target,
                'bookings_target': round(co_year_target / comm_rate) if comm_rate > 0 and co_year_target > 0 else co_year_target,
                'actual': co_year_actual_comm,
                'bookings_actual': round(co_year_actual_book),
                'commission_actual': round(co_year_actual_comm),
                'achievement_pct': round(co_year_actual_comm / co_year_target * 100, 1) if co_year_target > 0 else None,
            },
        },
        'advisors': advisor_results,
    }
