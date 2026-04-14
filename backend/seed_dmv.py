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
        county_list_str = ",".join(f"'{c}'" for c in counties_upper)
        
        # Socrata SoQL query
        params = {
            "$select": "zip, county, model_year, make, fuel_type, sum(1) as vehicle_count",
            "$where": f"county in ({county_list_str}) and record_type='VEH'",
            "$group": "zip, county, model_year, make, fuel_type",
            "$limit": 50000
        }
        
        log.info("Fetching NY DMV vehicle data for WCNY counties (by zip)...")
        response = requests.get(DMV_API_URL, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if not data:
            log.warning("No DMV data returned.")
            return {"ok": False, "error": "No data returned"}
            
        # Clear existing data
        db.query(GeoVehicleRegistration).delete()
        
        records_added = 0
        for row in data:
            county_name = row.get("county", "").title()
            if county_name == "St Lawrence":
                county_name = "St. Lawrence"
                
            db.add(GeoVehicleRegistration(
                zip_code=row.get("zip"),
                county_name=county_name,
                model_year=row.get("model_year"),
                make=row.get("make"),
                fuel_type=row.get("fuel_type"),
                vehicle_count=int(row.get("vehicle_count", 0))
            ))
            records_added += 1
            
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