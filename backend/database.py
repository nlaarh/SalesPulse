"""SQLAlchemy setup + DB init with seed user."""

import os, logging
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

log = logging.getLogger('salesinsight.db')

DB_DIR = Path.home() / '.salesinsight'
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / 'salesinsight.db'

engine = create_engine(f'sqlite:///{DB_PATH}', connect_args={'check_same_thread': False})
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
    """Create tables (idempotent) + seed users if not exists."""
    from models import User
    import bcrypt

    # checkfirst=True is default but we also guard with try/except for concurrent workers
    try:
        Base.metadata.create_all(bind=engine, checkfirst=True)
    except Exception as e:
        # Harmless if another worker already created the tables
        log.warning(f'create_all warning (likely race with another worker): {e}')
    log.info(f'Database initialized at {DB_PATH}')

    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            log.info('Users table not empty — skipping seed.')
            return

        for seed in SEED_USERS:
            hashed = bcrypt.hashpw(seed['password'].encode(), bcrypt.gensalt()).decode()
            db.add(User(
                email=seed['email'],
                name=seed['name'],
                password_hash=hashed,
                role=seed['role'],
                is_active=True,
            ))
            log.info(f'Seed user created: {seed["email"]} ({seed["role"]})')
        db.commit()
    finally:
        db.close()
