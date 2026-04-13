"""Admin endpoints for cache observability."""
import json
import time
from pathlib import Path
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from auth import require_admin
from database import get_db
from models import User, CacheWarmRun
import cache

router = APIRouter()


@router.get('/api/admin/cache/warm-status')
def warm_status(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
):
    """Recent cache warm runs + current cache stats."""
    runs = (db.query(CacheWarmRun)
              .order_by(CacheWarmRun.started_at.desc())
              .limit(limit)
              .all())

    recent = []
    for r in runs:
        recent.append({
            'id': r.id,
            'started_at': r.started_at.isoformat() if r.started_at else None,
            'ended_at': r.ended_at.isoformat() if r.ended_at else None,
            'trigger': r.trigger,
            'status': r.status,
            'endpoints_total': r.endpoints_total,
            'endpoints_success': r.endpoints_success,
            'endpoints_failed': r.endpoints_failed,
            'duration_ms': r.duration_ms,
            'log': json.loads(r.log_json) if r.log_json else [],
        })

    # Cache stats
    now = time.time()
    l1_size = len(cache._store)
    l2_files = list(cache._CACHE_DIR.glob('*.json'))
    l2_size = len(l2_files)
    l2_bytes = sum(f.stat().st_size for f in l2_files)
    oldest = min((f.stat().st_mtime for f in l2_files), default=None)
    newest = max((f.stat().st_mtime for f in l2_files), default=None)

    return {
        'recent_runs': recent,
        'cache_stats': {
            'l1_entries': l1_size,
            'l1_max_entries': cache.L1_MAX_ENTRIES,
            'l2_entries': l2_size,
            'l2_total_bytes': l2_bytes,
            'l2_oldest_age_seconds': (now - oldest) if oldest else None,
            'l2_newest_age_seconds': (now - newest) if newest else None,
            'version': cache.CACHE_VERSION,
            'v2_enabled': cache.ENABLE_V2,
        },
    }


@router.post('/api/admin/cache/warm-now')
def warm_now(admin: User = Depends(require_admin)):
    """Manually trigger a warm run (requires warmer.py from Team B)."""
    try:
        from warmer import warm_heavy_endpoints
    except ImportError:
        return {'ok': False, 'message': 'Warmer not yet installed — Team B pending'}
    import threading
    threading.Thread(
        target=warm_heavy_endpoints,
        kwargs={'trigger': 'manual'},
        daemon=True,
    ).start()
    return {'ok': True, 'message': 'Warm job started in background'}
