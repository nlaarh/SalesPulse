"""Centralized data access layer.

All database operations are accessed through this package.
Routers and services import from here — never directly from SQLAlchemy or raw DB.

Architecture:
    data/
      connection.py  — Engine, SessionLocal, get_db (ONLY file that knows PG vs SQLite)
      models.py      — All SQLAlchemy ORM models
      repos/         — Repository functions (CRUD) grouped by domain
"""

from data.connection import engine, SessionLocal, get_db, Base  # noqa: F401
from data import models  # noqa: F401
from data import repos  # noqa: F401
