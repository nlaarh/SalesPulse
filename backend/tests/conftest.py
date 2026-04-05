"""Shared fixtures for all backend tests.

Provides:
  - fast_bcrypt   : session-wide bcrypt patch (rounds=4, ~64x faster)
  - db_engine     : single in-memory SQLAlchemy engine for the whole session
  - in_memory_db  : per-test DB session that rolls back after each test
  - mock_sf       : patches sf_client so no real SF calls are made
  - api_client    : session-scoped FastAPI TestClient (created once)
  - auth_headers  : Bearer token for a pre-seeded admin user
"""

import os, sys, pytest
from collections import defaultdict
from unittest.mock import MagicMock

# ── Python path ───────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# ── Env defaults before any app import ───────────────────────────────────────
os.environ.setdefault('JWT_SECRET', 'test-secret-not-for-prod')
os.environ.setdefault('SF_TOKEN_URL',      'https://test.salesforce.com/token')
os.environ.setdefault('SF_CONSUMER_KEY',   'test-key')
os.environ.setdefault('SF_CONSUMER_SECRET','test-secret')
os.environ.setdefault('SF_USERNAME',       'test@example.com')
os.environ.setdefault('SF_PASSWORD',       'testpass')
os.environ.setdefault('SF_SECURITY_TOKEN', 'testtoken')


# ── bcrypt speed patch (session-wide, autouse) ────────────────────────────────
# Default bcrypt rounds = 12 → ~0.5s per hash.
# rounds = 4 → ~0.008s per hash (~64x faster). Safe for tests only.

@pytest.fixture(scope='session', autouse=True)
def fast_bcrypt():
    import bcrypt as _bcrypt
    _orig = _bcrypt.gensalt
    _bcrypt.gensalt = lambda rounds=4, prefix=b'2b': _orig(rounds=4, prefix=prefix)
    yield
    _bcrypt.gensalt = _orig


# ── Shared DB engine (session-scoped) ────────────────────────────────────────
# Engine + schema created ONCE for the entire test session.
# Each test gets its own connection+transaction that rolls back on teardown,
# so tests are fully isolated without paying engine/schema creation cost.

@pytest.fixture(scope='session')
def db_engine():
    from sqlalchemy import create_engine
    from sqlalchemy.pool import StaticPool
    from database import Base
    import models  # noqa: F401 — registers all ORM models on Base.metadata

    engine = create_engine(
        'sqlite:///:memory:',
        connect_args={'check_same_thread': False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)


# ── Per-test DB session with rollback isolation ───────────────────────────────

@pytest.fixture()
def in_memory_db(db_engine):
    """Yields a DB session. All writes are rolled back after the test."""
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=db_engine)
    db = Session()
    yield db
    db.rollback()
    db.close()


# ── Mock Salesforce client (function-scoped via monkeypatch) ──────────────────

@pytest.fixture()
def mock_sf(monkeypatch):
    """Patch sf_query_all and sf_parallel — no real SF calls made."""
    mock_query_all = MagicMock(return_value=[])
    mock_parallel  = MagicMock(return_value=defaultdict(list))

    monkeypatch.setattr('sf_client.sf_query_all', mock_query_all)
    monkeypatch.setattr('sf_client.sf_parallel',  mock_parallel)

    for mod in ['routers.sales_advisor', 'routers.sales_pipeline',
                'routers.sales_leads',   'routers.sales_performance',
                'routers.sales_travel',  'routers.sales_opportunities',
                'routers.sales_agent_profile']:
        monkeypatch.setattr(f'{mod}.sf_query_all', mock_query_all, raising=False)
        monkeypatch.setattr(f'{mod}.sf_parallel',  mock_parallel,  raising=False)

    return mock_query_all, mock_parallel


# ── FastAPI TestClient (session-scoped — created once) ───────────────────────
# The client itself is reused; only the DB session override changes per test.

@pytest.fixture(scope='session')
def _app_client(db_engine):
    """Internal: build the TestClient once for the whole session."""
    from fastapi.testclient import TestClient
    from main import app
    return TestClient(app, raise_server_exceptions=False), app


@pytest.fixture()
def api_client(mock_sf, in_memory_db, _app_client):
    """TestClient wired to the per-test in-memory DB session."""
    from database import get_db
    client, app = _app_client

    def override_db():
        yield in_memory_db

    app.dependency_overrides[get_db] = override_db
    yield client
    app.dependency_overrides.pop(get_db, None)


# ── Auth headers ──────────────────────────────────────────────────────────────

@pytest.fixture()
def auth_headers(api_client, in_memory_db):
    """Seed an admin user and return a valid Bearer token header."""
    import bcrypt
    from models import User

    hashed = bcrypt.hashpw(b'testpass123', bcrypt.gensalt()).decode()
    user = User(email='test@nyaaa.com', name='Test User',
                password_hash=hashed, role='admin', is_active=True)
    in_memory_db.add(user)
    in_memory_db.commit()

    resp = api_client.post('/api/auth/login',
                           json={'email': 'test@nyaaa.com', 'password': 'testpass123'})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return {'Authorization': f'Bearer {resp.json()["token"]}'}

