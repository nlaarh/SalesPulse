from datetime import date

from routers.opportunity_scoring import build_goal_gap_focus


def test_goal_gap_focus_prioritizes_deals_until_gap_is_covered():
    opportunities = [
        {
            "Id": "low",
            "Name": "Low Value Quote",
            "Amount": 5_000,
            "Probability": 90,
            "StageName": "Quote",
            "CloseDate": "2026-05-28",
            "LastActivityDate": "2026-05-22",
            "PushCount": 0,
        },
        {
            "Id": "best",
            "Name": "Best Gap Deal",
            "Amount": 20_000,
            "Probability": 80,
            "StageName": "Quote",
            "CloseDate": "2026-05-25",
            "LastActivityDate": "2026-05-23",
            "PushCount": 0,
        },
        {
            "Id": "risky",
            "Name": "Risky Large Deal",
            "Amount": 50_000,
            "Probability": 10,
            "StageName": "New",
            "CloseDate": "2026-05-31",
            "LastActivityDate": "2026-04-01",
            "PushCount": 4,
        },
    ]

    result = build_goal_gap_focus(
        opportunities,
        monthly_gap=18_000,
        today=date(2026, 5, 24),
        owner_map={},
        limit=5,
    )

    assert result["gap"] == 18_000
    assert result["coverage_amount"] >= 18_000
    assert result["coverage_pct"] >= 100
    assert [opp["id"] for opp in result["opportunities"][:2]] == ["best", "low"]
    assert result["opportunities"][0]["expected_value"] == 16_000
    assert "Close this month" in result["opportunities"][0]["next_action"]


def test_goal_focus_endpoint_returns_gap_ranked_opportunities(api_client, auth_headers, monkeypatch):
    monkeypatch.setattr(
        "routers.sales_goal_focus.get_target_achievement",
        lambda **_: {
            "comm_rate": 10,
            "current_month": {
                "company": {
                    "target": 10_000,
                    "commission_actual": 8_000,
                    "actual": 8_000,
                },
            },
            "advisors": [],
        },
    )
    monkeypatch.setattr("routers.sales_goal_focus.get_owner_map", lambda: {"u1": "Advisor One"})
    monkeypatch.setattr("routers.sales_goal_focus.is_sales_agent", lambda *_: True)
    monkeypatch.setattr(
        "routers.sales_goal_focus.sf_query_all",
        lambda _q: [
            {
                "Id": "opp1",
                "Name": "May Close",
                "Amount": 25_000,
                "Probability": 80,
                "StageName": "Quote",
                "CloseDate": "2026-05-30",
                "LastActivityDate": "2026-05-23",
                "PushCount": 0,
                "OwnerId": "u1",
            },
        ],
    )

    response = api_client.get(
        "/api/sales/opportunities/goal-focus?line=Travel&metric=commission",
        headers=auth_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["gap"] == 2_000
    assert body["opportunities"][0]["id"] == "opp1"
    assert body["opportunities"][0]["goal_value"] == 2_500
