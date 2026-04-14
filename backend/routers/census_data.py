"""Census & DMV vehicle demographic endpoints.

Serves census demographics (zip/county) and DMV vehicle registration data
from the local SQLite database — no Salesforce queries needed.
"""

import logging
from fastapi import APIRouter, Query

from constants import CACHE_TTL_NEVER
import cache

router = APIRouter()
log = logging.getLogger(__name__)


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

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_NEVER, disk_ttl=CACHE_TTL_NEVER)


# ── DMV Vehicle Registration Data ──────────────────────────────────────────

@router.get("/api/territory/vehicle-data")
def territory_vehicle_data():
    """Return DMV vehicle registration data aggregated by county/fuel_type."""

    key = "territory_vehicle_data_v1"

    def fetch():
        from database import SessionLocal
        from models import GeoVehicleRegistration
        from sqlalchemy import func

        db = SessionLocal()
        try:
            rows = (
                db.query(
                    GeoVehicleRegistration.county_name,
                    GeoVehicleRegistration.model_year,
                    GeoVehicleRegistration.fuel_type,
                    func.sum(GeoVehicleRegistration.vehicle_count).label('vehicle_count'),
                )
                .filter(GeoVehicleRegistration.county_name.isnot(None))
                .group_by(
                    GeoVehicleRegistration.county_name,
                    GeoVehicleRegistration.model_year,
                    GeoVehicleRegistration.fuel_type,
                )
                .all()
            )
            result = [{
                'county': r.county_name,
                'model_year': r.model_year or '',
                'fuel_type': r.fuel_type or '',
                'vehicle_count': r.vehicle_count or 0,
            } for r in rows]
            total = sum(r['vehicle_count'] for r in result)
            return {
                'level': 'county',
                'rows': result,
                'totals': {'vehicle_count': total},
                'count': len(result),
            }
        finally:
            db.close()

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_NEVER, disk_ttl=CACHE_TTL_NEVER)
