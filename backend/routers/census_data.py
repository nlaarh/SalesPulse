"""Census & DMV vehicle demographic endpoints.

Serves census demographics (zip/county) and DMV vehicle registration data
from the local SQLite database — no Salesforce queries needed.
"""

import logging
from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session
from database import get_db

from constants import CACHE_TTL_NEVER
import cache

router = APIRouter()
log = logging.getLogger(__name__)


# ── Census Demographics Data Table ──────────────────────────────────────────

@router.get("/api/territory/census-data")
def territory_census_data(
    level: str = Query("zip", regex="^(zip|county)$"),
    db: Session = Depends(get_db),
):
    """Return Census demographics as a flat table for display and Excel export."""

    key = f"census_data_{level}_v2"

    def fetch():
        from models import GeoCounty, GeoZip

        if level == "county":
            counties = db.query(GeoCounty).order_by(GeoCounty.name).all()
            rows = []
            for c in counties:
                college_pct = round((c.college_educated or 0) / c.pop_18plus * 100, 1) if c.pop_18plus else 0
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
                    'registered_vehicles': c.registered_vehicles or 0,
                    'vehicles_3plus_yrs': c.vehicles_3plus_yrs or 0,
                    'age_16_18': c.age_16_18 or 0,
                    'age_18_24': c.age_18_24 or 0,
                    'age_25_34': c.age_25_34 or 0,
                    'age_35_44': c.age_35_44 or 0,
                    'age_45_54': c.age_45_54 or 0,
                    'age_55_64': c.age_55_64 or 0,
                    'age_65_plus': c.age_65_plus or 0,
                })
            totals = {
                'population': sum(r['population'] for r in rows),
                'pop_18plus': sum(r['pop_18plus'] for r in rows),
                'housing_units': sum(r['housing_units'] for r in rows),
                'college_educated': sum(r['college_educated'] for r in rows),
                'avg_median_income': round(sum(r['median_income'] for r in rows) / len(rows)) if rows else 0,
                'avg_median_age': round(sum(r['median_age'] for r in rows) / len(rows), 1) if rows else 0,
                'avg_home_value': round(sum(r['median_home_value'] for r in rows) / len(rows)) if rows else 0,
                'registered_vehicles': sum(r['registered_vehicles'] for r in rows),
                'vehicles_3plus_yrs': sum(r['vehicles_3plus_yrs'] for r in rows),
                'age_16_18': sum(r['age_16_18'] for r in rows),
                'age_18_24': sum(r['age_18_24'] for r in rows),
                'age_25_34': sum(r['age_25_34'] for r in rows),
                'age_35_44': sum(r['age_35_44'] for r in rows),
                'age_45_54': sum(r['age_45_54'] for r in rows),
                'age_55_64': sum(r['age_55_64'] for r in rows),
                'age_65_plus': sum(r['age_65_plus'] for r in rows),
            }
            return {'level': 'county', 'rows': rows, 'totals': totals, 'count': len(rows)}

        else:  # zip
            zips = (db.query(GeoZip)
                    .filter(GeoZip.population > 0)
                    .order_by(GeoZip.population.desc())
                    .all())
            rows = []
            for z in zips:
                college_pct = round((z.college_educated or 0) / z.pop_18plus * 100, 1) if z.pop_18plus else 0
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
                    'registered_vehicles': z.registered_vehicles or 0,
                    'vehicles_3plus_yrs': z.vehicles_3plus_yrs or 0,
                    'age_16_18': z.age_16_18 or 0,
                    'age_18_24': z.age_18_24 or 0,
                    'age_25_34': z.age_25_34 or 0,
                    'age_35_44': z.age_35_44 or 0,
                    'age_45_54': z.age_45_54 or 0,
                    'age_55_64': z.age_55_64 or 0,
                    'age_65_plus': z.age_65_plus or 0,
                })
            totals = {
                'population': sum(r['population'] for r in rows),
                'pop_18plus': sum(r['pop_18plus'] for r in rows),
                'housing_units': sum(r['housing_units'] for r in rows),
                'college_educated': sum(r['college_educated'] for r in rows),
                'avg_median_income': round(sum(r['median_income'] for r in rows if r['median_income'] > 0) / max(1, sum(1 for r in rows if r['median_income'] > 0))),
                'avg_median_age': round(sum(r['median_age'] for r in rows if r['median_age'] > 0) / max(1, sum(1 for r in rows if r['median_age'] > 0)), 1),
                'avg_home_value': round(sum(r['median_home_value'] for r in rows if r['median_home_value'] > 0) / max(1, sum(1 for r in rows if r['median_home_value'] > 0))),
                'registered_vehicles': sum(r['registered_vehicles'] for r in rows),
                'vehicles_3plus_yrs': sum(r['vehicles_3plus_yrs'] for r in rows),
                'age_16_18': sum(r['age_16_18'] for r in rows),
                'age_18_24': sum(r['age_18_24'] for r in rows),
                'age_25_34': sum(r['age_25_34'] for r in rows),
                'age_35_44': sum(r['age_35_44'] for r in rows),
                'age_45_54': sum(r['age_45_54'] for r in rows),
                'age_55_64': sum(r['age_55_64'] for r in rows),
                'age_65_plus': sum(r['age_65_plus'] for r in rows),
            }
            return {'level': 'zip', 'rows': rows, 'totals': totals, 'count': len(rows)}

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_NEVER, disk_ttl=CACHE_TTL_NEVER)

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
