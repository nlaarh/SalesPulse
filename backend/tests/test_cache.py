"""Unit tests for backend/cache.py.

Covers: L1 hit, L2 promotion, TTL expiry, stampede protection,
        atomic disk write, invalidate clears both layers.
"""

import time, threading, tempfile, os, pytest
from unittest.mock import patch


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fresh_cache(tmp_path):
    """Return the cache module re-initialised against a temp directory."""
    import importlib, cache as _cache
    with patch.object(_cache, '_CACHE_DIR', tmp_path):
        _cache._store.clear()
        _cache._inflight.clear()
    return _cache


# ── L1 tests ─────────────────────────────────────────────────────────────────

def test_put_get_returns_value(tmp_path):
    import cache
    cache._store.clear()
    cache.put('k1', {'x': 1}, ttl=60)
    assert cache.get('k1') == {'x': 1}


def test_get_returns_none_after_ttl(tmp_path):
    import cache
    cache._store.clear()
    cache.put('k2', 'hello', ttl=0)   # instant expiry
    time.sleep(0.01)
    # L1 expired; L2 also empty → None
    with patch('cache.disk_get', return_value=None):
        assert cache.get('k2') is None


def test_get_promotes_disk_hit_to_l1(tmp_path):
    import cache
    cache._store.clear()
    with patch('cache.disk_get', return_value={'promoted': True}):
        result = cache.get('k-disk')
    assert result == {'promoted': True}
    # Now L1 should have it
    assert cache.get('k-disk') == {'promoted': True}


def test_invalidate_removes_from_l1(tmp_path):
    import cache
    cache._store.clear()
    cache.put('k3', 'data', ttl=60)
    cache.invalidate('k3')
    with patch('cache.disk_get', return_value=None):
        assert cache.get('k3') is None


# ── L2 disk tests ─────────────────────────────────────────────────────────────

def test_disk_put_get_roundtrip(tmp_path):
    import cache
    with patch.object(cache, '_CACHE_DIR', tmp_path):
        cache.disk_put('dk1', [1, 2, 3], ttl=60)
        assert cache.disk_get('dk1') == [1, 2, 3]


def test_disk_get_returns_none_after_expiry(tmp_path):
    import cache
    with patch.object(cache, '_CACHE_DIR', tmp_path):
        cache.disk_put('dk2', 'val', ttl=0)
        time.sleep(0.01)
        assert cache.disk_get('dk2') is None


def test_disk_write_is_atomic(tmp_path):
    """disk_put writes via .tmp then renames — no partial reads."""
    import cache
    with patch.object(cache, '_CACHE_DIR', tmp_path):
        cache.disk_put('dk3', {'safe': True}, ttl=60)
        tmp_files = list(tmp_path.glob('*.tmp'))
        assert tmp_files == [], "Temp file left behind after successful write"


# ── Stampede protection ───────────────────────────────────────────────────────

def test_cached_query_calls_fetch_once_under_concurrency(tmp_path):
    """With 10 concurrent threads all missing the same key, fetch fires only once."""
    import cache
    cache._store.clear()
    cache._inflight.clear()

    fetch_count = 0
    barrier = threading.Barrier(10)

    def slow_fetch():
        nonlocal fetch_count
        fetch_count += 1
        time.sleep(0.05)
        return {'result': 'ok'}

    def worker():
        barrier.wait()
        with patch('cache.disk_get', return_value=None), \
             patch('cache.disk_put'):
            cache.cached_query('stampede-key', slow_fetch, ttl=60)

    threads = [threading.Thread(target=worker) for _ in range(10)]
    for t in threads: t.start()
    for t in threads: t.join()

    assert fetch_count == 1, f"Expected 1 fetch, got {fetch_count}"


def test_cached_query_waiters_get_result(tmp_path):
    """Threads that waited on the stampede guard still receive the correct value."""
    import cache
    cache._store.clear()
    cache._inflight.clear()

    results = []

    def slow_fetch():
        time.sleep(0.05)
        return {'value': 42}

    def worker():
        with patch('cache.disk_get', return_value=None), \
             patch('cache.disk_put'):
            r = cache.cached_query('waiter-key', slow_fetch, ttl=60)
        results.append(r)

    threads = [threading.Thread(target=worker) for _ in range(5)]
    for t in threads: t.start()
    for t in threads: t.join()

    assert all(r is not None for r in results), "Some waiters got None"
    assert all(r.get('value') == 42 for r in results)


def test_cached_query_returns_cached_on_second_call():
    """Second call to cached_query should NOT invoke fetch_fn."""
    import cache
    cache._store.clear()

    calls = []

    def fetch():
        calls.append(1)
        return 'data'

    with patch('cache.disk_get', return_value=None), patch('cache.disk_put'):
        cache.cached_query('dup-key', fetch, ttl=60)
        cache.cached_query('dup-key', fetch, ttl=60)

    assert len(calls) == 1, "fetch_fn called more than once for same cached key"
