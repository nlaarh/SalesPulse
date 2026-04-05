"""Activity-log listing endpoint (admin only)."""

import math
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from models import ActivityLog, User
from auth import require_admin

router = APIRouter()


@router.get('/api/activity-logs')
def list_activity_logs(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    user_email: str | None = None,
    category: str | None = None,
    action: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
):
    q = db.query(ActivityLog)

    if user_email:
        q = q.filter(ActivityLog.user_email == user_email)
    if category:
        q = q.filter(ActivityLog.category == category)
    if action:
        q = q.filter(ActivityLog.action == action)
    if start_date:
        q = q.filter(ActivityLog.created_at >= datetime.fromisoformat(start_date))
    if end_date:
        q = q.filter(ActivityLog.created_at <= datetime.fromisoformat(end_date + 'T23:59:59'))

    total = q.count()
    items = (
        q.order_by(ActivityLog.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        'items': [i.to_dict() for i in items],
        'total': total,
        'page': page,
        'per_page': per_page,
        'pages': math.ceil(total / per_page) if total else 1,
    }


@router.get('/api/activity-logs/filters')
def activity_log_filters(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Return distinct values for filter dropdowns."""
    emails = [r[0] for r in db.query(ActivityLog.user_email).distinct().all() if r[0]]
    categories = [r[0] for r in db.query(ActivityLog.category).distinct().all() if r[0]]
    actions = [r[0] for r in db.query(ActivityLog.action).distinct().all() if r[0]]
    return {'emails': sorted(emails), 'categories': sorted(categories), 'actions': sorted(actions)}
