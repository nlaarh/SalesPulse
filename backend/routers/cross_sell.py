"""Cross-Sell Insights — Travel → Insurance gap detection.

Identifies travel customers who booked trips but have no insurance purchase
within ±30 days, creating actionable cross-sell opportunities for advisors.
"""

import logging
from datetime import date, datetime, timedelta
from typing import Optional
from collections import defaultdict

from fastapi import APIRouter, Query

from sf_client import sf_query_all, sf_parallel
from shared import (
    VALID_LINES, WON_STAGES, resolve_dates as _resolve_dates,
    get_owner_map, is_sales_agent, escape_soql,
    OPP_RT_TRAVEL_ID, OPP_RT_INSURANCE_ID,
)
from constants import CACHE_TTL_HOUR, CACHE_TTL_DAY
import cache

router = APIRouter()
log = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

INSURANCE_WINDOW_DAYS = 30  # ±days to check for matching insurance purchase


# ── Helpers ──────────────────────────────────────────────────────────────────

def _score_opportunity(amount: float, days_ago: int) -> tuple[int, str]:
    """Score a cross-sell opportunity 0-100 and assign priority label.

    Factors:
    - Trip value (60%): bigger trips = more insurance premium potential
    - Recency (40%): recent trips = customer still engaged
    """
    # Value score (0-60)
    if amount >= 10_000:
        val_score = 60
    elif amount >= 5_000:
        val_score = 48
    elif amount >= 2_500:
        val_score = 36
    elif amount >= 1_000:
        val_score = 24
    else:
        val_score = 12

    # Recency score (0-40)
    if days_ago <= 7:
        rec_score = 40
    elif days_ago <= 14:
        rec_score = 32
    elif days_ago <= 30:
        rec_score = 24
    elif days_ago <= 60:
        rec_score = 16
    elif days_ago <= 90:
        rec_score = 8
    else:
        rec_score = 4

    total = val_score + rec_score
    if total >= 70:
        priority = 'high'
    elif total >= 45:
        priority = 'medium'
    else:
        priority = 'low'

    return total, priority


def _build_reason(amount: float, days_ago: int, trip_name: str) -> str:
    """Build a human-readable reason for the cross-sell recommendation."""
    value_str = f"${amount:,.0f}"
    if days_ago <= 7:
        time_str = "booked this week"
    elif days_ago <= 14:
        time_str = "booked last week"
    elif days_ago <= 30:
        time_str = "booked this month"
    elif days_ago <= 60:
        time_str = f"booked {days_ago} days ago"
    else:
        time_str = f"booked {days_ago} days ago"

    return f"{value_str} trip {time_str} — no travel insurance on file"


# ── Core matching logic ──────────────────────────────────────────────────────

def _find_uninsured_trips(travel_opps: list, insurance_opps: list) -> list[dict]:
    """Match travel opps against insurance opps by AccountId + date proximity.

    Returns list of uninsured travel opps (no insurance within ±30 days).
    """
    # Build insurance lookup: AccountId → list of CloseDates
    ins_by_account: dict[str, list[date]] = defaultdict(list)
    for ins in insurance_opps:
        acct = ins.get('AccountId')
        cd = ins.get('CloseDate')
        if acct and cd:
            try:
                ins_by_account[acct].append(date.fromisoformat(cd))
            except (ValueError, TypeError):
                continue

    today = date.today()
    window = timedelta(days=INSURANCE_WINDOW_DAYS)
    results = []

    for trip in travel_opps:
        acct = trip.get('AccountId')
        cd_str = trip.get('CloseDate')
        if not acct or not cd_str:
            continue
        try:
            trip_date = date.fromisoformat(cd_str)
        except (ValueError, TypeError):
            continue

        # Check if any insurance opp exists within ±window
        ins_dates = ins_by_account.get(acct, [])
        has_insurance = any(
            abs((ins_d - trip_date).days) <= INSURANCE_WINDOW_DAYS
            for ins_d in ins_dates
        )

        if not has_insurance:
            days_ago = (today - trip_date).days
            amount = trip.get('Amount') or 0
            score, priority = _score_opportunity(amount, days_ago)

            results.append({
                'account_id': acct,
                'opportunity_id': trip.get('Id', ''),
                'trip_name': trip.get('Name', ''),
                'amount': round(amount, 2),
                'close_date': cd_str,
                'days_ago': days_ago,
                'owner_id': trip.get('OwnerId', ''),
                'score': score,
                'priority': priority,
                'reason': _build_reason(amount, days_ago, trip.get('Name', '')),
            })

    # Sort by score descending
    results.sort(key=lambda x: x['score'], reverse=True)
    return results


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/api/cross-sell/insights")
def cross_sell_insights(
    period: int = 6,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Aggregated cross-sell dashboard: uninsured trips, top opportunities, by-advisor."""
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"cross_sell_insights_{sd}_{ed}"

    def fetch():
        # Parallel: all Travel won opps + all Insurance won opps in date range
        data = sf_parallel(
            travel=f"""
                SELECT Id, Name, AccountId, Amount, CloseDate, OwnerId
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                  AND Amount != null
                ORDER BY CloseDate DESC
            """,
            insurance=f"""
                SELECT Id, AccountId, CloseDate
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_INSURANCE_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
            """,
            # Also get account names for top opportunities
            travel_total=f"""
                SELECT COUNT(Id) cnt, SUM(Amount) total
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                  AND Amount != null
            """,
        )

        travel_opps = data.get('travel', [])
        insurance_opps = data.get('insurance', [])
        total_row = data.get('travel_total', [{}])

        total_travel = (total_row[0] if total_row else {}).get('cnt', 0) or 0
        total_travel_value = (total_row[0] if total_row else {}).get('total', 0) or 0

        # Find uninsured trips
        uninsured = _find_uninsured_trips(travel_opps, insurance_opps)
        total_uninsured = len(uninsured)
        total_insured = total_travel - total_uninsured

        # Enrich with owner names
        owner_map = get_owner_map()
        for opp in uninsured:
            opp['advisor'] = owner_map.get(opp['owner_id'], 'Unknown')

        # Fetch account names for top 50 opportunities
        top_account_ids = list({o['account_id'] for o in uninsured[:50]})
        account_names = {}
        if top_account_ids:
            ids_csv = ','.join(f"'{aid}'" for aid in top_account_ids)
            name_rows = sf_query_all(
                f"SELECT Id, Name FROM Account WHERE Id IN ({ids_csv})"
            )
            account_names = {r['Id']: r.get('Name', '') for r in name_rows}

        for opp in uninsured[:50]:
            opp['account_name'] = account_names.get(opp['account_id'], '')

        # By-advisor aggregation
        advisor_agg: dict[str, dict] = {}
        for opp in uninsured:
            name = opp['advisor']
            if not is_sales_agent(name, 'Travel'):
                continue
            if name not in advisor_agg:
                advisor_agg[name] = {
                    'advisor': name,
                    'uninsured_count': 0,
                    'total_value': 0,
                    'top_amount': 0,
                    'top_trip': '',
                }
            agg = advisor_agg[name]
            agg['uninsured_count'] += 1
            agg['total_value'] = round(agg['total_value'] + opp['amount'], 2)
            if opp['amount'] > agg['top_amount']:
                agg['top_amount'] = opp['amount']
                agg['top_trip'] = opp['trip_name']

        by_advisor = sorted(
            advisor_agg.values(),
            key=lambda x: x['total_value'],
            reverse=True,
        )

        # Monthly trend (coverage rate by month)
        month_insured: dict[str, int] = defaultdict(int)
        month_total: dict[str, int] = defaultdict(int)

        for trip in travel_opps:
            cd = trip.get('CloseDate', '')[:7]  # YYYY-MM
            if cd:
                month_total[cd] += 1

        # Mark insured trips in monthly buckets
        insured_ids = set()
        ins_by_account: dict[str, list] = defaultdict(list)
        for ins in insurance_opps:
            acct = ins.get('AccountId')
            cd = ins.get('CloseDate')
            if acct and cd:
                try:
                    ins_by_account[acct].append(date.fromisoformat(cd))
                except (ValueError, TypeError):
                    pass

        window = timedelta(days=INSURANCE_WINDOW_DAYS)
        for trip in travel_opps:
            acct = trip.get('AccountId')
            cd_str = trip.get('CloseDate', '')
            if not acct or not cd_str:
                continue
            try:
                trip_date = date.fromisoformat(cd_str)
            except (ValueError, TypeError):
                continue
            ins_dates = ins_by_account.get(acct, [])
            if any(abs((d - trip_date).days) <= INSURANCE_WINDOW_DAYS for d in ins_dates):
                month_key = cd_str[:7]
                month_insured[month_key] += 1

        trend = []
        for ym in sorted(month_total.keys()):
            t = month_total[ym]
            i = month_insured.get(ym, 0)
            trend.append({
                'month': ym,
                'total': t,
                'insured': i,
                'uninsured': t - i,
                'coverage_rate': round(i / t * 100, 1) if t > 0 else 0,
            })

        # Summary
        value_at_risk = sum(o['amount'] for o in uninsured)
        coverage_rate = round(total_insured / total_travel * 100, 1) if total_travel > 0 else 0

        # Filter top opportunities to sales agents only
        top_opps = [o for o in uninsured[:50] if is_sales_agent(o.get('advisor', ''), 'Travel')]

        return {
            'summary': {
                'total_travel_trips': total_travel,
                'total_insured': total_insured,
                'total_uninsured': total_uninsured,
                'value_at_risk': round(value_at_risk, 2),
                'coverage_rate': coverage_rate,
                'avg_trip_value': round(total_travel_value / total_travel, 2) if total_travel > 0 else 0,
            },
            'top_opportunities': top_opps[:30],
            'by_advisor': by_advisor,
            'trend': trend,
            'date_range': {'start': sd, 'end': ed},
        }

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


@router.get("/api/cross-sell/advisor/{advisor_name}")
def cross_sell_by_advisor(
    advisor_name: str,
    period: int = 6,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Per-advisor cross-sell call list: uninsured trips for their customers."""
    sd, ed = _resolve_dates(start_date, end_date, period)
    safe_name = escape_soql(advisor_name)
    key = f"cross_sell_advisor_{safe_name}_{sd}_{ed}"

    def fetch():
        # First get this advisor's travel opp AccountIds
        travel_opps = sf_query_all(f"""
            SELECT Id, Name, AccountId, Amount, CloseDate, OwnerId
            FROM Opportunity
            WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
              AND {WON_STAGES}
              AND Owner.Name = '{safe_name}'
              AND CloseDate >= {sd} AND CloseDate <= {ed}
              AND Amount != null
            ORDER BY Amount DESC
        """)

        # Collect unique AccountIds from travel opps
        account_ids = list({t['AccountId'] for t in travel_opps if t.get('AccountId')})
        insurance_opps = []
        if account_ids:
            # Batch AccountIds (SOQL IN clause limit ~200 IDs at a time)
            for i in range(0, len(account_ids), 200):
                batch = account_ids[i:i+200]
                ids_csv = ','.join(f"'{aid}'" for aid in batch)
                ins = sf_query_all(f"""
                    SELECT Id, AccountId, CloseDate
                    FROM Opportunity
                    WHERE RecordTypeId = '{OPP_RT_INSURANCE_ID}'
                      AND {WON_STAGES}
                      AND AccountId IN ({ids_csv})
                """)
                insurance_opps.extend(ins)

        uninsured = _find_uninsured_trips(travel_opps, insurance_opps)

        # Enrich with account names
        account_ids = list({o['account_id'] for o in uninsured})
        account_names = {}
        if account_ids:
            ids_csv = ','.join(f"'{aid}'" for aid in account_ids[:100])
            name_rows = sf_query_all(
                f"SELECT Id, Name FROM Account WHERE Id IN ({ids_csv})"
            )
            account_names = {r['Id']: r.get('Name', '') for r in name_rows}

        for opp in uninsured:
            opp['account_name'] = account_names.get(opp['account_id'], '')
            opp['advisor'] = advisor_name

        # Summary for this advisor
        total_trips = len(travel_opps)
        total_uninsured = len(uninsured)
        value_at_risk = sum(o['amount'] for o in uninsured)

        return {
            'advisor': advisor_name,
            'summary': {
                'total_trips': total_trips,
                'total_uninsured': total_uninsured,
                'coverage_rate': round((total_trips - total_uninsured) / total_trips * 100, 1) if total_trips > 0 else 0,
                'value_at_risk': round(value_at_risk, 2),
            },
            'opportunities': uninsured,
            'date_range': {'start': sd, 'end': ed},
        }

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)
