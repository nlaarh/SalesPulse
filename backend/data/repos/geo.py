"""Geo repository — geographic/census/territory data operations."""

from typing import Optional
from sqlalchemy.orm import Session
from data.models import GeoCounty, GeoZip, GeoVehicleRegistration, GeoMeta, TerritoryZip, TerritoryCounty


def get_all_counties(db: Session) -> list[GeoCounty]:
    return db.query(GeoCounty).order_by(GeoCounty.name).all()


def get_county_by_fips(db: Session, fips: str) -> Optional[GeoCounty]:
    return db.query(GeoCounty).filter(GeoCounty.fips == fips).first()


def get_all_zips(db: Session) -> list[GeoZip]:
    return db.query(GeoZip).all()


def get_zip(db: Session, zip_code: str) -> Optional[GeoZip]:
    return db.query(GeoZip).filter(GeoZip.zip_code == zip_code).first()


def get_zips_by_county(db: Session, county_name: str) -> list[GeoZip]:
    return db.query(GeoZip).filter(GeoZip.county_name == county_name).all()


def get_territory_zips(db: Session) -> list[TerritoryZip]:
    return db.query(TerritoryZip).all()


def get_territory_counties(db: Session) -> list[TerritoryCounty]:
    return db.query(TerritoryCounty).all()


def get_vehicles_by_zip(db: Session, zip_code: str) -> list[GeoVehicleRegistration]:
    return db.query(GeoVehicleRegistration).filter(GeoVehicleRegistration.zip_code == zip_code).all()


def get_vehicles_by_county(db: Session, county_name: str) -> list[GeoVehicleRegistration]:
    return db.query(GeoVehicleRegistration).filter(GeoVehicleRegistration.county_name == county_name).all()


def count_vehicles(db: Session) -> int:
    return db.query(GeoVehicleRegistration).count()


def get_geo_meta(db: Session, key: str) -> Optional[str]:
    row = db.query(GeoMeta).filter(GeoMeta.key == key).first()
    return row.value if row else None


def set_geo_meta(db: Session, key: str, value: str) -> None:
    row = db.query(GeoMeta).filter(GeoMeta.key == key).first()
    if row:
        row.value = value
    else:
        db.add(GeoMeta(key=key, value=value))
    db.commit()
