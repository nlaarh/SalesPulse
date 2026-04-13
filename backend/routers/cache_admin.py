"""Admin endpoints for cache observability."""
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

    recent = [r.to_dict() for r in runs]

    return {
        'recent_runs': recent,
        'cache_stats': cache.stats(),
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
