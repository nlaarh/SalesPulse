"""Tests for SOQL query profiling router."""
from datetime import datetime
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def admin_client(monkeypatch):
    from main import app
    from auth import require_admin
    from models import User

    def fake_admin():
        return User(id=1, email='t@t', name='T', role='superadmin', is_active=True)

    app.dependency_overrides[require_admin] = fake_admin
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_slow_queries_empty(admin_client):
    r = admin_client.get('/api/admin/slow-queries?window_minutes=60')
    assert r.status_code == 200
    data = r.json()
    assert 'slow_queries' in data
    assert isinstance(data['slow_queries'], list)


def test_slow_queries_records_and_ranks(admin_client):
    from database import SessionLocal
    from models import SfQueryLog
    db = SessionLocal()
    try:
        # Insert synthetic log entries
        db.add_all([
            SfQueryLog(
                created_at=datetime.utcnow(),
                query_preview='SELECT Id FROM A WHERE ...',
                duration_ms=100,
                row_count=10,
            ),
            SfQueryLog(
                created_at=datetime.utcnow(),
                query_preview='SELECT Id FROM B WHERE slow stuff',
                duration_ms=5000,
                row_count=2000,
            ),
        ])
        db.commit()
    finally:
        db.close()

    r = admin_client.get('/api/admin/slow-queries?window_minutes=60&top_n=10')
    data = r.json()
    # The 5000ms query should rank first
    assert data['slow_queries'][0]['p95_ms'] >= 5000


def test_clear_query_log(admin_client):
    r = admin_client.delete('/api/admin/slow-queries')
    assert r.status_code == 200
    assert 'deleted' in r.json()
