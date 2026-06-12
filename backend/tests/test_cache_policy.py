from datetime import date


def test_historical_date_range_uses_longer_ttls():
    from cache_policy import resolve_cache_ttls

    ttl, disk_ttl = resolve_cache_ttls(
        "advisor_summary_Travel_2025-04-01_2025-04-30",
        3600,
        86400,
        today=date(2026, 5, 23),
    )

    assert ttl == 86400
    assert disk_ttl == 86400 * 90


def test_current_month_date_range_keeps_short_ttls():
    from cache_policy import resolve_cache_ttls

    ttl, disk_ttl = resolve_cache_ttls(
        "advisor_summary_Travel_2026-05-01_2026-05-23",
        3600,
        86400,
        today=date(2026, 5, 23),
    )

    assert ttl == 600
    assert disk_ttl == 3600


def test_open_ended_or_dateless_keys_keep_existing_ttls():
    from cache_policy import resolve_cache_ttls

    ttl, disk_ttl = resolve_cache_ttls("pipeline_slipping_v2_Travel_2026-05-23", 1800, 43200)

    assert ttl == 1800
    assert disk_ttl == 43200
