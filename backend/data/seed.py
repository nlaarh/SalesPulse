"""Seed data for initial database population.

Contains user credentials and default permission data.
Called by data/connection.py create_all_tables() on fresh DB.
"""

import logging
import bcrypt
from sqlalchemy.orm import Session
from data.models import User
from data.repos.permissions import _DEFAULTS

log = logging.getLogger('salesinsight.seed')

SEED_USERS = [
    {'email': 'nlaaroubi@nyaaa.com', 'name': 'Nour Laaroubi', 'role': 'superadmin', 'department': None, 'password': '8coDxQB!CB1*'},
    {'email': 'swas@nyaaa.com', 'name': 'S. Was', 'role': 'executive', 'department': None, 'password': 'Vfm&5z7C*1eX'},
    {'email': 'clawrence@nyaaa.com', 'name': 'C. Lawrence', 'role': 'executive', 'department': None, 'password': 'ttJO4J@bk&Jg'},
    {'email': 'akelly@nyaaa.com', 'name': 'A. Kelly', 'role': 'travel_manager', 'department': 'Travel', 'password': 'Xy&mY0OKLrTI'},
    {'email': 'jnicotra@nyaaa.com', 'name': 'J. Nicotra', 'role': 'travel_director', 'department': 'Travel', 'password': 'Y3v3Gt53I%Dy'},
]


def seed_users(db: Session) -> None:
    """Seed users if the table is empty."""
    count = db.query(User).count()
    if count > 0:
        log.info(f"Users table has {count} rows — skipping seed")
        return

    for u in SEED_USERS:
        hashed = bcrypt.hashpw(u['password'].encode(), bcrypt.gensalt()).decode()
        db.add(User(
            email=u['email'],
            name=u['name'],
            password_hash=hashed,
            role=u['role'],
            department=u['department'],
            is_active=True,
        ))
        log.info(f"Seeded user: {u['email']} ({u['role']}, dept={u['department']})")

    db.commit()
