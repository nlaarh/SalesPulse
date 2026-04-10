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
from constants import CACHE_TTL_MEDIUM, CACHE_TTL_HOUR, CACHE_TTL_DAY, CACHE_TTL_12H

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
    return cache_module.cached_query(key, fetch, ttl=CACHE_TTL_MEDIUM, disk_ttl=CACHE_TTL_12H)


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
    records = cache_module.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)
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


DEFAULT_SEED_GROWTH = 1.10  # 10% growth over prior year when seeding targets


def _ensure_monthly_targets(db: Session, year: int, advisor_ids: dict[str, int],
                            prior_earnings: dict[str, float],
                            py_monthly: dict[str, dict[int, float]] | None = None,
                            comm_rate: float = 0):
    """Seed missing MonthlyAdvisorTarget rows using prior year's seasonal shape + default growth.
    Stores both commission (target_amount) and bookings (target_bookings)."""
    # Check which advisor+month combos already exist (user-edited or previously seeded)
    existing_keys: set[tuple[int, int]] = set()
    existing_rows = db.query(
        MonthlyAdvisorTarget.advisor_target_id, MonthlyAdvisorTarget.month
    ).filter(MonthlyAdvisorTarget.year == year).all()
    for at_id, month in existing_rows:
        existing_keys.add((at_id, month))

    if len(existing_keys) >= len(advisor_ids) * 12:
        return  # All rows exist, nothing to seed

    vals = [v for v in prior_earnings.values() if v > 0]
    median = sorted(vals)[len(vals) // 2] if vals else 0
    py_monthly = py_monthly or {}

    # Company-wide seasonal shape (fallback for new advisors)
    company_shape = [0.0] * 12
    for months in py_monthly.values():
        for m, v in months.items():
            company_shape[m - 1] += v
    company_total = sum(company_shape)

    seeded = 0
    for name_lower, at_id in advisor_ids.items():
        base = prior_earnings.get(name_lower, 0)
        if base <= 0:
            base = median
        if base <= 0:
            continue
        # Apply default growth so seeds aren't identical to prior year
        base = round(base * DEFAULT_SEED_GROWTH)

        adv_months = py_monthly.get(name_lower, {})
        adv_total = sum(adv_months.values())

        for m in range(1, 13):
            if (at_id, m) in existing_keys:
                continue  # Don't overwrite user-edited values
            if adv_total > 0:
                target = round(base * (adv_months.get(m, 0) / adv_total))
            elif company_total > 0:
                target = round(base * (company_shape[m - 1] / company_total))
            else:
                target = round(base / 12)
            db.add(MonthlyAdvisorTarget(
                advisor_target_id=at_id, year=year, month=m,
                target_amount=target,
                target_bookings=round(target / comm_rate) if comm_rate > 0 else target,
                updated_by_email='system-seed',
            ))
            seeded += 1
    if seeded > 0:
        db.commit()
        log.info(f"Seeded {seeded} monthly targets (+{int((DEFAULT_SEED_GROWTH-1)*100)}%% growth) "
                 f"for {year} ({len(existing_keys)} existing rows preserved)")


# ── Schemas ──────────────────────────────────────────────────────────────────

class MonthlyTargetUpdate(BaseModel):
    advisor_target_id: int
    months: dict[str, float]

class MonthlyTargetSaveRequest(BaseModel):
    year: int
    updates: list[MonthlyTargetUpdate]
    base: str = 'commission'   # 'bookings' or 'commission' — unit of the submitted values
    line: str = 'Travel'       # needed to look up comm_rate when base='bookings'


class EstimateRequest(BaseModel):
    year: int
    line: str = 'Travel'
    base_years: list[int]       # 1-3 prior years to average


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/api/targets/monthly/estimate")
def compute_estimates(
    body: EstimateRequest,
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Compute base estimates by averaging monthly actuals across selected prior years.
    Returns per-advisor, per-month bookings + commission estimates (read-only base data)."""
    from shared import WON_STAGES, line_filter_opp
    from sf_client import sf_query_all
    import cache

    lf = line_filter_opp(body.line)
    current_year = date.today().year

    # Validate: only allow years within 3 years back
    valid_years = [y for y in body.base_years if current_year - 3 <= y < body.year]
    if not valid_years:
        return {'error': 'No valid base years selected (max 3 years back)'}

    # Get commission rate from most recent base year
    most_recent = max(valid_years)
    comm_rate = _get_comm_rate_accurate(body.line, most_recent, cache, sf_query_all, WON_STAGES, lf)

    # Fetch monthly actuals for each base year
    owner_map = get_owner_map()
    # advisor_lower -> { month -> [values across years] }
    advisor_monthly_bookings: dict[str, dict[int, list[float]]] = {}
    advisor_yearly_totals: dict[str, list[float]] = {}

    for yr in valid_years:
        cache_key = f"estimate_monthly_{body.line}_{yr}"
        def _fetch(y=yr):
            rows = sf_query_all(f"""
                SELECT OwnerId, CALENDAR_MONTH(CloseDate) mo,
                       SUM(Amount) rev, SUM(Earned_Commission_Amount__c) comm
                FROM Opportunity
                WHERE {WON_STAGES} AND {lf}
                  AND CloseDate >= {y}-01-01 AND CloseDate <= {y}-12-31
                  AND Amount != null
                GROUP BY OwnerId, CALENDAR_MONTH(CloseDate)
            """)
            return [{**r, 'Name': owner_map.get(r.get('OwnerId', ''), '')} for r in rows]
        records = cache.cached_query(cache_key, _fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)

        yr_totals: dict[str, float] = {}
        for r in records:
            name = (r.get('Name') or '').strip().lower()
            if not name:
                continue
            mo = r.get('mo', 0)
            rev = r.get('rev', 0) or 0
            advisor_monthly_bookings.setdefault(name, {}).setdefault(mo, []).append(rev)
            yr_totals[name] = yr_totals.get(name, 0) + rev
        for name, total in yr_totals.items():
            advisor_yearly_totals.setdefault(name, []).append(total)

    # Build averaged estimates
    all_names: dict[str, str] = {}
    for yr in valid_years:
        recs = _sf_advisors_with_bookings(body.line, yr, cache, sf_query_all, WON_STAGES, lf)
        for r in recs:
            n = (r.get('Name') or '').strip()
            if n:
                all_names[n.lower()] = n

    # Also include current year advisors
    cur_recs = _sf_advisors_with_bookings(body.line, body.year, cache, sf_query_all, WON_STAGES, lf)
    for r in cur_recs:
        n = (r.get('Name') or '').strip()
        if n:
            all_names[n.lower()] = n

    advisor_ids = _ensure_advisor_targets(db, list(all_names.values()))

    # Check if targets already exist for this year
    existing_count = db.query(MonthlyAdvisorTarget).filter(
        MonthlyAdvisorTarget.year == body.year
    ).count()

    n_years = len(valid_years)
    advisors = []
    for name_lower, display_name in all_names.items():
        at_id = advisor_ids.get(name_lower)
        if not at_id:
            continue

        monthly_data = advisor_monthly_bookings.get(name_lower, {})
        yearly_tots = advisor_yearly_totals.get(name_lower, [])
        avg_annual_bookings = sum(yearly_tots) / len(yearly_tots) if yearly_tots else 0

        months = []
        for m in range(1, 13):
            vals = monthly_data.get(m, [])
            avg_bookings = sum(vals) / n_years if vals else 0
            avg_commission = round(avg_bookings * comm_rate) if body.line == 'Travel' else round(avg_bookings)
            months.append({
                'month': m,
                'base_bookings': round(avg_bookings),
                'base_commission': avg_commission,
            })

        advisors.append({
            'advisor_target_id': at_id,
            'name': display_name,
            'months': months,
            'avg_annual_bookings': round(avg_annual_bookings),
            'avg_annual_commission': round(avg_annual_bookings * comm_rate) if body.line == 'Travel' else round(avg_annual_bookings),
        })

    advisors.sort(key=lambda a: a['avg_annual_bookings'], reverse=True)

    return {
        'year': body.year,
        'base_years': valid_years,
        'commission_rate': round(comm_rate * 100, 1),
        'existing_targets': existing_count,
        'advisors': advisors,
    }

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
    py_monthly_records = cache.cached_query(py_monthly_key, fetch_py_monthly, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)

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
    _ensure_monthly_targets(db, year, advisor_ids, prior_earnings, py_monthly=py_monthly_map,
                            comm_rate=comm_rate)

    # 8. Load monthly target rows
    monthly_rows = db.query(MonthlyAdvisorTarget).filter(
        MonthlyAdvisorTarget.year == year
    ).all()
    monthly_comm_map: dict[int, dict[int, float]] = {}
    monthly_book_map: dict[int, dict[int, float]] = {}
    for mr in monthly_rows:
        raw_amount = mr.target_amount
        raw_bookings = mr.target_bookings

        if raw_bookings is not None and raw_bookings > 0:
            comm_val = raw_amount
            book_val = raw_bookings
        elif mr.updated_by_email and mr.updated_by_email != 'system-seed':
            # Legacy: user-saved without target_bookings → amount is bookings
            book_val = raw_amount
            comm_val = round(raw_amount * comm_rate) if comm_rate > 0 else raw_amount
        else:
            # System-seeded → amount is commission
            comm_val = raw_amount
            book_val = round(raw_amount / comm_rate) if comm_rate > 0 else raw_amount

        monthly_comm_map.setdefault(mr.advisor_target_id, {})[mr.month] = comm_val
        monthly_book_map.setdefault(mr.advisor_target_id, {})[mr.month] = book_val

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
    monthly_records = cache.cached_query(cur_monthly_key, fetch_monthly, ttl=CACHE_TTL_MEDIUM, disk_ttl=CACHE_TTL_12H)

    actuals_map: dict[str, dict[int, float]] = {}
    for r in monthly_records:
        name = (r.get('Name') or '').strip().lower()
        if not name:
            continue
        rev = r.get('rev', 0) or 0
        val = round(rev * comm_rate) if line == 'Travel' else rev
        actuals_map.setdefault(name, {})[r.get('mo', 0)] = val

    # 9. Build response — return both commission and bookings targets
    company_months = [{'month': m, 'target': 0.0, 'target_bookings': 0.0, 'actual': 0.0, 'achievement_pct': None}
                      for m in range(1, 13)]

    advisors = []
    for name_lower, display_name in all_names.items():
        at_id = advisor_ids.get(name_lower)
        if not at_id:
            continue
        comm_by_month = monthly_comm_map.get(at_id, {})
        book_by_month = monthly_book_map.get(at_id, {})
        actuals_by_month = actuals_map.get(name_lower, {})

        months = []
        total_target = 0.0
        total_target_book = 0.0
        total_actual = 0.0
        for m in range(1, 13):
            t = comm_by_month.get(m, 0)
            tb = book_by_month.get(m, 0)
            a = actuals_by_month.get(m, 0)
            total_target += t
            total_target_book += tb
            total_actual += a
            pct = round(a / t * 100, 1) if t > 0 else None
            months.append({'month': m, 'target': t, 'target_bookings': tb, 'actual': a, 'achievement_pct': pct})
            company_months[m - 1]['target'] += t
            company_months[m - 1]['target_bookings'] += tb
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
            'total_target_bookings': total_target_book,
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
            'default_seed_growth': int((DEFAULT_SEED_GROWTH - 1) * 100),
            'note': f'Estimated commission = Bookings x {round(comm_rate * 100, 1)}% avg commission rate. '
                    f'Rate from {prior_year} deals with recorded commission. '
                    f'Initial targets seeded at +{int((DEFAULT_SEED_GROWTH - 1) * 100)}% over prior year (seasonal shape). '
                    f'Edit cells or use Apply Growth to customize.',
        },
    }


@router.put("/api/admin/targets/monthly")
def save_monthly_targets(
    body: MonthlyTargetSaveRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Batch upsert monthly targets for one or more advisors.
    Stores both commission and bookings targets using comm_rate."""
    from shared import WON_STAGES, line_filter_opp
    from sf_client import sf_query_all
    import cache

    # Get commission rate so we can store both units
    lf = line_filter_opp(body.line)
    comm_rate = _get_comm_rate_accurate(
        body.line, body.year - 1, cache, sf_query_all, WON_STAGES, lf
    )
    if comm_rate <= 0:
        comm_rate = 0.10  # fallback 10%

    count = 0
    for update in body.updates:
        for month_str, amount in update.months.items():
            month_int = int(month_str)
            if month_int < 1 or month_int > 12:
                continue

            # Compute both units from the submitted value
            if body.base == 'bookings':
                bookings_val = round(amount)
                commission_val = round(amount * comm_rate)
            else:
                commission_val = round(amount)
                bookings_val = round(amount / comm_rate) if comm_rate > 0 else round(amount)

            existing = db.query(MonthlyAdvisorTarget).filter(
                MonthlyAdvisorTarget.advisor_target_id == update.advisor_target_id,
                MonthlyAdvisorTarget.year == body.year,
                MonthlyAdvisorTarget.month == month_int,
            ).first()
            if existing:
                existing.target_amount = commission_val
                existing.target_bookings = bookings_val
                existing.updated_by_email = admin.email
                existing.updated_at = datetime.utcnow()
            else:
                db.add(MonthlyAdvisorTarget(
                    advisor_target_id=update.advisor_target_id,
                    year=body.year, month=month_int,
                    target_amount=commission_val,
                    target_bookings=bookings_val,
                    updated_by_email=admin.email,
                ))
            count += 1
    db.commit()

    log_activity(
        db, action='monthly_targets_saved', category='targets',
        user=admin,
        detail=f"Saved {count} monthly target entries for {body.year} (base={body.base}, rate={comm_rate:.4f})",
        metadata={'year': body.year, 'advisor_count': len(body.updates), 'cell_count': count,
                  'base': body.base, 'comm_rate': round(comm_rate, 4)},
    )
    return {'status': 'saved', 'count': count}


@router.delete("/api/admin/targets/monthly/{year}/reseed")
def reseed_monthly_targets(
    year: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete all system-seeded targets for a year so they get re-seeded with current growth."""
    from sqlalchemy import or_
    deleted = db.query(MonthlyAdvisorTarget).filter(
        MonthlyAdvisorTarget.year == year,
        or_(
            MonthlyAdvisorTarget.updated_by_email == 'system-seed',
            MonthlyAdvisorTarget.updated_by_email.is_(None),
        ),
    ).delete(synchronize_session=False)
    db.commit()
    log_activity(
        db, action='monthly_targets_reseeded', category='targets',
        user=admin,
        detail=f"Cleared {deleted} system-seeded targets for {year} — will re-seed on next load",
        metadata={'year': year, 'deleted': deleted},
    )
    return {'status': 'reseeded', 'deleted': deleted}
