from datetime import date


def test_historical_force_refresh_only_invalidates_aggregate_for_non_admin(monkeypatch):
    import routers.sales_dashboard as dashboard

    invalidated = []
    monkeypatch.setattr(dashboard.cache, 'invalidate', lambda key: invalidated.append(key))
    monkeypatch.setattr(dashboard, 'date', type('FixedDate', (), {
        'today': staticmethod(lambda: date(2026, 5, 23)),
    }))

    dashboard._invalidate_dashboard_scope(
        'advisor_dashboard_Travel_12_2025-04-01_2025-04-30_2026',
        'Travel',
        '2025-04-01',
        '2025-04-30',
        2026,
        allow_source_refresh=False,
    )

    assert invalidated == ['advisor_dashboard_Travel_12_2025-04-01_2025-04-30_2026']


def test_current_force_refresh_can_invalidate_component_keys(monkeypatch):
    import routers.sales_dashboard as dashboard

    invalidated = []
    monkeypatch.setattr(dashboard.cache, 'invalidate', lambda key: invalidated.append(key))

    dashboard._invalidate_dashboard_scope(
        'advisor_dashboard_Travel_12_2026-05-01_2026-05-23_2026',
        'Travel',
        '2026-05-01',
        '2026-05-23',
        2026,
        allow_source_refresh=True,
    )

    assert 'advisor_dashboard_Travel_12_2026-05-01_2026-05-23_2026' in invalidated
    assert 'advisor_summary_v2_Travel_2026-05-01_2026-05-23' in invalidated
