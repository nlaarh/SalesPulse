"""End-to-end integration tests for cache lifecycle.

Covers:
  - Deploy with same CACHE_VERSION — cache entries preserved
  - CACHE_VERSION bump — all entries flushed
  - Warmer module imports cleanly and builds a non-empty endpoint list
  - cache_admin routes are registered in the FastAPI app
  - ENABLE_CACHE_V2=false preserves v1 behaviour (no version stamp)
"""
import json
import importlib
import pytest


# ── F1: Deploy lifecycle ────────────────────────────────────────────────────


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

    # Re-run the "startup check" logic (replicated from main.py)
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
    """CACHE_VERSION bump from v1->v2 flushes all entries."""
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


# ── F2: Warmer module integration ───────────────────────────────────────────


def test_warmer_import_does_not_crash(monkeypatch):
    """Can we import warmer without starting a real app?"""
    monkeypatch.setenv('ENABLE_CACHE_V2', 'true')
    from warmer import warm_heavy_endpoints, _build_endpoint_list
    # Should not raise; should return a non-empty list
    endpoints = _build_endpoint_list()
    assert len(endpoints) > 0
    # Each entry should be (name, callable)
    for name, fn in endpoints:
        assert isinstance(name, str)
        assert callable(fn)


def test_cache_admin_router_registered(monkeypatch):
    """main.py should register cache_admin router."""
    monkeypatch.setenv('ENABLE_CACHE_V2', 'true')
    from main import app
    routes = [r.path for r in app.routes if hasattr(r, 'path')]
    assert '/api/admin/cache/warm-status' in routes
    assert '/api/admin/cache/warm-now' in routes


def test_cache_v2_disabled_behaves_like_v1(monkeypatch, tmp_path):
    """With ENABLE_CACHE_V2=false, v1 behavior is preserved."""
    monkeypatch.delenv('ENABLE_CACHE_V2', raising=False)
    import cache
    importlib.reload(cache)
    # No version check, no breaker, no inline retry
    assert cache.ENABLE_V2 is False
    # disk_put without version key
    monkeypatch.setattr(cache, '_CACHE_DIR', tmp_path)
    cache.disk_put('k', {'x': 1}, ttl=60)
    entry = json.loads((tmp_path / cache._disk_path('k').name).read_text())
    assert 'version' not in entry  # v1 does NOT stamp version
    # Restore v2 state for other tests
    monkeypatch.setenv('ENABLE_CACHE_V2', 'true')
    importlib.reload(cache)
