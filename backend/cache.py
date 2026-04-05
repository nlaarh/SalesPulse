"""Two-tier cache: L1 in-memory + L2 disk (JSON files).

Sales data changes slowly — cache aggressively (hourly L1, daily L2).
"""

import os, time, json, threading, logging, hashlib
from pathlib import Path

log = logging.getLogger('cache')

# ── L1: In-memory ────────────────────────────────────────────────────────────

_store = {}
_lock = threading.Lock()


def get(key: str):
    """Get from L1 memory cache. Returns None if missing or expired."""
    with _lock:
        entry = _store.get(key)
        if entry and time.time() < entry['expires']:
            return entry['data']
    # L1 miss — try L2
    disk_data = disk_get(key)
    if disk_data is not None:
        put(key, disk_data, 3600)  # Promote to L1 for 1h
        return disk_data
    return None


def put(key: str, data, ttl: int = 3600):
    """Store in L1 memory cache with TTL."""
    with _lock:
        _store[key] = {'data': data, 'expires': time.time() + ttl}


def invalidate(key: str):
    """Remove from L1."""
    with _lock:
        _store.pop(key, None)


# ── L2: Disk (JSON) ─────────────────────────────────────────────────────────

_CACHE_DIR = Path(os.path.expanduser('~/.salesinsight/cache'))
_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _disk_path(key: str) -> Path:
    safe = hashlib.md5(key.encode()).hexdigest()
    return _CACHE_DIR / f'{safe}.json'


def disk_get(key: str):
    """Get from L2 disk cache. Returns None if missing or expired."""
    path = _disk_path(key)
    if not path.exists():
        return None
    try:
        with open(path) as f:
            entry = json.load(f)
        if time.time() < entry.get('expires', 0):
            return entry['data']
        path.unlink(missing_ok=True)
    except Exception:
        pass
    return None


def disk_put(key: str, data, ttl: int = 86400):
    """Store in L2 disk cache with TTL."""
    path = _disk_path(key)
    try:
        with open(path, 'w') as f:
            json.dump({'data': data, 'expires': time.time() + ttl}, f, default=str)
    except Exception as e:
        log.warning(f"Disk cache write failed for '{key}': {e}")


def disk_invalidate(key: str):
    """Remove from L2."""
    _disk_path(key).unlink(missing_ok=True)


# ── Convenience ──────────────────────────────────────────────────────────────

def cached_query(key: str, fetch_fn, ttl: int = 3600, disk_ttl: int = 86400):
    """Cache-aside pattern: check L1 → L2 → fetch → store both layers."""
    data = get(key)
    if data is not None:
        return data
    data = fetch_fn()
    if data is not None:
        put(key, data, ttl)
        disk_put(key, data, disk_ttl)
    return data
