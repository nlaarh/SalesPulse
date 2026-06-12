"""Login-path performance tests."""

import time


def test_activity_logging_does_not_wait_for_caller_db_commit():
    """Activity logging must not add DB commit latency to hot request paths."""
    from activity_logger import log_activity

    class SlowDb:
        def add(self, _entry):
            pass

        def commit(self):
            time.sleep(1)

        def rollback(self):
            pass

    started = time.monotonic()
    log_activity(
        SlowDb(),
        action='login',
        category='auth',
        user_email='fast@example.com',
    )
    elapsed = time.monotonic() - started

    assert elapsed < 0.2


def test_login_does_not_wait_for_session_row_commit(api_client, in_memory_db, monkeypatch):
    """Successful login should issue JWT before best-effort session persistence."""
    import bcrypt
    from models import User

    hashed = bcrypt.hashpw(b'secret123', bcrypt.gensalt()).decode()
    in_memory_db.add(User(email='fast-login@nyaaa.com', name='Fast Login',
                          password_hash=hashed, role='executive', is_active=True))
    in_memory_db.commit()

    def slow_session_create(*_, **__):
        time.sleep(1)

    monkeypatch.setattr('routers.users._create_session_for_user', slow_session_create)

    started = time.monotonic()
    resp = api_client.post('/api/auth/login',
                           json={'email': 'fast-login@nyaaa.com', 'password': 'secret123'})
    elapsed = time.monotonic() - started

    assert resp.status_code == 200
    assert resp.json()['token']
    assert elapsed < 0.8
