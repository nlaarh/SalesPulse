"""Tests for backend/warmer.py — sequential nightly warm job."""
import time
import threading
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


def test_warm_sequence_does_not_block_on_hung_thread(monkeypatch):
    """When a callable hangs beyond PER_QUERY_TIMEOUT, _run_warm_sequence returns
    promptly instead of blocking until the thread finishes (the old `with` pattern
    called shutdown(wait=True) which would block forever).
    """
    monkeypatch.setenv('ENABLE_CACHE_V2', 'true')

    import importlib, warmer
    importlib.reload(warmer)

    # Use a very short timeout so the test is fast
    monkeypatch.setattr(warmer, 'PER_QUERY_TIMEOUT', 0.5)

    hang_started = threading.Event()

    def hanging_fn():
        hang_started.set()
        # Simulate a truly hung SF call — sleep far longer than the timeout
        time.sleep(30)

    endpoints = [('/api/hung', hanging_fn)]

    wall_start = time.monotonic()
    summary = warmer._run_warm_sequence(endpoints, trigger='test', sleep_between=0)
    wall_elapsed = time.monotonic() - wall_start

    # Must have recorded a timeout failure
    assert summary['endpoints_failed'] == 1
    assert summary['log'][0]['error'].startswith('timeout')

    # The key assertion: we returned in ~0.5s (the timeout), NOT 30s (the hang).
    # Allow generous headroom (3s) but it must be well under 30s.
    assert wall_elapsed < 3.0, (
        f"_run_warm_sequence blocked {wall_elapsed:.1f}s — "
        f"shutdown(wait=False) is not working"
    )
