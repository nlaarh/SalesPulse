import requests
import logging
from datetime import datetime, timezone
from database import SessionLocal
from models import GeoVehicleRegistration, GeoMeta
from seed_geodata import WCNY_COUNTY_FIPS

log = logging.getLogger(__name__)

# Socrata API endpoint for NY Vehicle Registrations
DMV_API_URL = "https://data.ny.gov/resource/w4pv-hbkt.json"

def refresh_dmv_data():
    db = SessionLocal()
    try:
        counties_upper = [c.upper() for c in WCNY_COUNTY_FIPS.values()]
        # Socrata stores "ST LAWRENCE" without a period — strip it to match
        counties_upper = [c.replace('ST. LAWRENCE', 'ST LAWRENCE') for c in counties_upper]
        county_list_str = ",".join(f"'{c}'" for c in counties_upper)

        # Aggregate at county level only (not by zip/make).
        # zip and make are never consumed downstream — grouping by them inflates the
        # result set to ~50k rows which times out from Azure.  County×year×fuel_type
        # gives ~2,700 rows and completes in seconds.
        params = {
            "$select": "county, model_year, fuel_type, count(*) as vehicle_count",
            "$where": f"county in ({county_list_str}) and record_type='VEH'",
            "$group": "county, model_year, fuel_type",
            "$limit": 10000
        }

        log.info("Fetching NY DMV vehicle data for WCNY counties (county-level aggregation)...")
        response = requests.get(DMV_API_URL, params=params, timeout=60)
        response.raise_for_status()
        data = response.json()

        if not data:
            log.warning("No DMV data returned.")
            return {"ok": False, "error": "No data returned"}

        log.info(f"DMV API returned {len(data)} rows — building records before clearing DB")

        # Build all records in memory BEFORE touching existing data.
        # This prevents a wipe-without-replace if the API call partially fails.
        new_records = []
        for row in data:
            county_name = row.get("county", "").title()
            if county_name in ("St Lawrence", "St. Lawrence"):
                county_name = "St. Lawrence"
            new_records.append(GeoVehicleRegistration(
                zip_code=None,
                county_name=county_name,
                model_year=row.get("model_year"),
                make=None,
                fuel_type=row.get("fuel_type"),
                vehicle_count=int(row.get("vehicle_count", 0))
            ))

        # Only clear existing data once we have a successful replacement
        db.query(GeoVehicleRegistration).delete()
        for rec in new_records:
            db.add(rec)
        records_added = len(new_records)

        now = datetime.now(timezone.utc).isoformat()
        db.merge(GeoMeta(key='last_refreshed_dmv', value=now))
        db.merge(GeoMeta(key='dmv_record_count', value=str(records_added)))
        db.merge(GeoMeta(key='dmv_source', value='NY DMV Open Data (Socrata) — w4pv-hbkt'))
        db.commit()
        log.info(f"Successfully refreshed DMV vehicle data. Added {records_added} records.")
        return {"ok": True, "records_added": records_added}
        
    except Exception as e:
        db.rollback()
        log.error(f"Failed to refresh DMV data: {e}")
        return {"ok": False, "error": str(e)}
    finally:
        db.close()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    refresh_dmv_data()