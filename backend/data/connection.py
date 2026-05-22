"""Database connection — PostgreSQL with Azure Entra (DefaultAzureCredential).

Same pattern as the FSL app:
- On Azure: Managed Identity (zero secrets)
- Locally: az login CLI session token

All data lives in the 'sales' schema. Other schemas (optimizer, public, etc.) are NEVER touched.
Tests only: USE_SQLITE=1 for isolated unit tests.
"""

import os
import logging
import threading
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase

log = logging.getLogger('salesinsight.db')

# ── Configuration ────────────────────────────────────────────────────────────

PG_HOST = os.getenv('PG_HOST', 'fslapp-pg.postgres.database.azure.com')
PG_DATABASE = os.getenv('PG_DATABASE', 'fslapp')
PG_SCHEMA = os.getenv('PG_SCHEMA', 'sales')
PG_USER = os.getenv('PG_USER', 'nlaaroubi@nyaaa.com')
PG_PORT = int(os.getenv('PG_PORT', '5432'))

# Tests only: USE_SQLITE=1 for unit tests that don't need PG
USE_SQLITE = os.getenv('USE_SQLITE', '').strip() in ('1', 'true', 'yes')

# ── Token management (Azure Entra / DefaultAzureCredential) ──────────────────

_token_lock = threading.Lock()
_cached_token: dict = {}  # {'token': str, 'expires_on': float}


def _get_azure_token() -> str:
    """Get a fresh Entra token for PostgreSQL. Cached until near-expiry (55 min cycle)."""
    import time
    with _token_lock:
        now = time.time()
        if _cached_token.get('token') and _cached_token.get('expires_on', 0) - now > 300:
            return _cached_token['token']

        try:
            from azure.identity import DefaultAzureCredential
            credential = DefaultAzureCredential()
            token_obj = credential.get_token("https://ossrdbms-aad.database.windows.net/.default")
            _cached_token['token'] = token_obj.token
            _cached_token['expires_on'] = token_obj.expires_on
            log.info("Entra token acquired/refreshed for PostgreSQL")
            return token_obj.token
        except Exception as e:
            log.error(f"Failed to get Entra token: {e}")
            raise


# ── Engine creation ──────────────────────────────────────────────────────────

def _build_engine():
    """Build SQLAlchemy engine. PostgreSQL with Entra auth (same as FSL app)."""

    if USE_SQLITE:
        # Unit tests only
        from pathlib import Path
        db_dir = Path.home() / '.salesinsight'
        db_dir.mkdir(parents=True, exist_ok=True)
        db_path = db_dir / 'salesinsight.db'

        eng = create_engine(
            f'sqlite:///{db_path}',
            connect_args={'check_same_thread': False, 'timeout': 15},
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )

        @event.listens_for(eng, 'connect')
        def _set_sqlite_pragmas(dbapi_conn, _):
            cur = dbapi_conn.cursor()
            cur.execute('PRAGMA journal_mode=WAL')
            cur.execute('PRAGMA synchronous=NORMAL')
            cur.execute('PRAGMA cache_size=-65536')
            cur.execute('PRAGMA temp_store=MEMORY')
            cur.close()

        log.info(f"Using SQLite (tests): {db_path}")
        return eng

    # ── PostgreSQL with Entra token auth ─────────────────────────────────
    url = (
        f"postgresql+psycopg2://{PG_USER}:placeholder"
        f"@{PG_HOST}:{PG_PORT}/{PG_DATABASE}"
        f"?sslmode=require"
    )
    log.info(f"PostgreSQL: {PG_HOST}/{PG_DATABASE} schema={PG_SCHEMA} user={PG_USER}")

    eng = create_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        pool_recycle=3300,  # recycle every 55 min (token refresh cycle)
    )

    # Inject fresh Entra token on every new connection
    @event.listens_for(eng, 'do_connect')
    def _inject_token(dialect, conn_rec, cargs, cparams):
        cparams['password'] = _get_azure_token()

    # Set search_path to sales schema — NEVER touches other schemas
    @event.listens_for(eng, 'connect')
    def _set_schema(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute(f"SET search_path TO {PG_SCHEMA}, public")
        cur.close()

    return eng


engine = _build_engine()

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


# ── Base class ───────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


# ── FastAPI dependency ───────────────────────────────────────────────────────

def get_db():
    """FastAPI dependency — yields a DB session, closes on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Schema initialization ────────────────────────────────────────────────────

def create_schema_if_needed():
    """Create the 'sales' schema if it doesn't exist.

    ONLY touches the 'sales' schema. Other schemas (optimizer, accounting,
    core, ops, public) are NEVER modified.
    """
    if USE_SQLITE:
        return
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {PG_SCHEMA}"))
        conn.commit()
    log.info(f"Schema '{PG_SCHEMA}' ensured")


def create_all_tables():
    """Create all tables defined in models (idempotent). All in 'sales' schema."""
    from data.models import register_all_models  # noqa: F401 — ensures models loaded
    Base.metadata.create_all(bind=engine, checkfirst=True)
    log.info("All tables created/verified")
