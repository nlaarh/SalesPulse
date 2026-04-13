"""Two-tier cache: L1 in-memory + L2 disk (JSON files).

Sales data changes slowly — cache aggressively (hourly L1, daily L2).

Stampede protection: only one thread fetches per key at a time.
Concurrent requests for the same cold key wait on an Event rather than
all firing independent Salesforce queries.
"""

import os, time, json, threading, logging, hashlib
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutTimeout
from pathlib import Path

log = logging.getLogger('cache')

# ── Feature flag + schema version ───────────────────────────────────────────
CACHE_VERSION = 'v1'  # Bump this ONLY when cached JSON shape changes.
ENABLE_V2 = os.getenv('ENABLE_CACHE_V2', 'false').lower() == 'true'

# ── L1: In-memory ────────────────────────────────────────────────────────────

L1_MAX_ENTRIES = 2000  # entries (not bytes) — tuned for 500MB worst-case
_store: OrderedDict = OrderedDict()
_lock = threading.Lock()


def get(key: str):
    """Get from L1 memory cache. Returns None if missing or expired.
    Moves entry to MRU end on access."""
    with _lock:
        entry = _store.get(key)
        if entry and (entry['expires'] is None or time.time() < entry['expires']):
            _store.move_to_end(key)  # LRU touch
            return entry['data']
    # L1 miss — try L2
    disk_data = disk_get(key)
    if disk_data is not None:
        put(key, disk_data, 3600)
        return disk_data
    return None


def put(key: str, data, ttl: int = 3600):
    """Store in L1 memory cache with TTL. Evicts LRU entry if over cap."""
    expires = None if ttl is None or ttl < 0 else time.time() + ttl
    with _lock:
        if key in _store:
            _store.move_to_end(key)
        _store[key] = {'data': data, 'expires': expires}
        # Evict oldest until within cap
        while len(_store) > L1_MAX_ENTRIES:
            _store.popitem(last=False)


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
    """Get from L2 disk cache. Returns None if missing, expired, or wrong version."""
    path = _disk_path(key)
    if not path.exists():
        return None
    try:
        with open(path) as f:
            entry = json.load(f)
        expires = entry.get('expires', 0)
        if expires is not None and time.time() >= expires:
            path.unlink(missing_ok=True)
            return None
        if ENABLE_V2:
            if entry.get('version') != CACHE_VERSION:
                path.unlink(missing_ok=True)
                return None
        return entry['data']
    except Exception:
        pass
    return None


def disk_put(key: str, data, ttl: int = 86400):
    """Store in L2 disk cache with TTL + version stamp. Atomic write."""
    path = _disk_path(key)
    # Use a unique temp file per write to avoid concurrent-write corruption
    # (multiple threads sharing a single .tmp path can clobber each other).
    tmp = path.with_suffix(f'.{threading.get_ident()}.tmp')
    try:
        now = time.time()
        expires = None if ttl is None or ttl < 0 else now + ttl
        entry = {'data': data, 'expires': expires, 'cached_at': now}
        if ENABLE_V2:
            entry['version'] = CACHE_VERSION
        with open(tmp, 'w') as f:
            json.dump(entry, f, default=str)
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


def stats() -> dict:
    """Return current cache stats under proper locking. Safe for admin observability."""
    with _lock:
        l1_entries = len(_store)
    l2_files = list(_CACHE_DIR.glob('*.json'))
    l2_bytes = 0
    oldest_mtime = None
    newest_mtime = None
    for f in l2_files:
        try:
            st = f.stat()
            l2_bytes += st.st_size
            if oldest_mtime is None or st.st_mtime < oldest_mtime:
                oldest_mtime = st.st_mtime
            if newest_mtime is None or st.st_mtime > newest_mtime:
                newest_mtime = st.st_mtime
        except FileNotFoundError:
            # Race: file vanished between glob and stat. Skip it.
            continue
    now = time.time()
    return {
        'l1_entries': l1_entries,
        'l1_max_entries': L1_MAX_ENTRIES,
        'l2_entries': len(l2_files),
        'l2_total_bytes': l2_bytes,
        'l2_oldest_age_seconds': (now - oldest_mtime) if oldest_mtime else None,
        'l2_newest_age_seconds': (now - newest_mtime) if newest_mtime else None,
        'version': CACHE_VERSION,
        'v2_enabled': ENABLE_V2,
    }


# ── Stampede protection ───────────────────────────────────────────────────────
# Per-process dict of in-flight fetches. When a key is being fetched, any
# concurrent requests for the same key block on the Event instead of firing
# duplicate Salesforce calls.

_inflight: dict[str, threading.Event] = {}
_inflight_lock = threading.Lock()

# ── Timeouts ─────────────────────────────────────────────────────────────────
# User-visible timeout: how long a user-facing HTTP request will wait on a
# concurrent fetcher before giving up and either (a) retrying inline or
# (b) returning stale data.
USER_WAIT_TIMEOUT = 25.0  # seconds

# Fetcher timeout: how long the designated fetcher may run before giving up.
# Kept long enough to cover the slowest cold query (leaderboard ~120s).
FETCHER_TIMEOUT = 240.0  # seconds

# v1 compat alias (read by old tests)
_FETCH_TIMEOUT = 45  # kept for v1 compat; v2 uses USER_WAIT_TIMEOUT/FETCHER_TIMEOUT

# ── Circuit Breaker ──────────────────────────────────────────────────────────
# Per-key failure tracking. 3 failures within WINDOW → OPEN state for COOLDOWN.
# While OPEN, cached_query raises CircuitBreakerOpen instead of hammering the source.

class CircuitBreakerOpen(Exception):
    """Raised when circuit breaker is OPEN for a cache key."""


BREAKER_THRESHOLD = 3            # failures to trip
BREAKER_WINDOW = 60.0            # seconds — failures must be within this window
BREAKER_COOLDOWN = 60.0          # seconds to stay OPEN

_breaker_failures: dict[str, list[float]] = {}
_breaker_open_until: dict[str, float] = {}
_breaker_lock = threading.Lock()


def _breaker_is_open(key: str) -> bool:
    with _breaker_lock:
        open_until = _breaker_open_until.get(key, 0.0)
        if open_until and time.time() < open_until:
            return True
        # Clear stale OPEN state
        if open_until:
            _breaker_open_until.pop(key, None)
        return False


def _breaker_record_failure(key: str):
    with _breaker_lock:
        now = time.time()
        failures = _breaker_failures.setdefault(key, [])
        # Prune old failures
        failures[:] = [t for t in failures if now - t < BREAKER_WINDOW]
        failures.append(now)
        if len(failures) >= BREAKER_THRESHOLD:
            _breaker_open_until[key] = now + BREAKER_COOLDOWN
            _breaker_failures[key] = []  # reset count
            log.error(f"Circuit breaker OPEN for '{key}' until {now + BREAKER_COOLDOWN}")


def _breaker_reset(key: str):
    with _breaker_lock:
        _breaker_failures.pop(key, None)
        _breaker_open_until.pop(key, None)


# ── Convenience ──────────────────────────────────────────────────────────────

def cached_query(key: str, fetch_fn, ttl: int = 3600, disk_ttl: int = 86400):
    """Cache-aside with stampede protection, decoupled timeouts, no-silent-null.

    Fast path: return L1/L2 hit immediately.
    Fetcher path: one thread fetches, records result.
    Waiter path: wait up to USER_WAIT_TIMEOUT; if still empty, retry inline once.
    """
    # Fast path
    data = get(key)
    if data is not None:
        return data

    # Circuit breaker: fail-fast if OPEN
    if ENABLE_V2 and _breaker_is_open(key):
        raise CircuitBreakerOpen(f"Circuit breaker OPEN for '{key}'")

    # Pick timeout based on v2 flag
    wait_timeout = USER_WAIT_TIMEOUT if ENABLE_V2 else _FETCH_TIMEOUT

    # Determine role
    with _inflight_lock:
        if key in _inflight:
            event = _inflight[key]
            is_fetcher = False
        else:
            event = threading.Event()
            _inflight[key] = event
            is_fetcher = True

    if not is_fetcher:
        if ENABLE_V2:
            # Waiter: bounded wait
            event.wait(timeout=wait_timeout)
            data = get(key)
            if data is not None:
                return data
            # Fetcher failed, timed out, or returned None.
            # Check if fetcher is still in flight (avoid retry storm)
            with _inflight_lock:
                still_fetching = key in _inflight
            if still_fetching:
                # Wait once more — don't stampede with a fresh fetch
                log.warning(f"Cache waiter for '{key}' still waiting on active fetcher")
                event.wait(timeout=wait_timeout)
                data = get(key)
                if data is not None:
                    return data
                # Still nothing — fetcher must be hung. Raise instead of firing our own.
                raise TimeoutError(f"Cache fetch for '{key}' still pending after {2 * wait_timeout}s")
            # Fetcher is gone — safe to retry inline (one attempt)
            log.warning(f"Cache waiter for '{key}' got no data; retrying inline")
            try:
                result = fetch_fn()
                if result is not None:
                    put(key, result, ttl)
                    disk_put(key, result, disk_ttl)
                    _breaker_reset(key)
                return result
            except Exception as e:
                log.error(f"Inline retry for '{key}' also failed: {e}")
                _breaker_record_failure(key)
                raise
        else:
            # v1 behavior: wait then return (may be None)
            event.wait(timeout=wait_timeout)
            return get(key)

    # Fetcher path
    try:
        if ENABLE_V2:
            # Enforce fetcher timeout — prevent hung queries from blocking forever
            with ThreadPoolExecutor(max_workers=1) as exe:
                fut = exe.submit(fetch_fn)
                try:
                    data = fut.result(timeout=FETCHER_TIMEOUT)
                except FutTimeout:
                    log.error(f"Fetcher timed out after {FETCHER_TIMEOUT}s for '{key}'")
                    # breaker_record_failure handled by outer except block
                    raise TimeoutError(f"Fetch timeout after {FETCHER_TIMEOUT}s for '{key}'")
        else:
            data = fetch_fn()
        if data is not None:
            put(key, data, ttl)
            disk_put(key, data, disk_ttl)
            if ENABLE_V2:
                _breaker_reset(key)  # success clears failure count
        return data
    except Exception as e:
        log.error(f"Fetch failed for '{key}': {e}")
        if ENABLE_V2:
            _breaker_record_failure(key)
        raise
    finally:
        with _inflight_lock:
            _inflight.pop(key, None)
        event.set()
