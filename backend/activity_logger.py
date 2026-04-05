"""Thin helper to persist activity logs to the database."""

import json, logging
from sqlalchemy.orm import Session
from models import ActivityLog

log = logging.getLogger('salesinsight.activity')


def log_activity(
    db: Session,
    *,
    action: str,
    category: str,
    user=None,
    user_email: str | None = None,
    detail: str | None = None,
    metadata: dict | None = None,
    ip: str | None = None,
):
    """Insert an activity log row.

    Accepts either a User object or a plain user_email string (for failed logins).
    """
    entry = ActivityLog(
        user_id=getattr(user, 'id', None),
        user_email=user_email or getattr(user, 'email', None),
        action=action,
        category=category,
        detail=detail,
        metadata_json=json.dumps(metadata) if metadata else None,
        ip_address=ip,
    )
    try:
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()
        log.exception('Failed to write activity log')


def log_sf_query(query: str):
    """Log a Salesforce SOQL query using its own DB session (fire-and-forget)."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        entry = ActivityLog(
            action='sf_query',
            category='data_access',
            detail=query[:500],
        )
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()
        log.exception('Failed to log SF query')
    finally:
        db.close()
