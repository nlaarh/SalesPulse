"""Permissions admin API — manage role-based access control.

Superadmin can:
- View all permissions per role
- Grant/revoke specific permissions
- See defaults vs overrides
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import User
from auth import require_admin, get_current_user
from data.repos.permissions import (
    get_role_permissions, set_permission, delete_permission,
    list_all_permissions, get_all_defaults, get_user_permissions,
)

router = APIRouter()
log = logging.getLogger('salesinsight.permissions')


class SetPermissionRequest(BaseModel):
    role: str
    resource: str
    allowed: bool


class DeletePermissionRequest(BaseModel):
    role: str
    resource: str


@router.get('/api/admin/permissions')
def get_permissions_overview(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Get all permission defaults and overrides for every role."""
    from data.models import VALID_ROLES
    return {
        'roles': VALID_ROLES,
        'defaults': get_all_defaults(),
        'overrides': list_all_permissions(db),
    }


@router.get('/api/admin/permissions/resources')
def list_resources(admin: User = Depends(require_admin)):
    """List all available resource identifiers that can be assigned."""
    return {
        'pages': [
            'page:dashboard', 'page:pipeline', 'page:opportunities', 'page:leads',
            'page:customers', 'page:territory_map', 'page:market_pulse',
            'page:cross_sell', 'page:monthly_report', 'page:travel_analytics',
            'page:agent_dashboard', 'page:census', 'page:settings',
        ],
        'lines': ['line:Travel', 'line:Insurance'],
        'actions': [
            'action:manage_users', 'action:upload_targets', 'action:view_cache',
            'action:export_data', 'action:manage_issues', 'action:use_ai_chat',
        ],
        'features': [
            'feature:ai_assistant', 'feature:opportunity_scoring',
        ],
    }


@router.get('/api/admin/permissions/{role}')
def get_role_detail(role: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Get detailed permission state for a specific role."""
    from data.models import VALID_ROLES
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f'Invalid role: {role}')
    return get_role_permissions(db, role)


@router.post('/api/admin/permissions')
def update_permission(body: SetPermissionRequest, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Grant or revoke a permission for a role."""
    from data.models import VALID_ROLES
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f'Invalid role: {body.role}')

    perm = set_permission(db, role=body.role, resource=body.resource, allowed=body.allowed, updated_by=admin.email)
    return {'ok': True, 'permission': perm.to_dict()}


@router.delete('/api/admin/permissions')
def reset_permission(body: DeletePermissionRequest, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Remove a permission override, reverting to default."""
    deleted = delete_permission(db, role=body.role, resource=body.resource)
    if not deleted:
        raise HTTPException(status_code=404, detail='Permission override not found')
    return {'ok': True, 'reverted_to_default': True}


@router.get('/api/auth/permissions')
def my_permissions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get current user's effective permissions."""
    return {'permissions': get_user_permissions(db, user)}
