"""Admin endpoint for SOQL query profiling — see which queries are slow."""
from datetime import datetime, timedelta
from collections import defaultdict
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from auth import require_admin
from database import get_db
from models import User, SfQueryLog

router = APIRouter()


def _percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * p
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    if f == c:
        return sorted_vals[f]
    return sorted_vals[f] + (k - f) * (sorted_vals[c] - sorted_vals[f])


@router.get('/api/admin/slow-queries')
def slow_queries(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    window_minutes: int = Query(1440, ge=5, le=10080),  # default 24h, max 7 days
    min_duration_ms: int = Query(0, ge=0),
    top_n: int = Query(50, ge=1, le=200),
):
    """Return slowest SOQL query groups within window.

    Groups by normalized query prefix (first 100 chars). Shows count, p50, p95,
    max, total time, and row counts.
    """
    cutoff = datetime.utcnow() - timedelta(minutes=window_minutes)
    rows = (db.query(SfQueryLog)
              .filter(SfQueryLog.created_at >= cutoff)
              .filter(SfQueryLog.duration_ms >= min_duration_ms)
              .all())

    # Group by query prefix
    groups: dict[str, dict] = defaultdict(lambda: {
        'count': 0, 'durations': [], 'rows': [], 'errors': 0, 'query_sample': '',
    })
    for r in rows:
        prefix = (r.query_preview or '')[:100]
        g = groups[prefix]
        g['count'] += 1
        g['durations'].append(r.duration_ms)
        if r.row_count is not None:
            g['rows'].append(r.row_count)
        if r.error:
            g['errors'] += 1
        if not g['query_sample']:
            g['query_sample'] = r.query_preview or ''

    summary = []
    for prefix, g in groups.items():
        durs = sorted(g['durations'])
        summary.append({
            'query_prefix': prefix,
            'query_sample': g['query_sample'],
            'count': g['count'],
            'p50_ms': round(_percentile(durs, 0.50), 0),
            'p95_ms': round(_percentile(durs, 0.95), 0),
            'max_ms': max(durs) if durs else 0,
            'total_ms': sum(durs),
            'avg_rows': round(sum(g['rows']) / len(g['rows'])) if g['rows'] else 0,
            'error_count': g['errors'],
        })
    summary.sort(key=lambda x: x['p95_ms'], reverse=True)

    return {
        'window_minutes': window_minutes,
        'total_queries': len(rows),
        'slow_queries': summary[:top_n],
    }


@router.delete('/api/admin/slow-queries')
def clear_query_log(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Truncate the query log. Useful for fresh profiling runs."""
    count = db.query(SfQueryLog).count()
    db.query(SfQueryLog).delete()
    db.commit()
    return {'ok': True, 'deleted': count}
