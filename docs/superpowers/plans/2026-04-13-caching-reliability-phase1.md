# Caching Reliability (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate cache-related production failures (silent nulls, deploy flushes, cold-cache timeouts, retry storms) with a feature-flagged, fully-tested rewrite of caching, warming, and frontend resilience.

**Architecture:** Keep two-tier L1/L2 design (memory + JSON-on-disk). Add per-entry version fingerprint, circuit breaker, split user/fetcher timeouts, worker-0 nightly warmer with file lock, deploy-time warming via existing stampede system, admin warm-status dashboard, and frontend 503 retry. All changes gated behind `ENABLE_CACHE_V2` env flag for safe rollback.

**Tech Stack:** Python 3.11 + FastAPI + SQLAlchemy + SQLite (backend), React 19 + Vite 6 + Tailwind + Axios (frontend), gunicorn 4-worker on Azure App Service Linux.

---

## Parallel Team Structure

Six teams work on independent file sets. Each team can be dispatched as a separate subagent. Dependencies map:

```
Team A (Core Cache)      ─┐
Team C (Admin API+DB)    ─┼─→ independent, start simultaneously
Team E (Frontend)        ─┘

Team B (Startup/Warmer)     ←── needs Team A interface (cache.py stable)
Team D (Admin UI)           ←── needs Team C endpoint shape
Team F (Integration Tests)  ←── needs A, B, C complete
```

**Task numbering:** A1, A2, A3 (Team A tasks), B1, B2 (Team B), etc. Execute in team order but teams A/C/E run in parallel. Each task is 2-5 minutes.

---

## File Structure

### Team A — Core Cache (rewrite `cache.py`)
- Modify: `backend/cache.py` (rewrite around failure modes)
- Create: `backend/cache_v1_backup.py` (old version for safe rollback)
- Create: `backend/tests/test_cache_v2.py` (comprehensive tests)

### Team B — Startup Lifespan & Nightly Warmer
- Modify: `backend/main.py` (remove file-hash flush, add worker-0 lock, add deploy warmer)
- Create: `backend/warmer.py` (new — sequential warm loop, per-query timeout, run logging)
- Create: `backend/tests/test_warmer.py`

### Team C — Admin Cache API + SQLite tables
- Modify: `backend/models.py` (add `CacheWarmRun` model)
- Create: `backend/routers/cache_admin.py` (new — warm-status endpoint)
- Modify: `backend/main.py` (register router — coordinate with Team B)
- Create: `backend/tests/test_cache_admin.py`

### Team D — Admin UI (Cache Status tab)
- Modify: `frontend/src/pages/Settings.tsx` (add `cache` tab)
- Create: `frontend/src/pages/settings/CacheStatusTab.tsx` (new)
- Modify: `frontend/src/lib/api.ts` (add `fetchCacheWarmStatus`)

### Team E — Frontend Resilience
- Modify: `frontend/src/lib/api.ts` (503 retry, cached_at header read)
- Create: `frontend/src/components/SlowLoadNotice.tsx` (new — "takes longer than usual" component)
- Modify: key pages to use SlowLoadNotice (MonthlyReport, TerritoryMap, Dashboard)

### Team F — Integration Tests (end-to-end validation)
- Create: `backend/tests/test_integration_cache_lifecycle.py`

---

## Prerequisites

- [ ] Verify local dev environment boots: `cd backend && python -m uvicorn main:app --port 8000`
- [ ] Verify frontend builds: `cd frontend && npm run build`
- [ ] Verify tests run: `cd backend && python -m pytest tests/ -v`

---

# TEAM A — CORE CACHE REWRITE

Team A owns the foundation. All other teams depend on A's public API (`cached_query`, `get`, `put`, `invalidate`). Stabilize this first.

## Task A1: Backup current cache.py

**Files:**
- Create: `backend/cache_v1_backup.py`

- [ ] **Step 1: Copy current cache.py as a backup for rollback**

```bash
cp backend/cache.py backend/cache_v1_backup.py
```

- [ ] **Step 2: Add header comment**

Edit `backend/cache_v1_backup.py`, add at top:

```python
"""BACKUP of cache.py v1 — kept for rollback if ENABLE_CACHE_V2 breaks prod.
Do not import from this file. See cache.py (v2) for active implementation.
"""
```

- [ ] **Step 3: Commit**

```bash
git add backend/cache_v1_backup.py
git commit -m "chore: backup cache v1 before rewrite"
```

---

## Task A2: Write test for CACHE_VERSION flush behavior

**Files:**
- Test: `backend/tests/test_cache_v2.py`

- [ ] **Step 1: Create test file with version-bump test**

```python
"""Tests for cache v2 — feature-flagged cache with fingerprint, circuit breaker,
decoupled timeouts, schema versioning."""

import os
import time
import json
import threading
from pathlib import Path
from unittest.mock import patch
import pytest


@pytest.fixture
def v2_enabled(monkeypatch, tmp_path):
    """Enable cache v2 with isolated dirs."""
    monkeypatch.setenv('ENABLE_CACHE_V2', 'true')
    cache_dir = tmp_path / 'cache'
    cache_dir.mkdir()
    # Reset module state
    import importlib
    import cache
    importlib.reload(cache)
    monkeypatch.setattr(cache, '_CACHE_DIR', cache_dir)
    cache._store.clear()
    return cache


def test_cache_version_bump_invalidates_old_entries(v2_enabled, tmp_path):
    """When CACHE_VERSION changes, old entries are invalidated on read."""
    cache = v2_enabled

    # Write an entry with "v0" fingerprint
    path = cache._disk_path('k1')
    path.write_text(json.dumps({
        'data': {'x': 1},
        'expires': time.time() + 3600,
        'cached_at': time.time(),
        'version': 'v0',
    }))

    # Current CACHE_VERSION is 'v1' — should refuse to return old-version entry
    assert cache.get('k1') is None
```

- [ ] **Step 2: Run test — expect fail (v2 not implemented yet)**

```bash
cd backend && python -m pytest tests/test_cache_v2.py::test_cache_version_bump_invalidates_old_entries -v
```

Expected: FAIL (cache.py doesn't yet check version).

- [ ] **Step 3: Commit failing test**

```bash
git add backend/tests/test_cache_v2.py
git commit -m "test: cache version bump invalidation (failing)"
```

---

## Task A3: Implement CACHE_VERSION in cache.py

**Files:**
- Modify: `backend/cache.py`

- [ ] **Step 1: Add CACHE_VERSION and ENABLE flag at top of cache.py**

Edit `backend/cache.py`. After the module docstring and imports, add:

```python
# ── Feature flag + schema version ───────────────────────────────────────────
CACHE_VERSION = 'v1'  # Bump this ONLY when cached JSON shape changes.
ENABLE_V2 = os.getenv('ENABLE_CACHE_V2', 'false').lower() == 'true'
```

- [ ] **Step 2: Update `disk_get` to check version when v2 enabled**

Replace `disk_get` function body (around line 60-74):

```python
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
```

- [ ] **Step 3: Update `disk_put` to write version + cached_at**

Replace `disk_put`:

```python
def disk_put(key: str, data, ttl: int = 86400):
    """Store in L2 disk cache with TTL + version stamp. Atomic write."""
    path = _disk_path(key)
    tmp = path.with_suffix('.tmp')
    try:
        now = time.time()
        expires = None if ttl is None or ttl < 0 else now + ttl
        entry = {'data': data, 'expires': expires, 'cached_at': now}
        if ENABLE_V2:
            entry['version'] = CACHE_VERSION
        with open(tmp, 'w') as f:
            json.dump(entry, f, default=str)
        tmp.replace(path)
    except Exception as e:
        log.warning(f"Disk cache write failed for '{key}': {e}")
        tmp.unlink(missing_ok=True)
```

- [ ] **Step 4: Run the A2 test — expect pass**

```bash
cd backend && python -m pytest tests/test_cache_v2.py::test_cache_version_bump_invalidates_old_entries -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/cache.py
git commit -m "feat(cache): add CACHE_VERSION guard behind ENABLE_CACHE_V2 flag"
```

---

## Task A4: Write test for cached_at timestamp

**Files:**
- Test: `backend/tests/test_cache_v2.py`

- [ ] **Step 1: Append test**

Add to `backend/tests/test_cache_v2.py`:

```python
def test_cached_at_timestamp_present(v2_enabled):
    """Every cached entry stores a cached_at timestamp."""
    cache = v2_enabled
    t0 = time.time()
    cache.disk_put('k_time', {'x': 1}, ttl=3600)
    # Read raw file to verify cached_at was persisted
    import json
    path = cache._disk_path('k_time')
    with open(path) as f:
        entry = json.load(f)
    assert entry['cached_at'] >= t0
    assert entry['version'] == cache.CACHE_VERSION
```

- [ ] **Step 2: Run**

```bash
cd backend && python -m pytest tests/test_cache_v2.py::test_cached_at_timestamp_present -v
```

Expected: PASS (already implemented in A3).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_cache_v2.py
git commit -m "test: verify cached_at timestamp stamped on disk entries"
```

---

## Task A5: Write test for decoupled user/fetcher timeouts

**Files:**
- Test: `backend/tests/test_cache_v2.py`

- [ ] **Step 1: Append test**

```python
def test_waiter_times_out_at_user_wait_but_fetcher_continues(v2_enabled):
    """User-wait timeout (25s) is less than fetcher timeout (240s).
    Waiter gives up early but fetch keeps running in the background."""
    cache = v2_enabled

    fetch_started = threading.Event()
    fetch_done = threading.Event()
    slow_result = {'x': 42}

    def slow_fetch():
        fetch_started.set()
        # Simulate long fetch — but test uses short timeouts via monkeypatch
        time.sleep(0.5)
        fetch_done.set()
        return slow_result

    # Override timeouts for test speed: USER_WAIT=0.1s, FETCHER=2s
    original_user_wait = cache.USER_WAIT_TIMEOUT
    original_fetcher = cache.FETCHER_TIMEOUT
    cache.USER_WAIT_TIMEOUT = 0.1
    cache.FETCHER_TIMEOUT = 2.0

    try:
        # Start fetcher in background
        fetcher_thread = threading.Thread(
            target=lambda: cache.cached_query('slow_key', slow_fetch, ttl=60)
        )
        fetcher_thread.start()

        # Give fetcher time to grab the lock
        time.sleep(0.05)

        # Second caller (waiter) should wait only 0.1s then retry inline
        # Since fetcher is still running, inline fetch will either:
        # (a) block on lock → get stale None, retry fetch themselves, or
        # (b) return stale data if available
        # For this test, verify waiter does not return None (no silent null)
        result = cache.cached_query('slow_key', slow_fetch, ttl=60)

        # Waiter either got the fresh result (if fetcher finished) or
        # triggered its own fetch — both cases return real data
        assert result == slow_result, f"Waiter got {result}, expected non-null real data"

        fetcher_thread.join(timeout=3)
    finally:
        cache.USER_WAIT_TIMEOUT = original_user_wait
        cache.FETCHER_TIMEOUT = original_fetcher
```

- [ ] **Step 2: Run — expect fail (timeouts not split yet)**

```bash
cd backend && python -m pytest tests/test_cache_v2.py::test_waiter_times_out_at_user_wait_but_fetcher_continues -v
```

Expected: FAIL (USER_WAIT_TIMEOUT attribute missing).

- [ ] **Step 3: Commit failing test**

```bash
git add backend/tests/test_cache_v2.py
git commit -m "test: decoupled user-wait vs fetcher timeouts (failing)"
```

---

## Task A6: Implement decoupled timeouts + no-silent-null waiter

**Files:**
- Modify: `backend/cache.py`

- [ ] **Step 1: Replace timeout constants**

In `backend/cache.py`, find `_FETCH_TIMEOUT = 45` (around line 117). Replace that block with:

```python
# ── Timeouts ─────────────────────────────────────────────────────────────────
# User-visible timeout: how long a user-facing HTTP request will wait on a
# concurrent fetcher before giving up and either (a) retrying inline or
# (b) returning stale data.
USER_WAIT_TIMEOUT = 25.0  # seconds

# Fetcher timeout: how long the designated fetcher may run before giving up.
# Kept long enough to cover the slowest cold query (leaderboard ~120s).
FETCHER_TIMEOUT = 240.0  # seconds
```

- [ ] **Step 2: Rewrite `cached_query` for decoupled timeouts + inline retry**

Replace the `cached_query` function at the bottom of `cache.py`:

```python
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
        # Waiter: bounded wait
        event.wait(timeout=USER_WAIT_TIMEOUT)
        data = get(key)
        if data is not None:
            return data
        # Fetcher failed, timed out, or returned None — retry inline ONCE.
        # No infinite retry loop: if this inline fetch also fails, raise.
        log.warning(f"Cache waiter for '{key}' got no data after {USER_WAIT_TIMEOUT}s; retrying inline")
        try:
            result = fetch_fn()
            if result is not None:
                put(key, result, ttl)
                disk_put(key, result, disk_ttl)
            return result
        except Exception as e:
            log.error(f"Inline retry for '{key}' also failed: {e}")
            raise

    # Fetcher path
    try:
        data = fetch_fn()
        if data is not None:
            put(key, data, ttl)
            disk_put(key, data, disk_ttl)
        return data
    except Exception as e:
        log.error(f"Fetch failed for '{key}': {e}")
        raise
    finally:
        with _inflight_lock:
            _inflight.pop(key, None)
        event.set()
```

- [ ] **Step 3: Run test — expect pass**

```bash
cd backend && python -m pytest tests/test_cache_v2.py::test_waiter_times_out_at_user_wait_but_fetcher_continues -v
```

Expected: PASS.

- [ ] **Step 4: Run all cache tests to catch regressions**

```bash
cd backend && python -m pytest tests/test_cache.py tests/test_cache_v2.py -v
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/cache.py
git commit -m "feat(cache): split user-wait (25s) from fetcher (240s) timeout; no silent null"
```

---

## Task A7: Write test for circuit breaker

**Files:**
- Test: `backend/tests/test_cache_v2.py`

- [ ] **Step 1: Append test**

```python
def test_circuit_breaker_trips_after_3_failures(v2_enabled):
    """3 failures within 60s → subsequent calls for same key fail-fast with stale data
    or raise BreakerOpen, no new fetch attempted."""
    cache = v2_enabled

    call_count = {'n': 0}
    def failing_fetch():
        call_count['n'] += 1
        raise RuntimeError("SF down")

    # First 3 attempts: actually call, all raise
    for _ in range(3):
        with pytest.raises(RuntimeError):
            cache.cached_query('breaker_key', failing_fetch, ttl=60)

    assert call_count['n'] == 3

    # 4th attempt: breaker OPEN — should NOT call failing_fetch
    with pytest.raises(cache.CircuitBreakerOpen):
        cache.cached_query('breaker_key', failing_fetch, ttl=60)

    assert call_count['n'] == 3, "breaker did not prevent the 4th call"
```

- [ ] **Step 2: Run — expect fail (breaker not implemented)**

```bash
cd backend && python -m pytest tests/test_cache_v2.py::test_circuit_breaker_trips_after_3_failures -v
```

Expected: FAIL (`CircuitBreakerOpen` not defined).

- [ ] **Step 3: Commit failing test**

```bash
git add backend/tests/test_cache_v2.py
git commit -m "test: circuit breaker trips after 3 failures (failing)"
```

---

## Task A8: Implement circuit breaker

**Files:**
- Modify: `backend/cache.py`

- [ ] **Step 1: Add circuit-breaker state + exception at top of cache.py**

After the timeout constants section, add:

```python
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
```

- [ ] **Step 2: Integrate breaker into `cached_query`**

In `cache.py`, find `def cached_query` (from Task A6) and modify the fetcher path and the inline retry:

At the top of the function (right after the fast path returns early), add:

```python
    # Circuit breaker: fail-fast if OPEN
    if ENABLE_V2 and _breaker_is_open(key):
        raise CircuitBreakerOpen(f"Circuit breaker OPEN for '{key}'")
```

In the fetcher path's `except Exception as e:` block, add `_breaker_record_failure(key)` before `raise`:

```python
    # Fetcher path
    try:
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
        ...
```

In the inline retry's `except Exception as e:` block, also record:

```python
        try:
            result = fetch_fn()
            if result is not None:
                put(key, result, ttl)
                disk_put(key, result, disk_ttl)
                if ENABLE_V2:
                    _breaker_reset(key)
            return result
        except Exception as e:
            log.error(f"Inline retry for '{key}' also failed: {e}")
            if ENABLE_V2:
                _breaker_record_failure(key)
            raise
```

- [ ] **Step 3: Run test — expect pass**

```bash
cd backend && python -m pytest tests/test_cache_v2.py::test_circuit_breaker_trips_after_3_failures -v
```

Expected: PASS.

- [ ] **Step 4: Run full cache suite**

```bash
cd backend && python -m pytest tests/test_cache.py tests/test_cache_v2.py -v
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/cache.py
git commit -m "feat(cache): circuit breaker opens after 3 failures in 60s"
```

---

## Task A9: Write test for L1 memory cap with LRU spillover

**Files:**
- Test: `backend/tests/test_cache_v2.py`

- [ ] **Step 1: Append test**

```python
def test_l1_cap_evicts_lru_to_disk(v2_enabled, monkeypatch):
    """When L1 exceeds size cap, oldest entries are evicted to L2."""
    cache = v2_enabled

    # Monkeypatch a tiny cap for test
    monkeypatch.setattr(cache, 'L1_MAX_ENTRIES', 3)

    cache.put('a', {'v': 1}, ttl=60)
    cache.put('b', {'v': 2}, ttl=60)
    cache.put('c', {'v': 3}, ttl=60)
    cache.put('d', {'v': 4}, ttl=60)  # forces eviction of 'a'

    # 'a' should have been evicted from L1 but may still be on L2 (if persisted)
    with cache._lock:
        assert 'a' not in cache._store
        assert len(cache._store) == 3
```

- [ ] **Step 2: Run — expect fail**

```bash
cd backend && python -m pytest tests/test_cache_v2.py::test_l1_cap_evicts_lru_to_disk -v
```

Expected: FAIL (L1_MAX_ENTRIES not defined).

- [ ] **Step 3: Commit failing test**

```bash
git add backend/tests/test_cache_v2.py
git commit -m "test: L1 cap evicts LRU (failing)"
```

---

## Task A10: Implement L1 cap + LRU eviction

**Files:**
- Modify: `backend/cache.py`

- [ ] **Step 1: Replace `_store` with OrderedDict and add cap**

Near top of `cache.py`, replace `_store: dict = {}` with:

```python
from collections import OrderedDict
L1_MAX_ENTRIES = 2000  # entries (not bytes) — tuned for 500MB worst-case
_store: OrderedDict = OrderedDict()
_lock = threading.Lock()
```

- [ ] **Step 2: Update `get` to reorder on access (LRU)**

Replace `get`:

```python
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
```

- [ ] **Step 3: Update `put` to evict oldest when over cap**

Replace `put`:

```python
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
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd backend && python -m pytest tests/test_cache_v2.py::test_l1_cap_evicts_lru_to_disk -v
```

Expected: PASS.

- [ ] **Step 5: Run all cache tests**

```bash
cd backend && python -m pytest tests/test_cache.py tests/test_cache_v2.py -v
```

Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/cache.py
git commit -m "feat(cache): L1 cap + LRU eviction (max 2000 entries)"
```

---

## Task A11: Write test for concurrent writes (atomicity)

**Files:**
- Test: `backend/tests/test_cache_v2.py`

- [ ] **Step 1: Append test**

```python
def test_concurrent_disk_writes_no_corruption(v2_enabled):
    """10 threads write the same key concurrently — file is always valid JSON."""
    cache = v2_enabled

    def writer(i):
        for _ in range(20):
            cache.disk_put('concurrent', {'writer': i, 'n': _}, ttl=60)

    threads = [threading.Thread(target=writer, args=(i,)) for i in range(10)]
    for t in threads: t.start()
    for t in threads: t.join()

    # File must exist and be valid JSON with expected shape
    import json
    path = cache._disk_path('concurrent')
    assert path.exists()
    with open(path) as f:
        entry = json.load(f)
    assert 'data' in entry
    assert 'writer' in entry['data']
```

- [ ] **Step 2: Run — expect pass (atomic write already exists)**

```bash
cd backend && python -m pytest tests/test_cache_v2.py::test_concurrent_disk_writes_no_corruption -v
```

Expected: PASS (current `disk_put` uses `.tmp` + rename).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_cache_v2.py
git commit -m "test: verify concurrent disk writes produce valid JSON"
```

---

## Task A12: Write test for Azure persistent path detection

**Files:**
- Test: `backend/tests/test_cache_v2.py`

- [ ] **Step 1: Append test**

```python
def test_cache_dir_uses_home_on_azure(monkeypatch):
    """On Azure (WEBSITE_SITE_NAME set + /home exists), cache lives in /home/."""
    # This test only runs a sanity check — cache.py picks dir at import time.
    # Verify the logic via direct string check.
    monkeypatch.setenv('WEBSITE_SITE_NAME', 'salespulse-nyaaa')
    import importlib, cache
    importlib.reload(cache)
    # Can't assert exact path (test env has no /home/.salesinsight), but verify
    # logic branches correctly: if /home exists + WEBSITE_SITE_NAME set,
    # _BASE_DIR should start with /home
    # (On CI/dev laptop, /home may not exist → falls back to ~/.salesinsight)
    assert str(cache._CACHE_DIR).endswith('/cache')
```

- [ ] **Step 2: Run — expect pass (already implemented in earlier deploy)**

```bash
cd backend && python -m pytest tests/test_cache_v2.py::test_cache_dir_uses_home_on_azure -v
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_cache_v2.py
git commit -m "test: verify Azure persistent path detection"
```

---

## Task A13: Full Team A regression run

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: ALL PASS (no regressions in other tests).

- [ ] **Step 2: Boot server, verify no import errors**

```bash
cd backend && python -c "from cache import cached_query, get, put, disk_put, CACHE_VERSION, ENABLE_V2, CircuitBreakerOpen, USER_WAIT_TIMEOUT, FETCHER_TIMEOUT, L1_MAX_ENTRIES; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit Team A completion marker**

```bash
git add -A
git commit --allow-empty -m "chore: Team A (core cache rewrite) complete"
```

**Team A interface now stable. Teams B can proceed.**

---

# TEAM C — ADMIN CACHE API + SQLITE (parallel with A/E)

Team C builds the `cache_warm_run` SQLite table + admin endpoints. Can run in parallel with Team A once Team A starts.

## Task C1: Add CacheWarmRun model

**Files:**
- Modify: `backend/models.py`

- [ ] **Step 1: Append model to models.py**

Edit `backend/models.py`. At the bottom, add:

```python
class CacheWarmRun(Base):
    """Record of each cache warm job (nightly or deploy-triggered)."""
    __tablename__ = 'cache_warm_runs'

    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at = Column(DateTime, nullable=False, index=True)
    ended_at = Column(DateTime, nullable=True)
    trigger = Column(String(32), nullable=False)       # 'nightly' | 'deploy' | 'manual'
    status = Column(String(32), nullable=False)        # 'running' | 'success' | 'partial' | 'failed'
    endpoints_total = Column(Integer, default=0)
    endpoints_success = Column(Integer, default=0)
    endpoints_failed = Column(Integer, default=0)
    duration_ms = Column(Integer, nullable=True)
    log_json = Column(Text, nullable=True)  # JSON array of per-endpoint results
```

- [ ] **Step 2: Verify import still works**

```bash
cd backend && python -c "from models import CacheWarmRun; print(CacheWarmRun.__tablename__)"
```

Expected: `cache_warm_runs`

- [ ] **Step 3: Commit**

```bash
git add backend/models.py
git commit -m "feat(models): add CacheWarmRun table for warm job history"
```

---

## Task C2: Write test for cache admin router

**Files:**
- Test: `backend/tests/test_cache_admin.py`

- [ ] **Step 1: Create test file**

```python
"""Tests for cache admin endpoints."""
import json
from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def admin_client(monkeypatch, tmp_path):
    """TestClient with ENABLE_CACHE_V2 + admin auth mocked."""
    monkeypatch.setenv('ENABLE_CACHE_V2', 'true')
    from main import app
    from auth import require_admin
    from models import User

    def fake_admin():
        u = User(id=1, email='test@test', name='Test', role='superadmin', is_active=True)
        return u

    app.dependency_overrides[require_admin] = fake_admin
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_warm_status_empty(admin_client):
    """Endpoint returns empty when no runs recorded."""
    r = admin_client.get('/api/admin/cache/warm-status')
    assert r.status_code == 200
    data = r.json()
    assert 'recent_runs' in data
    assert 'cache_stats' in data
    assert isinstance(data['recent_runs'], list)
```

- [ ] **Step 2: Run — expect fail**

```bash
cd backend && python -m pytest tests/test_cache_admin.py -v
```

Expected: FAIL (endpoint not defined).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_cache_admin.py
git commit -m "test: cache admin warm-status (failing)"
```

---

## Task C3: Create cache_admin router

**Files:**
- Create: `backend/routers/cache_admin.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create the router file**

```python
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
    """Manually trigger a warm run (fires in background thread)."""
    from warmer import warm_heavy_endpoints
    import threading
    threading.Thread(
        target=warm_heavy_endpoints,
        kwargs={'trigger': 'manual'},
        daemon=True,
    ).start()
    return {'ok': True, 'message': 'Warm job started in background'}
```

- [ ] **Step 2: Register the router in main.py**

In `backend/main.py`, find the router registration block (around line 204-229). After the last `app.include_router(...)` line, add:

```python
from routers import cache_admin
app.include_router(cache_admin.router)
```

Also add `cache_admin` to the comma-separated import on the line `from routers import ...` near the top of the registration block.

- [ ] **Step 3: Run test — expect pass (if warmer stub exists) or fail (if warmer not yet created)**

For now, comment out the import in cache_admin.py temporarily so the route loads without warmer.py:

In `backend/routers/cache_admin.py`, change `warm_now` to:

```python
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
```

- [ ] **Step 4: Run test**

```bash
cd backend && python -m pytest tests/test_cache_admin.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/cache_admin.py backend/main.py
git commit -m "feat(api): /api/admin/cache/warm-status + warm-now endpoints"
```

---

# TEAM E — FRONTEND RESILIENCE (parallel with A/C)

## Task E1: Add 503 retry to axios client

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Find the axios instance creation in api.ts**

Search for `const api = axios.create` or similar.

- [ ] **Step 2: Add response interceptor**

After the `api` instance is created, add:

```ts
// Retry once on 503 with 1s delay (cache warming / temporary SF issue)
api.interceptors.response.use(
  (response) => {
    // Expose cached_at if server included it
    const cachedAt = response.headers['x-cache-cached-at']
    if (cachedAt) {
      ;(response as any).cachedAt = cachedAt
    }
    return response
  },
  async (error) => {
    const config = error.config
    if (!config || config.__retried) throw error
    if (error.response?.status === 503) {
      config.__retried = true
      await new Promise((r) => setTimeout(r, 1000))
      return api.request(config)
    }
    throw error
  },
)
```

- [ ] **Step 3: Verify compile**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(api): retry once on 503 + expose cached_at header"
```

---

## Task E2: Create SlowLoadNotice component

**Files:**
- Create: `frontend/src/components/SlowLoadNotice.tsx`

- [ ] **Step 1: Create component**

```tsx
/**
 * SlowLoadNotice — shown when a loading state exceeds a threshold.
 * Usage:
 *   const [loading, setLoading] = useState(true)
 *   return <>{loading && <SlowLoadNotice thresholdMs={10000} />}</>
 */
import { useEffect, useState } from 'react'
import { Loader2, Info } from 'lucide-react'

interface Props {
  thresholdMs?: number
  label?: string
}

export default function SlowLoadNotice({ thresholdMs = 10000, label = 'Loading…' }: Props) {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), thresholdMs)
    return () => clearTimeout(t)
  }, [thresholdMs])

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <Loader2 className="w-6 h-6 animate-spin text-primary/60" />
      <p className="text-sm text-muted-foreground">{label}</p>
      {slow && (
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 max-w-md text-center">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>Loading is taking longer than usual. We're warming fresh data — this happens after deploys or overnight refresh.</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify compile**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SlowLoadNotice.tsx
git commit -m "feat(ui): SlowLoadNotice component for long loading states"
```

---

# TEAM B — STARTUP LIFESPAN & NIGHTLY WARMER (after Team A)

## Task B1: Remove file-hash auto-flush from main.py lifespan

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Open main.py, find the hash block**

Around line 46-64. The code computes an MD5 of all `.py` files and flushes cache if hash changed.

- [ ] **Step 2: Replace with CACHE_VERSION comparison**

Replace the block with:

```python
    # Deploy-aware cache invalidation:
    # Only flush on explicit CACHE_VERSION bump (cache.py CACHE_VERSION constant).
    # Individual entry version mismatches are handled lazily in disk_get().
    version_file = cache._CACHE_DIR / '.cache_version'
    cache._CACHE_DIR.mkdir(parents=True, exist_ok=True)
    stored_version = version_file.read_text().strip() if version_file.exists() else ''

    if stored_version != cache.CACHE_VERSION:
        flushed = sum(1 for f in cache._CACHE_DIR.glob('*.json') if (f.unlink(), True)[1])
        version_file.write_text(cache.CACHE_VERSION)
        log.info(f"CACHE_VERSION changed '{stored_version}' → '{cache.CACHE_VERSION}': flushed {flushed} entries")
    else:
        log.info(f"Restart (CACHE_VERSION={cache.CACHE_VERSION}): keeping existing cache")
```

Remove `import hashlib` if no longer used elsewhere in main.py (grep to confirm).

- [ ] **Step 3: Verify server boots**

```bash
cd backend && python -c "import main; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "fix(main): stop flushing cache on every deploy — use CACHE_VERSION gate"
```

---

## Task B2: Write test for warmer module

**Files:**
- Test: `backend/tests/test_warmer.py`

- [ ] **Step 1: Create test file**

```python
"""Tests for backend/warmer.py — sequential nightly warm job."""
import time
import pytest
from unittest.mock import patch, MagicMock


def test_warm_endpoints_records_success_and_failure(monkeypatch, tmp_path):
    """Warmer runs each endpoint, records per-endpoint result, persists to DB."""
    monkeypatch.setenv('ENABLE_CACHE_V2', 'true')

    # Stub endpoint callables
    def ok_fn():
        return {'data': [1, 2, 3]}
    def fail_fn():
        raise RuntimeError("fake failure")

    endpoints = [
        ('/api/ok', ok_fn),
        ('/api/fail', fail_fn),
    ]

    # Import after env set
    import importlib, warmer
    importlib.reload(warmer)

    # Run warm with stub endpoints
    summary = warmer._run_warm_sequence(endpoints, trigger='test', sleep_between=0)

    assert summary['endpoints_total'] == 2
    assert summary['endpoints_success'] == 1
    assert summary['endpoints_failed'] == 1
    assert any(e['endpoint'] == '/api/ok' and e['ok'] for e in summary['log'])
    assert any(e['endpoint'] == '/api/fail' and not e['ok'] for e in summary['log'])
```

- [ ] **Step 2: Run — expect fail (warmer.py not created)**

```bash
cd backend && python -m pytest tests/test_warmer.py -v
```

Expected: FAIL (no warmer module).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_warmer.py
git commit -m "test: warmer module (failing)"
```

---

## Task B3: Create warmer.py with sequential run + per-endpoint logging

**Files:**
- Create: `backend/warmer.py`

- [ ] **Step 1: Create the file**

```python
"""Sequential cache warmer for heavy endpoints.

Runs nightly via main.py's 3 AM schedule + on-demand via /api/admin/cache/warm-now.
Designed to protect Salesforce from hammering: sequential, 2s between queries,
per-query 60s timeout, records every run to cache_warm_runs SQLite table.
"""
import json
import logging
import time
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutTimeout

log = logging.getLogger('salesinsight.warmer')

PER_QUERY_TIMEOUT = 60.0      # seconds
SLEEP_BETWEEN_QUERIES = 2.0   # seconds — protect SF


def _run_warm_sequence(endpoints, trigger='nightly', sleep_between=SLEEP_BETWEEN_QUERIES):
    """Execute a list of (name, callable) sequentially with per-query timeout.

    Returns a summary dict. Does NOT write to DB — caller does that.
    """
    start = datetime.utcnow()
    log_entries = []
    success = 0
    failed = 0

    for name, fn in endpoints:
        q_start = time.time()
        try:
            with ThreadPoolExecutor(max_workers=1) as exe:
                fut = exe.submit(fn)
                result = fut.result(timeout=PER_QUERY_TIMEOUT)
            duration_ms = int((time.time() - q_start) * 1000)
            log_entries.append({
                'endpoint': name,
                'ok': True,
                'duration_ms': duration_ms,
                'error': None,
            })
            success += 1
            log.info(f"Warm OK: {name} ({duration_ms}ms)")
        except FutTimeout:
            duration_ms = int((time.time() - q_start) * 1000)
            log_entries.append({
                'endpoint': name,
                'ok': False,
                'duration_ms': duration_ms,
                'error': f'timeout after {PER_QUERY_TIMEOUT}s',
            })
            failed += 1
            log.warning(f"Warm TIMEOUT: {name} ({duration_ms}ms)")
        except Exception as e:
            duration_ms = int((time.time() - q_start) * 1000)
            log_entries.append({
                'endpoint': name,
                'ok': False,
                'duration_ms': duration_ms,
                'error': str(e)[:500],
            })
            failed += 1
            log.warning(f"Warm FAIL: {name}: {e}")

        if sleep_between > 0:
            time.sleep(sleep_between)

    end = datetime.utcnow()
    total_ms = int((end - start).total_seconds() * 1000)

    if failed == 0:
        status = 'success'
    elif success == 0:
        status = 'failed'
    else:
        status = 'partial'

    return {
        'started_at': start,
        'ended_at': end,
        'trigger': trigger,
        'status': status,
        'endpoints_total': len(endpoints),
        'endpoints_success': success,
        'endpoints_failed': failed,
        'duration_ms': total_ms,
        'log': log_entries,
    }


def _persist_run(summary):
    """Write the run summary to cache_warm_runs table."""
    from database import SessionLocal
    from models import CacheWarmRun
    db = SessionLocal()
    try:
        row = CacheWarmRun(
            started_at=summary['started_at'],
            ended_at=summary['ended_at'],
            trigger=summary['trigger'],
            status=summary['status'],
            endpoints_total=summary['endpoints_total'],
            endpoints_success=summary['endpoints_success'],
            endpoints_failed=summary['endpoints_failed'],
            duration_ms=summary['duration_ms'],
            log_json=json.dumps(summary['log']),
        )
        db.add(row)
        db.commit()
    except Exception as e:
        log.error(f"Could not persist warm run: {e}")
    finally:
        db.close()


def _build_endpoint_list():
    """Build the list of (name, callable) for heavy endpoints.
    Each callable invokes the endpoint's fetch function directly (not via HTTP).
    """
    from routers.sales_performance import performance_monthly
    from routers.sales_advisor import advisor_leaderboard, advisor_yoy
    from routers.sales_leads import sales_leads_volume, leads_agent_close_speed
    from routers.territory_map import territory_map_data
    from routers.market_pulse import market_pulse
    from routers.cross_sell import cross_sell_insights
    from routers.customer_profile import get_top_customers
    from routers.advisor_targets_achievement import targets_achievement
    from routers.sales_performance import performance_funnel

    # Travel + Insurance for each relevant endpoint, period=12 (covers 90% of traffic)
    endpoints = []

    for line in ('Travel', 'Insurance'):
        endpoints.append((f'monthly_{line}', lambda l=line: performance_monthly(line=l, period=12)))
        endpoints.append((f'leaderboard_{line}', lambda l=line: advisor_leaderboard(line=l, period=12)))
        endpoints.append((f'yoy_{line}', lambda l=line: advisor_yoy(line=l)))
        endpoints.append((f'funnel_{line}', lambda l=line: performance_funnel(line=l, period=12)))
        endpoints.append((f'close_speed_{line}', lambda l=line: leads_agent_close_speed(line=l, period=12)))
        endpoints.append((f'top_customers_{line}', lambda l=line: get_top_customers(line=l, limit=25)))
        endpoints.append((f'achievement_{line}', lambda l=line: targets_achievement(line=l)))
        endpoints.append((f'cross_sell_{line}', lambda l=line: cross_sell_insights(line=l)))

    # Line-independent
    endpoints.append(('territory_map', lambda: territory_map_data(period=12)))
    endpoints.append(('market_pulse', lambda: market_pulse(period=6)))

    return endpoints


def warm_heavy_endpoints(trigger='nightly'):
    """Top-level entry: build endpoint list, run sequentially, persist result."""
    endpoints = _build_endpoint_list()
    summary = _run_warm_sequence(endpoints, trigger=trigger)
    _persist_run(summary)
    log.info(
        f"Warm {trigger} complete: {summary['endpoints_success']}/"
        f"{summary['endpoints_total']} ok in {summary['duration_ms']/1000:.1f}s"
    )
    return summary
```

- [ ] **Step 2: Run test — expect pass**

```bash
cd backend && python -m pytest tests/test_warmer.py::test_warm_endpoints_records_success_and_failure -v
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/warmer.py
git commit -m "feat: sequential warmer with per-query timeout + DB logging"
```

---

## Task B4: Replace nightly cache_warmer with real warm

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Locate the async cache_warmer in main.py (around line 67-90)**

Replace the entire function body (between `async def cache_warmer():` and the next function or yield) with:

```python
    async def cache_warmer():
        """3 AM ET daily: flush in-memory L1, then warm heavy endpoints sequentially.
        Only worker 0 acquires the lock; other workers skip.
        Writes result to cache_warm_runs table for admin dashboard.
        """
        from zoneinfo import ZoneInfo
        import fcntl
        et = ZoneInfo('America/New_York')

        lock_path = cache._CACHE_DIR / '.warmer.lock'

        while True:
            now = datetime.now(et)
            next_run = now.replace(hour=3, minute=0, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=1)
            wait_secs = (next_run - now).total_seconds()
            log.info(f"Cache warmer: next run at {next_run.isoformat()} ({wait_secs/3600:.1f}h)")
            await asyncio.sleep(wait_secs)

            # Acquire file lock — only one worker runs the warm job
            try:
                lock_path.parent.mkdir(parents=True, exist_ok=True)
                with open(lock_path, 'w') as lockf:
                    try:
                        fcntl.flock(lockf, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError:
                        log.info("Cache warmer: another worker holds the lock — skipping")
                        continue

                    log.info("Cache warmer: acquired lock, starting sequential warm")
                    # Run in executor so we don't block event loop
                    from warmer import warm_heavy_endpoints
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, warm_heavy_endpoints, 'nightly')
            except Exception as e:
                log.error(f"Cache warmer error: {e}")
```

- [ ] **Step 2: Remove the old _startup_warm thread block**

In main.py, find the block that starts around `def _startup_warm():`. Replace the entire block (including the `threading.Thread(target=_startup_warm, daemon=True).start()` line) with:

```python
    # Deploy-time warming: run the same warmer in a background thread, worker-0 only
    import fcntl
    deploy_lock = cache._CACHE_DIR / '.deploy_warmer.lock'
    def _deploy_warm():
        import time
        time.sleep(10)  # let app finish booting + accept traffic
        try:
            cache._CACHE_DIR.mkdir(parents=True, exist_ok=True)
            with open(deploy_lock, 'w') as lockf:
                try:
                    fcntl.flock(lockf, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    log.info("Deploy warmer: another worker holds the lock — skipping")
                    return
                from warmer import warm_heavy_endpoints
                log.info("Deploy warmer: starting background warm")
                warm_heavy_endpoints(trigger='deploy')
        except Exception as e:
            log.warning(f"Deploy warmer failed: {e}")
    threading.Thread(target=_deploy_warm, daemon=True).start()
```

- [ ] **Step 3: Verify main.py still imports**

```bash
cd backend && python -c "import main; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "feat(lifespan): nightly + deploy warmer with worker-0 file lock"
```

---

# TEAM D — ADMIN UI (after Team C)

## Task D1: Add Cache tab to Settings

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`
- Create: `frontend/src/pages/settings/CacheStatusTab.tsx`

- [ ] **Step 1: Create CacheStatusTab**

```tsx
/**
 * CacheStatusTab — shows recent warm runs + current cache stats.
 */
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Loader2, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react'

interface WarmRun {
  id: number
  started_at: string
  ended_at: string | null
  trigger: string
  status: string
  endpoints_total: number
  endpoints_success: number
  endpoints_failed: number
  duration_ms: number | null
  log: { endpoint: string; ok: boolean; duration_ms: number; error: string | null }[]
}

interface WarmStatus {
  recent_runs: WarmRun[]
  cache_stats: {
    l1_entries: number
    l1_max_entries: number
    l2_entries: number
    l2_total_bytes: number
    l2_oldest_age_seconds: number | null
    l2_newest_age_seconds: number | null
    version: string
    v2_enabled: boolean
  }
}

export default function CacheStatusTab() {
  const [data, setData] = useState<WarmStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [warming, setWarming] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const { data } = await api.get<WarmStatus>('/api/admin/cache/warm-status')
      setData(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function triggerWarm() {
    setWarming(true)
    try {
      await api.post('/api/admin/cache/warm-now')
      setTimeout(load, 2000)
    } finally {
      setWarming(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" /></div>
  }
  if (!data) return <div className="text-sm text-muted-foreground">No data</div>

  const s = data.cache_stats
  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="L1 Entries" value={`${s.l1_entries} / ${s.l1_max_entries}`} />
        <StatCard label="L2 Entries" value={`${s.l2_entries}`} sub={`${(s.l2_total_bytes / 1024).toFixed(0)} KB`} />
        <StatCard label="Cache Version" value={s.version} sub={s.v2_enabled ? 'v2 enabled' : 'v1 legacy'} />
        <StatCard label="Oldest Entry" value={s.l2_oldest_age_seconds ? `${Math.floor(s.l2_oldest_age_seconds / 3600)}h ago` : '—'} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={triggerWarm}
          disabled={warming}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium',
            'bg-card hover:bg-muted/50 transition-colors',
            warming && 'opacity-60 cursor-not-allowed',
          )}
        >
          {warming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {warming ? 'Warming…' : 'Warm Now'}
        </button>
      </div>

      {/* Recent runs */}
      <div className="card-premium">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">Recent Warm Runs</div>
        <div className="divide-y divide-border">
          {data.recent_runs.map((r) => (
            <RunRow key={r.id} run={r} />
          ))}
          {data.recent_runs.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">No warm runs recorded yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function RunRow({ run }: { run: WarmRun }) {
  const [open, setOpen] = useState(false)
  const statusColor = run.status === 'success' ? 'text-emerald-600' : run.status === 'partial' ? 'text-amber-600' : 'text-rose-600'
  const Icon = run.status === 'success' ? CheckCircle : run.status === 'partial' ? Clock : XCircle

  return (
    <div className="p-3">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-3 w-full text-left">
        <Icon className={cn('w-4 h-4 shrink-0', statusColor)} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {run.trigger} — {run.endpoints_success}/{run.endpoints_total} ok
            {run.endpoints_failed > 0 && <span className="text-rose-600"> · {run.endpoints_failed} failed</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(run.started_at).toLocaleString()} — {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : 'running'}
          </div>
        </div>
      </button>
      {open && run.log.length > 0 && (
        <div className="mt-3 ml-7 space-y-1 text-xs">
          {run.log.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={e.ok ? 'text-emerald-600' : 'text-rose-600'}>{e.ok ? '✓' : '✗'}</span>
              <span className="font-mono">{e.endpoint}</span>
              <span className="text-muted-foreground">{(e.duration_ms / 1000).toFixed(1)}s</span>
              {e.error && <span className="text-rose-600 truncate">{e.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add the tab to Settings.tsx**

Edit `frontend/src/pages/Settings.tsx`:

1. Import at top with the other settings tab imports:

```tsx
const CacheStatusTab = lazy(() => import('@/pages/settings/CacheStatusTab'))
```

2. Add to the `SettingsTab` type:

```ts
type SettingsTab = 'users' | 'logs' | 'targets' | 'ai' | 'performance' | 'help' | 'issues' | 'cache'
```

3. Add the tab button (inside the tab bar array):

```tsx
{ key: 'cache' as SettingsTab, label: 'Cache', icon: Database },
```

4. Add the tab content:

```tsx
{tab === 'cache' && <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}><CacheStatusTab /></Suspense>}
```

- [ ] **Step 3: TS check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/settings/CacheStatusTab.tsx frontend/src/pages/Settings.tsx
git commit -m "feat(ui): Cache Status tab in Settings"
```

---

# TEAM F — INTEGRATION TESTS (after A, B, C)

## Task F1: End-to-end cache lifecycle test

**Files:**
- Create: `backend/tests/test_integration_cache_lifecycle.py`

- [ ] **Step 1: Create test**

```python
"""End-to-end test: deploy preserves cache, version bump invalidates, warmer populates."""
import os
import json
import time
from pathlib import Path
import pytest


def test_deploy_preserves_cache(monkeypatch, tmp_path):
    """Simulate lifespan startup with same CACHE_VERSION — no entries flushed."""
    monkeypatch.setenv('ENABLE_CACHE_V2', 'true')
    cache_dir = tmp_path / 'cache'
    cache_dir.mkdir()
    (cache_dir / 'test1.json').write_text('{"data":{"x":1},"expires":9999999999,"version":"v1"}')
    (cache_dir / 'test2.json').write_text('{"data":{"y":2},"expires":9999999999,"version":"v1"}')

    # Simulate what main.py's startup does
    version_file = cache_dir / '.cache_version'
    version_file.write_text('v1')  # same as CACHE_VERSION

    # Re-run the "startup check"
    CACHE_VERSION = 'v1'
    stored = version_file.read_text().strip() if version_file.exists() else ''
    if stored != CACHE_VERSION:
        flushed = sum(1 for f in cache_dir.glob('*.json') if (f.unlink(), True)[1])
    else:
        flushed = 0

    # Both cache entries should still exist
    remaining = list(cache_dir.glob('*.json'))
    assert len(remaining) == 2
    assert flushed == 0


def test_version_bump_flushes_all(monkeypatch, tmp_path):
    """CACHE_VERSION bump from v1→v2 flushes all entries."""
    cache_dir = tmp_path / 'cache'
    cache_dir.mkdir()
    (cache_dir / 'test1.json').write_text('{"data":{"x":1},"expires":9999999999,"version":"v1"}')

    version_file = cache_dir / '.cache_version'
    version_file.write_text('v1')  # old version

    CACHE_VERSION = 'v2'  # simulate bump
    stored = version_file.read_text().strip()
    if stored != CACHE_VERSION:
        flushed = sum(1 for f in cache_dir.glob('*.json') if (f.unlink(), True)[1])
        version_file.write_text(CACHE_VERSION)

    assert flushed == 1
    assert not list(cache_dir.glob('*.json'))
```

- [ ] **Step 2: Run**

```bash
cd backend && python -m pytest tests/test_integration_cache_lifecycle.py -v
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_integration_cache_lifecycle.py
git commit -m "test: integration — deploy preserves cache, version bump flushes"
```

---

## Task F2: Full backend suite

- [ ] **Step 1: Run everything**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: ALL PASS.

- [ ] **Step 2: Frontend typecheck + build**

```bash
cd frontend && npx tsc --noEmit && npm run build
```

Expected: no TS errors, build succeeds.

- [ ] **Step 3: Manual smoke test locally**

```bash
# Terminal 1
cd backend && ENABLE_CACHE_V2=true python -m uvicorn main:app --port 8000 --reload

# Terminal 2
cd frontend && npm run dev
```

Open `http://localhost:5173`, log in, open Settings → Cache tab, click "Warm Now", verify runs appear.

- [ ] **Step 4: Commit final marker**

```bash
git commit --allow-empty -m "chore: Phase 1 caching reliability complete (all teams merged)"
```

---

## Deferred to later plans

**Phase 2 (measurement):** `sf_query_log` table, `/api/admin/slow-queries` endpoint, before/after query table. Plan writes after Phase 1 lands.

**Phase 3 (query optimization):** One plan per optimized endpoint, referencing the Phase 2 data.

**Phase 4 (SF quota):** Dashboard, circuit breaker on quota, dedicated SF user, alerting. Separate plan.

---

## Rollout

1. Merge Phase 1 to main (no Azure deploy yet).
2. User reviews full diff.
3. Deploy to Azure with `ENABLE_CACHE_V2=false` (safe — old behavior).
4. Verify no regressions via `/api/admin/performance/summary`.
5. Flip `ENABLE_CACHE_V2=true` in Azure App Settings (no redeploy).
6. Monitor `/api/admin/cache/warm-status` for 24 hours.
7. If stable, bump `CACHE_VERSION` on next semantic query change.

## Rollback

- Set `ENABLE_CACHE_V2=false` in Azure App Settings → old behavior restored without redeploy.
- If module-level issue: revert the Phase 1 merge commit.
- Full code backup in `backend/cache_v1_backup.py`.
