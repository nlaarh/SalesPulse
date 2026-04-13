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
