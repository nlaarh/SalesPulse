"""Metrics repository — API request metrics, render metrics, cache warm runs, SF query logs."""

from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from data.models import ApiRequestMetric, ClientRenderMetric, CacheWarmRun, SfQueryLog, AIAuditLog


# ── API Request Metrics ──────────────────────────────────────────────────────

def log_api_request(db: Session, *, method: str, path: str, raw_path: Optional[str], status_code: int, duration_ms: float, user_id: Optional[int] = None, user_email: Optional[str] = None) -> None:
    db.add(ApiRequestMetric(
        method=method, path=path, raw_path=raw_path,
        status_code=status_code, duration_ms=duration_ms,
        user_id=user_id, user_email=user_email,
    ))
    db.commit()


def get_api_metrics(db: Session, *, since: Optional[datetime] = None, path: Optional[str] = None, limit: int = 100) -> list[ApiRequestMetric]:
    q = db.query(ApiRequestMetric)
    if since:
        q = q.filter(ApiRequestMetric.created_at >= since)
    if path:
        q = q.filter(ApiRequestMetric.path == path)
    return q.order_by(ApiRequestMetric.created_at.desc()).limit(limit).all()


def get_slow_endpoints(db: Session, *, since: Optional[datetime] = None, min_duration_ms: float = 1000, limit: int = 20):
    q = db.query(
        ApiRequestMetric.path,
        func.avg(ApiRequestMetric.duration_ms).label('avg_ms'),
        func.max(ApiRequestMetric.duration_ms).label('max_ms'),
        func.count(ApiRequestMetric.id).label('count'),
    ).group_by(ApiRequestMetric.path)
    if since:
        q = q.filter(ApiRequestMetric.created_at >= since)
    q = q.having(func.avg(ApiRequestMetric.duration_ms) >= min_duration_ms)
    return q.order_by(func.avg(ApiRequestMetric.duration_ms).desc()).limit(limit).all()


# ── Client Render Metrics ────────────────────────────────────────────────────

def log_render_metric(db: Session, *, page: str, metric: str, duration_ms: float, metadata_json: Optional[str] = None, user_id: Optional[int] = None, user_email: Optional[str] = None) -> None:
    db.add(ClientRenderMetric(
        page=page, metric=metric, duration_ms=duration_ms,
        metadata_json=metadata_json, user_id=user_id, user_email=user_email,
    ))
    db.commit()


# ── Cache Warm Runs ──────────────────────────────────────────────────────────

def create_warm_run(db: Session, *, trigger: str) -> CacheWarmRun:
    run = CacheWarmRun(started_at=datetime.utcnow(), trigger=trigger, status='running')
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def complete_warm_run(db: Session, run: CacheWarmRun, *, status: str, endpoints_total: int, endpoints_success: int, endpoints_failed: int, duration_ms: int, log_json: Optional[str] = None) -> None:
    run.ended_at = datetime.utcnow()
    run.status = status
    run.endpoints_total = endpoints_total
    run.endpoints_success = endpoints_success
    run.endpoints_failed = endpoints_failed
    run.duration_ms = duration_ms
    run.log_json = log_json
    db.commit()


def get_recent_warm_runs(db: Session, limit: int = 10) -> list[CacheWarmRun]:
    return db.query(CacheWarmRun).order_by(CacheWarmRun.started_at.desc()).limit(limit).all()


# ── AI Audit Log ─────────────────────────────────────────────────────────────

def log_ai_query(db: Session, *, user_id: int, user_email: str, query: str, intent: Optional[str] = None, blocked: bool = False, block_reason: Optional[str] = None, block_guard: Optional[str] = None, response_len: Optional[int] = None) -> None:
    db.add(AIAuditLog(
        user_id=user_id, user_email=user_email, query=query,
        intent=intent, blocked=blocked, block_reason=block_reason,
        block_guard=block_guard, response_len=response_len,
    ))
    db.commit()


# ── SF Query Log ─────────────────────────────────────────────────────────────

def log_sf_query(db: Session, *, endpoint: Optional[str] = None, query_preview: Optional[str] = None, duration_ms: int, row_count: Optional[int] = None, bytes: Optional[int] = None, error: Optional[str] = None, from_cache: bool = False) -> None:
    db.add(SfQueryLog(
        endpoint=endpoint, query_preview=query_preview,
        duration_ms=duration_ms, row_count=row_count,
        bytes=bytes, error=error, from_cache=from_cache,
    ))
    db.commit()
