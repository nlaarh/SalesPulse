"""UAT Alignments Tests.

Asserts correctness of:
- Separate bookings visibility for Insurance agent profiles.
- Exact Cross-Sell summary cards counts and queries.
- Market Pulse Turning-65 active WCNY territory filtering.
"""

import pytest
from unittest.mock import MagicMock


def test_insurance_agent_profile_has_separate_bookings(api_client, auth_headers, monkeypatch):
    """Verify that agent_profile returns has_separate_bookings: True for both Travel and Insurance."""
    from sf_client import sf_parallel
    
    # Mock is_sales_agent to bypass whitelist checks in tests
    monkeypatch.setattr('routers.sales_agent_profile.is_sales_agent', lambda name, line: True)
    
    # Mock sf_parallel to return a minimal dataset needed by agent_profile
    mock_data = {
        'won_cur': [{'cnt': 5, 'rev': 5000.0, 'comm': 500.0}],
        'won_pri': [{'cnt': 4, 'rev': 4000.0, 'comm': 400.0}],
        'mo_rev_cur': [],
        'mo_rev_pri': [],
        'closed_cur': [],
        'closed_pri': [],
        'pipeline': [{'cnt': 2, 'rev': 2000.0}],
        'mo_opps': [],
        'early_opps': [],
        'top_opps': [],
        'recent_won': [],
        'pushed': [{'cnt': 0, 'rev': 0.0}],
        'stale': [{'cnt': 0}],
        'agent_opportunities': [],
        'agent_user': [{'Email': 'test@example.com'}],
        't_won': [{'cnt': 10, 'rev': 10000.0, 'comm': 1000.0}],
        't_won_month': [{'rev': 1000.0, 'comm': 100.0}],
        't_won_ytd': [{'rev': 8000.0, 'comm': 800.0}],
        'mo_leads': [],
        'open_tasks': [],
        'tasks_done_period': [{'cnt': 0}],
        'tasks_total_period': [{'cnt': 0}],
        't_closed': [{'cnt': 10}],
        't_agents': [],
    }
    
    mock_parallel = MagicMock(return_value=mock_data)
    monkeypatch.setattr('routers.sales_agent_profile.sf_parallel', mock_parallel)
    
    # Test with Travel line
    resp = api_client.get(
        '/api/sales/agent/profile',
        params={'name': 'Karl Kautsky', 'line': 'Travel'},
        headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data['has_separate_bookings'] is True
    
    # Test with Insurance line
    resp = api_client.get(
        '/api/sales/agent/profile',
        params={'name': 'Karl Kautsky', 'line': 'Insurance'},
        headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data['has_separate_bookings'] is True


def test_cross_sell_insights_exact_summary_counts(api_client, auth_headers, monkeypatch):
    """Verify that cross-sell insights endpoint returns accurate, un-clamped summary counts."""
    # Mock sf_instance_url to prevent outbound request to Salesforce oauth server
    monkeypatch.setattr('routers.cross_sell.sf_instance_url', lambda: 'https://test-instance.salesforce.com')
    
    mock_data = {
        'travel_raw': [{'AccountId': 'acc1', 'cnt': 1, 'total': 1000.0}],
        'insurance_raw': [{'AccountId': 'acc2', 'cnt': 2, 'total': 2000.0}],
        'ins_customers_alltime': [{'Id': 'acc2'}],
        'travel_customers_3yr': [{'AccountId': 'acc1'}],
        'ins_opp_alltime': [],
        'true_travel_rev': [{'total': 150000.0}],
        'true_insurance_rev': [{'total': 75000.0}],
        'true_travel_custs': [{'cnt': 150}],
        'true_insurance_custs': [{'cnt': 75}],
        'true_both_custs': [{'cnt': 25}],
        'true_needs_ins_custs': [{'cnt': 125}],
        'true_needs_travel_custs': [{'cnt': 50}],
    }
    
    mock_parallel = MagicMock(return_value=mock_data)
    monkeypatch.setattr('routers.cross_sell.sf_parallel', mock_parallel)
    
    # Mock _enrich_accounts to return details for mock accounts
    mock_enrich = MagicMock(return_value={
        'acc1': {'name': 'Acc One', 'membership': 'Basic', 'ltv': 'A'},
        'acc2': {'name': 'Acc Two', 'membership': 'Plus', 'ltv': 'B'},
    })
    monkeypatch.setattr('routers.cross_sell._enrich_accounts', mock_enrich)

    resp = api_client.get(
        '/api/cross-sell/insights',
        params={'period': 12},
        headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    
    # Check the summary response mapping
    summary = data['summary']
    assert summary['total_travel_customers'] == 150
    assert summary['total_insurance_customers'] == 75
    assert summary['customers_with_both'] == 25
    assert summary['needs_insurance_count'] == 125
    assert summary['needs_travel_count'] == 50
    assert summary['total_travel_revenue'] == 150000.0
    assert summary['total_insurance_revenue'] == 75000.0


def test_market_pulse_turning_65_query_alignment(api_client, auth_headers, monkeypatch):
    """Verify that market_pulse turning_65 query uses the strict active membership filter."""
    from sf_client import sf_parallel
    
    mock_data = {
        'travel_rollup': [],
        'medicare_count': [{'cnt': 10}],
        'turning_65': [{'cnt': 14880}],
        'expiring_90d': [{'cnt': 5664}],
        'expiring_30d': [{'cnt': 2183}],
        'expiring_premier': [{'cnt': 1000}],
        'expiring_plus': [{'cnt': 3000}],
        'expiring_basic': [{'cnt': 1664}],
        'basic_members': [{'cnt': 194000}],
    }
    
    mock_parallel = MagicMock(return_value=mock_data)
    monkeypatch.setattr('routers.market_pulse.sf_parallel', mock_parallel)
    
    resp = api_client.get(
        '/api/market-pulse',
        params={'period': 12},
        headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    
    assert data['metrics']['members_turning_65'] == 14880
    assert data['metrics']['expiring_memberships_90d'] == 5664
    assert data['metrics']['basic_tier_members'] == 194000
    
    # Assert sf_parallel was called, and the turning_65 query contains strict _exp_base terms:
    # ImportantActiveMemExpiryDate__c >= and ImportantActiveMemCoverage__c IN ('B','PLUS','PREMIER')
    assert mock_parallel.called
    called_queries = mock_parallel.call_args[1]
    
    assert 'turning_65' in called_queries
    t65_query = called_queries['turning_65']
    assert 'ImportantActiveMemExpiryDate__c >= ' in t65_query
    assert "ImportantActiveMemCoverage__c IN ('B','PLUS','PREMIER')" in t65_query
    assert 'Out_of_Territory_Member__c = false' in t65_query
    assert "Billing_Region__c IN ('Western','Rochester','Central')" in t65_query
