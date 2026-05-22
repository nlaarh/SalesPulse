"""Targets repository — advisor target CRUD operations."""

from typing import Optional
from sqlalchemy.orm import Session
from data.models import AdvisorTarget, TargetUpload, MonthlyAdvisorTarget


def get_latest_upload(db: Session, line: str) -> Optional[TargetUpload]:
    return db.query(TargetUpload).filter(
        TargetUpload.line == line
    ).order_by(TargetUpload.created_at.desc()).first()


def get_upload_by_id(db: Session, upload_id: int) -> Optional[TargetUpload]:
    return db.query(TargetUpload).filter(TargetUpload.id == upload_id).first()


def list_uploads(db: Session, line: Optional[str] = None) -> list[TargetUpload]:
    q = db.query(TargetUpload)
    if line:
        q = q.filter(TargetUpload.line == line)
    return q.order_by(TargetUpload.created_at.desc()).all()


def create_upload(db: Session, *, filename: str, line: str, uploaded_by_id: int, uploaded_by_email: str, advisor_count: int) -> TargetUpload:
    upload = TargetUpload(
        filename=filename, line=line,
        uploaded_by_id=uploaded_by_id, uploaded_by_email=uploaded_by_email,
        advisor_count=advisor_count,
    )
    db.add(upload)
    db.commit()
    db.refresh(upload)
    return upload


def get_targets_for_upload(db: Session, upload_id: int) -> list[AdvisorTarget]:
    return db.query(AdvisorTarget).filter(AdvisorTarget.upload_id == upload_id).all()


def get_target_by_sf_name(db: Session, upload_id: int, sf_name: str) -> Optional[AdvisorTarget]:
    return db.query(AdvisorTarget).filter(
        AdvisorTarget.upload_id == upload_id,
        AdvisorTarget.sf_name == sf_name,
    ).first()


def bulk_create_targets(db: Session, targets: list[dict]) -> int:
    """Bulk insert advisor targets. Returns count inserted."""
    objects = [AdvisorTarget(**t) for t in targets]
    db.add_all(objects)
    db.commit()
    return len(objects)


def get_monthly_targets(db: Session, advisor_target_id: int, year: Optional[int] = None) -> list[MonthlyAdvisorTarget]:
    q = db.query(MonthlyAdvisorTarget).filter(MonthlyAdvisorTarget.advisor_target_id == advisor_target_id)
    if year:
        q = q.filter(MonthlyAdvisorTarget.year == year)
    return q.order_by(MonthlyAdvisorTarget.year, MonthlyAdvisorTarget.month).all()


def upsert_monthly_target(db: Session, *, advisor_target_id: int, year: int, month: int, target_amount: float, target_bookings: Optional[float] = None, updated_by_email: Optional[str] = None) -> MonthlyAdvisorTarget:
    existing = db.query(MonthlyAdvisorTarget).filter(
        MonthlyAdvisorTarget.advisor_target_id == advisor_target_id,
        MonthlyAdvisorTarget.year == year,
        MonthlyAdvisorTarget.month == month,
    ).first()

    if existing:
        existing.target_amount = target_amount
        if target_bookings is not None:
            existing.target_bookings = target_bookings
        existing.updated_by_email = updated_by_email
    else:
        existing = MonthlyAdvisorTarget(
            advisor_target_id=advisor_target_id,
            year=year, month=month,
            target_amount=target_amount,
            target_bookings=target_bookings,
            updated_by_email=updated_by_email,
        )
        db.add(existing)

    db.commit()
    db.refresh(existing)
    return existing
