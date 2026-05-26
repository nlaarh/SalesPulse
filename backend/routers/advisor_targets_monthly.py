"""Advisor Targets — monthly breakdown, achievement, and admin save endpoints.

Advisors are sourced directly from Salesforce (anyone with bookings in prior/current year).
No dependency on uploaded target files.
"""

import logging
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models import TargetUpload, AdvisorTarget, MonthlyAdvisorTarget, User
from auth import get_current_user, require_admin
from activity_logger import log_activity
from shared import get_owner_map
from constants import CACHE_TTL_MEDIUM, CACHE_TTL_HOUR, CACHE_TTL_DAY, CACHE_TTL_12H
from routers.advisor_targets_helpers import (
    _get_comm_rate, _sf_advisors_with_bookings, _get_comm_rate_accurate,
    _ensure_advisor_targets, _get_existing_advisor_targets, DEFAULT_SEED_GROWTH,
)

router = APIRouter()
log = logging.getLogger('salesinsight.targets')


# ── Schemas ──────────────────────────────────────────────────────────────────

from schemas import MonthlyTargetUpdate, MonthlyTargetSaveRequest, EstimateRequest


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

    advisor_ids = _ensure_advisor_targets(db, list(all_names.values()), line=body.line)

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

def _get_advisor_monthly_actuals(line: str, year: int, cache_module, sf_query_all, WON_STAGES, lf) -> dict:
    """Unified actuals getter. Queries PBI for Travel/Insurance, falls back to Salesforce for other lines.
    Returns: {
        'actuals': {name_lower: {month: {'bookings': float, 'commission': float}}},
        'names': {name_lower: original_name},
        'branches': {name_lower: branch_name}
    }
    """
    key = f"advisor_monthly_actuals_v5_{line}_{year}"

    def fetch():
        out = {}
        name_case_map = {}
        branch_map = {}

        if line in ('Travel', 'Insurance'):
            sd = f"{year}-01-01"
            ed = f"{year}-12-31"
            try:
                from pbi_utils import pbi_monthly_map as _pbi_map
                pbi_data = _pbi_map(line, sd, ed)
            except Exception as e:
                log.error(f"Failed to fetch PBI actuals for {line} {year}: {e}")
                pbi_data = {}

            for nk, month_data in pbi_data.items():
                raw_name = next(iter(month_data.values()))['_raw_name']
                name = raw_name.strip().lower()
                name_case_map[name] = raw_name.strip()
                if name not in out:
                    out[name] = {m: {'bookings': 0.0, 'commission': 0.0} for m in range(1, 13)}
                for ym, pd in month_data.items():
                    try:
                        yr_str, mo_str = ym.split('-')
                        if int(yr_str) != year:
                            continue
                        m = int(mo_str)
                        out[name][m]['bookings'] += pd['sales']
                        out[name][m]['commission'] += pd['commission']
                    except Exception:
                        pass
        else:
            # Salesforce Fallback
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
            for r in rows:
                original_name = owner_map.get(r.get('OwnerId', ''), '').strip()
                name = original_name.lower()
                if not name:
                    continue
                name_case_map[name] = original_name
                mo = r.get('mo', 0)
                rev = float(r.get('rev', 0.0) or 0.0)
                comm = float(r.get('comm', 0.0) or 0.0)

                if name not in out:
                    out[name] = {m: {'bookings': 0.0, 'commission': 0.0} for m in range(1, 13)}
                out[name][mo]['bookings'] += rev
                out[name][mo]['commission'] += comm

        return {'actuals': out, 'names': name_case_map, 'branches': branch_map}

    return cache_module.cached_query(key, fetch, ttl=3600, disk_ttl=86400)



@router.get("/api/targets/monthly/{year}")
def get_monthly_targets(
    year: int,
    line: str = "Travel",
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all advisors' 12-month targets + actuals. Sourced from PBI / SF."""
    from shared import WON_STAGES, line_filter_opp
    from sf_client import sf_query_all
    import cache

    lf = line_filter_opp(line)
    prior_year = year - 1
    current_year_sys = datetime.utcnow().year
    current_month_sys = datetime.utcnow().month

    # 1. Fetch current year and prior year monthly actual data (PBI for Travel/Insurance, SF fallback)
    cur_data = _get_advisor_monthly_actuals(line, year, cache, sf_query_all, WON_STAGES, lf)
    py_data = _get_advisor_monthly_actuals(line, prior_year, cache, sf_query_all, WON_STAGES, lf)
    comm_rate = _get_comm_rate_accurate(line, prior_year, cache, sf_query_all, WON_STAGES, lf)

    # 2. Build complete list of producing advisors (union of current + prior year + database targets)
    all_names: dict[str, str] = {}
    all_names.update(cur_data['names'])
    all_names.update(py_data['names'])

    # Filter DB targets by line (via TargetUpload) to prevent cross-line bleeding.
    # __sf_auto__ records are line='Travel' for all lines; skip them here since
    # PBI advisors are already captured via cur_data/py_data above.
    db_targets = (
        db.query(AdvisorTarget)
        .join(TargetUpload, AdvisorTarget.upload_id == TargetUpload.id)
        .filter(
            AdvisorTarget.monthly_target.isnot(None),
            TargetUpload.line == line,
            TargetUpload.filename != '__sf_auto__',
        )
        .all()
    )
    for dt in db_targets:
        name_lower = dt.sf_name.strip().lower()
        if name_lower not in all_names:
            all_names[name_lower] = dt.sf_name

    # 3. Read existing AdvisorTarget rows only. GET must not mutate target data.
    advisor_ids = _get_existing_advisor_targets(db, list(all_names.values()), line=line)

    # 4. Compute prior year totals for seeding
    prior_earnings: dict[str, float] = {}
    prior_bookings: dict[str, float] = {}
    py_monthly_map: dict[str, dict[int, float]] = {}

    for name_lower, months in py_data['actuals'].items():
        total_rev = sum(m['bookings'] for m in months.values())
        total_comm = sum(m['commission'] for m in months.values())
        prior_bookings[name_lower] = total_rev
        prior_earnings[name_lower] = total_comm if line in ('Travel', 'Insurance') else (total_rev * comm_rate)

        # Monthly breakdown for seasonal seeding
        py_monthly_map[name_lower] = {}
        for m, vals in months.items():
            py_monthly_map[name_lower][m] = vals['commission'] if line in ('Travel', 'Insurance') else vals['bookings']

    # 5. Load AdvisorTarget objects for metadata. Missing monthly targets render as 0
    # until an admin explicitly imports/saves/seeds them. Filter out null target rows.
    advisor_targets = db.query(AdvisorTarget).filter(
        AdvisorTarget.id.in_(list(advisor_ids.values())),
        AdvisorTarget.monthly_target.isnot(None)
    ).all()
    at_map = {at.id: at for at in advisor_targets}

    # 6. Load monthly target rows
    monthly_rows = db.query(MonthlyAdvisorTarget).filter(
        MonthlyAdvisorTarget.year == year
    ).all()
    monthly_comm_map: dict[int, dict[int, float]] = {}
    monthly_book_map: dict[int, dict[int, float]] = {}
    for mr in monthly_rows:
        monthly_comm_map.setdefault(mr.advisor_target_id, {})[mr.month] = mr.target_amount
        monthly_book_map.setdefault(mr.advisor_target_id, {})[mr.month] = mr.target_bookings or 0.0

    # 7. Build response data
    company_months = [{
        'month': m,
        'target': 0.0, 'target_bookings': 0.0,
        'actual': 0.0, 'bookings_actual': 0.0,
        'actual_py': 0.0, 'bookings_actual_py': 0.0,
        'achievement_pct': None, 'bookings_achievement_pct': None
    } for m in range(1, 13)]

    advisors = []
    for name_lower, display_name in all_names.items():
        at_id = advisor_ids.get(name_lower)
        at = at_map.get(at_id)
        if not at_id or not at:
            continue

        comm_by_month = monthly_comm_map.get(at_id, {})
        book_by_month = monthly_book_map.get(at_id, {})
        actuals_by_month = cur_data['actuals'].get(name_lower, {})
        actuals_py_by_month = py_data['actuals'].get(name_lower, {})

        months = []
        total_target = 0.0
        total_target_book = 0.0
        total_actual = 0.0
        total_actual_book = 0.0
        total_actual_py = 0.0
        total_actual_book_py = 0.0

        for m in range(1, 13):
            t = comm_by_month.get(m, 0.0)
            tb = book_by_month.get(m, 0.0)
            
            # Current year actuals
            act_vals = actuals_by_month.get(m) or actuals_by_month.get(str(m)) or {'bookings': 0.0, 'commission': 0.0}
            a = act_vals['commission']
            ab = act_vals['bookings']
            
            # Prior year actuals
            act_py_vals = actuals_py_by_month.get(m) or actuals_py_by_month.get(str(m)) or {'bookings': 0.0, 'commission': 0.0}
            
            # YoY Date Capping: if query year is current calendar year, blank out prior year months that are current/future
            if year == current_year_sys and m >= current_month_sys:
                apy = 0.0
                apb = 0.0
            else:
                apy = act_py_vals['commission']
                apb = act_py_vals['bookings']

            total_target += t
            total_target_book += tb
            total_actual += a
            total_actual_book += ab
            total_actual_py += apy
            total_actual_book_py += apb

            pct = round(a / t * 100, 1) if t > 0 else None
            pct_b = round(ab / tb * 100, 1) if tb > 0 else None

            months.append({
                'month': m,
                'target': t, 'target_bookings': tb,
                'actual': a, 'bookings_actual': ab,
                'actual_py': apy, 'bookings_actual_py': apb,
                'achievement_pct': pct, 'bookings_achievement_pct': pct_b
            })

            company_months[m - 1]['target'] += t
            company_months[m - 1]['target_bookings'] += tb
            company_months[m - 1]['actual'] += a
            company_months[m - 1]['bookings_actual'] += ab
            company_months[m - 1]['actual_py'] += apy
            company_months[m - 1]['bookings_actual_py'] += apb

        overall_pct = round(total_actual / total_target * 100, 1) if total_target > 0 else None
        overall_pct_b = round(total_actual_book / total_target_book * 100, 1) if total_target_book > 0 else None

        # Prior year monthly shape for seasonal display
        py_months = py_monthly_map.get(name_lower, {})
        py_month_list = [py_months.get(m, py_months.get(str(m), 0.0)) for m in range(1, 13)]

        monthly_threshold = at.monthly_target if at.monthly_target else 15000.0
        annual_threshold = monthly_threshold * 12

        advisors.append({
            'advisor_target_id': at_id,
            'name': at.raw_name or display_name,
            'sf_name': at.sf_name,
            'branch': at.branch,
            'title': at.title,
            'annual_threshold': annual_threshold,
            'monthly_threshold': monthly_threshold,
            'annual_stretch': at.annual_stretch,
            'months': months,
            'total_target': total_target,
            'total_target_bookings': total_target_book,
            'total_actual': total_actual,
            'total_actual_bookings': total_actual_book,
            'total_actual_py': total_actual_py,
            'total_actual_bookings_py': total_actual_book_py,
            'achievement_pct': overall_pct,
            'bookings_achievement_pct': overall_pct_b,
            'prior_year_actual': prior_earnings.get(name_lower, 0.0),
            'prior_year_revenue': prior_bookings.get(name_lower, 0.0),
            'prior_year_months': py_month_list,
        })

    for cm in company_months:
        cm['achievement_pct'] = round(cm['actual'] / cm['target'] * 100, 1) if cm['target'] > 0 else None
        cm['bookings_achievement_pct'] = round(cm['bookings_actual'] / cm['target_bookings'] * 100, 1) if cm['target_bookings'] > 0 else None

    co_total_target = sum(cm['target'] for cm in company_months)
    co_total_target_book = sum(cm['target_bookings'] for cm in company_months)
    co_total_actual = sum(cm['actual'] for cm in company_months)
    co_total_actual_book = sum(cm['bookings_actual'] for cm in company_months)
    co_total_actual_py = sum(cm['actual_py'] for cm in company_months)
    co_total_actual_book_py = sum(cm['bookings_actual_py'] for cm in company_months)

    advisors.sort(key=lambda a: a['prior_year_actual'], reverse=True)

    total_py_bookings = sum(prior_bookings.values())
    total_py_earnings = sum(prior_earnings.values())

    return {
        'year': year,
        'advisors': advisors,
        'company': {
            'months': company_months,
            'total_target': co_total_target,
            'total_target_bookings': co_total_target_book,
            'total_actual': co_total_actual,
            'total_actual_bookings': co_total_actual_book,
            'total_actual_py': co_total_actual_py,
            'total_actual_bookings_py': co_total_actual_book_py,
            'achievement_pct': round(co_total_actual / co_total_target * 100, 1) if co_total_target > 0 else None,
            'bookings_achievement_pct': round(co_total_actual_book / co_total_target_book * 100, 1) if co_total_target_book > 0 else None,
        },
        'methodology': {
            'commission_rate': round(comm_rate * 100, 1),
            'prior_year': prior_year,
            'prior_year_bookings': total_py_bookings,
            'prior_year_commission': total_py_earnings,
            'default_seed_growth': int((DEFAULT_SEED_GROWTH - 1) * 100),
            'note': f'Estimated commission = Bookings x {round(comm_rate * 100, 1)}% avg commission rate. '
                    f'Rate from {prior_year} deals with recorded commission. '
                    f'Target rows are read-only on load; admins must save/import/reseed to change database values.',
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
        # Update metadata if present
        advisor = db.query(AdvisorTarget).filter(AdvisorTarget.id == update.advisor_target_id).first()
        if advisor:
            if update.title is not None:
                advisor.title = update.title
            if update.branch is not None:
                advisor.branch = update.branch
            if update.monthly_target is not None:
                advisor.monthly_target = update.monthly_target
            if update.annual_stretch is not None:
                advisor.annual_stretch = update.annual_stretch
            db.add(advisor)

        current_year = datetime.utcnow().year
        current_month = datetime.utcnow().month

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
    line: str = Query('Travel'),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete system-seeded targets for a year/line. Scoped so clearing Insurance never touches Travel."""
    from sqlalchemy import or_
    # Find advisor_target_ids that belong to this line
    line_at_ids = (
        db.query(AdvisorTarget.id)
        .join(TargetUpload, AdvisorTarget.upload_id == TargetUpload.id)
        .filter(TargetUpload.line == line)
        .subquery()
    )
    deleted = db.query(MonthlyAdvisorTarget).filter(
        MonthlyAdvisorTarget.year == year,
        MonthlyAdvisorTarget.advisor_target_id.in_(line_at_ids),
        or_(
            MonthlyAdvisorTarget.updated_by_email == 'system-seed',
            MonthlyAdvisorTarget.updated_by_email.is_(None),
        ),
    ).delete(synchronize_session=False)
    db.commit()
    log_activity(
        db, action='monthly_targets_reseeded', category='targets',
        user=admin,
        detail=f"Cleared {deleted} system-seeded {line} targets for {year}",
        metadata={'year': year, 'line': line, 'deleted': deleted},
    )
    return {'status': 'reseeded', 'deleted': deleted}
