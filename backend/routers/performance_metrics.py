"""Performance metrics ingestion + admin summaries."""

from __future__ import annotations

import math
import json
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import ApiRequestMetric, ClientRenderMetric, User
from auth import get_current_user, require_admin

router = APIRouter()


def _percentile(sorted_vals: list[float], pct: float) -> float:
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return float(sorted_vals[0])
    rank = (len(sorted_vals) - 1) * pct
    lo = math.floor(rank)
    hi = math.ceil(rank)
    if lo == hi:
        return float(sorted_vals[lo])
    return float(sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (rank - lo))


class ClientMetricIn(BaseModel):
    page: str = Field(min_length=1, max_length=120)
    metric: str = Field(min_length=1, max_length=120)
    duration_ms: float = Field(ge=0, le=120_000)
    metadata: dict | None = None


@router.post('/api/perf/client-render')
def ingest_client_render_metric(
    body: ClientMetricIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = ClientRenderMetric(
        page=body.page[:120],
        metric=body.metric[:120],
        duration_ms=round(float(body.duration_ms), 3),
        metadata_json=json.dumps(body.metadata or {}, default=str),
        user_id=user.id,
        user_email=user.email,
    )
    db.add(row)
    db.commit()
    return {'ok': True}


@router.get('/api/admin/performance/summary')
def performance_summary(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    window_minutes: int = Query(60, ge=5, le=24 * 60),
    top_routes: int = Query(10, ge=1, le=50),
    top_pages: int = Query(10, ge=1, le=50),
):
    cutoff = datetime.utcnow() - timedelta(minutes=window_minutes)

    server_rows = db.query(
        ApiRequestMetric.path,
        ApiRequestMetric.duration_ms,
        ApiRequestMetric.status_code,
    ).filter(ApiRequestMetric.created_at >= cutoff).all()

    server_durations = sorted(float(r.duration_ms) for r in server_rows)
    server_avg = (sum(server_durations) / len(server_durations)) if server_durations else 0.0
    server_p50 = _percentile(server_durations, 0.50)
    server_p95 = _percentile(server_durations, 0.95)

    by_route = defaultdict(lambda: {'durations': [], 'errors': 0, 'count': 0})
    for r in server_rows:
        group = by_route[r.path]
        d = float(r.duration_ms)
        group['durations'].append(d)
        group['count'] += 1
        if int(r.status_code) >= 400:
            group['errors'] += 1

    route_items = []
    for path, g in by_route.items():
        vals = sorted(g['durations'])
        cnt = g['count']
        err = g['errors']
        route_items.append({
            'path': path,
            'requests': cnt,
            'avg_ms': round(sum(vals) / cnt, 2) if cnt else 0.0,
            'p50_ms': round(_percentile(vals, 0.50), 2),
            'p95_ms': round(_percentile(vals, 0.95), 2),
            'error_rate_pct': round((err / cnt) * 100, 2) if cnt else 0.0,
        })
    route_items.sort(key=lambda x: x['requests'], reverse=True)

    client_rows = db.query(
        ClientRenderMetric.page,
        ClientRenderMetric.metric,
        ClientRenderMetric.duration_ms,
    ).filter(ClientRenderMetric.created_at >= cutoff).all()

    by_page = defaultdict(list)
    by_page_metric = defaultdict(lambda: defaultdict(list))
    for r in client_rows:
        d = float(r.duration_ms)
        by_page[r.page].append(d)
        by_page_metric[r.page][r.metric].append(d)

    client_items = []
    for page, vals in by_page.items():
        svals = sorted(vals)
        metric_items = []
        for metric, mvals in by_page_metric[page].items():
            ms = sorted(mvals)
            metric_items.append({
                'metric': metric,
                'count': len(ms),
                'avg_ms': round(sum(ms) / len(ms), 2),
                'p50_ms': round(_percentile(ms, 0.50), 2),
                'p95_ms': round(_percentile(ms, 0.95), 2),
            })
        metric_items.sort(key=lambda x: x['count'], reverse=True)
        client_items.append({
            'page': page,
            'events': len(svals),
            'avg_ms': round(sum(svals) / len(svals), 2),
            'p50_ms': round(_percentile(svals, 0.50), 2),
            'p95_ms': round(_percentile(svals, 0.95), 2),
            'metrics': metric_items[:5],
        })
    client_items.sort(key=lambda x: x['events'], reverse=True)

    return {
        'window_minutes': window_minutes,
        'server': {
            'total_requests': len(server_durations),
            'avg_ms': round(server_avg, 2),
            'p50_ms': round(server_p50, 2),
            'p95_ms': round(server_p95, 2),
            'by_route': route_items[:top_routes],
        },
        'client': {
            'total_events': len(client_rows),
            'by_page': client_items[:top_pages],
        },
    }
