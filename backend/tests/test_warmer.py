"""Tests for backend/warmer.py — sequential nightly warm job."""
import time
import pytest
from unittest.mock import patch, MagicMock


def test_warm_endpoints_records_success_and_failure(monkeypatch, tmp_path):
    """Warmer runs each endpoint, records per-endpoint result, persists to DB."""
    monkeypatch.setenv('ENABLE_CACHE_V2', 'true')

    # Stub endpoint callables
    def ok_fn():
        return {'data': [1, 2, 3]}
    def fail_fn():
        raise RuntimeError("fake failure")

    endpoints = [
        ('/api/ok', ok_fn),
        ('/api/fail', fail_fn),
    ]

    # Import after env set
    import importlib, warmer
    importlib.reload(warmer)

    # Run warm with stub endpoints
    summary = warmer._run_warm_sequence(endpoints, trigger='test', sleep_between=0)

    assert summary['endpoints_total'] == 2
    assert summary['endpoints_success'] == 1
    assert summary['endpoints_failed'] == 1
    assert any(e['endpoint'] == '/api/ok' and e['ok'] for e in summary['log'])
    assert any(e['endpoint'] == '/api/fail' and not e['ok'] for e in summary['log'])
