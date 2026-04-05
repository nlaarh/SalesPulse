"""Integration tests for FastAPI endpoints via TestClient.

Uses the api_client + auth_headers fixtures from conftest.py, which
provide an in-memory SQLite DB and mocked Salesforce client.
"""

import pytest


# ── Health ────────────────────────────────────────────────────────────────────

def test_health_returns_ok(api_client):
    resp = api_client.get('/api/health')
    assert resp.status_code == 200
    assert resp.json()['status'] == 'ok'


# ── Auth: login ───────────────────────────────────────────────────────────────

def test_login_valid_credentials_returns_token(api_client, in_memory_db):
    import bcrypt
    from models import User
    hashed = bcrypt.hashpw(b'secret123', bcrypt.gensalt()).decode()
    in_memory_db.add(User(email='a@nyaaa.com', name='A', password_hash=hashed,
                          role='officer', is_active=True))
    in_memory_db.commit()

    resp = api_client.post('/api/auth/login',
                           json={'email': 'a@nyaaa.com', 'password': 'secret123'})
    assert resp.status_code == 200
    data = resp.json()
    assert 'token' in data
    assert data['user']['role'] == 'officer'


def test_login_wrong_password_returns_401(api_client, in_memory_db):
    import bcrypt
    from models import User
    hashed = bcrypt.hashpw(b'correct', bcrypt.gensalt()).decode()
    in_memory_db.add(User(email='b@nyaaa.com', name='B', password_hash=hashed,
                          role='officer', is_active=True))
    in_memory_db.commit()

    resp = api_client.post('/api/auth/login',
                           json={'email': 'b@nyaaa.com', 'password': 'wrong'})
    assert resp.status_code == 401


def test_login_unknown_email_returns_401(api_client):
    resp = api_client.post('/api/auth/login',
                           json={'email': 'nobody@nyaaa.com', 'password': 'pass'})
    assert resp.status_code == 401


def test_login_inactive_user_returns_403(api_client, in_memory_db):
    import bcrypt
    from models import User
    hashed = bcrypt.hashpw(b'pass', bcrypt.gensalt()).decode()
    in_memory_db.add(User(email='inactive@nyaaa.com', name='I', password_hash=hashed,
                          role='officer', is_active=False))
    in_memory_db.commit()

    resp = api_client.post('/api/auth/login',
                           json={'email': 'inactive@nyaaa.com', 'password': 'pass'})
    assert resp.status_code == 403   # deactivated account → 403 Forbidden


# ── Auth: protected routes ────────────────────────────────────────────────────

def test_protected_route_without_token_returns_403(api_client):
    # FastAPI HTTPBearer returns 403 (not 401) when the Authorization header is absent
    resp = api_client.get('/api/auth/me')
    assert resp.status_code == 403


def test_protected_route_with_valid_token_returns_200(api_client, auth_headers):
    resp = api_client.get('/api/auth/me', headers=auth_headers)
    assert resp.status_code == 200
    assert 'email' in resp.json()


def test_protected_route_with_bad_token_returns_401(api_client):
    resp = api_client.get('/api/auth/me',
                          headers={'Authorization': 'Bearer totally.fake.token'})
    assert resp.status_code == 401


# ── Sales endpoints: structure validation ─────────────────────────────────────
# SF is mocked (returns []), so we test that endpoints respond correctly
# and return the expected JSON keys — not specific values.

def test_advisor_summary_returns_expected_keys(api_client, auth_headers):
    resp = api_client.get('/api/sales/advisors/summary',
                          params={'line': 'Travel', 'period': 12},
                          headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    for key in ('bookings', 'deals', 'win_rate', 'pipeline_value', 'line'):
        assert key in data, f"Missing key: {key}"


def test_advisor_summary_invalid_line_defaults_to_travel(api_client, auth_headers):
    resp = api_client.get('/api/sales/advisors/summary',
                          params={'line': 'INVALID'},
                          headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()['line'] == 'Travel'


def test_advisor_leaderboard_returns_advisors_list(api_client, auth_headers):
    resp = api_client.get('/api/sales/advisors/leaderboard',
                          params={'line': 'Travel'},
                          headers=auth_headers)
    assert resp.status_code == 200
    assert 'advisors' in resp.json()
    assert isinstance(resp.json()['advisors'], list)


def test_pipeline_stages_returns_stages_list(api_client, auth_headers):
    resp = api_client.get('/api/sales/pipeline/stages',
                          params={'line': 'Travel'},
                          headers=auth_headers)
    assert resp.status_code == 200
    assert 'stages' in resp.json()


def test_pipeline_forecast_returns_months_list(api_client, auth_headers):
    resp = api_client.get('/api/sales/pipeline/forecast',
                          params={'line': 'Travel', 'period': 12},
                          headers=auth_headers)
    assert resp.status_code == 200
    assert 'months' in resp.json()


def test_leads_volume_returns_expected_keys(api_client, auth_headers):
    resp = api_client.get('/api/sales/leads/volume',
                          params={'line': 'Travel'},
                          headers=auth_headers)
    assert resp.status_code == 200


def test_narrative_invalid_page_returns_error(api_client, auth_headers):
    resp = api_client.get('/api/sales/narrative',
                          params={'page': 'nonexistent', 'line': 'Travel'},
                          headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()['narrative'] is None


# ── Date range passthrough ────────────────────────────────────────────────────

def test_advisor_summary_accepts_explicit_date_range(api_client, auth_headers):
    resp = api_client.get('/api/sales/advisors/summary',
                          params={'line': 'Travel',
                                  'start_date': '2025-01-01',
                                  'end_date': '2025-12-31'},
                          headers=auth_headers)
    assert resp.status_code == 200


# ── Admin-only endpoints ──────────────────────────────────────────────────────

def test_users_list_requires_admin(api_client, auth_headers):
    """The /api/users endpoint requires admin role; test user is admin."""
    resp = api_client.get('/api/users', headers=auth_headers)
    assert resp.status_code == 200


def test_users_list_denied_for_officer(api_client, in_memory_db):
    import bcrypt
    from models import User
    hashed = bcrypt.hashpw(b'pass', bcrypt.gensalt()).decode()
    in_memory_db.add(User(email='officer@nyaaa.com', name='O',
                          password_hash=hashed, role='officer', is_active=True))
    in_memory_db.commit()
    resp = api_client.post('/api/auth/login',
                           json={'email': 'officer@nyaaa.com', 'password': 'pass'})
    token = resp.json()['token']
    headers = {'Authorization': f'Bearer {token}'}

    resp2 = api_client.get('/api/users', headers=headers)
    assert resp2.status_code == 403
