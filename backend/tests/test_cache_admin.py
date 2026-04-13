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
