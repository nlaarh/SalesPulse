"""Auth + User management endpoints."""

import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from database import get_db
from models import User, VALID_ROLES
from auth import hash_password, verify_password, create_token, get_current_user, require_admin
from activity_logger import log_activity

router = APIRouter()
log = logging.getLogger('salesinsight.users')


# ── Request schemas ──────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str

class CreateUserRequest(BaseModel):
    email: str
    name: str
    password: str
    role: str = 'officer'

class UpdateUserRequest(BaseModel):
    name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = None


# ── Auth endpoints ───────────────────────────────────────────────────────────

@router.post('/api/auth/login')
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else None
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        log_activity(db, action='login_failed', category='auth', user_email=body.email, detail=f'Failed login attempt for {body.email}', ip=ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid email or password')
    if not user.is_active:
        log_activity(db, action='login_failed', category='auth', user=user, detail='Account is deactivated', ip=ip)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Account is deactivated')

    token = create_token(user.id, user.email, user.role)
    log_activity(db, action='login', category='auth', user=user, detail=f'Login success ({user.role})', ip=ip)
    log.info(f'Login success: {user.email} ({user.role})')
    return {'token': token, 'user': user.to_dict()}


@router.get('/api/auth/me')
def me(user: User = Depends(get_current_user)):
    return user.to_dict()


# ── User CRUD (admin/superadmin only) ────────────────────────────────────────

@router.get('/api/users')
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [u.to_dict() for u in users]


@router.post('/api/users', status_code=201)
def create_user(body: CreateUserRequest, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f'Invalid role. Must be one of: {", ".join(VALID_ROLES)}')

    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=409, detail='A user with this email already exists')

    user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        role=body.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    ip = request.client.host if request.client else None
    log_activity(db, action='user_created', category='user_mgmt', user=admin, detail=f'Created {user.email} ({user.role})', ip=ip)
    log.info(f'User created: {user.email} ({user.role}) by {admin.email}')
    return user.to_dict()


@router.put('/api/users/{user_id}')
def update_user(user_id: int, body: UpdateUserRequest, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    # Prevent demoting the last superadmin
    if user.role == 'superadmin' and body.role and body.role != 'superadmin':
        superadmin_count = db.query(User).filter(User.role == 'superadmin', User.is_active == True).count()
        if superadmin_count <= 1:
            raise HTTPException(status_code=400, detail='Cannot demote the last superadmin')

    if body.name is not None:
        user.name = body.name
    if body.role is not None:
        if body.role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f'Invalid role. Must be one of: {", ".join(VALID_ROLES)}')
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.password is not None:
        user.password_hash = hash_password(body.password)

    db.commit()
    db.refresh(user)
    ip = request.client.host if request.client else None
    log_activity(db, action='user_updated', category='user_mgmt', user=admin, detail=f'Updated {user.email}', ip=ip)
    log.info(f'User updated: {user.email} by {admin.email}')
    return user.to_dict()


@router.delete('/api/users/{user_id}')
def delete_user(user_id: int, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    # Prevent deleting self
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail='Cannot delete your own account')

    # Prevent deleting last superadmin
    if user.role == 'superadmin':
        superadmin_count = db.query(User).filter(User.role == 'superadmin', User.is_active == True).count()
        if superadmin_count <= 1:
            raise HTTPException(status_code=400, detail='Cannot delete the last superadmin')

    email = user.email
    db.delete(user)
    db.commit()
    ip = request.client.host if request.client else None
    log_activity(db, action='user_deleted', category='user_mgmt', user=admin, detail=f'Deleted {email}', ip=ip)
    log.info(f'User deleted: {email} by {admin.email}')
    return {'ok': True}


# ── Emergency superadmin reset (ADMIN_PIN protected, no auth required) ────────

class ResetAdminRequest(BaseModel):
    pin: str
    new_password: str

@router.post('/api/admin/reset-admin')
def reset_admin(body: ResetAdminRequest, db: Session = Depends(get_db)):
    """Reset superadmin password. Protected by ADMIN_PIN env var."""
    import os, bcrypt
    from database import SEED_USERS

    pin = os.getenv('ADMIN_PIN', '')
    if not pin or body.pin != pin:
        raise HTTPException(status_code=403, detail='Invalid PIN')

    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail='Password must be at least 8 characters')

    seed = next((s for s in SEED_USERS if s['role'] == 'superadmin'), None)
    if not seed:
        raise HTTPException(status_code=500, detail='No superadmin seed found')

    hashed = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    user = db.query(User).filter(User.email == seed['email']).first()
    if user:
        user.password_hash = hashed
        user.is_active = True
        user.role = 'superadmin'
        log.info(f'Superadmin reset via PIN: {user.email}')
    else:
        db.add(User(email=seed['email'], name=seed['name'],
                    password_hash=hashed, role='superadmin', is_active=True))
        log.info(f'Superadmin created via PIN: {seed["email"]}')
    db.commit()
    return {'ok': True, 'email': seed['email']}


@router.post('/api/admin/cache-reset')
def cache_reset(admin: User = Depends(require_admin)):
    """Force-reload the owner map/agent lists AND flush the full L1+L2 data cache."""
    import shared, cache
    # Flush L1 in-memory data cache
    with cache._lock:
        l1_count = len(cache._store)
        cache._store.clear()
    # Flush L2 disk cache
    l2_count = 0
    if cache._CACHE_DIR.exists():
        for f in cache._CACHE_DIR.glob('*.json'):
            f.unlink(missing_ok=True)
            l2_count += 1
    # Reload owner map
    shared._OWNER_MAP = None
    shared._TRAVEL_AGENTS = None
    shared._INSURANCE_AGENTS = None
    owner_map = shared.get_owner_map(force_refresh=True)
    return {
        'ok': True,
        'flushed_l1': l1_count,
        'flushed_l2': l2_count,
        'owner_map_size': len(owner_map),
    }


@router.post('/api/admin/geo/refresh')
def geo_refresh(admin: User = Depends(require_admin)):
    """Force re-seed geographic boundaries + Census population data."""
    from seed_geodata import seed_geodata
    from database import SessionLocal
    from models import GeoCounty, GeoZip, GeoMeta
    from sqlalchemy import func

    seed_geodata(force=True)

    db = SessionLocal()
    try:
        county_count = db.query(GeoCounty).count()
        zip_count = db.query(GeoZip).count()
        total_pop = db.query(func.sum(GeoZip.population)).scalar() or 0
        last_refreshed = db.query(GeoMeta).filter(GeoMeta.key == 'last_refreshed').first()
    finally:
        db.close()

    # Clear boundary + census caches
    import cache
    with cache._lock:
        keys_to_remove = [k for k in cache._store if 'boundar' in k or 'census' in k]
        for k in keys_to_remove:
            del cache._store[k]
    for f in cache._CACHE_DIR.glob('*.json'):
        fname = f.name
        if 'boundar' in fname or 'census' in fname:
            f.unlink(missing_ok=True)

    return {
        'ok': True,
        'counties': county_count,
        'zips': zip_count,
        'total_population': total_pop,
        'last_refreshed': last_refreshed.value if last_refreshed else None,
    }


@router.get('/api/admin/geo/status')
def geo_status(admin: User = Depends(require_admin)):
    """Return geo seed status — when last refreshed, counts."""
    from database import SessionLocal
    from models import GeoCounty, GeoZip, GeoMeta

    db = SessionLocal()
    try:
        county_count = db.query(GeoCounty).count()
        zip_count = db.query(GeoZip).count()
        meta = {m.key: m.value for m in db.query(GeoMeta).all()}
        return {
            'seeded': county_count > 0,
            'counties': county_count,
            'zips': zip_count,
            'last_refreshed': meta.get('last_refreshed'),
            'source': meta.get('source', 'US Census Bureau ACS 5-Year 2022'),
        }
    finally:
        db.close()


@router.get('/api/admin/db/backup')
def db_backup_download(admin: User = Depends(require_admin)):
    """Download the current SQLite database file (admin-only)."""
    from database import DB_PATH
    from fastapi.responses import FileResponse
    import shutil, tempfile

    if not DB_PATH.exists():
        raise HTTPException(status_code=404, detail="Database file not found")

    # Copy to temp file to avoid locking issues during download
    tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
    shutil.copy2(DB_PATH, tmp.name)
    tmp.close()

    return FileResponse(
        tmp.name,
        media_type='application/x-sqlite3',
        filename=f'salesinsight_backup_{DB_PATH.stat().st_mtime:.0f}.db',
    )


@router.get('/api/admin/db/info')
def db_info(admin: User = Depends(require_admin)):
    """Return DB location, size, backup info."""
    from database import DB_PATH, DB_DIR

    backup_dir = DB_DIR / 'backups'
    backups = []
    if backup_dir.exists():
        for f in sorted(backup_dir.glob('salesinsight_*.db'), reverse=True):
            backups.append({
                'name': f.name,
                'size_kb': f.stat().st_size // 1024,
                'created': f.stat().st_mtime,
            })

    return {
        'path': str(DB_PATH),
        'exists': DB_PATH.exists(),
        'size_kb': DB_PATH.stat().st_size // 1024 if DB_PATH.exists() else 0,
        'backups': backups,
    }
