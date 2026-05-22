"""Territory Zip Census — per-zip demographic & segment data from Census/Excel."""

import json
import os
from functools import lru_cache

from fastapi import APIRouter, Path

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
def zip_census(zip_code: str = Path(..., min_length=5, max_length=5)):
    """Return census demographics + customer segment data for a single zip."""
    data = _load_segments()
    entry = data.get(zip_code)
    if not entry:
        return {"found": False, "zip_code": zip_code}
    return {"found": True, **entry}
