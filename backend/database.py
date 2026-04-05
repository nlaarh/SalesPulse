"""SQLAlchemy setup + DB init with seed user."""

import os, logging
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase

log = logging.getLogger('salesinsight.db')

DB_DIR = Path.home() / '.salesinsight'
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / 'salesinsight.db'

engine = create_engine(
    f'sqlite:///{DB_PATH}',
    connect_args={'check_same_thread': False},
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
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
    {'email': 'nlaaroubi@nyaaa.com', 'name': 'Nour Laaroubi', 'password': '***REDACTED***', 'role': 'superadmin'},
    {'email': 'swas@nyaaa.com', 'name': 'S. Was', 'password': '***REDACTED***', 'role': 'officer'},
    {'email': 'clawrence@nyaaa.com', 'name': 'C. Lawrence', 'password': '***REDACTED***', 'role': 'officer'},
    {'email': 'akelly@nyaaa.com', 'name': 'A. Kelly', 'password': '***REDACTED***', 'role': 'travel_manager'},
    {'email': 'jnicotra@nyaaa.com', 'name': 'J. Nicotra', 'password': '***REDACTED***', 'role': 'travel_director'},
]


def init_db():
    """Create tables (idempotent) + seed/upsert users."""
    from models import User
    import bcrypt

    try:
        Base.metadata.create_all(bind=engine, checkfirst=True)
    except Exception as e:
        log.warning(f'create_all warning (likely race with another worker): {e}')
    log.info(f'Database initialized at {DB_PATH}')

    db = SessionLocal()
    try:
        existing_count = db.query(User).count()
        for seed in SEED_USERS:
            user = db.query(User).filter(User.email == seed['email']).first()
            hashed = bcrypt.hashpw(seed['password'].encode(), bcrypt.gensalt()).decode()
            if user is None:
                db.add(User(
                    email=seed['email'],
                    name=seed['name'],
                    password_hash=hashed,
                    role=seed['role'],
                    is_active=True,
                ))
                log.info(f'Seed user created: {seed["email"]} ({seed["role"]})')
            else:
                # Always sync superadmin credentials; sync others only on fresh DB
                if seed['role'] == 'superadmin' or existing_count == 0:
                    user.password_hash = hashed
                    user.role = seed['role']
                    user.is_active = True
                    log.info(f'Seed user synced: {seed["email"]} ({seed["role"]})')
        db.commit()
    finally:
        db.close()
