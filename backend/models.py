"""Models — SHIM that re-exports from data/models.py.

All real model definitions live in data/models.py. This file exists for
backward compatibility so existing `from models import User` imports keep working.
"""

from data.connection import Base  # noqa: F401

from data.models import (  # noqa: F401
    User, VALID_ROLES, VALID_DEPARTMENTS,
    UserSession, SESSION_TTL_HOURS,
    ActivityLog, VALID_CATEGORIES,
    TargetUpload, AdvisorTarget, MonthlyAdvisorTarget,
    GeoCounty, GeoMeta, GeoZip, GeoVehicleRegistration,
    TerritoryZip, TerritoryCounty,
    AIAuditLog, ApiRequestMetric, ClientRenderMetric,
    CacheWarmRun, SfQueryLog,
    RolePermission,
)
