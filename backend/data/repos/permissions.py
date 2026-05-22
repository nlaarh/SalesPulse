"""Permissions repository — dynamic RBAC.

The ONLY place that knows how permissions are stored and evaluated.
Routers call `has_permission(db, user, 'page:pipeline')` — never check roles directly.
"""

import logging
from typing import Optional
from sqlalchemy.orm import Session
from data.models import RolePermission, User

log = logging.getLogger('salesinsight.permissions')

# ── Default permissions (used when no DB rows exist for a role) ───────────────
# These are the BASELINE — admin can override any of these via the UI.

_DEFAULTS: dict[str, set[str]] = {
    'superadmin': {
        'page:*', 'line:*', 'action:*', 'feature:*',
    },
    # 'admin' is a lighter version of superadmin — can manage users (password reset,
    # activate/deactivate) and view all pages/lines/AI features, but NOT impersonate
    # and not the system-level (cache/permissions) admin endpoints, which remain
    # superadmin-only via require_admin. Refine as needed.
    'admin': {
        'page:*', 'line:*',
        'action:manage_users', 'action:export_data', 'action:use_ai_chat',
        'action:manage_issues', 'action:upload_targets',
        'feature:ai_assistant', 'feature:opportunity_scoring',
    },
    'executive': {
        'page:*', 'line:*',
        'action:export_data', 'action:use_ai_chat', 'action:manage_issues',
        'feature:ai_assistant', 'feature:opportunity_scoring',
    },
    'travel_manager': {
        'page:dashboard', 'page:pipeline', 'page:opportunities', 'page:leads',
        'page:customers', 'page:territory_map', 'page:monthly_report',
        'page:travel_analytics', 'page:agent_dashboard',
        'line:Travel',
        'action:upload_targets', 'action:export_data',
        'feature:opportunity_scoring',
    },
    'travel_director': {
        'page:dashboard', 'page:pipeline', 'page:opportunities', 'page:leads',
        'page:customers', 'page:territory_map', 'page:monthly_report',
        'page:travel_analytics', 'page:agent_dashboard',
        'line:Travel',
        'action:upload_targets', 'action:export_data',
        'feature:opportunity_scoring',
    },
    'insurance_manager': {
        'page:dashboard', 'page:pipeline', 'page:opportunities', 'page:leads',
        'page:customers', 'page:territory_map', 'page:monthly_report',
        'page:cross_sell', 'page:agent_dashboard',
        'line:Insurance',
        'action:upload_targets', 'action:export_data',
        'feature:opportunity_scoring',
    },
}

# In-memory cache of DB overrides (refreshed on change)
_cache: dict[str, dict[str, bool]] = {}
_cache_loaded = False


def _load_cache(db: Session) -> None:
    """Load all permission overrides from DB into memory."""
    global _cache, _cache_loaded
    rows = db.query(RolePermission).all()
    _cache = {}
    for r in rows:
        _cache.setdefault(r.role, {})[r.resource] = r.allowed
    _cache_loaded = True


def invalidate_cache() -> None:
    """Call after any permission change to force reload on next check."""
    global _cache_loaded
    _cache_loaded = False


# ── Public API ───────────────────────────────────────────────────────────────

def has_permission(db: Session, user: User, resource: str) -> bool:
    """Check if a user has access to a resource.

    Resolution order:
    1. DB override for exact resource → use it
    2. DB override for wildcard (e.g., 'page:*') → use it
    3. Default permissions for role → use it
    4. Deny
    """
    if not _cache_loaded:
        _load_cache(db)

    role = user.role
    overrides = _cache.get(role, {})

    # Check exact match in DB overrides
    if resource in overrides:
        return overrides[resource]

    # Check wildcard in DB overrides (e.g., 'page:*' covers 'page:pipeline')
    resource_type = resource.split(':')[0] + ':*'
    if resource_type in overrides:
        return overrides[resource_type]

    # Fall back to defaults
    defaults = _DEFAULTS.get(role, set())
    if resource in defaults:
        return True
    if resource_type in defaults:
        return True

    return False


def get_user_permissions(db: Session, user: User) -> list[str]:
    """Get all resources this user can access (for frontend menu/routing)."""
    if not _cache_loaded:
        _load_cache(db)

    role = user.role
    overrides = _cache.get(role, {})
    defaults = _DEFAULTS.get(role, set())

    # Start with defaults, apply overrides
    allowed = set(defaults)
    for resource, is_allowed in overrides.items():
        if is_allowed:
            allowed.add(resource)
        else:
            allowed.discard(resource)

    return sorted(allowed)


def get_role_permissions(db: Session, role: str) -> dict:
    """Get full permission state for a role (for admin UI)."""
    if not _cache_loaded:
        _load_cache(db)

    defaults = _DEFAULTS.get(role, set())
    overrides = _cache.get(role, {})

    return {
        'role': role,
        'defaults': sorted(defaults),
        'overrides': {k: v for k, v in overrides.items()},
        'effective': get_user_permissions(db, type('FakeUser', (), {'role': role})()),
    }


def set_permission(db: Session, *, role: str, resource: str, allowed: bool, updated_by: str) -> RolePermission:
    """Grant or revoke a permission for a role."""
    existing = db.query(RolePermission).filter(
        RolePermission.role == role,
        RolePermission.resource == resource,
    ).first()

    if existing:
        existing.allowed = allowed
        existing.updated_by = updated_by
    else:
        existing = RolePermission(role=role, resource=resource, allowed=allowed, updated_by=updated_by)
        db.add(existing)

    db.commit()
    invalidate_cache()
    log.info(f"Permission {'granted' if allowed else 'revoked'}: {role} → {resource} (by {updated_by})")
    return existing


def delete_permission(db: Session, *, role: str, resource: str) -> bool:
    """Remove a DB override, reverting to default."""
    row = db.query(RolePermission).filter(
        RolePermission.role == role,
        RolePermission.resource == resource,
    ).first()
    if row:
        db.delete(row)
        db.commit()
        invalidate_cache()
        return True
    return False


def list_all_permissions(db: Session) -> list[dict]:
    """List all DB-stored permission overrides."""
    return [r.to_dict() for r in db.query(RolePermission).order_by(RolePermission.role, RolePermission.resource).all()]


def get_all_defaults() -> dict[str, list[str]]:
    """Return the default permission sets for all roles (for admin reference)."""
    return {role: sorted(perms) for role, perms in _DEFAULTS.items()}
