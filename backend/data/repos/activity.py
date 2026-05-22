"""Activity log repository — audit trail operations."""

import json
import logging
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from data.models import ActivityLog

log = logging.getLogger('salesinsight.activity')


def log_activity(
    db: Session,
    *,
    action: str,
    category: str,
    user=None,
    user_email: Optional[str] = None,
    detail: Optional[str] = None,
    metadata: Optional[dict] = None,
    ip: Optional[str] = None,
) -> None:
    """Insert an activity log row."""
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


def get_activity_logs(
    db: Session,
    *,
    category: Optional[str] = None,
    user_email: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> list[ActivityLog]:
    """Query activity logs with optional filters."""
    q = db.query(ActivityLog)
    if category:
        q = q.filter(ActivityLog.category == category)
    if user_email:
        q = q.filter(ActivityLog.user_email == user_email)
    return q.order_by(ActivityLog.created_at.desc()).offset(offset).limit(limit).all()


def count_activity_logs(db: Session, *, category: Optional[str] = None) -> int:
    q = db.query(ActivityLog)
    if category:
        q = q.filter(ActivityLog.category == category)
    return q.count()
