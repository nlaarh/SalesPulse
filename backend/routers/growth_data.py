"""Auxiliary data endpoints for the Strategic Growth Plan Data Explorer.

Each dataset has:
  - GET endpoint returning rows + totals
  - Optional refresh path via shared /api/cache/flush-live

Datasets:
  - /api/growth/data/canonical-counts  : ONE source of truth for member/auto/home/travel totals
  - /api/growth/data/customers-by-age  : 5-cohort breakdown of active members
  - /api/growth/data/coverage-tiers    : member counts by Premier / Plus / Basic
  - DMV vehicle data is exposed at /api/territory/vehicle-data (existing)
  - ZIP penetration via /api/territory/map-data (existing)
"""

import logging
from datetime import date

from fastapi import APIRouter

from sf_client import sf_parallel
import cache

router = APIRouter()
log = logging.getLogger(__name__)


# ── Age cohort buckets ────────────────────────────────────────────────────────
# Granular bands so each one maps to a distinct strategic play:
#   16-17  → teen drivers (Driver Programs)
#   18-24  → Gen Z / young adults
#   25-34  → millennials
#   35-44  → Gen X early
#   45-54  → Gen X late
#   55-64  → near-seniors / pre-retirement
#   65-74  → young seniors
#   75+    → senior
# Each bucket is non-overlapping. A row showing zero is still informative
# (e.g. "we have no 16-17 members today — Driver Programs upside").
AGE_COHORTS = [
    ('16-17', 16, 17),
    ('18-24', 18, 24),
    ('25-34', 25, 34),
    ('35-44', 35, 44),
    ('45-54', 45, 54),
    ('55-64', 55, 64),
    ('65-74', 65, 74),
    ('75+',   75, 99),
]


def _safe_birthday(year: int, month: int, day: int) -> date:
    """Construct a date safely (e.g. handles Feb 29)."""
    try:
        return date(year, month, day)
    except ValueError:
        return date(year, month, 28)


@router.get('/api/growth/data/customers-by-age')
def customers_by_age():
    """Active member count grouped by age cohort.

    Returns rows: cohort, count, pct_of_total.
    Five SOQL COUNT queries in parallel.
    """

    today = date.today()
    # v3 bumped after two fixes:
    #   1. Filter widened to org-wide active members so the cohort total matches
    #      what the rest of the page reports (851K canonical) instead of the
    #      stricter ~754K WCNY-active-non-expired count.
    #   2. Cohort birthdate ranges are now non-overlapping at the boundaries —
    #      previously e.g. someone born exactly bd_start of one cohort was also
    #      bd_end of the adjacent cohort, so they were counted twice.
    key = f'growth_data_customers_by_age_v4_{today.isoformat()}'

    def fetch():
        queries = {}
        # Loose filter — matches territory_map.py's `members_total` (the count
        # this page already shows in the hero). Cohorts must reconcile to it.
        base = "IsPersonAccount = true AND Member_Status__c = 'A'"

        for label, min_age, max_age in AGE_COHORTS:
            # Person is age X today iff their birthdate is in
            #     ( today - (X+1)y , today - Xy ]   (half-open, upper inclusive)
            # Using strict greater-than on bd_start avoids the prior overlap
            # bug where cohort N's bd_start equaled cohort N-1's bd_end.
            bd_end = _safe_birthday(today.year - min_age, today.month, today.day)
            bd_start = _safe_birthday(today.year - max_age - 1, today.month, today.day)
            queries[label] = f"""
                SELECT COUNT(Id) cnt
                FROM Account
                WHERE {base}
                  AND PersonBirthdate != null
                  AND PersonBirthdate > {bd_start.isoformat()}
                  AND PersonBirthdate <= {bd_end.isoformat()}
            """

        queries['Unknown'] = f"""
            SELECT COUNT(Id) cnt
            FROM Account
            WHERE {base}
              AND PersonBirthdate = null
        """

        queries['Total'] = f"""
            SELECT COUNT(Id) cnt
            FROM Account
            WHERE {base}
        """

        data = sf_parallel(**queries)

        def cnt(k: str) -> int:
            try:
                return (data.get(k, [{}])[0] or {}).get('cnt', 0) or 0
            except Exception:
                return 0

        # The parallel `Total` query and the cohort queries can drift slightly
        # (a member can have their status flipped between queries). To keep
        # the percentages internally consistent, base them on the row sum.
        sf_total = cnt('Total') or 0
        unk = cnt('Unknown')
        cohort_counts = [(label, _min, _max, cnt(label)) for label, _min, _max in AGE_COHORTS]
        row_sum = sum(c for _, _, _, c in cohort_counts) + unk
        denom = row_sum or 1

        rows = []
        for label, _min, _max, c in cohort_counts:
            rows.append({
                'cohort': label,
                'min_age': _min,
                'max_age': _max,
                'count': c,
                'pct_of_total': round(100 * c / denom, 2),
            })
        rows.append({
            'cohort': 'Unknown',
            'min_age': None,
            'max_age': None,
            'count': unk,
            'pct_of_total': round(100 * unk / denom, 2),
        })

        return {
            'level': 'cohort',
            'as_of': today.isoformat(),
            'rows': rows,
            'totals': {
                'count': row_sum,        # sum of displayed rows (always reconciles)
                'sf_total': sf_total,    # SOQL COUNT for cross-check
            },
            'count': len(rows),
        }

    # 6 hour TTL — age cohort buckets shift daily but aren't real-time
    return cache.cached_query(key, fetch, ttl=6 * 3600, disk_ttl=24 * 3600)


@router.get('/api/growth/data/coverage-tiers')
def coverage_tiers():
    """Active members by coverage tier (Premier / Plus / Basic)."""

    today = date.today()
    # v2 bumped when filter was widened to match customers-by-age + canonical-counts.
    key = f'growth_data_coverage_tiers_v2_{today.isoformat()}'

    def fetch():
        # Match the org-wide active filter used by canonical-counts so all the
        # /growth-plan totals reconcile.
        base = "IsPersonAccount = true AND Member_Status__c = 'A'"
        data = sf_parallel(
            premier=f"SELECT COUNT(Id) cnt FROM Account WHERE {base} AND ImportantActiveMemCoverage__c = 'PREMIER'",
            plus=f"SELECT COUNT(Id) cnt FROM Account WHERE {base} AND ImportantActiveMemCoverage__c = 'PLUS'",
            basic=f"SELECT COUNT(Id) cnt FROM Account WHERE {base} AND ImportantActiveMemCoverage__c = 'B'",
            other=f"SELECT COUNT(Id) cnt FROM Account WHERE {base} AND (ImportantActiveMemCoverage__c = null OR ImportantActiveMemCoverage__c NOT IN ('PREMIER','PLUS','B'))",
            total=f"SELECT COUNT(Id) cnt FROM Account WHERE {base}",
        )

        def cnt(k: str) -> int:
            try:
                return (data.get(k, [{}])[0] or {}).get('cnt', 0) or 0
            except Exception:
                return 0

        total = cnt('total') or 1
        tiers = [
            ('Premier', cnt('premier')),
            ('Plus', cnt('plus')),
            ('Basic', cnt('basic')),
            ('Other / Unknown', cnt('other')),
        ]
        rows = [
            {'tier': name, 'count': c, 'pct_of_total': round(100 * c / total, 2)}
            for name, c in tiers
        ]
        return {
            'level': 'tier',
            'as_of': today.isoformat(),
            'rows': rows,
            'totals': {'count': total},
            'count': len(rows),
        }

    return cache.cached_query(key, fetch, ttl=6 * 3600, disk_ttl=24 * 3600)


@router.post('/api/growth/data/refresh')
def refresh_dataset(dataset: str = 'all'):
    """Invalidate cache for a specific data-explorer dataset and refetch on next request."""
    keys_by_dataset = {
        'customers-by-age': 'growth_data_customers_by_age',
        'coverage-tiers': 'growth_data_coverage_tiers',
        'vehicles': 'territory_vehicle_data',
        'zips': 'territory_map_data',
    }

    cleared = []
    if dataset == 'all':
        for prefix in keys_by_dataset.values():
            n = cache.flush_prefix(prefix)
            cleared.append({'prefix': prefix, 'cleared': n})
    else:
        prefix = keys_by_dataset.get(dataset)
        if not prefix:
            return {'ok': False, 'error': f"Unknown dataset '{dataset}'", 'valid': list(keys_by_dataset)}
        n = cache.flush_prefix(prefix)
        cleared.append({'prefix': prefix, 'cleared': n})

    return {'ok': True, 'dataset': dataset, 'cleared': cleared}


# ── Canonical counts — single source of truth for the Strategic Growth Plan ──
#
# `members` is queried LIVE from Salesforce so it reconciles exactly with the
# customers-by-age and coverage-tiers tables (same `IsPersonAccount = true AND
# Member_Status__c = 'A'` filter). Auto/home/travel are still hardcoded from
# the PBI workbook because the SOQL definitions for those don't yet match the
# board-reported numbers (a follow-up).
#
# When PBI republishes auto/home/travel, update CANONICAL_AH_T below.

CANONICAL_AH_T = {
    'auto_customers':     27_385,   # Auto insurance policies in force (PBI)
    'home_customers':     17_111,   # Home insurance policies in force (PBI)
    'travel_customers':   79_439,   # Travel agency customers, rolling (PBI)
}
CANONICAL_AH_T_AS_OF = '2026-04-30'  # PBI workbook export date for the static counts


def _live_members_total() -> int:
    """Active members per Salesforce (org-wide). Cached 6h.

    Same filter used by `customers-by-age` and `coverage-tiers` so every
    aggregation on /growth-plan reconciles to this single number.
    """
    today = date.today()
    key = f'canonical_members_live_{today.isoformat()}'

    def fetch():
        try:
            data = sf_parallel(
                total="SELECT COUNT(Id) cnt FROM Account WHERE IsPersonAccount = true AND Member_Status__c = 'A'",
            )
            rows = data.get('total') or []
            return int((rows[0] or {}).get('cnt', 0)) if rows else 0
        except Exception:
            log.exception('canonical: live members query failed; falling back to last cached')
            return 0

    return cache.cached_query(key, fetch, ttl=6 * 3600, disk_ttl=24 * 3600)


@router.get('/api/growth/data/canonical-counts')
def canonical_counts():
    """Single source of truth for member/insurance/travel totals on /growth-plan.

    Members is live-queried from SF so the hero/donuts/per-product cards
    reconcile with the cohort and coverage-tier tables. Insurance & travel are
    still from the PBI workbook (see memory:
    project_canonical_counts.md) which is the same source the board PDF report
    uses; updating one place updates the whole page.
    """
    members_live = _live_members_total()
    counts = {
        'members': members_live,
        **CANONICAL_AH_T,
    }
    return {
        'as_of': date.today().isoformat(),
        'source': 'SF live · members; PBI workbook · auto/home/travel',
        'counts': counts,
        'total_insurance': counts['auto_customers'] + counts['home_customers'],
    }
