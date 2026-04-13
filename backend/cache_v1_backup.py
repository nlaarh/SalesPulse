"""BACKUP of cache.py v1 — kept for rollback if ENABLE_CACHE_V2 breaks prod.
Do not import from this file. See cache.py (v2) for active implementation.

Two-tier cache: L1 in-memory + L2 disk (JSON files).

Sales data changes slowly — cache aggressively (hourly L1, daily L2).

Stampede protection: only one thread fetches per key at a time.
Concurrent requests for the same cold key wait on an Event rather than
all firing independent Salesforce queries.
"""

import os, time, json, threading, logging, hashlib
from pathlib import Path

log = logging.getLogger('cache')

# ── L1: In-memory ────────────────────────────────────────────────────────────

_store: dict = {}
_lock = threading.Lock()


def get(key: str):
    """Get from L1 memory cache. Returns None if missing or expired."""
    with _lock:
        entry = _store.get(key)
        if entry and (entry['expires'] is None or time.time() < entry['expires']):
            return entry['data']
    # L1 miss — try L2 (shared across all workers via filesystem)
    disk_data = disk_get(key)
    if disk_data is not None:
        put(key, disk_data, 3600)  # Promote to L1 for 1h
        return disk_data
    return None


def put(key: str, data, ttl: int = 3600):
    """Store in L1 memory cache with TTL."""
    expires = None if ttl is None or ttl < 0 else time.time() + ttl
    with _lock:
        _store[key] = {'data': data, 'expires': expires}


def invalidate(key: str):
    """Remove from both L1 and L2."""
    with _lock:
        _store.pop(key, None)
    disk_invalidate(key)


# ── L2: Disk (JSON) — shared across all gunicorn workers ─────────────────────

# Azure App Service Linux: /home/ is persistent, /root/ is ephemeral.
_azure_home = Path('/home')
_BASE_DIR = (_azure_home / '.salesinsight') if _azure_home.is_dir() and os.getenv('WEBSITE_SITE_NAME') else Path(os.path.expanduser('~/.salesinsight'))
_CACHE_DIR = _BASE_DIR / 'cache'
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
        expires = entry.get('expires', 0)
        if expires is None or time.time() < expires:
            return entry['data']
        path.unlink(missing_ok=True)
    except Exception:
        pass
    return None


def disk_put(key: str, data, ttl: int = 86400):
    """Store in L2 disk cache with TTL. Atomic write via temp file."""
    path = _disk_path(key)
    tmp = path.with_suffix('.tmp')
    try:
        expires = None if ttl is None or ttl < 0 else time.time() + ttl
        with open(tmp, 'w') as f:
            json.dump({'data': data, 'expires': expires}, f, default=str)
        tmp.replace(path)  # atomic on POSIX
    except Exception as e:
        log.warning(f"Disk cache write failed for '{key}': {e}")
        tmp.unlink(missing_ok=True)


def disk_invalidate(key: str):
    """Remove from L2."""
    _disk_path(key).unlink(missing_ok=True)


def clear_all() -> tuple[int, int]:
    """Clear full L1 + L2 cache. Returns (l1_count, l2_count)."""
    with _lock:
        l1_count = len(_store)
        _store.clear()
    l2_count = 0
    if _CACHE_DIR.exists():
        for f in _CACHE_DIR.glob('*.json'):
            f.unlink(missing_ok=True)
            l2_count += 1
    return l1_count, l2_count


# ── Stampede protection ───────────────────────────────────────────────────────
# Per-process dict of in-flight fetches. When a key is being fetched, any
# concurrent requests for the same key block on the Event instead of firing
# duplicate Salesforce calls.

_inflight: dict[str, threading.Event] = {}
_inflight_lock = threading.Lock()

_FETCH_TIMEOUT = 45  # max seconds to wait for another thread's fetch


# ── Convenience ──────────────────────────────────────────────────────────────

def cached_query(key: str, fetch_fn, ttl: int = 3600, disk_ttl: int = 86400):
    """Cache-aside with stampede protection.

    Only one thread fetches per key at a time. All other concurrent
    requests for the same cold key wait up to _FETCH_TIMEOUT seconds,
    then read the freshly cached result.
    """
    # Fast path — already in L1 or L2
    data = get(key)
    if data is not None:
        return data

    # Determine if we're the fetcher or a waiter
    with _inflight_lock:
        if key in _inflight:
            event = _inflight[key]
            is_fetcher = False
        else:
            event = threading.Event()
            _inflight[key] = event
            is_fetcher = True

    if not is_fetcher:
        # Wait for the designated fetcher to finish, then read from cache
        event.wait(timeout=_FETCH_TIMEOUT)
        return get(key)  # may still be None if fetcher failed

    # We are the designated fetcher
    try:
        data = fetch_fn()
        if data is not None:
            put(key, data, ttl)
            disk_put(key, data, disk_ttl)
        return data
    finally:
        with _inflight_lock:
            _inflight.pop(key, None)
        event.set()  # wake all waiters
