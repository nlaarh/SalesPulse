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
