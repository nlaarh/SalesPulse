"""Territory Zip Census — per-zip demographic & segment data from Census/Excel."""

import json
import os
from functools import lru_cache

from fastapi import APIRouter, Path, Depends
from sqlalchemy.orm import Session
from database import get_db

router = APIRouter()

_DATA_PATH = os.path.join(os.path.dirname(__file__), '..', 'seed_data', 'census_segments.json')


@lru_cache(maxsize=1)
def _load_segments() -> dict:
    """Load census segment data from JSON seed file (cached in memory)."""
    try:
        with open(_DATA_PATH) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


@router.get("/api/territory/zip-census/{zip_code}")
def zip_census(
    zip_code: str = Path(..., min_length=5, max_length=5),
    db: Session = Depends(get_db),
):
    """Return census demographics + customer segment data for a single zip."""
    from models import GeoZip

    gz = None
    try:
        gz = db.query(GeoZip).filter(GeoZip.zip_code == zip_code).first()
    except Exception as e:
        # DB query failure shouldn't crash the API entirely, fall back to segments
        pass

    # Load local segments json
    segments_data = _load_segments()
    seg_entry = segments_data.get(zip_code) or {}

    if not gz and not seg_entry:
        return {"found": False, "zip_code": zip_code}

    pop_18plus = (gz.pop_18plus if gz else None) or seg_entry.get("adults_18plus") or 0
    college_ed = (gz.college_educated if (gz and gz.college_educated is not None) else None) or 0
    college_pct = round(college_ed / pop_18plus * 100, 1) if pop_18plus > 0 else 0

    # Build entry dictionary, prioritizing database values
    entry = {
        "found": True,
        "zip_code": zip_code,
        "city": (gz.city if gz else None) or seg_entry.get("city") or "",
        "county": (gz.county_name if gz else None) or seg_entry.get("county") or "",
        "population": (gz.population if gz else None) or seg_entry.get("population") or 0,
        "adults_18plus": pop_18plus,
        "median_income": (gz.median_income if gz else None) or seg_entry.get("median_income") or 0,
        "median_home_value": (gz.median_home_value if gz else None) or seg_entry.get("median_home_value") or 0,
        "registered_vehicles": (gz.registered_vehicles if (gz and gz.registered_vehicles is not None) else None) or seg_entry.get("registered_vehicles") or 0,
        "vehicles_3plus_yrs": (gz.vehicles_3plus_yrs if (gz and gz.vehicles_3plus_yrs is not None) else None) or seg_entry.get("vehicles_3plus_yrs") or 0,
        "college_educated": college_ed,
        "college_pct": college_pct,
        "owner_occupied": seg_entry.get("owner_occupied") or 0,
        "renter_occupied": seg_entry.get("renter_occupied") or 0,
        "untapped_homes": seg_entry.get("untapped_homes") or 0,
        "housing_type": seg_entry.get("housing_type") or "Unknown",
        "location_type": seg_entry.get("location_type") or "Unknown",
        "coverage": seg_entry.get("coverage") or "Unknown",
        "region": seg_entry.get("region") or "",
    }

    # Overlay age segments prioritizing database values
    for k in ["age_16_18", "age_18_24", "age_25_34", "age_35_44", "age_45_54", "age_55_64", "age_65_plus"]:
        db_val = getattr(gz, k, None) if gz else None
        entry[k] = (db_val if db_val is not None else None) or seg_entry.get(k) or 0

    return entry
