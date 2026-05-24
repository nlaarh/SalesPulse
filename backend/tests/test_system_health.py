import bcrypt
from uuid import uuid4

from models import User


def _superadmin_headers(api_client, db):
    email = f"superadmin-{uuid4().hex[:8]}@nyaaa.com"
    user = User(
        email=email,
        name="Super Admin",
        password_hash=bcrypt.hashpw(b"testpass123", bcrypt.gensalt()).decode(),
        role="superadmin",
        is_active=True,
    )
    db.add(user)
    db.commit()

    resp = api_client.post(
        "/api/auth/login",
        json={"email": email, "password": "testpass123"},
    )
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['token']}"}


def test_system_health_returns_salespulse_ui_contract(api_client, in_memory_db, monkeypatch):
    monkeypatch.setenv("SF_USERNAME", "apiintegration@nyaaa.com")
    monkeypatch.setenv("SF_CONSUMER_KEY", "sf-key")
    monkeypatch.setenv("SF_CONSUMER_SECRET", "sf-secret")
    monkeypatch.setenv("SF_TOKEN_URL", "https://test.salesforce.com/token")
    monkeypatch.setenv("POWERBI_CLIENT_ID", "powerbi-client")
    monkeypatch.setenv("OPENAI_API_KEY", "openai-key")
    monkeypatch.setenv("GITHUB_REPO", "nlaarh/SalesPulse")

    resp = api_client.get(
        "/api/admin/system/health",
        headers=_superadmin_headers(api_client, in_memory_db),
    )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["quota_safe"] is True
    assert payload["status"] in {"online", "degraded", "offline"}
    assert set(payload["services"]) >= {
        "salesforce",
        "postgres",
        "app",
        "pbi",
        "azure",
        "openai",
        "github",
    }
    assert payload["services"]["salesforce"]["host_link"].startswith("https://")
    assert payload["services"]["github"]["repo"] == "nlaarh/SalesPulse"
    assert payload["services"]["openai"]["live_ping"] is False
    assert payload["services"]["salesforce"]["live_ping"] is False
    assert payload["services"]["pbi"]["live_ping"] is False
    assert payload["services"]["postgres"]["logs"]
    assert payload["logs"]
    assert payload["env_variables"]["OPENAI_API_KEY"].startswith("op")


def test_system_health_ping_performs_live_check_and_caches(api_client, in_memory_db):
    headers = _superadmin_headers(api_client, in_memory_db)
    resp = api_client.post(
        "/api/admin/system/health/ping/openai",
        headers=headers,
    )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["service"] == "openai"
    assert payload["live_ping"] is True
    assert payload["status"] == "online"
    assert "completed successfully" in payload["message"].lower()

    resp2 = api_client.get(
        "/api/admin/system/health",
        headers=headers,
    )
    assert resp2.status_code == 200
    p2 = resp2.json()
    assert p2["services"]["openai"]["live_ping"] is True
    assert p2["services"]["openai"]["latency_ms"] == 15.0
    assert any("TEST MOCK" in l for l in p2["services"]["openai"]["logs"])



def test_system_health_is_superadmin_only(api_client, auth_headers):
    resp = api_client.get("/api/admin/system/health", headers=auth_headers)

    assert resp.status_code == 403
