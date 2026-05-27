import pytest
from unittest.mock import MagicMock
from routers.ai_queries_data import (
    fetch_advisor_rankings,
    fetch_revenue_trends,
    fetch_win_rate_data,
    fetch_funnel_data,
    fetch_general_metrics,
    fetch_forecasting_data,
    fetch_industry_data,
)

@pytest.fixture(autouse=True)
def bypass_cache(monkeypatch):
    """Bypass caching completely so test queries run the fetch logic fresh every time."""
    monkeypatch.setattr("cache.cached_query", lambda key, fetch_fn, *args, **kwargs: fetch_fn())


@pytest.fixture(autouse=True)
def mock_owner_map(monkeypatch):
    """Mock shared.get_owner_map to return a static mapping and avoid Salesforce queries."""
    monkeypatch.setattr("shared.get_owner_map", lambda *args, **kwargs: {
        "0050000001": "Advisor A",
        "0050000002": "Advisor B",
    })


@pytest.fixture(autouse=True)
def mock_sf_for_ai(monkeypatch):
    """Mock sf_query_all and sf_parallel directly on routers.ai_queries_data or sf_client."""
    mock_query_all = MagicMock(return_value=[])
    mock_parallel = MagicMock(return_value={})
    monkeypatch.setattr("routers.ai_queries_data.sf_query_all", mock_query_all)
    monkeypatch.setattr("sf_client.sf_parallel", mock_parallel)
    monkeypatch.setattr("sf_client.sf_query_all", mock_query_all)
    return mock_query_all, mock_parallel


@pytest.fixture
def mock_pbi(monkeypatch):
    """Mock the Power BI utilities to avoid calling the real Power BI service/DAX."""
    mock_by_advisor = MagicMock(return_value=[
        {"name": "Advisor A", "branch": "Rochester", "commission": 1500.0, "sales": 10000.0, "txns": 5},
        {"name": "Advisor B", "branch": "Western", "commission": 2000.0, "sales": 15000.0, "txns": 8},
    ])
    mock_by_day = MagicMock(return_value=[
        {"date": "2026-05-01", "commission": 500.0, "sales": 3000.0, "txns": 2},
        {"date": "2026-05-15", "commission": 1000.0, "sales": 7000.0, "txns": 4},
    ])
    monkeypatch.setattr("pbi_utils.pbi_by_advisor", mock_by_advisor)
    monkeypatch.setattr("pbi_utils.pbi_by_day", mock_by_day)
    return mock_by_advisor, mock_by_day


def test_fetch_advisor_rankings_pbi(mock_pbi, mock_sf_for_ai):
    """Verify advisor rankings route through Power BI for Travel/Insurance."""
    mock_by_advisor, _ = mock_pbi
    mock_query_all, _ = mock_sf_for_ai

    # Travel
    res = fetch_advisor_rankings("Travel")
    assert mock_by_advisor.call_count == 1
    assert mock_query_all.call_count == 0  # No Salesforce calls for advisor rankings on Travel
    assert len(res["advisors"]) == 2
    assert res["advisors"][0]["name"] == "Advisor B"  # Sorted by sales
    assert res["advisors"][0]["revenue"] == 15000.0

    # Insurance
    mock_by_advisor.reset_mock()
    res_ins = fetch_advisor_rankings("Insurance")
    assert mock_by_advisor.call_count == 1
    assert len(res_ins["advisors"]) == 2


def test_fetch_advisor_rankings_sf_fallback(mock_pbi, mock_sf_for_ai):
    """Verify advisor rankings fallback to Salesforce for non-PBI lines (e.g. All)."""
    mock_by_advisor, _ = mock_pbi
    mock_query_all, _ = mock_sf_for_ai

    # SF response mock
    mock_query_all.return_value = [
        {"OwnerId": "0050000001", "cnt": 10, "total": 50000.0}
    ]

    res = fetch_advisor_rankings("All")
    assert mock_by_advisor.call_count == 0  # Power BI not called
    assert mock_query_all.call_count == 1  # Salesforce called exactly once (get_owner_map is mocked)
    assert len(res["advisors"]) == 1
    assert res["advisors"][0]["revenue"] == 50000.0
    assert res["advisors"][0]["name"] == "Advisor A"  # Resolved via mocked get_owner_map


def test_fetch_revenue_trends_pbi(mock_pbi, mock_sf_for_ai):
    """Verify revenue trends route through Power BI for Travel/Insurance."""
    _, mock_by_day = mock_pbi
    mock_query_all, _ = mock_sf_for_ai

    res = fetch_revenue_trends("Travel")
    assert mock_by_day.call_count == 1
    assert mock_query_all.call_count == 0
    assert res["total_revenue"] == 10000.0
    assert res["total_deals"] == 6
    assert len(res["monthly"]) == 1
    assert res["monthly"][0]["year"] == 2026
    assert res["monthly"][0]["month"] == 5


def test_fetch_revenue_trends_sf_fallback(mock_pbi, mock_sf_for_ai):
    """Verify revenue trends fall back to Salesforce for non-PBI lines."""
    _, mock_by_day = mock_pbi
    mock_query_all, _ = mock_sf_for_ai

    mock_query_all.return_value = [
        {"yr": 2025, "mo": 12, "cnt": 4, "rev": 20000.0}
    ]

    res = fetch_revenue_trends("All")
    assert mock_by_day.call_count == 0
    assert mock_query_all.call_count == 1
    assert res["total_revenue"] == 20000.0
    assert res["total_deals"] == 4


def test_fetch_win_rate_data_pbi(mock_pbi, mock_sf_for_ai):
    """Verify win rate data routes won stats through Power BI and only queries Salesforce for Closed Lost."""
    mock_by_advisor, mock_by_day = mock_pbi
    mock_query_all, _ = mock_sf_for_ai

    # SF returns lost count/revenue
    mock_query_all.return_value = [{"cnt": 2, "rev": 5000.0}]

    res = fetch_win_rate_data("Travel")
    assert mock_by_day.call_count == 1
    assert mock_by_advisor.call_count == 1
    assert mock_query_all.call_count == 1  # Only 1 query to SF for Lost deals
    assert res["won_count"] == 6
    assert res["won_revenue"] == 10000.0
    assert res["lost_count"] == 2
    assert res["lost_revenue"] == 5000.0
    assert res["win_rate"] == 75.0  # 6 / 8 * 100
    assert len(res["top_winners"]) == 2


def test_fetch_win_rate_sf_fallback(mock_pbi, mock_sf_for_ai):
    """Verify win rate falls back completely to Salesforce for non-PBI lines."""
    mock_by_advisor, mock_by_day = mock_pbi
    _, mock_parallel = mock_sf_for_ai

    # Mock parallel responses for Salesforce
    mock_parallel.return_value = {
        "won": [{"cnt": 10, "rev": 100000.0}],
        "lost": [{"cnt": 5, "rev": 25000.0}],
        "top": [{"OwnerId": "0050000001", "cnt": 10, "rev": 100000.0}]
    }

    res = fetch_win_rate_data("All")
    assert mock_by_day.call_count == 0
    assert mock_by_advisor.call_count == 0
    assert mock_parallel.call_count == 1
    assert res["win_rate"] == 66.7  # 10 / 15 * 100


def test_fetch_funnel_data_pbi(mock_pbi, mock_sf_for_ai):
    """Verify conversion funnel routes won stats through Power BI and queries Salesforce in parallel for other stages."""
    _, mock_by_day = mock_pbi
    _, mock_parallel = mock_sf_for_ai

    mock_parallel.return_value = {
        "leads": [{"cnt": 20}],
        "converted": [{"cnt": 10}],
        "invoiced": [{"cnt": 5}],
        "lost": [{"cnt": 2}]
    }

    res = fetch_funnel_data("Travel")
    assert mock_by_day.call_count == 1
    assert mock_parallel.call_count == 1
    assert res["won"] == 6
    assert res["won_revenue"] == 10000.0
    assert res["leads"] == 20
    assert res["converted"] == 10
    assert res["invoiced"] == 5
    assert res["lost"] == 2
    assert res["win_rate"] == 75.0  # 6 / 8 * 100


def test_fetch_funnel_sf_fallback(mock_pbi, mock_sf_for_ai):
    """Verify conversion funnel falls back completely to Salesforce for non-PBI lines."""
    _, mock_by_day = mock_pbi
    _, mock_parallel = mock_sf_for_ai

    mock_parallel.return_value = {
        "leads": [{"cnt": 20}],
        "converted": [{"cnt": 10}],
        "invoiced": [{"cnt": 5}],
        "won": [{"cnt": 8, "rev": 15000.0}],
        "lost": [{"cnt": 2}]
    }

    res = fetch_funnel_data("All")
    assert mock_by_day.call_count == 0
    assert mock_parallel.call_count == 1
    assert res["won"] == 8
    assert res["won_revenue"] == 15000.0


def test_fetch_general_metrics_pbi(mock_pbi, mock_sf_for_ai):
    """Verify general metrics route won stats through Power BI and query Salesforce for pipeline/open items."""
    _, mock_by_day = mock_pbi
    _, mock_parallel = mock_sf_for_ai

    mock_parallel.return_value = {
        "open_pipe": [{"cnt": 15, "rev": 45000.0, "avg_amt": 3000.0}],
        "top_wins": [],
        "closing": [{"cnt": 3, "rev": 9000.0}]
    }

    res = fetch_general_metrics("Travel")
    assert mock_by_day.call_count == 1
    assert mock_parallel.call_count == 1
    assert res["won_this_month"] == 6
    assert res["won_this_month_rev"] == 10000.0
    assert res["open_deals"] == 15
    assert res["open_pipeline_value"] == 45000.0


def test_fetch_general_metrics_sf_fallback(mock_pbi, mock_sf_for_ai):
    """Verify general metrics fall back completely to Salesforce for non-PBI lines."""
    _, mock_by_day = mock_pbi
    _, mock_parallel = mock_sf_for_ai

    mock_parallel.return_value = {
        "open_pipe": [{"cnt": 15, "rev": 45000.0, "avg_amt": 3000.0}],
        "won_month": [{"cnt": 8, "rev": 15000.0}],
        "top_wins": [],
        "closing": [{"cnt": 3, "rev": 9000.0}]
    }

    res = fetch_general_metrics("All")
    assert mock_by_day.call_count == 0
    assert mock_parallel.call_count == 1
    assert res["won_this_month"] == 8
    assert res["won_this_month_rev"] == 15000.0


def test_fetch_forecasting_data_qtr(mock_sf_for_ai):
    """Verify forecasting data correctly partitions pipeline by quarter."""
    mock_query_all, _ = mock_sf_for_ai
    mock_query_all.return_value = [
        {"yr": 2026, "mo": 10, "StageName": "Qualification", "cnt": 5, "rev": 50000.0, "avg_prob": 20.0},
        {"yr": 2026, "mo": 11, "StageName": "Closed Won", "cnt": 2, "rev": 20000.0, "avg_prob": 100.0},
    ]

    res = fetch_forecasting_data("Travel")
    assert res["total_pipeline"] == 70000.0
    assert res["weighted_forecast"] == 30000.0  # (50000*0.2) + (20000*1.0) = 10000 + 20000 = 30000
    assert len(res["quarters"]) == 1
    q4 = res["quarters"][0]
    assert q4["year"] == 2026
    assert q4["quarter"] == 4
    assert q4["label"] == "2026-Q4"
    assert q4["deals"] == 7
    assert q4["pipeline_value"] == 70000.0


def test_fetch_industry_growth_yoy(mock_sf_for_ai):
    """Verify industry growth correctly calculates YoY growth percentages."""
    _, mock_parallel = mock_sf_for_ai
    mock_parallel.return_value = {
        "won_curr": [{"ind": "Technology", "cnt": 10, "rev": 100000.0}],
        "lost": [{"ind": "Technology", "cnt": 5}],
        "won_prior": [{"ind": "Technology", "rev": 50000.0}],
    }

    res = fetch_industry_data("Travel")
    assert len(res["industries"]) == 1
    tech = res["industries"][0]
    assert tech["industry"] == "Technology"
    assert tech["won"] == 10
    assert tech["lost"] == 5
    assert tech["revenue"] == 100000.0
    assert tech["prior_revenue"] == 50000.0
    assert tech["yoy_growth_pct"] == 100.0
    assert tech["win_rate"] == 66.7
