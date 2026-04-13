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


def test_warm_status_malformed_log_json(admin_client):
    """Malformed log_json must not crash the endpoint — returns log: []."""
    from database import get_db
    from models import CacheWarmRun

    # Insert a run with broken JSON via the DB
    db = next(get_db())
    run = CacheWarmRun(
        started_at=datetime.utcnow(),
        ended_at=datetime.utcnow(),
        trigger='manual',
        status='success',
        endpoints_total=1,
        endpoints_success=1,
        endpoints_failed=0,
        duration_ms=100,
        log_json='not valid json{',
    )
    db.add(run)
    db.commit()

    r = admin_client.get('/api/admin/cache/warm-status')
    assert r.status_code == 200
    data = r.json()
    assert len(data['recent_runs']) >= 1
    # The run with malformed JSON should have log: []
    malformed_run = data['recent_runs'][0]
    assert malformed_run['log'] == []

    # Cleanup
    db.delete(run)
    db.commit()
