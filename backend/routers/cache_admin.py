"""Admin endpoints for cache observability."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from auth import require_admin, get_current_user
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

    recent = [r.to_dict() for r in runs]

    return {
        'recent_runs': recent,
        'cache_stats': cache.stats(),
    }


@router.post('/api/cache/flush-live')
def flush_live_cache(_user: User = Depends(get_current_user)):
    """Clear in-memory (L1) cache for all business-metric keys.

    Protected keys (census, boundaries, vehicle data) are preserved.
    Disk (L2) cache is also cleared so next request hits Salesforce live.
    Available to any authenticated user — lets the UI offer a refresh button.
    """
    l1, l2 = cache.clear_all(skip_protected=True)
    # Also reload user data so agent lists are fresh
    try:
        from shared import _ensure_users_loaded
        _ensure_users_loaded(force_refresh=True)
    except Exception:
        pass
    return {'ok': True, 'l1_cleared': l1, 'l2_cleared': l2}


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
