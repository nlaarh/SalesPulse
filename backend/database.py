"""SQLAlchemy setup — SHIM that re-exports from data/ package.

All real logic lives in data/connection.py. This file exists for backward
compatibility so existing `from database import ...` imports keep working.
"""

# Re-export everything the old module provided
from data.connection import engine, SessionLocal, get_db, Base  # noqa: F401
from data.connection import create_all_tables, USE_SQLITE  # noqa: F401

import logging

log = logging.getLogger('salesinsight.db')


def _migrate_roles():
    """Fix legacy 'officer' role → 'executive'. Set departments.

    Note: 'admin' is now a valid role (added in the user_sessions migration).
    Do NOT migrate 'admin' → 'superadmin' anymore.
    """
    db = SessionLocal()
    try:
        from data.models import User
        db.query(User).filter(User.role == 'officer').update({'role': 'executive'})
        db.query(User).filter(User.email == 'akelly@nyaaa.com', User.department.is_(None)).update({'department': 'Travel'})
        db.query(User).filter(User.email == 'jnicotra@nyaaa.com', User.department.is_(None)).update({'department': 'Travel'})
        db.commit()
    except Exception as e:
        log.warning(f"Role migration skipped: {e}")
    finally:
        db.close()


def init_db():
    """Create schema + tables + seed users. All in 'sales' schema on PG."""
    from data.connection import create_schema_if_needed, create_all_tables
    from data.seed import seed_users

    create_schema_if_needed()
    create_all_tables()

    # Fix any legacy role names
    _migrate_roles()

    db = SessionLocal()
    try:
        seed_users(db)
    finally:
        db.close()

    # Seed geographic data in background thread
    import threading
    def _bg_geo_seed():
        try:
            from seed_geodata import seed_geodata, seed_geodata_local
            seed_geodata(force=False)
        except Exception as e:
            log.warning(f'Geo data seed failed: {e}')
            try:
                from seed_geodata import seed_geodata_local
                seed_geodata_local(force=False)
            except Exception as e2:
                log.warning(f'Local geo seed also failed: {e2}')
        # Invalidate territory_map cache so population data is picked up
        try:
            import cache
            cache.flush_prefix('territory_map')
            log.info('Invalidated territory_map cache after geo seed')
        except Exception:
            pass
        try:
            from data.models import GeoVehicleRegistration
            sess = SessionLocal()
            count = sess.query(GeoVehicleRegistration).count()
            sess.close()
            if count == 0:
                log.info('DMV vehicle table empty — seeding...')
                from seed_dmv import refresh_dmv_data
                refresh_dmv_data()
        except Exception as e:
            log.warning(f'DMV data seed failed: {e}')
        try:
            from seed_territory import seed_territory
            seed_territory()
        except Exception as e:
            log.warning(f'Territory seed failed: {e}')
    threading.Thread(target=_bg_geo_seed, daemon=True).start()
