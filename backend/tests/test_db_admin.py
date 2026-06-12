"""Tests for database backup and restore admin endpoints."""
import json
import pytest
from datetime import datetime, date
from pathlib import Path
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from models import User, AdvisorTarget
from auth import require_admin
import routers.db_admin as db_admin

@pytest.fixture
def mock_db_admin_env(monkeypatch, tmp_path, db_engine, api_client):
    # Patch BACKUP_DIR to a temporary path
    monkeypatch.setattr(db_admin, 'BACKUP_DIR', tmp_path)
    
    # Patch engine used in drop_all / create_all
    monkeypatch.setattr(db_admin, 'engine', db_engine)
    
    # Patch SessionLocal used inside restore
    mock_sessionmaker = sessionmaker(bind=db_engine)
    monkeypatch.setattr('database.SessionLocal', mock_sessionmaker)
    
    # Enable Admin role override with superadmin
    from main import app
    def fake_admin():
        return User(id=999, email='admin@test.com', name='Test Admin', role='superadmin', is_active=True)
    
    app.dependency_overrides[require_admin] = fake_admin
    yield api_client
    app.dependency_overrides.clear()


def test_create_and_restore_backup(mock_db_admin_env, in_memory_db, db_engine):
    client = mock_db_admin_env
    
    # Ensure tables are clean/created first
    from database import Base
    Base.metadata.create_all(bind=db_engine)
    
    # Clear existing targets to ensure isolation from other tests
    in_memory_db.query(AdvisorTarget).delete()
    in_memory_db.commit()
    
    # 1. Seed some data in the database
    target = AdvisorTarget(
        upload_id=10,
        raw_name="Advisor Test",
        sf_name="Advisor Test SF",
        branch="NYC",
        title="Senior Advisor",
        monthly_target=50000.0,
    )
    in_memory_db.add(target)
    in_memory_db.commit()
    
    # Check that it exists
    assert in_memory_db.query(AdvisorTarget).count() == 1
    
    # Get the count at backup time
    original_count = in_memory_db.query(AdvisorTarget).count()
    
    # 2. List backups (should be empty first)
    r = client.get('/api/admin/db/backups')
    assert r.status_code == 200
    assert len(r.json()['backups']) == 0
    
    # 3. Create a backup snapshot
    r = client.post('/api/admin/db/backup')
    assert r.status_code == 200
    res = r.json()
    assert res['status'] == 'success'
    filename = res['filename']
    assert filename.startswith('db_backup_')
    
    # 4. List backups (should show the backup)
    r = client.get('/api/admin/db/backups')
    assert r.status_code == 200
    backups = r.json()['backups']
    assert len(backups) == 1
    assert backups[0]['filename'] == filename
    assert backups[0]['size_bytes'] > 0
    
    # 5. Modify/delete the data in database to simulate loss
    in_memory_db.delete(target)
    in_memory_db.commit()
    assert in_memory_db.query(AdvisorTarget).count() == original_count - 1
    
    # 6. Restore the database from the backup
    r = client.post(f'/api/admin/db/restore?filename={filename}')
    assert r.status_code == 200
    assert r.json()['status'] == 'success'
    assert r.json()['restored_from'] == filename
    
    # 7. Check if data is recovered!
    from database import SessionLocal
    new_db = SessionLocal()
    try:
        recovered_targets = new_db.query(AdvisorTarget).all()
        assert len(recovered_targets) == original_count
        
        # Verify the specific target was restored successfully
        recovered_target = new_db.query(AdvisorTarget).filter(AdvisorTarget.sf_name == "Advisor Test SF").first()
        assert recovered_target is not None
        assert recovered_target.monthly_target == 50000.0
    finally:
        new_db.close()


def test_unauthorized_endpoints():
    from main import app
    client = TestClient(app)
    
    # No credentials (returns 401 or 403 because requiring bearer)
    r = client.get('/api/admin/db/backups')
    assert r.status_code in (401, 403)
