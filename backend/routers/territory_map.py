"""Territory Heatmap — Zip-code-level customer penetration analytics.

Shows insurance and travel customer density across AAA WCNY's operating
regions (Western, Rochester, Central) with hover tooltips for detailed
per-zip metrics.
"""

import json
import logging
import os
from datetime import date
from typing import Optional
from collections import defaultdict

from fastapi import APIRouter, Query

from sf_client import sf_parallel
from shared import (
    WON_STAGES, OPP_RT_TRAVEL_ID, OPP_RT_INSURANCE_ID,
    resolve_dates as _resolve_dates,
)
from constants import CACHE_TTL_HOUR, CACHE_TTL_DAY
import cache

router = APIRouter()
log = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

OPERATING_REGIONS = ("Western", "Rochester", "Central")
REGION_FILTER = "Billing_Region__c IN ('Western','Rochester','Central')"
MIN_MEMBERS = 50  # skip noise zips
NY_STATE = "BillingState = 'New York'"

# Static zip centroid lookup (no numpy/pandas dependency)
_CENTROID_FILE = os.path.join(os.path.dirname(__file__), '..', 'ny_zip_centroids.json')
with open(_CENTROID_FILE) as _f:
    _ZIP_CENTROIDS: dict[str, list] = json.load(_f)


def _zip_centroid(zip_code: str) -> tuple:
    """Return (lat, lng, city) for a US zip code from static lookup."""
    entry = _ZIP_CENTROIDS.get(zip_code)
    if entry:
        return entry[0], entry[1], entry[2]
    return None, None, ''


# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.get("/api/territory/map-data")
def territory_map_data(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Return zip-level heatmap data for insurance + travel penetration."""

    today = date.today()
    cy_start = f"{today.year}-01-01"
    cy_end = today.isoformat()
    py_start = f"{today.year - 1}-01-01"
    py_end = f"{today.year - 1}-12-31"
    travel_3yr = f"{today.year - 3}-01-01"

    key = f"territory_map_{cy_start}_{cy_end}"

    def fetch():
        # Batch 1: members + insurance
        batch1 = sf_parallel(
            members=f"""
                SELECT BillingPostalCode zip, Billing_Region__c region,
                       COUNT(Id) cnt
                FROM Account
                WHERE BillingPostalCode != null
                  AND {NY_STATE} AND {REGION_FILTER}
                GROUP BY BillingPostalCode, Billing_Region__c
                HAVING COUNT(Id) >= {MIN_MEMBERS}
                ORDER BY COUNT(Id) DESC
                LIMIT 2000
            """,
            ins_cy=f"""
                SELECT Account.BillingPostalCode zip, COUNT(Id) cnt
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_INSURANCE_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {cy_start} AND CloseDate <= {cy_end}
                  AND Account.BillingPostalCode != null
                  AND Account.BillingState = 'New York'
                GROUP BY Account.BillingPostalCode
                ORDER BY COUNT(Id) DESC
                LIMIT 2000
            """,
            ins_py=f"""
                SELECT Account.BillingPostalCode zip, COUNT(Id) cnt
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_INSURANCE_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {py_start} AND CloseDate <= {py_end}
                  AND Account.BillingPostalCode != null
                  AND Account.BillingState = 'New York'
                GROUP BY Account.BillingPostalCode
                ORDER BY COUNT(Id) DESC
                LIMIT 2000
            """,
        )
        # Batch 2: travel queries (separate to stay under SF concurrency)
        batch2 = sf_parallel(
            travel_3yr_q=f"""
                SELECT Account.BillingPostalCode zip, COUNT(Id) cnt,
                       SUM(Amount) rev
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {travel_3yr} AND CloseDate <= {cy_end}
                  AND Account.BillingPostalCode != null
                  AND Account.BillingState = 'New York'
                  AND Amount != null
                GROUP BY Account.BillingPostalCode
                ORDER BY COUNT(Id) DESC
                LIMIT 2000
            """,
            travel_cy=f"""
                SELECT Account.BillingPostalCode zip, COUNT(Id) cnt,
                       SUM(Amount) rev
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {cy_start} AND CloseDate <= {cy_end}
                  AND Account.BillingPostalCode != null
                  AND Account.BillingState = 'New York'
                  AND Amount != null
                GROUP BY Account.BillingPostalCode
                ORDER BY COUNT(Id) DESC
                LIMIT 2000
            """,
            travel_py=f"""
                SELECT Account.BillingPostalCode zip, COUNT(Id) cnt,
                       SUM(Amount) rev
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {py_start} AND CloseDate <= {py_end}
                  AND Account.BillingPostalCode != null
                  AND Account.BillingState = 'New York'
                  AND Amount != null
                GROUP BY Account.BillingPostalCode
                ORDER BY COUNT(Id) DESC
                LIMIT 2000
            """,
        )
        data = {**batch1, **batch2}

        # Build lookup dicts from query results
        def _to_dict(records, val_key='cnt', extra_keys=None):
            out = {}
            for r in (records or []):
                z = r.get('zip', '')
                if not z:
                    continue
                entry = {val_key: r.get(val_key, 0)}
                if extra_keys:
                    for ek in extra_keys:
                        entry[ek] = r.get(ek, 0)
                out[z] = entry
            return out

        members_raw = data.get('members', [])
        ins_cy = _to_dict(data.get('ins_cy', []))
        ins_py = _to_dict(data.get('ins_py', []))
        travel_3yr_d = _to_dict(data.get('travel_3yr_q', []),
                                extra_keys=['rev'])
        travel_cy = _to_dict(data.get('travel_cy', []),
                             extra_keys=['rev'])
        travel_py = _to_dict(data.get('travel_py', []),
                             extra_keys=['rev'])

        # Totals for % of org calculations
        total_ins_cy = sum(v['cnt'] for v in ins_cy.values())
        total_ins_py = sum(v['cnt'] for v in ins_py.values())
        total_travel_3yr = sum(v['cnt'] for v in travel_3yr_d.values())
        total_travel_cy_rev = sum(v.get('rev', 0) for v in travel_cy.values())
        total_travel_py_rev = sum(v.get('rev', 0) for v in travel_py.values())
        total_members = sum(r.get('cnt', 0) for r in members_raw)

        # Build per-zip records
        zips = []
        for rec in members_raw:
            z = rec.get('zip', '')
            if not z:
                continue
            member_cnt = rec.get('cnt', 0)
            region = rec.get('region', '')

            lat, lng, city = _zip_centroid(z)
            if lat is None:
                continue

            ic = ins_cy.get(z, {}).get('cnt', 0)
            ip = ins_py.get(z, {}).get('cnt', 0)
            tc = travel_3yr_d.get(z, {}).get('cnt', 0)
            tr_cy = travel_cy.get(z, {}).get('rev', 0) or 0
            tr_py = travel_py.get(z, {}).get('rev', 0) or 0
            tc_cy = travel_cy.get(z, {}).get('cnt', 0)
            tc_py = travel_py.get(z, {}).get('cnt', 0)

            ins_pct = round(ic / member_cnt * 100, 1) if member_cnt else 0
            travel_pct = round(tc / member_cnt * 100, 1) if member_cnt else 0

            zips.append({
                'zip': z,
                'lat': lat,
                'lng': lng,
                'city': city,
                'region': region,
                'members': member_cnt,
                # Insurance
                'ins_customers_cy': ic,
                'ins_customers_py': ip,
                'ins_penetration': ins_pct,
                'ins_pct_of_total': round(ic / total_ins_cy * 100, 2) if total_ins_cy else 0,
                # Travel
                'travel_customers_3yr': tc,
                'travel_bookings_cy': tc_cy,
                'travel_bookings_py': tc_py,
                'travel_penetration': travel_pct,
                'travel_pct_of_total': round(tc / total_travel_3yr * 100, 2) if total_travel_3yr else 0,
                # Revenue
                'travel_rev_cy': round(tr_cy, 0),
                'travel_rev_py': round(tr_py, 0),
            })

        # Sort by member count desc
        zips.sort(key=lambda x: x['members'], reverse=True)

        # Region summaries
        region_summary = defaultdict(lambda: {
            'members': 0, 'ins_cy': 0, 'travel_3yr': 0,
            'travel_rev_cy': 0, 'zip_count': 0,
        })
        for z in zips:
            r = region_summary[z['region']]
            r['members'] += z['members']
            r['ins_cy'] += z['ins_customers_cy']
            r['travel_3yr'] += z['travel_customers_3yr']
            r['travel_rev_cy'] += z['travel_rev_cy']
            r['zip_count'] += 1

        return {
            'zips': zips,
            'totals': {
                'members': total_members,
                'ins_customers_cy': total_ins_cy,
                'ins_customers_py': total_ins_py,
                'travel_customers_3yr': total_travel_3yr,
                'travel_rev_cy': round(total_travel_cy_rev, 0),
                'travel_rev_py': round(total_travel_py_rev, 0),
                'zip_count': len(zips),
            },
            'regions': dict(region_summary),
            'year': today.year,
        }

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)
