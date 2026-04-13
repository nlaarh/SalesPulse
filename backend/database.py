"""SQLAlchemy setup + DB init with seed user."""

import os, logging
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase

log = logging.getLogger('salesinsight.db')

# Azure App Service Linux: /home/ is persistent, /root/ is ephemeral.
# Use /home/.salesinsight/ on Azure, ~/.salesinsight/ locally.
_azure_home = Path('/home')
DB_DIR = (_azure_home / '.salesinsight') if _azure_home.is_dir() and os.getenv('WEBSITE_SITE_NAME') else (Path.home() / '.salesinsight')
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / 'salesinsight.db'

engine = create_engine(
    f'sqlite:///{DB_PATH}',
    connect_args={'check_same_thread': False, 'timeout': 15},
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=600,     # recycle connections every 10min to avoid stale WAL handles
)

@event.listens_for(engine, 'connect')
def _set_sqlite_pragmas(dbapi_conn, _):
    """WAL mode + performance pragmas. Called once per new connection."""
    cur = dbapi_conn.cursor()
    cur.execute('PRAGMA journal_mode=WAL')       # concurrent readers + one writer
    cur.execute('PRAGMA synchronous=NORMAL')      # safe + faster than FULL
    cur.execute('PRAGMA cache_size=-65536')       # 64 MB page cache
    cur.execute('PRAGMA temp_store=MEMORY')       # temp tables in RAM
    cur.execute('PRAGMA mmap_size=268435456')     # 256 MB memory-mapped I/O
    cur.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency — yields a DB session, closes on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


SEED_USERS = [
    {'email': 'nlaaroubi@nyaaa.com', 'name': 'Nour Laaroubi', 'role': 'superadmin', 'pw_env': 'SEED_PW_NLAAROUBI'},
    {'email': 'swas@nyaaa.com', 'name': 'S. Was', 'role': 'officer', 'pw_env': 'SEED_PW_SWAS'},
    {'email': 'clawrence@nyaaa.com', 'name': 'C. Lawrence', 'role': 'officer', 'pw_env': 'SEED_PW_CLAWRENCE'},
    {'email': 'akelly@nyaaa.com', 'name': 'A. Kelly', 'role': 'travel_manager', 'pw_env': 'SEED_PW_AKELLY'},
    {'email': 'jnicotra@nyaaa.com', 'name': 'J. Nicotra', 'role': 'travel_director', 'pw_env': 'SEED_PW_JNICOTRA'},
]


def _migrate_target_bookings():
    """Add target_bookings column if missing (one-time migration)."""
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()
    try:
        cur.execute("PRAGMA table_info(monthly_advisor_targets)")
        cols = {row[1] for row in cur.fetchall()}
        if 'target_bookings' not in cols and 'target_amount' in cols:
            cur.execute("ALTER TABLE monthly_advisor_targets ADD COLUMN target_bookings REAL")
            conn.commit()
            log.info("Migration: added target_bookings column to monthly_advisor_targets")
    except Exception as e:
        log.warning(f"Migration target_bookings skipped: {e}")
    finally:
        conn.close()


def init_db():
    """Create tables (idempotent) + seed/upsert users + run migrations."""
    from models import User
    import bcrypt

    try:
        Base.metadata.create_all(bind=engine, checkfirst=True)
    except Exception as e:
        log.warning(f'create_all warning (likely race with another worker): {e}')
    log.info(f'Database initialized at {DB_PATH}')

    # Migrate: add target_bookings column if missing
    _migrate_target_bookings()

    db = SessionLocal()
    try:
        existing_count = db.query(User).count()
        if existing_count == 0:
            # Fresh DB — seed users from env vars (set in Azure App Settings or .env)
            missing = [s['pw_env'] for s in SEED_USERS if not os.getenv(s['pw_env'])]
            if missing:
                log.error(f'Cannot seed: missing env vars {missing}. Set them in Azure App Settings or .env')
                return
            for seed in SEED_USERS:
                pw = os.getenv(seed['pw_env'])
                hashed = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
                db.add(User(
                    email=seed['email'],
                    name=seed['name'],
                    password_hash=hashed,
                    role=seed['role'],
                    is_active=True,
                ))
                log.info(f'Seed user created: {seed["email"]} ({seed["role"]})')
        else:
            log.info(f'DB has {existing_count} users, skipping seed')
        db.commit()
    finally:
        db.close()

    # Seed geographic data in background thread (takes ~60s for Census API calls)
    import threading
    def _bg_geo_seed():
        try:
            from seed_geodata import seed_geodata
            seed_geodata(force=False)
        except Exception as e:
            log.warning(f'Geo data seed failed: {e}')
    threading.Thread(target=_bg_geo_seed, daemon=True).start()
