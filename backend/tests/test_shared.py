"""Unit tests for backend/shared.py.

Covers: resolve_dates, prev_dates, line_filter_opp, line_filter_lead,
        escape_soql, val helper.
"""

import pytest
from datetime import date
from dateutil.relativedelta import relativedelta
from shared import (
    resolve_dates, prev_dates,
    line_filter_opp, line_filter_lead,
    escape_soql, val,
    VALID_LINES, WON_STAGES,
)


# ── resolve_dates ─────────────────────────────────────────────────────────────

def test_resolve_dates_passthrough_explicit():
    sd, ed = resolve_dates('2025-01-01', '2025-12-31', 12)
    assert sd == '2025-01-01'
    assert ed == '2025-12-31'


def test_resolve_dates_computes_from_period():
    sd, ed = resolve_dates(None, None, 12)
    today = date.today()
    assert ed == today.isoformat()
    # start should be ~12 months ago, first of that month
    expected_start = (today - relativedelta(months=12)).replace(day=1)
    assert sd == expected_start.isoformat()


def test_resolve_dates_period_3():
    sd, ed = resolve_dates(None, None, 3)
    today = date.today()
    expected_start = (today - relativedelta(months=3)).replace(day=1)
    assert sd == expected_start.isoformat()


def test_resolve_dates_never_returns_none():
    """resolve_dates must always return concrete ISO dates, never None."""
    sd, ed = resolve_dates(None, None, 6)
    assert sd is not None and ed is not None
    assert '-' in sd and '-' in ed


def test_resolve_dates_only_start_provided_uses_period():
    """Partial input (only start_date) falls back to period computation."""
    sd, ed = resolve_dates('2025-01-01', None, 12)
    today = date.today()
    assert ed == today.isoformat()


# ── prev_dates ────────────────────────────────────────────────────────────────

def test_prev_dates_shifts_back_exactly_one_year():
    sd, ed = prev_dates('2025-01-01', '2025-12-31')
    assert sd == '2024-01-01'
    assert ed == '2024-12-31'


def test_prev_dates_handles_leap_year():
    sd, ed = prev_dates('2024-02-29', '2024-12-31')
    assert sd == '2023-02-28'   # dateutil clamps to Feb 28 on non-leap year
    assert ed == '2023-12-31'


def test_prev_dates_consistent_with_resolve_dates():
    """prev_dates output should itself be valid ISO date strings."""
    sd, ed = resolve_dates(None, None, 12)
    p_sd, p_ed = prev_dates(sd, ed)
    assert date.fromisoformat(p_sd) < date.fromisoformat(sd)
    assert date.fromisoformat(p_ed) < date.fromisoformat(ed)


# ── line_filter_opp ───────────────────────────────────────────────────────────

def test_line_filter_opp_travel():
    f = line_filter_opp('Travel')
    assert "RecordType.Name = 'Travel'" in f
    assert 'Insurance' not in f


def test_line_filter_opp_insurance():
    f = line_filter_opp('Insurance')
    assert "RecordType.Name = 'Insurance'" in f


def test_line_filter_opp_all():
    f = line_filter_opp('All')
    assert 'Travel' in f and 'Insurance' in f
    assert 'IN' in f


# ── line_filter_lead ──────────────────────────────────────────────────────────

def test_line_filter_lead_travel():
    f = line_filter_lead('Travel')
    assert "RecordType.Name = 'Travel'" in f


def test_line_filter_lead_all_includes_extra_types():
    f = line_filter_lead('All')
    assert 'Financial Services' in f
    assert 'Outbound Lead' in f


# ── escape_soql ───────────────────────────────────────────────────────────────

def test_escape_soql_single_quotes():
    assert escape_soql("O'Brien") == "O\\'Brien"


def test_escape_soql_backslash():
    assert escape_soql("C:\\path") == "C:\\\\path"


def test_escape_soql_clean_string_unchanged():
    assert escape_soql("John Smith") == "John Smith"


# ── val helper ────────────────────────────────────────────────────────────────

def test_val_extracts_default_cnt_field():
    assert val([{'cnt': 42}]) == 42


def test_val_custom_field():
    assert val([{'rev': 999}], 'rev') == 999


def test_val_empty_rows_returns_zero():
    assert val([]) == 0


def test_val_none_value_returns_zero():
    assert val([{'cnt': None}]) == 0


def test_val_missing_field_returns_zero():
    assert val([{}]) == 0


# ── Constants sanity ──────────────────────────────────────────────────────────

def test_valid_lines_contains_expected():
    assert {'Travel', 'Insurance', 'All'} == VALID_LINES


def test_won_stages_contains_both():
    assert 'Closed Won' in WON_STAGES
    assert 'Invoice' in WON_STAGES
