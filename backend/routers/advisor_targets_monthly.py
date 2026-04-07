"""Advisor Targets — monthly breakdown, achievement, and admin save endpoints.

Advisors are sourced directly from Salesforce (anyone with bookings in prior/current year).
No dependency on uploaded target files.
"""

import logging
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import TargetUpload, AdvisorTarget, MonthlyAdvisorTarget, User
from auth import get_current_user, require_admin
from activity_logger import log_activity
from shared import get_owner_map

router = APIRouter()
log = logging.getLogger('salesinsight.targets')


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_comm_rate(records: list) -> float:
    """Compute avg commission rate from deals that HAVE commission data (> 0).
    Deals with NULL/0 commission (mostly Invoice stage) are excluded from rate calc
    since they'd dilute the true rate.
    """
    rev_with = 0.0
    comm_with = 0.0
    for r in records:
        comm = r.get('comm', 0) or 0
        if comm > 0:
            rev_with += r.get('rev', 0) or 0
            comm_with += comm
    return comm_with / rev_with if rev_with > 0 else 0.187


def _sf_advisors_with_bookings(line: str, year: int, cache_module, sf_query_all, WON_STAGES, lf):
    """Get all advisors who had bookings in a given year from SF."""
    key = f"sf_advisors_{line}_{year}"
    def fetch():
        # OwnerId avoids the User cross-object join in GROUP BY
        rows = sf_query_all(f"""
            SELECT OwnerId, SUM(Amount) rev, SUM(Earned_Commission_Amount__c) comm
            FROM Opportunity
            WHERE {WON_STAGES} AND {lf}
              AND CloseDate >= {year}-01-01 AND CloseDate <= {year}-12-31
              AND Amount != null
            GROUP BY OwnerId
        """)
        owner_map = get_owner_map()
        out = []
        for r in rows:
            name = owner_map.get(r.get('OwnerId', ''), '')
            if name:
                out.append({**r, 'Name': name})
        return out
    return cache_module.cached_query(key, fetch, ttl=1800, disk_ttl=43200)


def _get_comm_rate_accurate(line: str, year: int, cache_module, sf_query_all, WON_STAGES, lf) -> float:
    """Get true commission rate from deals that have commission recorded (non-grouped query)."""
    key = f"comm_rate_{line}_{year}"
    def fetch():
        return sf_query_all(f"""
            SELECT SUM(Amount) rev, SUM(Earned_Commission_Amount__c) comm
            FROM Opportunity
            WHERE {WON_STAGES} AND {lf}
              AND CloseDate >= {year}-01-01 AND CloseDate <= {year}-12-31
              AND Amount != null AND Earned_Commission_Amount__c > 0
        """)
    records = cache_module.cached_query(key, fetch, ttl=3600, disk_ttl=86400)
    if records:
        rev = records[0].get('rev', 0) or 0
        comm = records[0].get('comm', 0) or 0
        if rev > 0:
            return comm / rev
    return 0.187


def _ensure_advisor_targets(db: Session, sf_names: list[str]):
    """Auto-create AdvisorTarget rows for SF advisors that don't have one yet.
    Returns dict of sf_name_lower -> AdvisorTarget.id
    """
    # Get or create a system upload record
    upload = db.query(TargetUpload).filter(TargetUpload.filename == '__sf_auto__').first()
    if not upload:
        upload = TargetUpload(
            filename='__sf_auto__',
            line='Travel',
            uploaded_by_id=0,
            uploaded_by_email='system',
            advisor_count=0,
        )
        db.add(upload)
        db.flush()

    # Get existing advisor targets
    existing = db.query(AdvisorTarget).filter(AdvisorTarget.upload_id == upload.id).all()
    existing_map = {at.sf_name.strip().lower(): at for at in existing}

    # Create missing ones
    for name in sf_names:
        key = name.strip().lower()
        if key not in existing_map:
            at = AdvisorTarget(
                upload_id=upload.id,
                raw_name=name,
                sf_name=name,
                branch=None,
                title=None,
                monthly_target=None,
            )
            db.add(at)
            existing_map[key] = at

    if db.new:
        upload.advisor_count = len(existing_map)
        db.commit()

    return {at.sf_name.strip().lower(): at.id for at in existing_map.values()}


def _ensure_monthly_targets(db: Session, year: int, advisor_ids: dict[str, int],
                            prior_earnings: dict[str, float],
                            py_monthly: dict[str, dict[int, float]] | None = None):
    """Seed MonthlyAdvisorTarget rows using prior year's seasonal shape."""
    existing = db.query(MonthlyAdvisorTarget).filter(
        MonthlyAdvisorTarget.year == year
    ).first()
    if existing:
        return

    vals = [v for v in prior_earnings.values() if v > 0]
    median = sorted(vals)[len(vals) // 2] if vals else 0
    py_monthly = py_monthly or {}

    # Company-wide seasonal shape (fallback for new advisors)
    company_shape = [0.0] * 12
    for months in py_monthly.values():
        for m, v in months.items():
            company_shape[m - 1] += v
    company_total = sum(company_shape)

    for name_lower, at_id in advisor_ids.items():
        base = prior_earnings.get(name_lower, 0)
        if base <= 0:
            base = median
        if base <= 0:
            continue

        # Use this advisor's prior year monthly shape
        adv_months = py_monthly.get(name_lower, {})
        adv_total = sum(adv_months.values())

        for m in range(1, 13):
            if adv_total > 0:
                # Seasonal: proportional to prior year pattern
                target = round(base * (adv_months.get(m, 0) / adv_total))
            elif company_total > 0:
                # New advisor: use company-wide seasonal shape
                target = round(base * (company_shape[m - 1] / company_total))
            else:
                target = round(base / 12)
            db.add(MonthlyAdvisorTarget(
                advisor_target_id=at_id, year=year, month=m,
                target_amount=target, updated_by_email='system-seed',
            ))
    db.commit()
    log.info(f"Seeded {year} monthly targets (seasonal) for {len(advisor_ids)} advisors")


# ── Schemas ──────────────────────────────────────────────────────────────────

class MonthlyTargetUpdate(BaseModel):
    advisor_target_id: int
    months: dict[str, float]

class MonthlyTargetSaveRequest(BaseModel):
    year: int
    updates: list[MonthlyTargetUpdate]


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/api/targets/monthly/{year}")
def get_monthly_targets(
    year: int,
    line: str = "Travel",
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all advisors' 12-month targets + actuals. Advisors from SF, not uploads."""
    from shared import WON_STAGES, line_filter_opp
    from sf_client import sf_query_all
    import cache

    lf = line_filter_opp(line)
    prior_year = year - 1

    # 1. Get current year actuals + prior year for commission rate
    #    Use prior year's rate — current year is too early (most deals still Invoice with no commission)
    cur_records = _sf_advisors_with_bookings(line, year, cache, sf_query_all, WON_STAGES, lf)

    # 2. Get prior year data — use its commission rate (most complete data, deal-level accuracy)
    py_records = _sf_advisors_with_bookings(line, prior_year, cache, sf_query_all, WON_STAGES, lf)
    comm_rate = _get_comm_rate_accurate(line, prior_year, cache, sf_query_all, WON_STAGES, lf)

    # 3. Build advisor list = union of current + prior year names
    all_names: dict[str, str] = {}  # lower -> display name
    for r in cur_records + py_records:
        name = (r.get('Name') or '').strip()
        if name:
            all_names[name.lower()] = name

    # 4. Ensure AdvisorTarget rows exist for all SF advisors
    advisor_ids = _ensure_advisor_targets(db, list(all_names.values()))

    # 5. Compute prior year totals — estimated commission (Bookings × rate)
    prior_earnings: dict[str, float] = {}
    prior_bookings: dict[str, float] = {}
    for r in py_records:
        name = (r.get('Name') or '').strip().lower()
        rev = r.get('rev', 0) or 0
        if name:
            prior_bookings[name] = rev
            prior_earnings[name] = round(rev * comm_rate) if line == 'Travel' else rev

    # 6. Prior year monthly breakdown (for seasonal seeding + display)
    #    Use raw Earned_Commission_Amount__c to match what Monthly Report shows
    py_monthly_key = f"targets_py_monthly_v2_{line}_{prior_year}"
    def fetch_py_monthly():
        rows = sf_query_all(f"""
            SELECT OwnerId, CALENDAR_MONTH(CloseDate) mo,
                   SUM(Amount) rev, SUM(Earned_Commission_Amount__c) comm
            FROM Opportunity
            WHERE {WON_STAGES} AND {lf}
              AND CloseDate >= {prior_year}-01-01 AND CloseDate <= {prior_year}-12-31
              AND Amount != null
            GROUP BY OwnerId, CALENDAR_MONTH(CloseDate)
        """)
        owner_map = get_owner_map()
        return [{**r, 'Name': owner_map.get(r.get('OwnerId', ''), '')} for r in rows]
    py_monthly_records = cache.cached_query(py_monthly_key, fetch_py_monthly, ttl=3600, disk_ttl=86400)

    # Estimated commission per month (Bookings × rate) for seasonal shape
    py_monthly_map: dict[str, dict[int, float]] = {}
    for r in py_monthly_records:
        name = (r.get('Name') or '').strip().lower()
        if not name:
            continue
        rev = r.get('rev', 0) or 0
        val = round(rev * comm_rate) if line == 'Travel' else rev
        py_monthly_map.setdefault(name, {})[r.get('mo', 0)] = val

    # 7. Ensure monthly targets are seeded (seasonal shape)
    _ensure_monthly_targets(db, year, advisor_ids, prior_earnings, py_monthly=py_monthly_map)

    # 8. Load monthly target rows
    monthly_rows = db.query(MonthlyAdvisorTarget).filter(
        MonthlyAdvisorTarget.year == year
    ).all()
    monthly_map: dict[int, dict[int, float]] = {}
    for mr in monthly_rows:
        monthly_map.setdefault(mr.advisor_target_id, {})[mr.month] = mr.target_amount

    # 8. Current year actuals per advisor per month
    cur_monthly_key = f"targets_monthly_actuals_{line}_{year}"
    def fetch_monthly():
        rows = sf_query_all(f"""
            SELECT OwnerId, CALENDAR_MONTH(CloseDate) mo,
                   SUM(Amount) rev, SUM(Earned_Commission_Amount__c) comm
            FROM Opportunity
            WHERE {WON_STAGES} AND {lf}
              AND CloseDate >= {year}-01-01 AND CloseDate <= {year}-12-31
              AND Amount != null
            GROUP BY OwnerId, CALENDAR_MONTH(CloseDate)
        """)
        owner_map = get_owner_map()
        return [{**r, 'Name': owner_map.get(r.get('OwnerId', ''), '')} for r in rows]
    monthly_records = cache.cached_query(cur_monthly_key, fetch_monthly, ttl=1800, disk_ttl=43200)

    actuals_map: dict[str, dict[int, float]] = {}
    for r in monthly_records:
        name = (r.get('Name') or '').strip().lower()
        if not name:
            continue
        rev = r.get('rev', 0) or 0
        val = round(rev * comm_rate) if line == 'Travel' else rev
        actuals_map.setdefault(name, {})[r.get('mo', 0)] = val

    # 9. Build response
    company_months = [{'month': m, 'target': 0.0, 'actual': 0.0, 'achievement_pct': None}
                      for m in range(1, 13)]

    advisors = []
    for name_lower, display_name in all_names.items():
        at_id = advisor_ids.get(name_lower)
        if not at_id:
            continue
        targets_by_month = monthly_map.get(at_id, {})
        actuals_by_month = actuals_map.get(name_lower, {})

        months = []
        total_target = 0.0
        total_actual = 0.0
        for m in range(1, 13):
            t = targets_by_month.get(m, 0)
            a = actuals_by_month.get(m, 0)
            total_target += t
            total_actual += a
            pct = round(a / t * 100, 1) if t > 0 else None
            months.append({'month': m, 'target': t, 'actual': a, 'achievement_pct': pct})
            company_months[m - 1]['target'] += t
            company_months[m - 1]['actual'] += a

        overall_pct = round(total_actual / total_target * 100, 1) if total_target > 0 else None
        # Prior year monthly shape for seasonal targets
        py_months = py_monthly_map.get(name_lower, {})
        py_month_list = [py_months.get(m, 0) for m in range(1, 13)]

        advisors.append({
            'advisor_target_id': at_id,
            'name': display_name,
            'branch': None,
            'title': None,
            'months': months,
            'total_target': total_target,
            'total_actual': total_actual,
            'achievement_pct': overall_pct,
            'prior_year_actual': prior_earnings.get(name_lower, 0),
            'prior_year_revenue': prior_bookings.get(name_lower, 0),
            'prior_year_months': py_month_list,  # 12 values, seasonal shape
        })

    for cm in company_months:
        cm['achievement_pct'] = round(cm['actual'] / cm['target'] * 100, 1) if cm['target'] > 0 else None

    co_total_target = sum(cm['target'] for cm in company_months)
    co_total_actual = sum(cm['actual'] for cm in company_months)
    advisors.sort(key=lambda a: a['prior_year_actual'], reverse=True)

    total_py_bookings = sum(prior_bookings.values())
    total_py_earnings = sum(prior_earnings.values())

    return {
        'year': year,
        'advisors': advisors,
        'company': {
            'months': company_months,
            'total_target': co_total_target,
            'total_actual': co_total_actual,
            'achievement_pct': round(co_total_actual / co_total_target * 100, 1) if co_total_target > 0 else None,
        },
        'methodology': {
            'commission_rate': round(comm_rate * 100, 1),
            'prior_year': prior_year,
            'prior_year_bookings': total_py_bookings,
            'prior_year_commission': total_py_earnings,
            'note': f'Estimated commission = Bookings x {round(comm_rate * 100, 1)}% avg commission rate. '
                    f'Rate from {prior_year} deals with recorded commission. '
                    f'Many invoiced deals have no commission in Salesforce — this estimates the full picture.',
        },
    }


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
    import calendar

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


@router.put("/api/admin/targets/monthly")
def save_monthly_targets(
    body: MonthlyTargetSaveRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Batch upsert monthly targets for one or more advisors."""
    count = 0
    for update in body.updates:
        for month_str, amount in update.months.items():
            month_int = int(month_str)
            if month_int < 1 or month_int > 12:
                continue
            existing = db.query(MonthlyAdvisorTarget).filter(
                MonthlyAdvisorTarget.advisor_target_id == update.advisor_target_id,
                MonthlyAdvisorTarget.year == body.year,
                MonthlyAdvisorTarget.month == month_int,
            ).first()
            if existing:
                existing.target_amount = amount
                existing.updated_by_email = admin.email
                existing.updated_at = datetime.utcnow()
            else:
                db.add(MonthlyAdvisorTarget(
                    advisor_target_id=update.advisor_target_id,
                    year=body.year, month=month_int,
                    target_amount=amount,
                    updated_by_email=admin.email,
                ))
            count += 1
    db.commit()

    log_activity(
        db, action='monthly_targets_saved', category='targets',
        user=admin,
        detail=f"Saved {count} monthly target entries for {body.year}",
        metadata={'year': body.year, 'advisor_count': len(body.updates), 'cell_count': count},
    )
    return {'status': 'saved', 'count': count}
