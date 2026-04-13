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
