import pytest
from models import GeoZip, GeoCounty

def test_demographics_database_schema_and_seeding(in_memory_db):
    """Verify that GeoZip and GeoCounty models accept the new fields in the DB."""
    try:
        # Create test ZIP record
        zip_rec = GeoZip(
            zip_code="14709",
            city="Angelica",
            county_name="Allegany",
            population=1240,
            pop_18plus=997,
            median_income=51528,
            median_home_value=82200,
            college_educated=250,
            registered_vehicles=1350,
            vehicles_3plus_yrs=1193,
            age_16_18=36,
            age_18_24=120,
            age_25_34=179,
            age_35_44=179,
            age_45_54=189,
            age_55_64=179,
            age_65_plus=150
        )
        in_memory_db.add(zip_rec)

        # Create test County record
        county_rec = GeoCounty(
            fips="36003",
            name="Allegany",
            population=46457,
            pop_18plus=37000,
            median_income=55000,
            median_age=40.2,
            housing_units=20000,
            median_home_value=90000,
            college_educated=8000,
            registered_vehicles=35000,
            vehicles_3plus_yrs=30000,
            age_16_18=1500,
            age_18_24=4500,
            age_25_34=6000,
            age_35_44=6000,
            age_45_54=7000,
            age_55_64=7000,
            age_65_plus=5000
        )
        in_memory_db.add(county_rec)
        in_memory_db.commit()

        # Query back and verify
        z = in_memory_db.query(GeoZip).filter(GeoZip.zip_code == "14709").first()
        assert z is not None
        assert z.registered_vehicles == 1350
        assert z.vehicles_3plus_yrs == 1193
        assert z.age_16_18 == 36
        assert z.age_65_plus == 150

        c = in_memory_db.query(GeoCounty).filter(GeoCounty.fips == "36003").first()
        assert c is not None
        assert c.registered_vehicles == 35000
        assert c.age_18_24 == 4500
        assert c.age_55_64 == 7000
    finally:
        in_memory_db.query(GeoZip).delete()
        in_memory_db.query(GeoCounty).delete()
        in_memory_db.commit()


def test_census_data_endpoint(api_client, in_memory_db, monkeypatch):
    """Verify that /api/territory/census-data returns all new fields and correct totals."""
    # Bypass cache so the endpoint hits the in_memory_db directly
    monkeypatch.setattr('cache.cached_query', lambda key, fetch_fn, *args, **kwargs: fetch_fn())

    try:
        # Add mock zip code
        zip_rec = GeoZip(
            zip_code="14710",
            city="Angelica",
            county_name="Allegany",
            population=1000,
            pop_18plus=800,
            median_income=50000,
            median_age=40.0,
            housing_units=400,
            median_home_value=80000,
            college_educated=200,
            registered_vehicles=900,
            vehicles_3plus_yrs=750,
            age_16_18=30,
            age_18_24=100,
            age_25_34=150,
            age_35_44=150,
            age_45_54=150,
            age_55_64=120,
            age_65_plus=100
        )
        in_memory_db.add(zip_rec)
        in_memory_db.commit()

        # Call endpoint for zip level
        resp = api_client.get('/api/territory/census-data', params={'level': 'zip'})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data['rows']) == 1
        row = data['rows'][0]
        assert row['zip'] == '14710'
        assert row['registered_vehicles'] == 900
        assert row['vehicles_3plus_yrs'] == 750
        assert row['age_16_18'] == 30
        assert row['age_65_plus'] == 100
        assert row['college_pct'] == 25.0  # 200 / 800 * 100

        # Verify totals
        totals = data['totals']
        assert totals['registered_vehicles'] == 900
        assert totals['vehicles_3plus_yrs'] == 750
        assert totals['age_16_18'] == 30
        assert totals['age_65_plus'] == 100
    finally:
        in_memory_db.query(GeoZip).delete()
        in_memory_db.query(GeoCounty).delete()
        in_memory_db.commit()


def test_zip_census_detail_endpoint(api_client, in_memory_db):
    """Verify that /api/territory/zip-census/{zip_code} returns database demographics."""
    try:
        zip_rec = GeoZip(
            zip_code="14711",
            city="Angelica",
            county_name="Allegany",
            population=1000,
            pop_18plus=800,
            median_income=50000,
            median_age=40.0,
            housing_units=400,
            median_home_value=80000,
            college_educated=240,
            registered_vehicles=900,
            vehicles_3plus_yrs=750,
            age_16_18=30,
            age_18_24=100,
            age_25_34=150,
            age_35_44=150,
            age_45_54=150,
            age_55_64=120,
            age_65_plus=100
        )
        in_memory_db.add(zip_rec)
        in_memory_db.commit()

        resp = api_client.get('/api/territory/zip-census/14711')
        assert resp.status_code == 200
        data = resp.json()
        assert data['found'] is True
        assert data['zip_code'] == '14711'
        assert data['registered_vehicles'] == 900
        assert data['vehicles_3plus_yrs'] == 750
        assert data['college_educated'] == 240
        assert data['college_pct'] == 30.0  # 240 / 800 * 100
        assert data['age_16_18'] == 30
        assert data['age_65_plus'] == 100
    finally:
        in_memory_db.query(GeoZip).delete()
        in_memory_db.query(GeoCounty).delete()
        in_memory_db.commit()
