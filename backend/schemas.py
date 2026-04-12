"""Pydantic validation models for the API."""

from typing import Optional
from pydantic import BaseModel, EmailStr

# ── Auth & Users ─────────────────────────────────────────────────────────────

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

class ResetAdminRequest(BaseModel):
    pin: str
    new_password: str

# ── AI Config ────────────────────────────────────────────────────────────────

class AIConfigUpdate(BaseModel):
    provider: str | None = None
    model: str | None = None
    api_key: str | None = None
    base_url: str | None = None

# ── Targets ──────────────────────────────────────────────────────────────────

class AdvisorPreview(BaseModel):
    raw_name: str
    sf_name: str
    branch: str | None = None
    title: str | None = None
    monthly_target: float | None = None
    monthly_targets: dict[str, float] | None = None

class ConfirmRequest(BaseModel):
    filename: str
    line: str = 'Travel'
    year: int = 2026
    advisors: list[AdvisorPreview]

class MonthlyTargetUpdate(BaseModel):
    advisor_target_id: int
    months: dict[str, float]

class MonthlyTargetSaveRequest(BaseModel):
    year: int
    updates: list[MonthlyTargetUpdate]
    base: str = 'commission'
    line: str = 'Travel'

class EstimateRequest(BaseModel):
    year: int
    line: str = 'Travel'
    base_years: list[int]

# ── Emails ───────────────────────────────────────────────────────────────────

class EmailReportRequest(BaseModel):
    to: str
    agent_name: str
    line: str = 'Travel'
    period: int = 12
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class DashboardEmailRequest(BaseModel):
    to: str
    line: str = 'Travel'
    period: int = 12
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class OppEmailRequest(BaseModel):
    to: str

class CustomerEmailRequest(BaseModel):
    to: str
    note: Optional[str] = None
