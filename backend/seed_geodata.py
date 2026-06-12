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
    '36045': 'Jefferson',
    '36049': 'Lewis',
    '36089': 'St. Lawrence',
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

    if force:
        log.info("Force re-seed: dropping existing geo tables to align schema")
        try:
            from sqlalchemy import text
            with engine.connect() as conn:
                conn.execute(text("DROP TABLE IF EXISTS sales.geo_zips CASCADE;"))
                conn.execute(text("DROP TABLE IF EXISTS sales.geo_counties CASCADE;"))
                conn.commit()
        except Exception as e:
            log.warning(f"Could not drop tables: {e}")

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

        # ── 1. Fetch county boundaries + population ──
        boundaries = _fetch_county_boundaries()
        populations = _fetch_county_population()

        # ── 2. Load zip centroids and assign to counties ──
        with open(CENTROID_FILE) as f:
            centroids = json.load(f)

        # Filter to WCNY area — extended north to 45.1 to capture St. Lawrence County
        wcny_zips = {}
        for z, (lat, lng, city) in centroids.items():
            if 41.5 <= lat <= 45.1 and -80.0 <= lng <= -74.0:
                wcny_zips[z] = {'lat': lat, 'lng': lng, 'city': city}

        log.info(f"Found {len(wcny_zips)} zips in WCNY area")

        # Fetch population for these zips
        zip_pops = _fetch_zip_population(list(wcny_zips.keys()))

        # Load local segments to merge age/vehicle metrics if available
        census_segments = {}
        try:
            segments_file = os.path.join(os.path.dirname(__file__), 'seed_data', 'census_segments.json')
            if os.path.exists(segments_file):
                with open(segments_file) as f:
                    census_segments = json.load(f)
        except Exception as e:
            log.warning(f"Could not load census_segments.json for API merge: {e}")

        # Assign each zip to nearest county
        county_aggregates = {}
        for z, info in wcny_zips.items():
            county_fips, county_name = _assign_zip_to_county(
                info['lat'], info['lng'], boundaries
            )
            pop = zip_pops.get(z, {})

            seg = census_segments.get(z) or {}
            reg_v = seg.get('registered_vehicles') or 0
            v_3yr = seg.get('vehicles_3plus_yrs') or 0
            a_16_18 = seg.get('age_16_18') or 0
            a_18_24 = seg.get('age_18_24') or 0
            a_25_34 = seg.get('age_25_34') or 0
            a_35_44 = seg.get('age_35_44') or 0
            a_45_54 = seg.get('age_45_54') or 0
            a_55_64 = seg.get('age_55_64') or 0
            a_65_plus = seg.get('age_65_plus') or 0

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
                registered_vehicles=reg_v,
                vehicles_3plus_yrs=v_3yr,
                age_16_18=a_16_18,
                age_18_24=a_18_24,
                age_25_34=a_25_34,
                age_35_44=a_35_44,
                age_45_54=a_45_54,
                age_55_64=a_55_64,
                age_65_plus=a_65_plus,
            ))

            # Aggregate for county in API seeder
            if county_fips:
                if county_fips not in county_aggregates:
                    county_aggregates[county_fips] = {
                        'registered_vehicles': 0,
                        'vehicles_3plus_yrs': 0,
                        'age_16_18': 0,
                        'age_18_24': 0,
                        'age_25_34': 0,
                        'age_35_44': 0,
                        'age_45_54': 0,
                        'age_55_64': 0,
                        'age_65_plus': 0,
                    }
                agg = county_aggregates[county_fips]
                agg['registered_vehicles'] += reg_v
                agg['vehicles_3plus_yrs'] += v_3yr
                agg['age_16_18'] += a_16_18
                agg['age_18_24'] += a_18_24
                agg['age_25_34'] += a_25_34
                agg['age_35_44'] += a_35_44
                agg['age_45_54'] += a_45_54
                agg['age_55_64'] += a_55_64
                agg['age_65_plus'] += a_65_plus

        # ── 3. Seed county records ──
        for fips, name in WCNY_COUNTY_FIPS.items():
            pop = populations.get(fips, {})
            agg = county_aggregates.get(fips) or {
                'registered_vehicles': 0,
                'vehicles_3plus_yrs': 0,
                'age_16_18': 0,
                'age_18_24': 0,
                'age_25_34': 0,
                'age_35_44': 0,
                'age_45_54': 0,
                'age_55_64': 0,
                'age_65_plus': 0,
            }
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
                registered_vehicles=agg['registered_vehicles'],
                vehicles_3plus_yrs=agg['vehicles_3plus_yrs'],
                age_16_18=agg['age_16_18'],
                age_18_24=agg['age_18_24'],
                age_25_34=agg['age_25_34'],
                age_35_44=agg['age_35_44'],
                age_45_54=agg['age_45_54'],
                age_55_64=agg['age_55_64'],
                age_65_plus=agg['age_65_plus'],
                geojson=boundaries.get(fips, ''),
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

        # ── 3. Seed DMV Vehicle data ──
        try:
            from seed_dmv import refresh_dmv_data
            log.info("Seeding DMV vehicle data...")
            dmv_res = refresh_dmv_data()
            if dmv_res.get('ok'):
                log.info(f"DMV seed complete: {dmv_res.get('records_added')} records added")
            else:
                log.warning(f"DMV seed non-ok response: {dmv_res.get('error')}")
        except Exception as e:
            log.warning(f"DMV vehicle data seed failed (skipping): {e}")

    except Exception as e:
        db.rollback()
        log.warning(f"Census API seed failed ({e}), falling back to local data...")
        try:
            seed_geodata_local(force=force)
        except Exception as le:
            log.error(f"Fallback local seed also failed: {le}", exc_info=True)
            raise
    finally:
        db.close()


def seed_geodata_local(force: bool = False):
    """Seed GeoZip and GeoCounty tables from local census_segments.json + ny_zip_centroids.json.

    This is a robust fallback that doesn't require the Census Bureau API.
    Works reliably on Azure and in any environment.
    """
    from database import SessionLocal, Base, engine
    from models import GeoZip, GeoCounty, GeoMeta
    from datetime import datetime, timezone

    if force:
        log.info("Force local seed: dropping existing geo tables to align schema")
        try:
            from sqlalchemy import text
            with engine.connect() as conn:
                conn.execute(text("DROP TABLE IF EXISTS sales.geo_zips CASCADE;"))
                conn.execute(text("DROP TABLE IF EXISTS sales.geo_counties CASCADE;"))
                conn.commit()
        except Exception as e:
            log.warning(f"Could not drop tables: {e}")

    Base.metadata.create_all(bind=engine, checkfirst=True)

    db = SessionLocal()
    try:
        zip_count = db.query(GeoZip).count()
        county_count = db.query(GeoCounty).count()
        if zip_count > 0 and county_count > 0 and not force:
            log.info(f"Geo data already seeded ({zip_count} zips, {county_count} counties) — skipping local seed")
            return

        # Load county boundaries GeoJSON from public plotly github URL if available
        boundaries = {}
        try:
            log.info("Fetching county boundary GeoJSON for local fallback...")
            req = urllib.request.Request(COUNTY_GEOJSON_URL, headers={'User-Agent': 'SalesPulse/1.0'})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())
                for feature in data['features']:
                    fips = feature.get('id') or feature['properties'].get('GEO_ID', '')[-5:]
                    if fips in WCNY_COUNTY_FIPS:
                        boundaries[fips] = json.dumps(feature['geometry'])
            log.info(f"Got boundaries for {len(boundaries)} WCNY counties")
        except Exception as e:
            log.warning(f"Failed to fetch county boundaries: {e}. Falling back to empty string boundaries.")

        # Load local data files
        census_file = os.path.join(os.path.dirname(__file__), 'seed_data', 'census_segments.json')
        with open(census_file) as f:
            census_data = json.load(f)

        # Load census_zips.json to get actual college_educated and median_age if available
        zip_details = {}
        try:
            zips_file = os.path.join(os.path.dirname(__file__), 'seed_data', 'census_zips.json')
            if os.path.exists(zips_file):
                with open(zips_file) as f:
                    zips_list = json.load(f)
                    for item in zips_list:
                        zc = item.get('zip_code')
                        if zc:
                            zip_details[str(zc).zfill(5)] = item
                log.info(f"Loaded details for {len(zip_details)} zips from census_zips.json")
        except Exception as e:
            log.warning(f"Could not load census_zips.json for college/age: {e}")

        # Load census_counties.json to get actual county demographics if available
        county_details = {}
        try:
            counties_file = os.path.join(os.path.dirname(__file__), 'seed_data', 'census_counties.json')
            if os.path.exists(counties_file):
                with open(counties_file) as f:
                    counties_list = json.load(f)
                    for item in counties_list:
                        cfips = item.get('fips')
                        if cfips:
                            county_details[cfips] = item
                log.info(f"Loaded details for {len(county_details)} counties from census_counties.json")
        except Exception as e:
            log.warning(f"Could not load census_counties.json: {e}")

        with open(CENTROID_FILE) as f:
            centroids = json.load(f)

        county_aggregates = {}
        name_to_fips = {name.lower().strip(): fips for fips, name in WCNY_COUNTY_FIPS.items()}

        z_count = 0
        for zip_code, info in census_data.items():
            z = str(zip_code).zfill(5)
            centroid = centroids.get(z)
            lat = centroid[0] if centroid else None
            lng = centroid[1] if centroid else None

            pop = info.get('population', 0) or 0
            adults = info.get('adults_18plus', 0) or 0
            income = info.get('median_income', 0) or 0
            home_val = info.get('median_home_value', 0) or 0
            owner = info.get('owner_occupied', 0) or 0
            renter = info.get('renter_occupied', 0) or 0
            housing = (owner or 0) + (renter or 0)
            county_name = info.get('county', '').strip()

            # Find matching FIPS code
            fips = name_to_fips.get(county_name.lower())

            # Get actual college_educated and median_age from lookup
            lookup = zip_details.get(z, {})
            college = lookup.get('college_educated') or 0
            med_age = lookup.get('median_age') or 0.0

            reg_v = info.get('registered_vehicles') or 0
            v_3yr = info.get('vehicles_3plus_yrs') or 0
            a_16_18 = info.get('age_16_18') or 0
            a_18_24 = info.get('age_18_24') or 0
            a_25_34 = info.get('age_25_34') or 0
            a_35_44 = info.get('age_35_44') or 0
            a_45_54 = info.get('age_45_54') or 0
            a_55_64 = info.get('age_55_64') or 0
            a_65_plus = info.get('age_65_plus') or 0

            db.merge(GeoZip(
                zip_code=z,
                city=info.get('city', ''),
                county_fips=fips,
                county_name=county_name,
                lat=lat,
                lng=lng,
                population=pop,
                pop_18plus=adults,
                median_income=income,
                median_age=med_age,
                housing_units=housing,
                median_home_value=home_val,
                college_educated=college,
                registered_vehicles=reg_v,
                vehicles_3plus_yrs=v_3yr,
                age_16_18=a_16_18,
                age_18_24=a_18_24,
                age_25_34=a_25_34,
                age_35_44=a_35_44,
                age_45_54=a_45_54,
                age_55_64=a_55_64,
                age_65_plus=a_65_plus,
            ))
            z_count += 1

            # Aggregate ZIP details for GeoCounty
            if fips:
                if fips not in county_aggregates:
                    county_aggregates[fips] = {
                        'name': county_name,
                        'population': 0,
                        'pop_18plus': 0,
                        'housing_units': 0,
                        'college_educated': 0,
                        'income_weighted_sum': 0,
                        'income_weight': 0,
                        'home_val_weighted_sum': 0,
                        'home_val_weight': 0,
                        'registered_vehicles': 0,
                        'vehicles_3plus_yrs': 0,
                        'age_16_18': 0,
                        'age_18_24': 0,
                        'age_25_34': 0,
                        'age_35_44': 0,
                        'age_45_54': 0,
                        'age_55_64': 0,
                        'age_65_plus': 0,
                    }
                agg = county_aggregates[fips]
                agg['population'] += pop
                agg['pop_18plus'] += adults
                agg['housing_units'] += housing
                agg['college_educated'] += college
                agg['registered_vehicles'] += reg_v
                agg['vehicles_3plus_yrs'] += v_3yr
                agg['age_16_18'] += a_16_18
                agg['age_18_24'] += a_18_24
                agg['age_25_34'] += a_25_34
                agg['age_35_44'] += a_35_44
                agg['age_45_54'] += a_45_54
                agg['age_55_64'] += a_55_64
                agg['age_65_plus'] += a_65_plus

                if income > 0:
                    agg['income_weighted_sum'] += income * pop
                    agg['income_weight'] += pop
                if home_val > 0:
                    agg['home_val_weighted_sum'] += home_val * pop
                    agg['home_val_weight'] += pop

        # Insert aggregated GeoCounty records
        c_count = 0
        for fips, agg in county_aggregates.items():
            lookup = county_details.get(fips)
            if lookup:
                pop = lookup.get('population', agg['population'])
                adults = lookup.get('pop_18plus', agg['pop_18plus'])
                income = lookup.get('median_income', 0)
                med_age = lookup.get('median_age', 0.0) or 40.0
                housing = lookup.get('housing_units', agg['housing_units'])
                home_val = lookup.get('median_home_value', 0)
                college = lookup.get('college_educated', 0)
            else:
                pop = agg['population']
                adults = agg['pop_18plus']
                income = int(agg['income_weighted_sum'] / agg['income_weight']) if agg['income_weight'] > 0 else 0
                med_age = 40.0
                housing = agg['housing_units']
                home_val = int(agg['home_val_weighted_sum'] / agg['home_val_weight']) if agg['home_val_weight'] > 0 else 0
                college = agg['college_educated']

            db.merge(GeoCounty(
                fips=fips,
                name=agg['name'],
                population=pop,
                pop_18plus=adults,
                median_income=income,
                median_age=med_age,
                housing_units=housing,
                median_home_value=home_val,
                college_educated=college,
                registered_vehicles=agg['registered_vehicles'],
                vehicles_3plus_yrs=agg['vehicles_3plus_yrs'],
                age_16_18=agg['age_16_18'],
                age_18_24=agg['age_18_24'],
                age_25_34=agg['age_25_34'],
                age_35_44=agg['age_35_44'],
                age_45_54=agg['age_45_54'],
                age_55_64=agg['age_55_64'],
                age_65_plus=agg['age_65_plus'],
                geojson=boundaries.get(fips, '') or (lookup.get('geojson', '') if lookup else ''),
            ))
            c_count += 1

        db.commit()

        now = datetime.now(timezone.utc).isoformat()
        db.merge(GeoMeta(key='last_refreshed', value=now))
        db.merge(GeoMeta(key='zip_count', value=str(z_count)))
        db.merge(GeoMeta(key='county_count', value=str(c_count)))
        db.merge(GeoMeta(key='source', value='Local census_segments.json'))
        db.commit()

        log.info(f"Local geo seed complete: {z_count} zips and {c_count} counties from census_segments.json")

    except Exception as e:
        db.rollback()
        log.error(f"Local geo seed failed: {e}", exc_info=True)
        raise
    finally:
        db.close()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    force = '--force' in sys.argv
    local = '--local' in sys.argv
    if local:
        seed_geodata_local(force=force)
    else:
        try:
            seed_geodata(force=force)
        except Exception as e:
            log.warning(f"Census API seed failed ({e}), falling back to local data...")
            seed_geodata_local(force=force)
