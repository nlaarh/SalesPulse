"""Market Pulse — Destination impact endpoint and advisory matching helper.

Extracted from market_pulse.py to keep file sizes manageable.
Routes attach to the shared router from market_pulse.py.
"""

import logging
from datetime import date
from typing import Optional

from fastapi import Query

from sf_client import sf_query_all
from shared import OPP_RT_TRAVEL_ID, WON_STAGES, get_owner_map
from constants import CACHE_TTL_DAY
import cache

log = logging.getLogger(__name__)


def _match_advisories_to_trips(advisories: list[dict], trip_counts: dict,
                                destination_countries: dict) -> list[dict]:
    """Cross-reference advisories with our customers' booked destinations."""
    # Build advisory lookup by country name (keep highest level if dupes)
    advisory_by_name = {}
    for a in advisories:
        key = a['country_name'].lower()
        if key not in advisory_by_name or a['level'] > advisory_by_name[key]['level']:
            advisory_by_name[key] = a

    # For each destination, find matching advisories and aggregate trips
    country_alerts: dict[str, dict] = {}
    for dest, country_names in destination_countries.items():
        count = trip_counts.get(dest, 0)
        if count == 0:
            continue
        for cname in country_names:
            ckey = cname.lower()
            if ckey in advisory_by_name:
                if ckey not in country_alerts:
                    country_alerts[ckey] = {
                        'adv': advisory_by_name[ckey],
                        'total_trips': 0,
                        'destinations': [],
                    }
                country_alerts[ckey]['total_trips'] += count
                if dest not in country_alerts[ckey]['destinations']:
                    country_alerts[ckey]['destinations'].append(dest)

    matched = []
    for info in country_alerts.values():
        adv = info['adv']
        dests = ', '.join(info['destinations'])
        matched.append({
            'type': 'travel_advisory',
            'severity': adv.get('severity', 'medium'),
            'title': f"Travel Advisory: {adv['country_name']} — Level {adv['level']}",
            'summary': f"{adv.get('label', '')}. "
                       f"You have {info['total_trips']} customer trips to {dests}.",
            'action': f"Contact {dests} travelers about trip insurance and backup plans",
            'country_name': adv['country_name'],
            'advisory_level': adv['level'],
            'customer_trips': info['total_trips'],
            'destination': dests,
            'icon': 'alert-triangle',
        })

    severity_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3, 'info': 4}
    matched.sort(key=lambda x: (severity_order.get(x['severity'], 5), -x.get('customer_trips', 0)))
    return matched


def register_routes(router, DESTINATION_COUNTRIES):
    """Register the impacted-customers endpoint on the shared router."""

    @router.get("/api/market-pulse/impacted-customers")
    def impacted_customers(
        destination: str = Query(..., description="Destination region(s), comma-separated"),
        period: int = 6,
        start_date: Optional[str] = Query(None),
        end_date: Optional[str] = Query(None),
    ):
        """Return customers traveling to advisory-affected destinations,
        grouped by advisor.  Loaded on-demand when user expands an alert."""
        from shared import resolve_dates as _resolve_dates
        sd, ed = _resolve_dates(start_date, end_date, period)
        destinations = sorted({d.strip() for d in destination.split(',') if d.strip()})
        if not destinations:
            return {'advisors': [], 'total': 0}

        safe_dests = "','".join(d.replace("'", "\\'") for d in destinations)
        key = f"mp_impact_{safe_dests}_{sd}_{ed}"

        def fetch():
            today_str = date.today().isoformat()
            future_start = max(sd, today_str)
            rows = sf_query_all(f"""
                SELECT Account.Name, AccountId,
                       OwnerId, Name,
                       Amount, CloseDate,
                       Destination_Region__c
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {future_start} AND CloseDate <= {ed}
                  AND Destination_Region__c IN ('{safe_dests}')
                  AND Amount != null
                ORDER BY Amount DESC
            """)

            owner_map = get_owner_map()
            advisor_map: dict[str, dict] = {}
            for r in rows:
                adv = owner_map.get(r.get('OwnerId', ''), '') or 'Unknown'
                if adv not in advisor_map:
                    advisor_map[adv] = {'advisor': adv, 'trips': 0, 'value': 0, 'customers': []}
                advisor_map[adv]['trips'] += 1
                advisor_map[adv]['value'] += (r.get('Amount') or 0)
                if len(advisor_map[adv]['customers']) < 15:
                    advisor_map[adv]['customers'].append({
                        'name': (r.get('Account') or {}).get('Name') or '—',
                        'account_id': r.get('AccountId', ''),
                        'trip': r.get('Name', ''),
                        'destination': r.get('Destination_Region__c', ''),
                        'amount': r.get('Amount') or 0,
                        'close_date': r.get('CloseDate', ''),
                    })

            advisors = sorted(advisor_map.values(), key=lambda a: -a['value'])
            return {
                'advisors': advisors,
                'total': sum(a['trips'] for a in advisors),
            }

        return cache.cached_query(key, fetch, ttl=CACHE_TTL_DAY, disk_ttl=CACHE_TTL_DAY)
