"""Seed geographic data: NY county boundaries + population + zip-to-county mapping.

Fetches from:
  - US Census Bureau ACS 5-Year API (population by county and ZCTA)
  - Census Bureau / plotly GeoJSON (county boundary polygons)
  - Local ny_zip_centroids.json (zip → lat/lng/city)

Data is stored in SQLite tables geo_counties and geo_zips.
Runs once on first boot (skips if tables already populated).
Can be re-run with --force to refresh.

Usage:
    python seed_geodata.py          # seed only if empty
    python seed_geodata.py --force  # re-seed (drop + recreate)
"""

import json
import logging
import os
import sys
import time
import urllib.request
from pathlib import Path

log = logging.getLogger(__name__)

# ── WCNY counties (FIPS codes for Western/Rochester/Central NY) ─────────────
# These are the counties in AAA WCNY's operating territory
WCNY_COUNTY_FIPS = {
    # Western region
    '36029': 'Erie',
    '36063': 'Niagara',
    '36009': 'Cattaraugus',
    '36013': 'Chautauqua',
    '36003': 'Allegany',
    '36037': 'Genesee',
    '36121': 'Wyoming',
    '36073': 'Orleans',
    # Rochester region
    '36055': 'Monroe',
    '36051': 'Livingston',
    '36069': 'Ontario',
    '36117': 'Wayne',
    '36099': 'Seneca',
    '36123': 'Yates',
    # Central region
    '36067': 'Onondaga',
    '36011': 'Cayuga',
    '36075': 'Oswego',
    '36053': 'Madison',
    '36065': 'Oneida',
    '36043': 'Herkimer',
    '36023': 'Cortland',
    '36107': 'Tioga',
    '36109': 'Tompkins',
    '36097': 'Schuyler',
    '36101': 'Steuben',
    '36015': 'Chemung',
}

CENSUS_BASE = "https://api.census.gov/data/2022/acs/acs5"
COUNTY_GEOJSON_URL = "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json"

# Census ACS variables we fetch
# B01001_001E = total population
# B09021_001E = population 18+
# B19013_001E = median household income ($)
# B01002_001E = median age
# B25001_001E = total housing units
# B25077_001E = median home value ($)
# B15003_022E..025E = bachelor's, master's, professional, doctorate (sum = college educated)
CENSUS_VARS_ZIP = "B01001_001E,B09021_001E,B19013_001E,B01002_001E,B25001_001E,B25077_001E,B15003_022E,B15003_023E,B15003_024E,B15003_025E"
CENSUS_VARS_COUNTY = f"NAME,{CENSUS_VARS_ZIP}"

CENTROID_FILE = os.path.join(os.path.dirname(__file__), 'ny_zip_centroids.json')


def _safe_int(val) -> int:
    """Convert Census value to int, handling None, '-', negative (suppressed)."""
    if val is None or val == '' or val == '-':
        return 0
    try:
        v = int(val)
        return max(v, 0)  # Census uses negative values for suppressed data
    except (ValueError, TypeError):
        return 0


def _safe_float(val) -> float:
    """Convert Census value to float."""
    if val is None or val == '' or val == '-':
        return 0.0
    try:
        v = float(val)
        return max(v, 0.0)
    except (ValueError, TypeError):
        return 0.0


def _fetch_json(url: str, retries: int = 3) -> dict | list:
    """Fetch JSON from URL with retry."""
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'SalesPulse/1.0'})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            if attempt == retries - 1:
                raise
            log.warning(f"Retry {attempt+1}/{retries} for {url[:80]}: {e}")
            time.sleep(2 ** attempt)


def _fetch_county_boundaries() -> dict:
    """Download county GeoJSON and filter to WCNY counties."""
    log.info("Fetching county boundary GeoJSON...")
    data = _fetch_json(COUNTY_GEOJSON_URL)
    result = {}
    for feature in data['features']:
        fips = feature.get('id') or feature['properties'].get('GEO_ID', '')[-5:]
        if fips in WCNY_COUNTY_FIPS:
            result[fips] = json.dumps(feature['geometry'])
    log.info(f"Got boundaries for {len(result)} WCNY counties")
    return result


def _fetch_county_population() -> dict:
    """Fetch demographics from Census ACS for NY counties."""
    log.info("Fetching county demographics from Census API...")
    url = f"{CENSUS_BASE}?get={CENSUS_VARS_COUNTY}&for=county:*&in=state:36"
    data = _fetch_json(url)
    result = {}
    # header: NAME, B01001_001E, B09021_001E, B19013_001E, B01002_001E, B25001_001E, B25077_001E, B15003_022-025E, state, county
    for row in data[1:]:
        name = row[0]
        total, adult, income, med_age, housing, home_val = row[1], row[2], row[3], row[4], row[5], row[6]
        bach, masters, prof, doc = row[7], row[8], row[9], row[10]
        state_code, county_code = row[11], row[12]
        fips = f"{state_code}{county_code}"
        if fips in WCNY_COUNTY_FIPS:
            college = sum(int(x) for x in [bach, masters, prof, doc] if x and x != '-')
            result[fips] = {
                'name': WCNY_COUNTY_FIPS[fips],
                'population': _safe_int(total),
                'pop_18plus': _safe_int(adult),
                'median_income': _safe_int(income),
                'median_age': _safe_float(med_age),
                'housing_units': _safe_int(housing),
                'median_home_value': _safe_int(home_val),
                'college_educated': college,
            }
    log.info(f"Got demographics for {len(result)} WCNY counties")
    return result


def _fetch_zip_population(zip_codes: list[str]) -> dict:
    """Fetch demographics by ZCTA from Census ACS in batches."""
    log.info(f"Fetching zip demographics for {len(zip_codes)} zips...")
    result = {}
    batch_size = 50  # Census API accepts ~50 ZCTAs per request
    for i in range(0, len(zip_codes), batch_size):
        batch = zip_codes[i:i + batch_size]
        zips_param = ','.join(batch)
        url = f"{CENSUS_BASE}?get={CENSUS_VARS_ZIP}&for=zip%20code%20tabulation%20area:{zips_param}"
        try:
            data = _fetch_json(url)
            # header: B01001_001E, B09021_001E, B19013_001E, B01002_001E, B25001_001E, B25077_001E, B15003_022-025E, zcta
            for row in data[1:]:
                total, adult, income, med_age, housing, home_val = row[0], row[1], row[2], row[3], row[4], row[5]
                bach, masters, prof, doc = row[6], row[7], row[8], row[9]
                zcta = row[10]
                college = sum(_safe_int(x) for x in [bach, masters, prof, doc])
                result[zcta] = {
                    'population': _safe_int(total),
                    'pop_18plus': _safe_int(adult),
                    'median_income': _safe_int(income),
                    'median_age': _safe_float(med_age),
                    'housing_units': _safe_int(housing),
                    'median_home_value': _safe_int(home_val),
                    'college_educated': college,
                }
        except Exception as e:
            log.warning(f"Census ZIP batch {i}-{i+batch_size} failed: {e}")
        if i > 0 and i % 200 == 0:
            log.info(f"  ...fetched {len(result)} zip demographics so far")
            time.sleep(0.5)  # rate limit courtesy
    log.info(f"Got demographics for {len(result)} zips")
    return result


def _assign_zip_to_county(lat: float, lng: float, county_boundaries: dict) -> tuple:
    """Point-in-county assignment using simple bounding box + centroid proximity.

    For speed, we use nearest-county-centroid rather than full polygon intersection.
    """
    # Pre-compute county centroids from boundaries
    if not hasattr(_assign_zip_to_county, '_centroids'):
        centroids = {}
        for fips, geojson_str in county_boundaries.items():
            geo = json.loads(geojson_str)
            # Get all coordinates
            coords = []
            if geo['type'] == 'Polygon':
                coords = geo['coordinates'][0]
            elif geo['type'] == 'MultiPolygon':
                for poly in geo['coordinates']:
                    coords.extend(poly[0])
            if coords:
                avg_lng = sum(c[0] for c in coords) / len(coords)
                avg_lat = sum(c[1] for c in coords) / len(coords)
                centroids[fips] = (avg_lat, avg_lng)
        _assign_zip_to_county._centroids = centroids

    centroids = _assign_zip_to_county._centroids
    if not centroids:
        return None, None

    # Find nearest county centroid
    best_fips = None
    best_dist = float('inf')
    for fips, (clat, clng) in centroids.items():
        dist = (lat - clat) ** 2 + (lng - clng) ** 2
        if dist < best_dist:
            best_dist = dist
            best_fips = fips

    if best_fips and best_dist < 1.0:  # ~60 miles max
        return best_fips, WCNY_COUNTY_FIPS.get(best_fips, '')
    return None, None


def seed_geodata(force: bool = False):
    """Main seed function — populates geo_counties and geo_zips tables."""
    from database import SessionLocal, Base, engine
    from models import GeoCounty, GeoZip, GeoMeta
    from datetime import datetime, timezone

    # Create tables if not exist
    Base.metadata.create_all(bind=engine, checkfirst=True)

    db = SessionLocal()
    try:
        # Check if already seeded
        county_count = db.query(GeoCounty).count()
        zip_count = db.query(GeoZip).count()

        if county_count > 0 and zip_count > 0 and not force:
            log.info(f"Geo data already seeded ({county_count} counties, {zip_count} zips) — skipping")
            return

        if force:
            log.info("Force re-seed: clearing existing geo data")
            db.query(GeoZip).delete()
            db.query(GeoCounty).delete()
            db.commit()

        # ── 1. Fetch county boundaries + population ──
        boundaries = _fetch_county_boundaries()
        populations = _fetch_county_population()

        for fips, name in WCNY_COUNTY_FIPS.items():
            pop = populations.get(fips, {})
            db.merge(GeoCounty(
                fips=fips,
                name=name,
                population=pop.get('population', 0),
                pop_18plus=pop.get('pop_18plus', 0),
                median_income=pop.get('median_income', 0),
                median_age=pop.get('median_age', 0),
                housing_units=pop.get('housing_units', 0),
                median_home_value=pop.get('median_home_value', 0),
                college_educated=pop.get('college_educated', 0),
                geojson=boundaries.get(fips, ''),
            ))
        db.commit()
        log.info(f"Seeded {len(WCNY_COUNTY_FIPS)} county records")

        # ── 2. Load zip centroids and assign to counties ──
        with open(CENTROID_FILE) as f:
            centroids = json.load(f)

        # Filter to WCNY area (lat 42-44.5, lng -79.5 to -74.5)
        wcny_zips = {}
        for z, (lat, lng, city) in centroids.items():
            if 41.5 <= lat <= 44.5 and -80.0 <= lng <= -74.0:
                wcny_zips[z] = {'lat': lat, 'lng': lng, 'city': city}

        log.info(f"Found {len(wcny_zips)} zips in WCNY area")

        # Fetch population for these zips
        zip_pops = _fetch_zip_population(list(wcny_zips.keys()))

        # Assign each zip to nearest county
        for z, info in wcny_zips.items():
            county_fips, county_name = _assign_zip_to_county(
                info['lat'], info['lng'], boundaries
            )
            pop = zip_pops.get(z, {})
            db.merge(GeoZip(
                zip_code=z,
                city=info['city'],
                county_fips=county_fips,
                county_name=county_name,
                lat=info['lat'],
                lng=info['lng'],
                population=pop.get('population', 0),
                pop_18plus=pop.get('pop_18plus', 0),
                median_income=pop.get('median_income', 0),
                median_age=pop.get('median_age', 0),
                housing_units=pop.get('housing_units', 0),
                median_home_value=pop.get('median_home_value', 0),
                college_educated=pop.get('college_educated', 0),
            ))

        db.commit()
        final_zip_count = db.query(GeoZip).count()
        final_county_count = db.query(GeoCounty).count()

        # Record refresh timestamp
        now = datetime.now(timezone.utc).isoformat()
        db.merge(GeoMeta(key='last_refreshed', value=now))
        db.merge(GeoMeta(key='county_count', value=str(final_county_count)))
        db.merge(GeoMeta(key='zip_count', value=str(final_zip_count)))
        db.merge(GeoMeta(key='source', value='US Census Bureau ACS 5-Year 2022'))
        db.commit()

        log.info(f"Geo seed complete: {final_county_count} counties, {final_zip_count} zips")

    except Exception as e:
        db.rollback()
        log.error(f"Geo seed failed: {e}", exc_info=True)
        raise
    finally:
        db.close()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    force = '--force' in sys.argv
    seed_geodata(force=force)
