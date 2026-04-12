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
from constants import CACHE_TTL_HOUR, CACHE_TTL_DAY, CACHE_TTL_NEVER
import cache

router = APIRouter()
log = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

OPERATING_REGIONS = ("Western", "Rochester", "Central")
REGION_FILTER = "Billing_Region__c IN ('Western','Rochester','Central')"
ACTIVE_MEMBER = "(Member_Status__c = 'A' OR ImportantActiveMemExpiryDate__c >= TODAY)"
MIN_MEMBERS = 10  # skip tiny noise zips on the map
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
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Return zip-level heatmap data for insurance + travel penetration."""

    today = date.today()
    # Use resolve_dates to honor period/custom dates like all other endpoints
    cy_start, cy_end = _resolve_dates(start_date, end_date, period)
    # Compute prior-year equivalent
    from dateutil.relativedelta import relativedelta
    sd = date.fromisoformat(cy_start)
    ed = date.fromisoformat(cy_end)
    py_start = (sd - relativedelta(years=1)).isoformat()
    py_end = (ed - relativedelta(years=1)).isoformat()
    travel_3yr = f"{today.year - 3}-01-01"

    key = f"territory_map_{cy_start}_{cy_end}"

    def fetch():
        # ── Load census data in a background thread while SOQL runs ──
        import threading
        census_result: dict[str, dict] = {}
        census_error = None

        def _load_census():
            nonlocal census_result, census_error
            try:
                from database import SessionLocal
                from models import GeoZip
                db = SessionLocal()
                geo_zips = db.query(GeoZip).all()
                for gz in geo_zips:
                    census_result[gz.zip_code] = {
                        'population': gz.population or 0,
                        'pop_18plus': gz.pop_18plus or 0,
                        'median_income': gz.median_income or 0,
                        'median_age': gz.median_age or 0,
                        'housing_units': gz.housing_units or 0,
                        'median_home_value': gz.median_home_value or 0,
                        'college_educated': gz.college_educated or 0,
                        'county_name': gz.county_name or '',
                    }
                db.close()
            except Exception as e:
                census_error = e

        census_thread = threading.Thread(target=_load_census, daemon=True)
        census_thread.start()

        # ── ALL 12 SOQL queries in ONE parallel batch ──
        # Previously 3 sequential batches (batch1→batch2→batch3).
        # No data dependencies between any of these queries, so run all at once.
        data = sf_parallel(
            # -- Members & totals --
            members=f"""
                SELECT BillingPostalCode zip, Billing_Region__c region,
                       COUNT(Id) cnt
                FROM Account
                WHERE BillingPostalCode != null
                  AND {NY_STATE} AND {REGION_FILTER}
                  AND {ACTIVE_MEMBER}
                GROUP BY BillingPostalCode, Billing_Region__c
                HAVING COUNT(Id) >= {MIN_MEMBERS}
                ORDER BY COUNT(Id) DESC
                LIMIT 2000
            """,

            # -- Insurance customers --
            ins_customers=f"""
                SELECT BillingPostalCode zip, COUNT(Id) cnt
                FROM Account
                WHERE Insuance_Customer_ID__c != null
                  AND BillingPostalCode != null
                  AND {NY_STATE} AND {REGION_FILTER}
                GROUP BY BillingPostalCode
                ORDER BY COUNT(Id) DESC
                LIMIT 2000
            """,

            # -- Travel customers 3yr + CY + PY --
            travel_customers_3yr=f"""
                SELECT BillingPostalCode zip, COUNT(Id) cnt
                FROM Account
                WHERE Id IN (
                    SELECT AccountId FROM Opportunity
                    WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                      AND {WON_STAGES}
                      AND CloseDate >= {travel_3yr} AND CloseDate <= {cy_end}
                )
                  AND BillingPostalCode != null
                  AND {NY_STATE} AND {REGION_FILTER}
                GROUP BY BillingPostalCode
                ORDER BY COUNT(Id) DESC
                LIMIT 2000
            """,

            travel_customers_cy=f"""
                SELECT BillingPostalCode zip, COUNT(Id) cnt
                FROM Account
                WHERE Id IN (
                    SELECT AccountId FROM Opportunity
                    WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                      AND {WON_STAGES}
                      AND CloseDate >= {cy_start} AND CloseDate <= {cy_end}
                )
                  AND BillingPostalCode != null
                  AND {NY_STATE} AND {REGION_FILTER}
                GROUP BY BillingPostalCode
                ORDER BY COUNT(Id) DESC
                LIMIT 2000
            """,
            travel_customers_py=f"""
                SELECT BillingPostalCode zip, COUNT(Id) cnt
                FROM Account
                WHERE Id IN (
                    SELECT AccountId FROM Opportunity
                    WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                      AND {WON_STAGES}
                      AND CloseDate >= {py_start} AND CloseDate <= {py_end}
                )
                  AND BillingPostalCode != null
                  AND {NY_STATE} AND {REGION_FILTER}
                GROUP BY BillingPostalCode
                ORDER BY COUNT(Id) DESC
                LIMIT 2000
            """,
            # -- Revenue (insurance + travel, CY + PY) --
            ins_rev_cy=f"""
                SELECT Account.BillingPostalCode zip,
                       SUM(Amount) rev
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_INSURANCE_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {cy_start} AND CloseDate <= {cy_end}
                  AND Account.BillingPostalCode != null
                  AND Account.BillingState = 'New York'
                GROUP BY Account.BillingPostalCode
                ORDER BY SUM(Amount) DESC
                LIMIT 2000
            """,
            ins_rev_py=f"""
                SELECT Account.BillingPostalCode zip,
                       SUM(Amount) rev
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_INSURANCE_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {py_start} AND CloseDate <= {py_end}
                  AND Account.BillingPostalCode != null
                  AND Account.BillingState = 'New York'
                GROUP BY Account.BillingPostalCode
                ORDER BY SUM(Amount) DESC
                LIMIT 2000
            """,
            travel_rev_cy=f"""
                SELECT Account.BillingPostalCode zip,
                       SUM(Amount) rev
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {cy_start} AND CloseDate <= {cy_end}
                  AND Account.BillingPostalCode != null
                  AND Account.BillingState = 'New York'
                  AND Amount != null
                GROUP BY Account.BillingPostalCode
                ORDER BY SUM(Amount) DESC
                LIMIT 2000
            """,
            travel_rev_py=f"""
                SELECT Account.BillingPostalCode zip,
                       SUM(Amount) rev
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {py_start} AND CloseDate <= {py_end}
                  AND Account.BillingPostalCode != null
                  AND Account.BillingState = 'New York'
                  AND Amount != null
                GROUP BY Account.BillingPostalCode
                ORDER BY SUM(Amount) DESC
                LIMIT 2000
            """,
        )

        # Wait for census thread to finish (should be done by now — SQLite is fast)
        census_thread.join(timeout=5)

        # Build lookup dicts from query results
        # Normalize ZIP+4 (e.g. 14211-2506) to 5-digit and aggregate
        def _to_dict(records, val_key='cnt', extra_keys=None):
            out: dict = {}
            for r in (records or []):
                z = (r.get('zip', '') or '')[:5]  # normalize to 5-digit
                if not z or len(z) < 5:
                    continue
                val = r.get(val_key) or 0
                if z in out:
                    out[z][val_key] = (out[z][val_key] or 0) + val
                    if extra_keys:
                        for ek in extra_keys:
                            out[z][ek] = (out[z].get(ek) or 0) + (r.get(ek) or 0)
                else:
                    entry = {val_key: val}
                    if extra_keys:
                        for ek in extra_keys:
                            entry[ek] = r.get(ek) or 0
                    out[z] = entry
            return out

        members_raw = data.get('members', [])
        # Normalize members ZIP+4 to 5-digit and aggregate
        members_normed: dict[str, dict] = {}
        for r in (members_raw or []):
            z = (r.get('zip', '') or '')[:5]
            if not z or len(z) < 5:
                continue
            region = r.get('region', '')
            cnt = r.get('cnt', 0) or 0
            if z in members_normed:
                members_normed[z]['cnt'] += cnt
            else:
                members_normed[z] = {'cnt': cnt, 'region': region}

        # Customer lookups (Account-based = unique people per zip)
        ins_cust = _to_dict(data.get('ins_customers', []))
        travel_cust_3yr = _to_dict(data.get('travel_customers_3yr', []))
        travel_cust_cy = _to_dict(data.get('travel_customers_cy', []))
        travel_cust_py = _to_dict(data.get('travel_customers_py', []))

        # Revenue lookups (Opp-based)
        ins_rev_cy_d = _to_dict(data.get('ins_rev_cy', []), val_key='rev')
        ins_rev_py_d = _to_dict(data.get('ins_rev_py', []), val_key='rev')
        travel_rev_cy_d = _to_dict(data.get('travel_rev_cy', []), val_key='rev')
        travel_rev_py_d = _to_dict(data.get('travel_rev_py', []), val_key='rev')

        # Totals — computed in Python to reduce SOQL concurrency contention
        total_ins = sum(v.get('cnt', 0) or 0 for v in ins_cust.values())
        total_ins_cy_rev = sum(v.get('rev', 0) or 0 for v in ins_rev_cy_d.values())
        total_ins_py_rev = sum(v.get('rev', 0) or 0 for v in ins_rev_py_d.values())
        total_travel_3yr = sum(v.get('cnt', 0) or 0 for v in travel_cust_3yr.values())
        total_travel_cy_rev = sum(v.get('rev', 0) or 0 for v in travel_rev_cy_d.values())
        total_travel_py_rev = sum(v.get('rev', 0) or 0 for v in travel_rev_py_d.values())
        total_members = sum(v.get('cnt', 0) or 0 for v in members_normed.values())
        # Sum of members in mapped zips (for penetration calculations)
        mapped_members = sum(v['cnt'] for v in members_normed.values())

        # Census data already loaded by background thread above
        census_lookup = census_result
        if census_error:
            log.warning("Census lookup failed (tables may not be seeded yet): %s", census_error)

        # Build per-zip records
        zips = []
        for z, m_data in members_normed.items():
            member_cnt = m_data['cnt']
            region = m_data['region']

            lat, lng, city = _zip_centroid(z)
            if lat is None:
                continue

            # Unique customers per zip (Account-based)
            ic = ins_cust.get(z, {}).get('cnt', 0)
            tc = travel_cust_3yr.get(z, {}).get('cnt', 0)
            tc_cy = travel_cust_cy.get(z, {}).get('cnt', 0)
            tc_py = travel_cust_py.get(z, {}).get('cnt', 0)

            # Revenue per zip (Opp-based)
            ir_cy = ins_rev_cy_d.get(z, {}).get('rev', 0) or 0
            ir_py = ins_rev_py_d.get(z, {}).get('rev', 0) or 0
            tr_cy = travel_rev_cy_d.get(z, {}).get('rev', 0) or 0
            tr_py = travel_rev_py_d.get(z, {}).get('rev', 0) or 0

            ins_pct = round(ic / member_cnt * 100, 1) if member_cnt else 0
            travel_pct = round(tc / member_cnt * 100, 1) if member_cnt else 0

            # Census enrichment
            census = census_lookup.get(z, {})
            pop = census.get('population', 0)
            zip_rev = tr_cy + ir_cy

            zips.append({
                'zip': z,
                'lat': lat,
                'lng': lng,
                'city': city,
                'region': region,
                'members': member_cnt,
                # Insurance (customers = accounts with Insurance Customer ID)
                'ins_customers_cy': ic,
                'ins_rev_cy': round(ir_cy, 0),
                'ins_rev_py': round(ir_py, 0),
                'ins_penetration': ins_pct,
                'ins_pct_of_total': round(ic / total_ins * 100, 2) if total_ins else 0,
                # Travel (customers = unique accounts with won travel opp)
                'travel_customers_3yr': tc,
                'travel_customers_cy': tc_cy,
                'travel_customers_py': tc_py,
                'travel_penetration': travel_pct,
                'travel_pct_of_total': round(tc / total_travel_3yr * 100, 2) if total_travel_3yr else 0,
                # Revenue
                'travel_rev_cy': round(tr_cy, 0),
                'travel_rev_py': round(tr_py, 0),
                'rev_pct_of_total': round(zip_rev / total_travel_cy_rev * 100, 2) if total_travel_cy_rev else 0,
                # Census demographics
                'population': pop,
                'pop_18plus': census.get('pop_18plus', 0),
                'median_income': census.get('median_income', 0),
                'median_age': census.get('median_age', 0),
                'housing_units': census.get('housing_units', 0),
                'median_home_value': census.get('median_home_value', 0),
                'college_educated': census.get('college_educated', 0),
                'county_name': census.get('county_name', ''),
                # Market share: customers / census population
                'market_share': round(member_cnt / pop * 100, 2) if pop else 0,
            })

        # Sort by member count desc
        zips.sort(key=lambda x: x['members'], reverse=True)

        # Region summaries
        region_summary = defaultdict(lambda: {
            'members': 0, 'ins_cy': 0, 'ins_rev_cy': 0,
            'travel_3yr': 0, 'travel_rev_cy': 0,
            'zip_count': 0, 'population': 0,
        })
        for z in zips:
            r = region_summary[z['region']]
            r['members'] += z['members']
            r['ins_cy'] += z['ins_customers_cy']
            r['ins_rev_cy'] += z['ins_rev_cy']
            r['travel_3yr'] += z['travel_customers_3yr']
            r['travel_rev_cy'] += z['travel_rev_cy']
            r['zip_count'] += 1
            r['population'] += z['population']

        total_pop = sum(z['population'] for z in zips)

        return {
            'zips': zips,
            'totals': {
                'members': total_members,
                'ins_customers': total_ins,
                'ins_rev_cy': round(total_ins_cy_rev, 0),
                'ins_rev_py': round(total_ins_py_rev, 0),
                'travel_customers_3yr': total_travel_3yr,
                'travel_rev_cy': round(total_travel_cy_rev, 0),
                'travel_rev_py': round(total_travel_py_rev, 0),
                'zip_count': len(zips),
                'population': total_pop,
                'market_share': round(total_members / total_pop * 100, 2) if total_pop else 0,
            },
            'regions': dict(region_summary),
            'year': today.year,
        }

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


# ── County Boundaries + Population endpoint ──────────────────────────────────

@router.get("/api/territory/boundaries")
def territory_boundaries(
    include_zips: bool = Query(False, description="Include zip-level demographic payload"),
):
    """Return county boundary GeoJSON + optional zip demographic payload."""

    key = f"territory_boundaries_v3_include_zips_{1 if include_zips else 0}"

    def fetch():
        from database import SessionLocal
        from models import GeoCounty, GeoZip
        from sqlalchemy import func

        db = SessionLocal()
        try:
            counties = db.query(GeoCounty).all()
            if not counties:
                return {'counties': [], 'zips': []}

            # Get zip aggregates by county
            county_zip_stats = (
                db.query(
                    GeoZip.county_fips,
                    func.count(GeoZip.zip_code).label('zip_count'),
                    func.sum(GeoZip.population).label('total_pop'),
                    func.sum(GeoZip.pop_18plus).label('total_18plus'),
                )
                .filter(GeoZip.county_fips.isnot(None))
                .group_by(GeoZip.county_fips)
                .all()
            )
            zip_stats = {r.county_fips: {
                'zip_count': r.zip_count,
                'zip_pop': r.total_pop or 0,
                'zip_18plus': r.total_18plus or 0,
            } for r in county_zip_stats}

            county_features = []
            for c in counties:
                if not c.geojson:
                    continue
                zs = zip_stats.get(c.fips, {})
                county_features.append({
                    'type': 'Feature',
                    'id': c.fips,
                    'properties': {
                        'fips': c.fips,
                        'name': c.name,
                        'population': c.population,
                        'pop_18plus': c.pop_18plus,
                        'median_income': c.median_income,
                        'median_age': c.median_age,
                        'housing_units': c.housing_units,
                        'median_home_value': c.median_home_value,
                        'college_educated': c.college_educated,
                        'zip_count': zs.get('zip_count', 0),
                    },
                    'geometry': json.loads(c.geojson),
                })

            zip_list = []
            if include_zips:
                # Optional heavy payload; not needed for map boundary rendering path.
                zips = db.query(GeoZip).filter(GeoZip.lat.isnot(None)).all()
                zip_list = [{
                    'zip': z.zip_code,
                    'city': z.city,
                    'county_fips': z.county_fips,
                    'county_name': z.county_name,
                    'lat': z.lat,
                    'lng': z.lng,
                    'population': z.population or 0,
                    'pop_18plus': z.pop_18plus or 0,
                    'median_income': z.median_income or 0,
                    'median_age': z.median_age or 0,
                    'housing_units': z.housing_units or 0,
                    'median_home_value': z.median_home_value or 0,
                    'college_educated': z.college_educated or 0,
                } for z in zips]

            return {
                'county_geojson': {
                    'type': 'FeatureCollection',
                    'features': county_features,
                },
                'zips': zip_list,
            }
        finally:
            db.close()

    # Static geography/census source data: keep indefinitely until explicit admin refresh.
    return cache.cached_query(key, fetch, ttl=CACHE_TTL_NEVER, disk_ttl=CACHE_TTL_NEVER)


# ── Census Demographics Data Table ──────────────────────────────────────────

@router.get("/api/territory/census-data")
def territory_census_data(
    level: str = Query("zip", regex="^(zip|county)$"),
):
    """Return Census demographics as a flat table for display and Excel export."""

    key = f"census_data_{level}_v2"

    def fetch():
        from database import SessionLocal
        from models import GeoCounty, GeoZip

        db = SessionLocal()
        try:
            if level == "county":
                counties = db.query(GeoCounty).order_by(GeoCounty.name).all()
                rows = []
                for c in counties:
                    college_pct = round(c.college_educated / c.pop_18plus * 100, 1) if c.pop_18plus else 0
                    rows.append({
                        'county': c.name,
                        'fips': c.fips,
                        'population': c.population or 0,
                        'pop_18plus': c.pop_18plus or 0,
                        'median_income': c.median_income or 0,
                        'median_age': c.median_age or 0,
                        'housing_units': c.housing_units or 0,
                        'median_home_value': c.median_home_value or 0,
                        'college_educated': c.college_educated or 0,
                        'college_pct': college_pct,
                    })
                totals = {
                    'population': sum(r['population'] for r in rows),
                    'pop_18plus': sum(r['pop_18plus'] for r in rows),
                    'housing_units': sum(r['housing_units'] for r in rows),
                    'college_educated': sum(r['college_educated'] for r in rows),
                    'avg_median_income': round(sum(r['median_income'] for r in rows) / len(rows)) if rows else 0,
                    'avg_median_age': round(sum(r['median_age'] for r in rows) / len(rows), 1) if rows else 0,
                    'avg_home_value': round(sum(r['median_home_value'] for r in rows) / len(rows)) if rows else 0,
                }
                return {'level': 'county', 'rows': rows, 'totals': totals, 'count': len(rows)}

            else:  # zip
                zips = (db.query(GeoZip)
                        .filter(GeoZip.population > 0)
                        .order_by(GeoZip.population.desc())
                        .all())
                rows = []
                for z in zips:
                    college_pct = round(z.college_educated / z.pop_18plus * 100, 1) if z.pop_18plus else 0
                    rows.append({
                        'zip': z.zip_code,
                        'city': z.city or '',
                        'county': z.county_name or '',
                        'population': z.population or 0,
                        'pop_18plus': z.pop_18plus or 0,
                        'median_income': z.median_income or 0,
                        'median_age': z.median_age or 0,
                        'housing_units': z.housing_units or 0,
                        'median_home_value': z.median_home_value or 0,
                        'college_educated': z.college_educated or 0,
                        'college_pct': college_pct,
                    })
                totals = {
                    'population': sum(r['population'] for r in rows),
                    'pop_18plus': sum(r['pop_18plus'] for r in rows),
                    'housing_units': sum(r['housing_units'] for r in rows),
                    'college_educated': sum(r['college_educated'] for r in rows),
                    'avg_median_income': round(sum(r['median_income'] for r in rows if r['median_income'] > 0) / max(1, sum(1 for r in rows if r['median_income'] > 0))),
                    'avg_median_age': round(sum(r['median_age'] for r in rows if r['median_age'] > 0) / max(1, sum(1 for r in rows if r['median_age'] > 0)), 1),
                    'avg_home_value': round(sum(r['median_home_value'] for r in rows if r['median_home_value'] > 0) / max(1, sum(1 for r in rows if r['median_home_value'] > 0))),
                }
                return {'level': 'zip', 'rows': rows, 'totals': totals, 'count': len(rows)}
        finally:
            db.close()

    # Static geography/census source data: keep indefinitely until explicit admin refresh.
    return cache.cached_query(key, fetch, ttl=CACHE_TTL_NEVER, disk_ttl=CACHE_TTL_NEVER)
