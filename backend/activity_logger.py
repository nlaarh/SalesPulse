"""Thin helper to persist activity logs to the database.

All writes go through a single-threaded background executor so that
logging never adds latency to request handlers or Salesforce queries.
"""

import json, logging
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.orm import Session
from models import ActivityLog

log = logging.getLogger('salesinsight.activity')

# Single worker keeps writes serialised; daemon=True so it doesn't block shutdown.
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='activity-log')


def _write(entry: ActivityLog) -> None:
    """Blocking write — runs in background thread."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()
        log.exception('Failed to write activity log')
    finally:
        db.close()


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
    """Insert an activity log row using the caller's existing DB session.

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


def log_sf_query(query: str) -> None:
    """Fire-and-forget: log a Salesforce SOQL query without blocking the caller."""
    entry = ActivityLog(
        action='sf_query',
        category='data_access',
        detail=query[:500],
    )
    _executor.submit(_write, entry)
