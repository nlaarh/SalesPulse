"""Unit tests for Power BI caching utility wrappers."""
import pbi_utils
import cache

def test_pbi_by_day_uses_caching(monkeypatch):
    captured = {}

    def fake_cached_query(key, fetch_fn, ttl=3600, disk_ttl=86400):
        captured["key"] = key
        captured["ttl"] = ttl
        captured["disk_ttl"] = disk_ttl
        return [{"date": "2026-05-01", "commission": 100.0, "sales": 1000.0, "txns": 5}]

    monkeypatch.setattr(cache, "cached_query", fake_cached_query)

    result = pbi_utils.pbi_by_day("Travel", "2026-05-01", "2026-05-23")

    assert result == [{"date": "2026-05-01", "commission": 100.0, "sales": 1000.0, "txns": 5}]
    assert captured["key"] == "pbi_by_day_v1_Travel_2026-05-01_2026-05-23"
    assert captured["ttl"] == 3600
    assert captured["disk_ttl"] == 86400


def test_pbi_by_branch_day_uses_caching(monkeypatch):
    captured = {}

    def fake_cached_query(key, fetch_fn, ttl=3600, disk_ttl=86400):
        captured["key"] = key
        captured["ttl"] = ttl
        captured["disk_ttl"] = disk_ttl
        return [{"branch": "Buffalo", "date": "2026-05-01", "commission": 50.0, "sales": 500.0}]

    monkeypatch.setattr(cache, "cached_query", fake_cached_query)

    result = pbi_utils.pbi_by_branch_day("Travel", "2026-05-01", "2026-05-23")

    assert result == [{"branch": "Buffalo", "date": "2026-05-01", "commission": 50.0, "sales": 500.0}]
    assert captured["key"] == "pbi_by_branch_day_v1_Travel_2026-05-01_2026-05-23"
    assert captured["ttl"] == 3600
    assert captured["disk_ttl"] == 86400
