"""Unit tests for backend/sf_client.py.

Tests the validation and rate-limiting logic without making real SF calls.
All actual HTTP calls are blocked via monkeypatching.
"""

import pytest
from unittest.mock import patch, MagicMock
from sf_client import _validate, RateLimitExceeded, _rate_check, _call_times, _RATE_LIMIT


# ── Query validation ──────────────────────────────────────────────────────────

def test_validate_accepts_select():
    _validate('SELECT Id FROM Opportunity')   # should not raise


def test_validate_accepts_select_with_leading_whitespace():
    _validate('   SELECT Id FROM Lead   ')


def test_validate_blocks_insert():
    with pytest.raises(ValueError, match='DML not allowed'):
        _validate('INSERT INTO Foo VALUES (1)')


def test_validate_blocks_update():
    with pytest.raises(ValueError, match='DML not allowed'):
        _validate('UPDATE Account SET Name = "X"')


def test_validate_blocks_delete():
    with pytest.raises(ValueError, match='DML not allowed'):
        _validate('DELETE FROM Contact WHERE Id = "X"')


def test_validate_blocks_non_select():
    with pytest.raises(ValueError, match='Only SELECT queries allowed'):
        _validate('DESCRIBE Opportunity')


def test_validate_case_insensitive_dml_block():
    with pytest.raises(ValueError):
        _validate('insert into Foo values (1)')


# ── Rate limiter ──────────────────────────────────────────────────────────────

def test_rate_check_allows_under_limit():
    """First call should never raise."""
    import sf_client
    sf_client._call_times.clear()
    _rate_check()   # should not raise
    sf_client._call_times.clear()


def test_rate_check_raises_at_limit():
    """Fill the window to the limit; next call must raise RateLimitExceeded."""
    import time, sf_client
    now = time.time()
    sf_client._call_times[:] = [now] * sf_client._RATE_LIMIT  # saturate
    with pytest.raises(RateLimitExceeded):
        _rate_check()
    sf_client._call_times.clear()


def test_rate_check_allows_after_window_expires():
    """Calls older than _RATE_WINDOW should be evicted and not count."""
    import time, sf_client
    old = time.time() - sf_client._RATE_WINDOW - 1   # outside the window
    sf_client._call_times[:] = [old] * sf_client._RATE_LIMIT
    _rate_check()   # should NOT raise — old calls are evicted
    sf_client._call_times.clear()


def test_rate_limit_per_worker_is_20():
    """Regression: rate limit must be 20 per worker (not 60) to respect SF org limit."""
    import sf_client
    assert sf_client._RATE_LIMIT == 20, (
        f"Rate limit is {sf_client._RATE_LIMIT} — should be 20 "
        "(3 workers × 20 = 60 total = SF org quota)"
    )


# ── sf_parallel ───────────────────────────────────────────────────────────────

def test_sf_parallel_returns_dict_with_all_keys():
    from sf_client import sf_parallel
    with patch('sf_client.sf_query_all', return_value=[{'Id': '1'}]):
        result = sf_parallel(q1='SELECT Id FROM A', q2='SELECT Id FROM B')
    assert 'q1' in result and 'q2' in result


def test_sf_parallel_handles_individual_failure_gracefully():
    """A failure in one query should not crash the others."""
    from sf_client import sf_parallel

    def fail_on_q1(query, **_):
        if 'A' in query:
            raise RuntimeError('SF error')
        return [{'Id': 'ok'}]

    with patch('sf_client.sf_query_all', side_effect=fail_on_q1):
        result = sf_parallel(q1='SELECT Id FROM A', q2='SELECT Id FROM B')

    assert result['q1'] == []       # failed query returns empty list
    assert result['q2'] == [{'Id': 'ok'}]
