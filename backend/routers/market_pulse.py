"""Market Pulse — External intelligence feed for proactive sales.

Aggregates travel advisories, seasonal patterns, Medicare enrollment
calendar, and internal SF data to surface actionable alerts for advisors.
No external PII matching — signals match against internal SF fields only.
"""

import logging
from datetime import date, datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Query

from sf_client import sf_query_all, sf_parallel
from shared import (
    resolve_dates as _resolve_dates,
    OPP_RT_TRAVEL_ID, OPP_RT_INSURANCE_ID, WON_STAGES,
    get_owner_map,
)
from pbi_client import dax_query, PBI_WS
MEMBERSHIP_DS = "d7cdf3bc-dcf4-48ed-b4bb-200563dcfd7f"
from constants import CACHE_TTL_DAY
import cache
from routers.market_pulse_destinations import (
    _match_advisories_to_trips, register_routes as _register_dest_routes,
)

router = APIRouter()
log = logging.getLogger(__name__)

OPP_RT_MEDICARE_ID = '012Pb0000006hIhIAI'
DOMESTIC_DESTINATIONS = {'United States', 'Alaska', 'Hawaii', 'Walt Disney World'}

# ── Travel Advisory levels ───────────────────────────────────────────────────

ADVISORY_LEVELS = {
    1: {'label': 'Exercise Normal Precautions', 'severity': 'low'},
    2: {'label': 'Exercise Increased Caution', 'severity': 'medium'},
    3: {'label': 'Reconsider Travel', 'severity': 'high'},
    4: {'label': 'Do Not Travel', 'severity': 'critical'},
}

# Map destination names to country names for advisory title matching
DESTINATION_COUNTRIES = {
    'Caribbean': ['Jamaica', 'Dominican Republic', 'Trinidad', 'Barbados', 'Cuba', 'Haiti', 'Bahamas'],
    'Mexico': ['Mexico'],
    'Europe': ['France', 'Germany', 'Italy', 'Spain', 'United Kingdom', 'Portugal', 'Greece', 'Netherlands', 'Belgium', 'Austria', 'Switzerland', 'Ireland'],
    'Italy': ['Italy'],
    'France': ['France'],
    'Ireland': ['Ireland'],
    'Great Britian': ['United Kingdom'],
    'Asia': ['Japan', 'China', 'Thailand', 'Vietnam', 'South Korea', 'India', 'Philippines', 'Singapore', 'Malaysia', 'Indonesia'],
    'Bahamas': ['Bahamas'],
    'European River Cruise': ['France', 'Germany', 'Austria', 'Hungary', 'Netherlands', 'Switzerland'],
    'Canada': ['Canada'],
    'Alaska': [],
    'Hawaii': [],
    'Walt Disney World': [],
    'United States': [],
}

# ── Medicare Enrollment Calendar ─────────────────────────────────────────────

def _medicare_calendar_alerts(today: date) -> list[dict]:
    """Generate Medicare enrollment period alerts based on current date."""
    alerts = []
    year = today.year

    # Annual Enrollment Period: Oct 15 – Dec 7
    aep_start = date(year, 10, 15)
    aep_end = date(year, 12, 7)
    days_to_aep = (aep_start - today).days

    if aep_start <= today <= aep_end:
        days_left = (aep_end - today).days
        alerts.append({
            'type': 'medicare_enrollment',
            'severity': 'high' if days_left <= 14 else 'medium',
            'title': 'Medicare Annual Enrollment — NOW OPEN',
            'summary': f'Annual Enrollment Period ends in {days_left} days (Dec 7). '
                       f'Members can switch Medicare Advantage and Part D plans.',
            'action': 'Contact eligible members who haven\'t enrolled yet',
            'deadline': aep_end.isoformat(),
            'days_remaining': days_left,
            'icon': 'shield',
        })
    elif 0 < days_to_aep <= 60:
        alerts.append({
            'type': 'medicare_enrollment',
            'severity': 'medium' if days_to_aep <= 30 else 'low',
            'title': f'Medicare Annual Enrollment Opens in {days_to_aep} Days',
            'summary': f'AEP runs Oct 15 – Dec 7. Start preparing outreach lists '
                       f'for members turning 65 and existing Medicare enrollees.',
            'action': 'Build call lists for Medicare-eligible members',
            'deadline': aep_start.isoformat(),
            'days_remaining': days_to_aep,
            'icon': 'shield',
        })

    # Open Enrollment Period: Jan 1 – Mar 31
    oep_start = date(year, 1, 1)
    oep_end = date(year, 3, 31)
    if oep_start <= today <= oep_end:
        days_left = (oep_end - today).days
        alerts.append({
            'type': 'medicare_enrollment',
            'severity': 'medium' if days_left <= 14 else 'low',
            'title': 'Medicare Open Enrollment — Active',
            'summary': f'Open Enrollment Period ends in {days_left} days (Mar 31). '
                       f'Medicare Advantage members can switch to another MA plan or Original Medicare.',
            'action': 'Follow up with MA members considering plan changes',
            'deadline': oep_end.isoformat(),
            'days_remaining': days_left,
            'icon': 'shield',
        })

    # Initial Enrollment: members turning 65 (3 months before to 3 months after birth month)
    # Always relevant — generate a standing alert about upcoming birthdays
    alerts.append({
        'type': 'medicare_turning_65',
        'severity': 'info',
        'title': 'Members Turning 65 — Ongoing IEP Outreach',
        'summary': 'Initial Enrollment Period (IEP) runs 3 months before to 3 months '
                   'after a member\'s 65th birthday month. Contact members proactively.',
        'action': 'Review Medicare-eligible members list',
        'icon': 'cake',
    })

    return alerts


# ── Seasonal Travel Intelligence ─────────────────────────────────────────────

def _seasonal_alerts(today: date) -> list[dict]:
    """Time-based travel industry intelligence."""
    month = today.month
    alerts = []

    # Hurricane season: Jun 1 – Nov 30
    if 6 <= month <= 11:
        alerts.append({
            'type': 'seasonal',
            'severity': 'medium' if 8 <= month <= 10 else 'low',
            'title': 'Atlantic Hurricane Season Active',
            'summary': 'Hurricane season runs June–November, peaking Aug–Oct. '
                       'Caribbean, Gulf Coast, and SE US trips are at elevated risk.',
            'action': 'Recommend travel insurance for Caribbean and coastal bookings',
            'icon': 'cloud-lightning',
        })
    elif month == 5:
        alerts.append({
            'type': 'seasonal',
            'severity': 'low',
            'title': 'Hurricane Season Approaching (June 1)',
            'summary': 'Atlantic hurricane season starts June 1. '
                       'Proactively contact customers with summer Caribbean trips.',
            'action': 'Cross-sell travel insurance to Caribbean travelers',
            'icon': 'cloud-lightning',
        })

    # Peak booking season: Jan–Mar (summer travel planning)
    if 1 <= month <= 3:
        alerts.append({
            'type': 'seasonal',
            'severity': 'info',
            'title': 'Peak Travel Booking Season',
            'summary': 'January through March is the busiest booking period for summer travel. '
                       'Focus on upselling insurance and premium packages.',
            'action': 'Bundle travel insurance with new bookings',
            'icon': 'trending-up',
        })

    # Holiday travel: Oct–Nov (booking for Thanksgiving/Christmas/New Year)
    if 10 <= month <= 11:
        alerts.append({
            'type': 'seasonal',
            'severity': 'info',
            'title': 'Holiday Travel Booking Window',
            'summary': 'Customers are booking Thanksgiving, Christmas, and New Year trips. '
                       'Higher traveler counts (families) = bigger insurance opportunities.',
            'action': 'Focus on family travel packages + group insurance',
            'icon': 'gift',
        })

    # Summer travel insurance reminder: Apr–May
    if 4 <= month <= 5:
        alerts.append({
            'type': 'seasonal',
            'severity': 'info',
            'title': 'Summer Trip Insurance Window',
            'summary': 'Many summer trips are already booked. '
                       'Contact travelers departing Jun–Aug who lack insurance.',
            'action': 'Review upcoming international departures without insurance',
            'icon': 'umbrella',
        })

    # Membership renewal: always relevant (placeholder — enriched in endpoint with real data)
    alerts.append({
        'type': 'membership',
        'severity': 'info',
        'title': 'Membership Renewals — Upgrade Opportunity',
        'summary': '',  # Filled in by endpoint with real tier breakdown
        'action': 'Review expiring memberships for upgrade candidates',
        'icon': 'arrow-up-circle',
    })

    return alerts


# ── State Dept Travel Advisories ─────────────────────────────────────────────

def _fetch_travel_advisories() -> list[dict]:
    """Fetch current US State Dept travel advisories (level 2+) from RSS feed.

    Uses the public travel.state.gov RSS. Returns advisories for countries
    that match our active travel destinations.
    """
    key = 'market_pulse_advisories'
    cached = cache.get(key)
    if cached is not None:
        return cached

    try:
        resp = httpx.get(
            'https://travel.state.gov/_res/rss/TAsTWs.xml',
            timeout=15,
            follow_redirects=True,
        )
        if resp.status_code != 200:
            log.warning(f"State Dept RSS returned {resp.status_code}")
            return []

        import xml.etree.ElementTree as ET
        root = ET.fromstring(resp.text)
        advisories = []

        # Build set of country names we care about
        relevant_names = set()
        for names in DESTINATION_COUNTRIES.values():
            relevant_names.update(n.lower() for n in names)

        for item in root.findall('.//item'):
            title = item.findtext('title', '')

            level = 0
            if 'Level 4' in title:
                level = 4
            elif 'Level 3' in title:
                level = 3
            elif 'Level 2' in title:
                level = 2

            if level < 2:
                continue

            # Match by country name in title (State Dept uses FIPS codes, not ISO)
            title_lower = title.lower()
            matched_name = None
            for name in relevant_names:
                if name in title_lower:
                    matched_name = name.title()
                    break

            if not matched_name:
                continue

            pub_date = item.findtext('pubDate', '')
            advisories.append({
                'country_name': matched_name,
                'level': level,
                **ADVISORY_LEVELS.get(level, {}),
                'date_updated': pub_date,
            })

        cache.put(key, advisories, ttl=CACHE_TTL_DAY)
        return advisories

    except Exception as e:
        log.warning(f"Failed to fetch travel advisories: {e}")
        return []


def _safe_birthday_window(today: date) -> tuple[date, date]:
    """Return birthdate range for members turning 65 in next 12 months."""
    try:
        start = date(today.year - 65, today.month, today.day)
    except ValueError:
        # Handles Feb 29 on non-leap years.
        start = date(today.year - 65, today.month, 28)
    try:
        end = date(today.year - 64, today.month, today.day)
    except ValueError:
        end = date(today.year - 64, today.month, 28)
    return start, end

# _fetch_membership_metrics has been removed as it was unused and relied on Salesforce.


# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.get("/api/market-pulse")
def market_pulse(
    period: int = 6,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Market Pulse feed: travel advisories, seasonal alerts, Medicare calendar,
    and internal SF metrics — all in one feed."""
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"market_pulse_{sd}_{ed}"

    def fetch():
        today = date.today()

        # For advisory matching, only count FUTURE trips (travel not yet departed).
        future_start = max(sd, today.isoformat())

        # Fetch travel advisories in a thread while SOQL runs
        import threading
        advisory_result = []
        def _fetch_adv():
            advisory_result.extend(_fetch_travel_advisories())
        adv_thread = threading.Thread(target=_fetch_adv, daemon=True)
        adv_thread.start()

        # ── SF parallel batch (Opportunities only) ──
        data = sf_parallel(
            travel_rollup=f"""
                SELECT Destination_Region__c dest, COUNT(Id) cnt, SUM(Amount) total
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {future_start} AND CloseDate <= {ed}
                  AND Destination_Region__c != null
                GROUP BY Destination_Region__c
                ORDER BY COUNT(Id) DESC
            """,
            medicare_count=f"""
                SELECT COUNT(Id) cnt
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_MEDICARE_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
            """,
        )

        # ── Query active WCNY membership statistics from PBI ──
        y, m, d = today.isoformat().split("-")
        today_dax = f"DATE({y}, {int(m)}, {int(d)})"
        
        exp_end_90 = (today + timedelta(days=90)).isoformat()
        y90, m90, d90 = exp_end_90.split("-")
        exp_end_90_dax = f"DATE({y90}, {int(m90)}, {int(d90)})"
        
        exp_end_30 = (today + timedelta(days=30)).isoformat()
        y30, m30, d30 = exp_end_30.split("-")
        exp_end_30_dax = f"DATE({y30}, {int(m30)}, {int(d30)})"
        
        birth_start, birth_end = _safe_birthday_window(today)
        yb_start, mb_start, db_start = birth_start.isoformat().split("-")
        birth_start_dax = f"DATE({yb_start}, {int(mb_start)}, {int(db_start)})"
        
        yb_end, mb_end, db_end = birth_end.isoformat().split("-")
        birth_end_dax = f"DATE({yb_end}, {int(mb_end)}, {int(db_end)})"

        q_pbi = f"""
        EVALUATE
        ROW(
            "turning_65", CALCULATE(
                COUNTROWS(membership_consolidated),
                membership_consolidated[membership_status_code] = "A"
                && membership_consolidated[customer_address_region] IN {{"WESTERN", "ROCHESTER", "CENTRAL"}}
                && membership_consolidated[membership_coverage_level_code] IN {{"BASIC", "PLUS", "PLUS-A", "PREMIER", "PREMIER-A"}}
                && membership_consolidated[membership_expiry_date] >= {today_dax}
                && membership_consolidated[customer_birthdate] >= {birth_start_dax}
                && membership_consolidated[customer_birthdate] <= {birth_end_dax}
            ),
            "expiring_90d", CALCULATE(
                COUNTROWS(membership_consolidated),
                membership_consolidated[membership_status_code] = "A"
                && membership_consolidated[customer_address_region] IN {{"WESTERN", "ROCHESTER", "CENTRAL"}}
                && membership_consolidated[membership_coverage_level_code] IN {{"BASIC", "PLUS", "PLUS-A", "PREMIER", "PREMIER-A"}}
                && membership_consolidated[membership_expiry_date] >= {today_dax}
                && membership_consolidated[membership_expiry_date] <= {exp_end_90_dax}
            ),
            "expiring_30d", CALCULATE(
                COUNTROWS(membership_consolidated),
                membership_consolidated[membership_status_code] = "A"
                && membership_consolidated[customer_address_region] IN {{"WESTERN", "ROCHESTER", "CENTRAL"}}
                && membership_consolidated[membership_coverage_level_code] IN {{"BASIC", "PLUS", "PLUS-A", "PREMIER", "PREMIER-A"}}
                && membership_consolidated[membership_expiry_date] >= {today_dax}
                && membership_consolidated[membership_expiry_date] <= {exp_end_30_dax}
            ),
            "expiring_premier", CALCULATE(
                COUNTROWS(membership_consolidated),
                membership_consolidated[membership_status_code] = "A"
                && membership_consolidated[customer_address_region] IN {{"WESTERN", "ROCHESTER", "CENTRAL"}}
                && membership_consolidated[membership_coverage_level_code] IN {{"PREMIER", "PREMIER-A"}}
                && membership_consolidated[membership_expiry_date] >= {today_dax}
                && membership_consolidated[membership_expiry_date] <= {exp_end_90_dax}
            ),
            "expiring_plus", CALCULATE(
                COUNTROWS(membership_consolidated),
                membership_consolidated[membership_status_code] = "A"
                && membership_consolidated[customer_address_region] IN {{"WESTERN", "ROCHESTER", "CENTRAL"}}
                && membership_consolidated[membership_coverage_level_code] IN {{"PLUS", "PLUS-A"}}
                && membership_consolidated[membership_expiry_date] >= {today_dax}
                && membership_consolidated[membership_expiry_date] <= {exp_end_90_dax}
            ),
            "expiring_basic", CALCULATE(
                COUNTROWS(membership_consolidated),
                membership_consolidated[membership_status_code] = "A"
                && membership_consolidated[customer_address_region] IN {{"WESTERN", "ROCHESTER", "CENTRAL"}}
                && membership_consolidated[membership_coverage_level_code] IN {{"BASIC"}}
                && membership_consolidated[membership_expiry_date] >= {today_dax}
                && membership_consolidated[membership_expiry_date] <= {exp_end_90_dax}
            ),
            "basic_members", CALCULATE(
                COUNTROWS(membership_consolidated),
                membership_consolidated[membership_status_code] = "A"
                && membership_consolidated[customer_address_region] IN {{"WESTERN", "ROCHESTER", "CENTRAL"}}
                && membership_consolidated[membership_coverage_level_code] IN {{"BASIC"}}
                && membership_consolidated[membership_expiry_date] >= {today_dax}
            )
        )
        """
        pbi_metrics = {}
        try:
            pbi_rows = dax_query(PBI_WS, MEMBERSHIP_DS, q_pbi)
            if pbi_rows:
                pbi_metrics = pbi_rows[0]
        except Exception:
            log.exception("Failed to query membership metrics from PBI in market pulse")

        _cnt = lambda k: (data.get(k, [{}])[0] or {}).get('cnt', 0) or 0

        # Build destination count map
        trip_counts = {}
        travel_rows = data.get('travel_rollup', [])
        for row in travel_rows:
            trip_counts[row.get('dest', '')] = row.get('cnt', 0)

        # Wait for advisory thread
        adv_thread.join(timeout=10)
        advisory_alerts = _match_advisories_to_trips(advisory_result, trip_counts, DESTINATION_COUNTRIES)

        # Calendar & seasonal alerts
        medicare_alerts = _medicare_calendar_alerts(today)
        seasonal_alerts = _seasonal_alerts(today)

        # Internal data metrics
        intl_count = 0
        intl_value = 0
        for row in travel_rows:
            dest = row.get('dest', '')
            if not dest or dest in DOMESTIC_DESTINATIONS:
                continue
            cnt = row.get('cnt') or 0
            total = row.get('total') or 0
            intl_count += cnt
            intl_value += total

        medicare_won = _cnt('medicare_count')
        membership_metrics = {
            'members_turning_65': int(pbi_metrics.get('[turning_65]') or 0),
            'expiring_memberships_90d': int(pbi_metrics.get('[expiring_90d]') or 0),
            'expiring_memberships_30d': int(pbi_metrics.get('[expiring_30d]') or 0),
            'expiring_premier': int(pbi_metrics.get('[expiring_premier]') or 0),
            'expiring_plus': int(pbi_metrics.get('[expiring_plus]') or 0),
            'expiring_basic': int(pbi_metrics.get('[expiring_basic]') or 0),
            'basic_tier_members': int(pbi_metrics.get('[basic_members]') or 0),
        }

        # Enrich membership renewal alert with real tier breakdown
        mm = membership_metrics
        exp_90 = mm['expiring_memberships_90d']
        exp_30 = mm['expiring_memberships_30d']
        exp_premier = mm['expiring_premier']
        exp_plus = mm['expiring_plus']
        exp_basic = mm['expiring_basic']

        for alert in seasonal_alerts:
            if alert.get('type') == 'membership' and exp_90 > 0:
                urgent = f" ({exp_30:,} within 30 days)" if exp_30 else ""
                alert['severity'] = 'high' if exp_30 > 1000 else 'medium'
                alert['title'] = f'{exp_90:,} Memberships Expiring — Renewal & Upgrade Window'
                alert['summary'] = (
                    f"{exp_90:,} active memberships expiring in the next 90 days{urgent}. "
                    f"Breakdown: {exp_premier:,} Premier (highest retention value), "
                    f"{exp_plus:,} Plus, {exp_basic:,} Basic. "
                    f"Premier members are your top retention priority. "
                    f"Basic members are upgrade candidates (Basic→Plus)."
                )
                alert['action'] = (
                    f"Prioritize {exp_premier:,} Premier renewals, "
                    f"then target {exp_basic:,} Basic members for tier upgrades"
                )

        # Compile all alerts, sorted by severity
        all_alerts = advisory_alerts + medicare_alerts + seasonal_alerts

        severity_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3, 'info': 4}
        all_alerts.sort(key=lambda x: severity_order.get(x.get('severity', 'info'), 5))

        return {
            'alerts': all_alerts,
            'metrics': {
                'international_trips': intl_count,
                'international_value': round(intl_value, 2),
                'medicare_enrolled_period': medicare_won,
                'members_turning_65': membership_metrics['members_turning_65'],
                'expiring_memberships_90d': membership_metrics['expiring_memberships_90d'],
                'expiring_memberships_30d': membership_metrics['expiring_memberships_30d'],
                'expiring_premier': membership_metrics['expiring_premier'],
                'expiring_plus': membership_metrics['expiring_plus'],
                'expiring_basic': membership_metrics['expiring_basic'],
                'basic_tier_members': membership_metrics['basic_tier_members'],
                'top_destinations': [
                    {'destination': r.get('dest', ''), 'trips': r.get('cnt', 0)}
                    for r in travel_rows[:10]
                ],
            },
            'advisory_count': len(advisory_alerts),
            'date_range': {'start': sd, 'end': ed},
            'generated_at': datetime.utcnow().isoformat() + 'Z',
        }

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_DAY, disk_ttl=CACHE_TTL_DAY)


_register_dest_routes(router, DESTINATION_COUNTRIES)
