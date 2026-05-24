"""All SQLAlchemy ORM models for SalesPulse.

Every model uses the 'sales' schema in PostgreSQL.
Schema is set dynamically from PG_SCHEMA env var.
"""

import os
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, Index, Text
from data.connection import Base

SCHEMA = os.getenv('PG_SCHEMA', 'sales')
USE_SQLITE = os.getenv('USE_SQLITE', '').strip() in ('1', 'true', 'yes')

# Schema arg: PostgreSQL uses schema, SQLite ignores it
_schema_args = {'schema': SCHEMA} if not USE_SQLITE else {}


def _table_args(*indexes, **kw):
    """Build __table_args__ tuple with optional schema."""
    args = list(indexes)
    meta = dict(_schema_args)
    meta.update(kw)
    args.append(meta)
    return tuple(args)


# ── Auth ─────────────────────────────────────────────────────────────────────

VALID_ROLES = ('superadmin', 'admin', 'executive', 'travel_manager', 'travel_director', 'insurance_manager')
VALID_DEPARTMENTS = ('Travel', 'Insurance', None)  # None = all departments (executive/superadmin/admin)


class User(Base):
    __tablename__ = 'users'
    __table_args__ = _table_args()

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default='executive')
    department = Column(String(50), nullable=True)  # Travel, Insurance, or NULL (all)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'role': self.role,
            'department': self.department,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# ── User Sessions ────────────────────────────────────────────────────────────

# Default session lifetime — matches FSLAPP (10 hours from login).
SESSION_TTL_HOURS = 10


class UserSession(Base):
    """Persistent record of an authenticated session.

    A row is inserted on every successful /api/auth/login (and on every
    /api/admin/users/{id}/impersonate). The JWT carries a `sid` claim that
    points to this row's `token`. Used to:
      - List who is currently online (Admin → Sessions UI)
      - Invalidate a user's sessions on password reset
      - Track "logged in as X by admin Y" during impersonation
    """
    __tablename__ = 'user_sessions'
    __table_args__ = _table_args(
        Index('ix_user_sessions_user_id', 'user_id'),
        Index('ix_user_sessions_last_seen', 'last_seen'),
        Index('ix_user_sessions_active', 'logout_time', 'expires_at'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    token = Column(String(64), nullable=False, unique=True, index=True)
    user_id = Column(Integer, nullable=False)
    name = Column(String(255), nullable=False, default='')  # denormalized for fast listing
    role = Column(String(50), nullable=False, default='')
    login_time = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_seen = Column(DateTime, nullable=False, default=datetime.utcnow)
    logout_time = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    ip_address = Column(String(64), nullable=True)
    # When set, this session was created via /impersonate by user `impersonator_user_id`.
    # The frontend reads this back via /api/admin/sessions to label sessions.
    impersonator_user_id = Column(Integer, nullable=True)


# ── Activity Logs ────────────────────────────────────────────────────────────

VALID_CATEGORIES = ('auth', 'user_mgmt', 'data_access', 'targets', 'impersonate')


class ActivityLog(Base):
    __tablename__ = 'activity_logs'
    __table_args__ = _table_args(
        Index('ix_activity_logs_category', 'category'),
        Index('ix_activity_logs_user_email', 'user_email'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True)
    user_email = Column(String(255), nullable=True)
    action = Column(String(128), nullable=False, index=True)
    category = Column(String(64), nullable=False)
    detail = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    ip_address = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'user_email': self.user_email,
            'action': self.action,
            'category': self.category,
            'detail': self.detail,
            'metadata_json': self.metadata_json,
            'ip_address': self.ip_address,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# ── Advisor Targets ──────────────────────────────────────────────────────────

class TargetUpload(Base):
    __tablename__ = 'target_uploads'
    __table_args__ = _table_args()

    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String(512), nullable=False)
    line = Column(String(50), nullable=False, default='Travel')
    uploaded_by_id = Column(Integer, nullable=False)
    uploaded_by_email = Column(String(255), nullable=False)
    advisor_count = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'filename': self.filename,
            'line': self.line,
            'uploaded_by_id': self.uploaded_by_id,
            'uploaded_by_email': self.uploaded_by_email,
            'advisor_count': self.advisor_count,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class AdvisorTarget(Base):
    __tablename__ = 'advisor_targets'
    __table_args__ = _table_args()

    id = Column(Integer, primary_key=True, autoincrement=True)
    upload_id = Column(Integer, nullable=False, index=True)
    raw_name = Column(String(255), nullable=False)
    sf_name = Column(String(255), nullable=False, index=True)
    branch = Column(String(128), nullable=True)
    title = Column(String(128), nullable=True)
    monthly_target = Column(Float, nullable=True)
    annual_stretch = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'upload_id': self.upload_id,
            'raw_name': self.raw_name,
            'sf_name': self.sf_name,
            'branch': self.branch,
            'title': self.title,
            'monthly_target': self.monthly_target,
            'annual_stretch': self.annual_stretch,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class MonthlyAdvisorTarget(Base):
    __tablename__ = 'monthly_advisor_targets'
    __table_args__ = _table_args(
        Index('ix_monthly_target_advisor_year', 'advisor_target_id', 'year'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    advisor_target_id = Column(Integer, nullable=False, index=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    target_amount = Column(Float, nullable=False)
    target_bookings = Column(Float, nullable=True)
    updated_by_email = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'advisor_target_id': self.advisor_target_id,
            'year': self.year,
            'month': self.month,
            'target_amount': self.target_amount,
            'target_bookings': self.target_bookings,
            'updated_by_email': self.updated_by_email,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


# ── Geographic Data ──────────────────────────────────────────────────────────

class GeoCounty(Base):
    __tablename__ = 'geo_counties'
    __table_args__ = _table_args()

    fips = Column(String(10), primary_key=True)
    name = Column(String(128), nullable=False, index=True)
    population = Column(Integer, nullable=True)
    pop_18plus = Column(Integer, nullable=True)
    median_income = Column(Integer, nullable=True)
    median_age = Column(Float, nullable=True)
    housing_units = Column(Integer, nullable=True)
    median_home_value = Column(Integer, nullable=True)
    college_educated = Column(Integer, nullable=True)
    geojson = Column(Text, nullable=True)


class GeoMeta(Base):
    __tablename__ = 'geo_meta'
    __table_args__ = _table_args()

    key = Column(String(128), primary_key=True)
    value = Column(Text, nullable=True)


class GeoZip(Base):
    __tablename__ = 'geo_zips'
    __table_args__ = _table_args()

    zip_code = Column(String(10), primary_key=True)
    city = Column(String(128), nullable=True)
    county_fips = Column(String(10), nullable=True, index=True)
    county_name = Column(String(128), nullable=True, index=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    population = Column(Integer, nullable=True)
    pop_18plus = Column(Integer, nullable=True)
    median_income = Column(Integer, nullable=True)
    median_age = Column(Float, nullable=True)
    housing_units = Column(Integer, nullable=True)
    median_home_value = Column(Integer, nullable=True)
    college_educated = Column(Integer, nullable=True)


class GeoVehicleRegistration(Base):
    __tablename__ = 'geo_vehicles'
    __table_args__ = _table_args(
        Index('ix_geo_vehicles_zip', 'zip_code'),
        Index('ix_geo_vehicles_county', 'county_name'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    zip_code = Column(String(10), nullable=True, index=True)
    county_name = Column(String(128), nullable=False, index=True)
    model_year = Column(String(10), nullable=True)
    make = Column(String(64), nullable=True)
    fuel_type = Column(String(32), nullable=True)
    vehicle_count = Column(Integer, default=0)


class TerritoryZip(Base):
    __tablename__ = 'territory_zips'
    __table_args__ = _table_args()

    zip_code = Column(String(5), primary_key=True)
    city = Column(String(128), nullable=True)
    county = Column(String(128), nullable=True, index=True)
    coverage = Column(String(16), nullable=False)
    region = Column(String(64), nullable=True)


class TerritoryCounty(Base):
    __tablename__ = 'territory_counties'
    __table_args__ = _table_args()

    county = Column(String(128), primary_key=True)
    service_type = Column(String(16), nullable=False)


# ── Observability ────────────────────────────────────────────────────────────

class AIAuditLog(Base):
    __tablename__ = 'ai_audit_log'
    __table_args__ = _table_args(
        Index('ix_ai_audit_user', 'user_id'),
        Index('ix_ai_audit_ts', 'created_at'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False)
    user_email = Column(String(255), nullable=False)
    query = Column(Text, nullable=False)
    intent = Column(String(128), nullable=True)
    blocked = Column(Boolean, default=False)
    block_reason = Column(String(255), nullable=True)
    block_guard = Column(String(128), nullable=True)
    response_len = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ApiRequestMetric(Base):
    __tablename__ = 'api_request_metrics'
    __table_args__ = _table_args(
        Index('ix_api_request_metrics_created_at', 'created_at'),
        Index('ix_api_request_metrics_path_created_at', 'path', 'created_at'),
        Index('ix_api_request_metrics_status_created_at', 'status_code', 'created_at'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    method = Column(String(16), nullable=False)
    path = Column(String(512), nullable=False, index=True)
    raw_path = Column(String(1024), nullable=True)
    status_code = Column(Integer, nullable=False, index=True)
    duration_ms = Column(Float, nullable=False)
    user_id = Column(Integer, nullable=True, index=True)
    user_email = Column(String(255), nullable=True, index=True)
    source = Column(String(32), nullable=False, default='middleware')
    created_at = Column(DateTime, default=datetime.utcnow)


class ClientRenderMetric(Base):
    __tablename__ = 'client_render_metrics'
    __table_args__ = _table_args(
        Index('ix_client_render_metrics_created_at', 'created_at'),
        Index('ix_client_render_metrics_page_created_at', 'page', 'created_at'),
        Index('ix_client_render_metrics_metric_created_at', 'metric', 'created_at'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    page = Column(String(128), nullable=False, index=True)
    metric = Column(String(128), nullable=False, index=True)
    duration_ms = Column(Float, nullable=False)
    metadata_json = Column(Text, nullable=True)
    user_id = Column(Integer, nullable=True, index=True)
    user_email = Column(String(255), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class CacheWarmRun(Base):
    __tablename__ = 'cache_warm_runs'
    __table_args__ = _table_args()

    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at = Column(DateTime, nullable=False, index=True)
    ended_at = Column(DateTime, nullable=True)
    trigger = Column(String(32), nullable=False)
    status = Column(String(32), nullable=False)
    endpoints_total = Column(Integer, default=0)
    endpoints_success = Column(Integer, default=0)
    endpoints_failed = Column(Integer, default=0)
    duration_ms = Column(Integer, nullable=True)
    log_json = Column(Text, nullable=True)

    def to_dict(self) -> dict:
        import json as _json
        try:
            log_data = _json.loads(self.log_json) if self.log_json else []
        except (_json.JSONDecodeError, TypeError):
            log_data = []
        return {
            'id': self.id,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'ended_at': self.ended_at.isoformat() if self.ended_at else None,
            'trigger': self.trigger,
            'status': self.status,
            'endpoints_total': self.endpoints_total,
            'endpoints_success': self.endpoints_success,
            'endpoints_failed': self.endpoints_failed,
            'duration_ms': self.duration_ms,
            'log': log_data,
        }


class SfQueryLog(Base):
    __tablename__ = 'sf_query_log'
    __table_args__ = _table_args()

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    endpoint = Column(String(128), nullable=True, index=True)
    query_preview = Column(String(500), nullable=True)
    duration_ms = Column(Integer, nullable=False)
    row_count = Column(Integer, nullable=True)
    bytes = Column(Integer, nullable=True)
    error = Column(String(500), nullable=True)
    from_cache = Column(Boolean, default=False)


# ── Role-Based Access Control (Dynamic) ──────────────────────────────────────

class RolePermission(Base):
    """Dynamic permission assignments per role.

    resource: what is being accessed (page, feature, action)
        - Pages: 'page:dashboard', 'page:pipeline', 'page:territory_map', etc.
        - Lines: 'line:Travel', 'line:Insurance'
        - Actions: 'action:manage_users', 'action:upload_targets', 'action:use_ai_chat',
                   'action:view_cache', 'action:export_data', 'action:manage_issues'
        - Features: 'feature:ai_assistant', 'feature:opportunity_scoring'

    Admin can grant/revoke any permission via the UI.
    """
    __tablename__ = 'role_permissions'
    __table_args__ = _table_args(
        Index('ix_role_permissions_role', 'role'),
        Index('ix_role_permissions_resource', 'resource'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    role = Column(String(50), nullable=False)
    resource = Column(String(128), nullable=False)  # e.g., 'page:pipeline', 'line:Travel'
    allowed = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_by = Column(String(255), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'role': self.role,
            'resource': self.resource,
            'allowed': self.allowed,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_by': self.updated_by,
        }


# ── Ensure all models are registered ─────────────────────────────────────────

def register_all_models():
    """Called during create_all to ensure all models are imported."""
    pass  # Just importing this module registers them with Base.metadata
