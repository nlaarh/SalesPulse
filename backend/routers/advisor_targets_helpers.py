"""Shared helper functions for advisor targets monthly endpoint."""

import logging
from sqlalchemy.orm import Session

from models import TargetUpload, AdvisorTarget, MonthlyAdvisorTarget
from shared import get_owner_map
from constants import CACHE_TTL_MEDIUM, CACHE_TTL_HOUR, CACHE_TTL_DAY, CACHE_TTL_12H

log = logging.getLogger('salesinsight.targets')


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



def _get_comm_rate_accurate(line: str, year: int, cache_module, sf_query_all, WON_STAGES, lf) -> float:
    """Get true commission rate. Uses PBI for Travel/Insurance (authoritative); SF for other lines."""
    from pbi_utils import PBI_COMMISSION_LINES
    if line in PBI_COMMISSION_LINES:
        key = f"comm_rate_pbi_{line}_{year}"
        def fetch_pbi():
            from pbi_utils import pbi_by_day
            rows = pbi_by_day(line, f"{year}-01-01", f"{year}-12-31")
            total_sales = sum(r.get('sales', 0) for r in rows)
            total_comm  = sum(r.get('commission', 0) for r in rows)
            return [{'rev': total_sales, 'comm': total_comm}]
        records = cache_module.cached_query(key, fetch_pbi, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)
        if records:
            rev  = records[0].get('rev', 0) or 0
            comm = records[0].get('comm', 0) or 0
            if rev > 0:
                return comm / rev
        return 0.187

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


def _ensure_advisor_targets(db: Session, sf_names: list[str], line: str = 'Travel'):
    """Auto-create AdvisorTarget rows for SF advisors that don't have one yet.
    Returns dict of sf_name_lower -> AdvisorTarget.id.
    Uses a per-line __sf_auto__ upload so Travel and Insurance advisors stay isolated.
    """
    # Get or create a line-scoped system upload record.
    # One record per line prevents Insurance advisors from landing on a Travel upload
    # (which was the old behaviour when a single __sf_auto__ record existed).
    upload = (
        db.query(TargetUpload)
        .filter(TargetUpload.filename == '__sf_auto__', TargetUpload.line == line)
        .first()
    )
    if not upload:
        upload = TargetUpload(
            filename='__sf_auto__',
            line=line,
            uploaded_by_id=0,
            uploaded_by_email='system',
            advisor_count=0,
        )
        db.add(upload)
        db.flush()

    # Get existing advisor targets for this line's upload only
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


def _get_existing_advisor_targets(db: Session, sf_names: list[str], line: str = 'Travel'):
    """Read-only lookup for existing AdvisorTarget rows by Salesforce name, scoped to line."""
    wanted = {name.strip().lower() for name in sf_names if name and name.strip()}
    if not wanted:
        return {}
    rows = (
        db.query(AdvisorTarget)
        .join(TargetUpload, AdvisorTarget.upload_id == TargetUpload.id)
        .filter(TargetUpload.line == line)
        .all()
    )
    return {
        row.sf_name.strip().lower(): row.id
        for row in rows
        if row.sf_name and row.sf_name.strip().lower() in wanted
    }


DEFAULT_SEED_GROWTH = 1.10  # 10% growth over prior year when seeding targets


def _ensure_monthly_targets(db: Session, year: int, advisor_ids: dict[str, int],
                            prior_earnings: dict[str, float],
                            py_monthly: dict[str, dict[int, float]] | None = None,
                            comm_rate: float = 0):
    """Seed missing MonthlyAdvisorTarget rows using prior year's seasonal shape + default growth.
    Stores both commission (target_amount) and bookings (target_bookings)."""
    # Backfill monthly_target on AdvisorTarget rows created with monthly_target=None
    # (e.g. auto-created by _ensure_advisor_targets for PBI advisors).
    # Runs before early-exit so subsequent calls still pick up stragglers.
    _at_ids = [id for id in advisor_ids.values() if id]
    if _at_ids:
        _no_mt = db.query(AdvisorTarget).filter(
            AdvisorTarget.id.in_(_at_ids),
            AdvisorTarget.monthly_target.is_(None)
        ).all()
        if _no_mt:
            _mr = db.query(MonthlyAdvisorTarget).filter(
                MonthlyAdvisorTarget.advisor_target_id.in_([a.id for a in _no_mt]),
                MonthlyAdvisorTarget.year == year
            ).all()
            _rows_by = {}
            for r in _mr:
                _rows_by.setdefault(r.advisor_target_id, []).append(r.target_amount)
            _changed = False
            for at in _no_mt:
                vals = _rows_by.get(at.id)
                if vals:
                    at.monthly_target = round(sum(vals) / 12)
                    _changed = True
            if _changed:
                db.commit()

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
            company_shape[int(m) - 1] += v
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
                val = adv_months.get(m, adv_months.get(str(m), 0))
                target = round(base * (val / adv_total))
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
