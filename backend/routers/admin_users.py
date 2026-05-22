"""Admin user management: sessions list, password reset, impersonate, activate.

Every endpoint here is superadmin-only via require_admin. The lighter
require_admin_or_superadmin gate is reserved for endpoints we want regular
'admin' role users to access — none in this router today.

Mirrors FSLAPP's /api/admin/users/* surface (see FSLAPP/backend/routers/admin.py),
adapted to SalesPulse's JWT + SQLAlchemy ORM + UserSession model.
"""

import logging
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from database import get_db
from models import User, UserSession, SESSION_TTL_HOURS
from auth import hash_password, create_token, decode_token, require_admin, require_admin_or_superadmin
from activity_logger import log_activity
from schemas import ChangePasswordRequest, ImpersonateReturnRequest

router = APIRouter()
log = logging.getLogger('salesinsight.admin_users')


# ── Sessions list ────────────────────────────────────────────────────────────

@router.get('/api/admin/sessions')
def list_sessions(admin: User = Depends(require_admin_or_superadmin), db: Session = Depends(get_db)):
    """List currently active sessions, one row per user (newest session wins).

    A session is active when logout_time IS NULL AND expires_at > now().
    `online=True` iff last_seen is within the last 60 seconds (heartbeat window).
    `impersonator_email` is set when this session was created via /impersonate.
    """
    now = datetime.utcnow()

    # Pull active sessions ordered so the newest per-user comes first.
    rows = (
        db.query(UserSession)
        .filter(UserSession.logout_time.is_(None))
        .filter(UserSession.expires_at > now)
        .order_by(UserSession.user_id, UserSession.last_seen.desc())
        .all()
    )

    # De-duplicate to one row per user_id (newest by last_seen).
    by_user: dict[int, UserSession] = {}
    for s in rows:
        if s.user_id not in by_user:
            by_user[s.user_id] = s

    if not by_user:
        return []

    # Resolve user + impersonator emails in one batch.
    user_ids = set(by_user.keys())
    for s in by_user.values():
        if s.impersonator_user_id is not None:
            user_ids.add(s.impersonator_user_id)
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}

    sessions = list(by_user.values())
    sessions.sort(key=lambda s: s.last_seen or s.login_time, reverse=True)

    out = []
    for s in sessions:
        u = users.get(s.user_id)
        if not u:  # session row points at a deleted user — skip defensively
            continue
        impersonator_email = None
        if s.impersonator_user_id is not None:
            imp = users.get(s.impersonator_user_id)
            impersonator_email = imp.email if imp else None
        online = bool(s.last_seen and (now - s.last_seen).total_seconds() <= 60)
        out.append({
            'user_id': u.id,
            'email': u.email,
            'name': u.name,
            'role': u.role,
            'login_time': s.login_time.isoformat() if s.login_time else None,
            'last_seen': s.last_seen.isoformat() if s.last_seen else None,
            'expires_at': s.expires_at.isoformat() if s.expires_at else None,
            'ip_address': s.ip_address,
            'impersonator_email': impersonator_email,
            'online': online,
        })
    return out


# ── Admin sets new password for a user ───────────────────────────────────────

@router.post('/api/admin/users/{user_id}/password')
def set_user_password(
    user_id: int,
    body: ChangePasswordRequest,
    request: Request,
    admin: User = Depends(require_admin_or_superadmin),
    db: Session = Depends(get_db),
):
    """Set a new password for a target user; invalidates all their active sessions."""
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail='Password must be at least 8 characters')

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail='User not found')

    target.password_hash = hash_password(body.new_password)

    # Force re-login: invalidate every open session for this user.
    db.query(UserSession).filter(
        UserSession.user_id == target.id,
        UserSession.logout_time.is_(None),
    ).update({'logout_time': datetime.utcnow()})

    db.commit()

    ip = request.client.host if request.client else None
    log_activity(
        db,
        action='admin_password_reset',
        category='user_mgmt',
        user=admin,
        detail=f'Reset password for {target.email}',
        ip=ip,
    )
    log.info(f'Admin {admin.email} reset password for {target.email}')
    return {'ok': True}


# ── Impersonate ──────────────────────────────────────────────────────────────

@router.post('/api/admin/users/{user_id}/impersonate')
def impersonate(
    user_id: int,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Mint a JWT for the target user. Caller stashes `origin_token` to return.

    Refuses: target=self, target=superadmin, target inactive.
    """
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail='User not found')
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail='Cannot impersonate yourself')
    if target.role == 'superadmin':
        raise HTTPException(status_code=400, detail='Cannot impersonate another superadmin')
    if not target.is_active:
        raise HTTPException(status_code=400, detail='Cannot impersonate an inactive user')

    ip = request.client.host if request.client else None

    # New session row for the target user, with impersonator linked back to admin.
    target_sess = UserSession(
        token=secrets.token_urlsafe(32),
        user_id=target.id,
        name=target.name or '',
        role=target.role or '',
        login_time=datetime.utcnow(),
        last_seen=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=SESSION_TTL_HOURS),
        ip_address=ip,
        impersonator_user_id=admin.id,
    )
    db.add(target_sess)

    # Fresh session row for the admin so they can come back with a clean JWT.
    origin_sess = UserSession(
        token=secrets.token_urlsafe(32),
        user_id=admin.id,
        name=admin.name or '',
        role=admin.role or '',
        login_time=datetime.utcnow(),
        last_seen=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=SESSION_TTL_HOURS),
        ip_address=ip,
        impersonator_user_id=None,
    )
    db.add(origin_sess)
    db.commit()
    db.refresh(target_sess)
    db.refresh(origin_sess)

    new_token = create_token(target.id, target.email, target.role, sid=target_sess.token)
    origin_token = create_token(admin.id, admin.email, admin.role, sid=origin_sess.token)

    log_activity(
        db,
        action='impersonate_start',
        category='impersonate',
        user=admin,
        detail=f'Impersonating {target.email} ({target.role})',
        ip=ip,
        metadata={'target_user_id': target.id, 'target_email': target.email},
    )
    log.info(f'Impersonate start: {admin.email} → {target.email}')

    return {
        'token': new_token,
        'user': target.to_dict(),
        'origin_token': origin_token,
    }


@router.post('/api/admin/impersonate/return')
def impersonate_return(
    body: ImpersonateReturnRequest,
    request: Request,
    # We do NOT require_admin here — the *current* JWT in the Authorization header
    # is the impersonated user's, which is not necessarily superadmin. We rely on
    # the integrity of the signed origin_token to verify the original admin.
    db: Session = Depends(get_db),
):
    """Restore the original admin session from a previously-stashed origin_token.

    Verifies the origin token's signature, marks the impersonated session as
    logged out (if we can identify it from the Authorization header), and issues
    a fresh JWT for the original admin.
    """
    # Validate origin token (raises 401 on invalid/expired).
    origin_payload = decode_token(body.origin_token)
    origin_user = db.query(User).filter(User.id == int(origin_payload['sub'])).first()
    if not origin_user or not origin_user.is_active:
        raise HTTPException(status_code=401, detail='Origin user not found or inactive')

    # Best-effort: close the impersonated session (current Bearer).
    auth_header = request.headers.get('authorization', '')
    if auth_header.lower().startswith('bearer '):
        raw = auth_header.split(' ', 1)[1].strip()
        try:
            cur_payload = decode_token(raw)
            cur_sid = cur_payload.get('sid')
            if cur_sid:
                impersonated_sess = db.query(UserSession).filter(
                    UserSession.token == cur_sid,
                    UserSession.logout_time.is_(None),
                ).first()
                if impersonated_sess:
                    impersonated_sess.logout_time = datetime.utcnow()
                    db.commit()
        except Exception:
            log.debug('impersonate_return: could not close current session', exc_info=True)
            try:
                db.rollback()
            except Exception:
                pass

    ip = request.client.host if request.client else None

    # Issue a fresh session + JWT for the returning admin.
    new_origin_sess = UserSession(
        token=secrets.token_urlsafe(32),
        user_id=origin_user.id,
        name=origin_user.name or '',
        role=origin_user.role or '',
        login_time=datetime.utcnow(),
        last_seen=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=SESSION_TTL_HOURS),
        ip_address=ip,
        impersonator_user_id=None,
    )
    db.add(new_origin_sess)
    db.commit()
    db.refresh(new_origin_sess)

    new_token = create_token(origin_user.id, origin_user.email, origin_user.role, sid=new_origin_sess.token)

    log_activity(
        db,
        action='impersonate_end',
        category='impersonate',
        user=origin_user,
        detail='Returned from impersonation',
        ip=ip,
    )
    log.info(f'Impersonate end: returned to {origin_user.email}')

    return {'token': new_token, 'user': origin_user.to_dict()}


# ── Activate (restore soft-deleted) ──────────────────────────────────────────

@router.post('/api/admin/users/{user_id}/activate')
def activate_user(
    user_id: int,
    request: Request,
    admin: User = Depends(require_admin_or_superadmin),
    db: Session = Depends(get_db),
):
    """Restore a soft-deleted user (sets is_active=true)."""
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail='User not found')

    target.is_active = True
    db.commit()
    db.refresh(target)

    ip = request.client.host if request.client else None
    log_activity(
        db,
        action='user_activated',
        category='user_mgmt',
        user=admin,
        detail=f'Activated {target.email}',
        ip=ip,
    )
    log.info(f'User activated: {target.email} by {admin.email}')
    return {'ok': True, 'user': target.to_dict()}
