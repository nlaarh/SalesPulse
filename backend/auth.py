"""JWT token creation/verification + password utilities + dynamic RBAC."""

import os, jwt, bcrypt, logging
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from models import User, UserSession

log = logging.getLogger('salesinsight.auth')

JWT_SECRET = os.getenv('JWT_SECRET', 'salesinsight-dev-secret-change-in-prod')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRY_HOURS = 24

# Throttle for last_seen UPDATEs — only write if older than this.
LAST_SEEN_THROTTLE_SECONDS = 30

security = HTTPBearer()


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(user_id: int, email: str, role: str, sid: str | None = None) -> str:
    """Mint a JWT. Optionally embed a `sid` claim that points to a UserSession row."""
    payload = {
        'sub': str(user_id),
        'email': email,
        'role': role,
        'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    if sid:
        payload['sid'] = sid
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Token expired')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid token')


def _touch_session(db: Session, sid: str | None) -> None:
    """Best-effort: update last_seen on the matching UserSession row.

    Never raises — tokens issued before this migration won't have a `sid` claim,
    and old session rows may have been purged. Both cases are silently ignored.
    Throttled to one UPDATE per session per LAST_SEEN_THROTTLE_SECONDS.
    """
    if not sid:
        return
    try:
        now = datetime.utcnow()
        sess = db.query(UserSession).filter(
            UserSession.token == sid,
            UserSession.logout_time.is_(None),
        ).first()
        if not sess:
            return
        # Throttle: only UPDATE if last_seen is stale.
        if sess.last_seen and (now - sess.last_seen).total_seconds() < LAST_SEEN_THROTTLE_SECONDS:
            return
        sess.last_seen = now
        db.commit()
    except Exception:
        # Must NOT fail the request — graceful degradation.
        try:
            db.rollback()
        except Exception:
            pass
        log.debug('touch_session failed (non-fatal)', exc_info=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency — extracts and validates the current user from JWT."""
    payload = decode_token(credentials.credentials)
    user = db.query(User).filter(User.id == int(payload['sub'])).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='User not found or inactive')
    # Best-effort last_seen update on the session (throttled, swallow errors).
    _touch_session(db, payload.get('sid'))
    return user


# ── Dynamic Permission Checks ────────────────────────────────────────────────

def require_admin(user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency — ensures the user is superadmin.

    Reserved for the highest-privilege endpoints (impersonate, password reset,
    permission editing, cache admin). Do not weaken this gate.
    """
    if user.role != 'superadmin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Admin access required')
    return user


def require_admin_or_superadmin(user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency — admin OR superadmin.

    Lighter gate for user-management endpoints that an `admin` role can perform
    (e.g., list sessions, manage user accounts), but excludes the high-privilege
    actions still locked behind `require_admin`.
    """
    if user.role not in ('admin', 'superadmin'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Admin access required')
    return user


def require_permission(resource: str):
    """Factory: creates a FastAPI dependency that checks a specific permission.

    Usage:
        @router.get("/api/something", dependencies=[Depends(require_permission('action:use_ai_chat'))])
        def my_endpoint(...): ...
    """
    def _check(
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        from data.repos.permissions import has_permission
        if not has_permission(db, user, resource):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f'Access denied: {resource}',
            )
        return user
    return _check


# Legacy aliases for backward compatibility
def require_ai_access(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    """AI chat access — checked dynamically via permissions."""
    from data.repos.permissions import has_permission
    if not has_permission(db, user, 'action:use_ai_chat'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='AI chat access restricted')
    return user
