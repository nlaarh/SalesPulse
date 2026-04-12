"""User + ActivityLog models for authentication, role-based access, and audit trail."""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, Index
from database import Base

VALID_ROLES = ('superadmin', 'admin', 'officer', 'travel_manager', 'travel_director', 'insurance_manager')

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default='officer')
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'role': self.role,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


VALID_CATEGORIES = ('auth', 'user_mgmt', 'data_access', 'targets')


# ── Advisor Targets ─────────────────────────────────────────────────────────

class TargetUpload(Base):
    __tablename__ = 'target_uploads'

    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String, nullable=False)
    line = Column(String, nullable=False, default='Travel')
    uploaded_by_id = Column(Integer, nullable=False)
    uploaded_by_email = Column(String, nullable=False)
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

    id = Column(Integer, primary_key=True, autoincrement=True)
    upload_id = Column(Integer, nullable=False, index=True)
    raw_name = Column(String, nullable=False)
    sf_name = Column(String, nullable=False, index=True)
    branch = Column(String, nullable=True)
    title = Column(String, nullable=True)
    monthly_target = Column(Float, nullable=True)  # NULL = "No Revenue Targets"
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
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class MonthlyAdvisorTarget(Base):
    __tablename__ = 'monthly_advisor_targets'
    __table_args__ = (
        Index('ix_monthly_target_advisor_year', 'advisor_target_id', 'year'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    advisor_target_id = Column(Integer, nullable=False, index=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)  # 1-12
    target_amount = Column(Float, nullable=False)       # commission target
    target_bookings = Column(Float, nullable=True)      # bookings/revenue target
    updated_by_email = Column(String, nullable=True)
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


# ── Geographic Data (Census) ─────────────────────────────────────────────────

class GeoCounty(Base):
    """NY county boundaries + population from US Census."""
    __tablename__ = 'geo_counties'

    fips = Column(String, primary_key=True)           # 5-digit county FIPS
    name = Column(String, nullable=False, index=True)
    population = Column(Integer, nullable=True)        # total pop
    pop_18plus = Column(Integer, nullable=True)        # 18+ pop
    median_income = Column(Integer, nullable=True)     # median household income $
    median_age = Column(Float, nullable=True)          # median age
    housing_units = Column(Integer, nullable=True)     # total housing units
    median_home_value = Column(Integer, nullable=True) # median home value $
    college_educated = Column(Integer, nullable=True)  # bachelor's+ (25+)
    geojson = Column(String, nullable=True)            # GeoJSON geometry (polygon)


class GeoMeta(Base):
    """Tracks when geo/census data was last refreshed."""
    __tablename__ = 'geo_meta'

    key = Column(String, primary_key=True)
    value = Column(String, nullable=True)


class GeoZip(Base):
    """Zip code → county mapping + demographics + centroid."""
    __tablename__ = 'geo_zips'

    zip_code = Column(String, primary_key=True)
    city = Column(String, nullable=True)
    county_fips = Column(String, nullable=True, index=True)
    county_name = Column(String, nullable=True, index=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    population = Column(Integer, nullable=True)
    pop_18plus = Column(Integer, nullable=True)
    median_income = Column(Integer, nullable=True)     # median household income $
    median_age = Column(Float, nullable=True)          # median age
    housing_units = Column(Integer, nullable=True)     # total housing units
    median_home_value = Column(Integer, nullable=True) # median home value $
    college_educated = Column(Integer, nullable=True)  # bachelor's+ (25+)


class AIAuditLog(Base):
    """Audit trail for AI chat queries."""
    __tablename__ = 'ai_audit_log'
    __table_args__ = (
        Index('ix_ai_audit_user', 'user_id'),
        Index('ix_ai_audit_ts', 'created_at'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False)
    user_email = Column(String, nullable=False)
    query = Column(String, nullable=False)
    intent = Column(String, nullable=True)
    blocked = Column(Boolean, default=False)
    block_reason = Column(String, nullable=True)
    block_guard = Column(String, nullable=True)
    response_len = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ApiRequestMetric(Base):
    """Server-side API request timing samples."""
    __tablename__ = 'api_request_metrics'
    __table_args__ = (
        Index('ix_api_request_metrics_created_at', 'created_at'),
        Index('ix_api_request_metrics_path_created_at', 'path', 'created_at'),
        Index('ix_api_request_metrics_status_created_at', 'status_code', 'created_at'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    method = Column(String, nullable=False)
    path = Column(String, nullable=False, index=True)  # normalized route path when available
    raw_path = Column(String, nullable=True)           # full raw request path
    status_code = Column(Integer, nullable=False, index=True)
    duration_ms = Column(Float, nullable=False)
    user_id = Column(Integer, nullable=True, index=True)
    user_email = Column(String, nullable=True, index=True)
    source = Column(String, nullable=False, default='middleware')
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class ClientRenderMetric(Base):
    """Client-side render timing events reported by frontend."""
    __tablename__ = 'client_render_metrics'
    __table_args__ = (
        Index('ix_client_render_metrics_created_at', 'created_at'),
        Index('ix_client_render_metrics_page_created_at', 'page', 'created_at'),
        Index('ix_client_render_metrics_metric_created_at', 'metric', 'created_at'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    page = Column(String, nullable=False, index=True)
    metric = Column(String, nullable=False, index=True)
    duration_ms = Column(Float, nullable=False)
    metadata_json = Column(String, nullable=True)
    user_id = Column(Integer, nullable=True, index=True)
    user_email = Column(String, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class ActivityLog(Base):
    __tablename__ = 'activity_logs'
    __table_args__ = (
        Index('ix_activity_logs_category', 'category'),
        Index('ix_activity_logs_user_email', 'user_email'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True)
    user_email = Column(String, nullable=True)
    action = Column(String, nullable=False, index=True)
    category = Column(String, nullable=False)
    detail = Column(String, nullable=True)
    metadata_json = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

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
