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


def init_db():
    """Create tables + seed superadmin if not exists."""
    from models import User
    import bcrypt

    Base.metadata.create_all(bind=engine)
    log.info(f'Database initialized at {DB_PATH}')

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == 'nlaaroubi@nyaaa.com').first()
        if not existing:
            hashed = bcrypt.hashpw('***REDACTED***'.encode(), bcrypt.gensalt()).decode()
            seed = User(
                email='nlaaroubi@nyaaa.com',
                name='Nour Laaroubi',
                password_hash=hashed,
                role='superadmin',
                is_active=True,
            )
            db.add(seed)
            db.commit()
            log.info('Seed superadmin user created: nlaaroubi@nyaaa.com')
        else:
            log.info('Seed user already exists, skipping.')
    finally:
        db.close()
