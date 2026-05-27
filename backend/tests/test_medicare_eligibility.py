"""Unit tests for the Medicare Eligibility cross-sell endpoint."""

import pytest
from unittest.mock import MagicMock
from datetime import date


def test_medicare_eligibility_insights_endpoint(api_client, auth_headers, monkeypatch):
    """Verify that the Medicare eligibility cross-sell insights endpoint returns candidates, excludes existing opps, and scores correctly."""
    # Mock sf_instance_url
    monkeypatch.setattr('routers.cross_sell.sf_instance_url', lambda: 'https://test-instance.salesforce.com')

    today = date.today()
    birth_64 = date(today.year - 64, today.month, today.day).isoformat()
    birth_65 = date(today.year - 65, today.month, today.day).isoformat()

    mock_data = {
        'candidates': [
            {
                'Id': 'acc_high',
                'Name': 'High Priority Candidate',
                'Phone': '555-0001',
                'PersonEmail': 'high@example.com',
                'BillingCity': 'Buffalo',
                'LTV__c': 'A',
                'PersonBirthdate': birth_65,
                'ImportantActiveMemCoverage__c': 'PREMIER',
                'Account_Member_Since__c': '2015-01-01',
            },
            {
                'Id': 'acc_med',
                'Name': 'Medium Priority Candidate',
                'Phone': '555-0002',
                'PersonEmail': 'med@example.com',
                'BillingCity': 'Rochester',
                'LTV__c': 'C',
                'PersonBirthdate': birth_64,
                'ImportantActiveMemCoverage__c': 'PLUS',
                'Account_Member_Since__c': '2018-05-01',
            },
            {
                'Id': 'acc_excluded',
                'Name': 'Already Has Medicare Opp',
                'Phone': '555-0003',
                'PersonEmail': 'ex@example.com',
                'BillingCity': 'Syracuse',
                'LTV__c': 'B',
                'PersonBirthdate': birth_65,
                'ImportantActiveMemCoverage__c': 'PLUS',
                'Account_Member_Since__c': '2020-01-01',
            }
        ],
        'medicare_opps': [
            {'AccountId': 'acc_excluded'}
        ]
    }

    mock_parallel = MagicMock(return_value=mock_data)
    monkeypatch.setattr('routers.cross_sell.sf_parallel', mock_parallel)

    resp = api_client.get(
        '/api/cross-sell/medicare-eligibility',
        params={'period': 12},
        headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()

    # Verify summary structure
    summary = data['summary']
    assert summary['total_eligible'] == 2
    assert summary['high_priority_count'] == 1  # LTV A + PREMIER = 50 + 50 = 100 -> high
    assert summary['medium_priority_count'] == 1  # LTV C + PLUS = 30 + 40 = 70 -> medium
    assert summary['low_priority_count'] == 0

    # Verify candidates returned and acc_excluded is filtered out
    customers = data['customers']
    assert len(customers) == 2

    # High priority candidate assertions
    high_cust = next(c for c in customers if c['account_id'] == 'acc_high')
    assert high_cust['account_name'] == 'High Priority Candidate'
    assert high_cust['priority'] == 'high'
    assert high_cust['score'] == 100
    assert high_cust['days_until_65'] == 0  # born exactly 65 years ago today

    # Medium priority candidate assertions
    med_cust = next(c for c in customers if c['account_id'] == 'acc_med')
    assert med_cust['account_name'] == 'Medium Priority Candidate'
    assert med_cust['priority'] == 'medium'
    assert med_cust['score'] == 70
    assert med_cust['days_until_65'] == 365 or med_cust['days_until_65'] == 366  # turns 65 in 1 year

    # Excluded customer should not be in the list
    assert not any(c['account_id'] == 'acc_excluded' for c in customers)
