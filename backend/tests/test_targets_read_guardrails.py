from unittest.mock import MagicMock

import cache
from models import AdvisorTarget, MonthlyAdvisorTarget


def test_monthly_targets_get_does_not_seed_or_backfill(api_client, auth_headers, monkeypatch, in_memory_db):
    in_memory_db.query(AdvisorTarget).delete()
    in_memory_db.query(MonthlyAdvisorTarget).delete()
    in_memory_db.commit()
    cache.clear_all(skip_protected=False)

    mock_travel = MagicMock(return_value=[
        {
            'name': 'New Advisor',
            'branch': 'Amherst',
            'date': '2026-01-15',
            'commission': 1000.0,
            'sales': 10000.0,
        },
    ])
    monkeypatch.setattr('pbi_client.travel_by_advisor_day', mock_travel)

    response = api_client.get('/api/targets/monthly/2026?line=Travel', headers=auth_headers)

    assert response.status_code == 200
    assert in_memory_db.query(AdvisorTarget).count() == 0
    assert in_memory_db.query(MonthlyAdvisorTarget).count() == 0
