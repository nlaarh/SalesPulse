"""Seed data for initial database population.

Only runs on a completely empty users table (fresh deploy).
Passwords are read from environment variables — never hardcoded here.
Set SEED_PW_<SUFFIX> vars in Azure App Service → Configuration before first deploy.
"""

import os
import logging
import bcrypt
from sqlalchemy.orm import Session
from data.models import User
from data.repos.permissions import _DEFAULTS

log = logging.getLogger('salesinsight.seed')

SEED_USERS = [
    {'email': 'nlaaroubi@nyaaa.com', 'name': 'Nour Laaroubi',  'role': 'superadmin',      'department': None,       'pw_env': 'SEED_PW_NLAAROUBI'},
    {'email': 'swas@nyaaa.com',      'name': 'S. Was',          'role': 'executive',        'department': None,       'pw_env': 'SEED_PW_SWAS'},
    {'email': 'clawrence@nyaaa.com', 'name': 'C. Lawrence',     'role': 'executive',        'department': None,       'pw_env': 'SEED_PW_CLAWRENCE'},
    {'email': 'akelly@nyaaa.com',    'name': 'A. Kelly',        'role': 'travel_manager',   'department': 'Travel',   'pw_env': 'SEED_PW_AKELLY'},
    {'email': 'jnicotra@nyaaa.com',  'name': 'J. Nicotra',      'role': 'travel_director',  'department': 'Travel',   'pw_env': 'SEED_PW_JNICOTRA'},
]


def seed_users(db: Session) -> None:
    """Seed users if the table is empty. Skips any user whose password env var is not set."""
    count = db.query(User).count()
    if count > 0:
        log.info(f"Users table has {count} rows — skipping seed")
        return

    seeded = 0
    for u in SEED_USERS:
        pw = os.getenv(u['pw_env'], '').strip()
        if not pw:
            log.warning(f"Skipping seed for {u['email']}: {u['pw_env']} not set")
            continue
        hashed = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
        db.add(User(
            email=u['email'],
            name=u['name'],
            password_hash=hashed,
            role=u['role'],
            department=u['department'],
            is_active=True,
        ))
        log.info(f"Seeded user: {u['email']} ({u['role']})")
        seeded += 1

    if seeded:
        db.commit()
    else:
        log.error("No users seeded — all SEED_PW_* env vars are missing. Set them in Azure App Service Configuration.")


def seed_advisor_aliases(db: Session) -> None:
    """Seed default advisor name aliases if the advisor_aliases table is empty."""
    from data.models import AdvisorAlias
    count = db.query(AdvisorAlias).count()
    if count > 0:
        log.info(f"Advisor aliases table has {count} rows — skipping seed")
        return

    default_aliases = {
        "kevin fairbanks-bloom": "Kevin Bloom",
        "bloom, kevin": "Kevin Bloom",
        "fairbanks-bloom, kevin": "Kevin Bloom",
        "michelle szalapak": "Michelle Szlapak",
        "michelle a szlapak": "Michelle Szlapak",
        "szalapak, michelle": "Michelle Szlapak",
        "joanna voight": "Joanna Voigt",
        "voight, joanna": "Joanna Voigt",
        "joy kellner": "Joyce Foglia Kellner",
        "kellner, joy": "Joyce Foglia Kellner",
        "jacki nieman": "Jacqueline Nieman",
        "nieman, jacki": "Jacqueline Nieman",
        "beth steves": "Bethany Steves",
        "steves, beth": "Bethany Steves",
        "kelly harrienger": "Kelly Gonseth-Harrienger",
        "harrienger, kelly": "Kelly Gonseth-Harrienger",
        "cat mccarthy": "Catherine McCarthy",
        "mccarthy, cat": "Catherine McCarthy",
        "kim greene": "Kimberly Greene",
        "greene, kim": "Kimberly Greene",
    }

    for alias, canonical in default_aliases.items():
        db.add(AdvisorAlias(
            alias_name=alias,
            canonical_name=canonical
        ))
    db.commit()
    log.info(f"Seeded {len(default_aliases)} default advisor name aliases")
