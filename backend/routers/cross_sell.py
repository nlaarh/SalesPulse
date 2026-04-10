"""Cross-Sell Insights — Product gap detection.

Identifies customers who have one product line but not another:
  • Travel customers with no insurance → sell insurance
  • Insurance customers with no travel → sell travel packages
Shows contact info, spend, and Salesforce links for actionable outreach.
"""

import logging
from typing import Optional
from collections import defaultdict

from fastapi import APIRouter, Query

from sf_client import sf_query_all, sf_parallel, sf_instance_url
from shared import (
    WON_STAGES, resolve_dates as _resolve_dates,
    get_owner_map, is_sales_agent,
    OPP_RT_TRAVEL_ID, OPP_RT_INSURANCE_ID,
)
from constants import CACHE_TTL_HOUR, CACHE_TTL_DAY
import cache

router = APIRouter()
log = logging.getLogger(__name__)

# Max customers to return per category
TOP_N = 100


# ── Helpers ──────────────────────────────────────────────────────────────────

def _score_customer(total_spend: float, opp_count: int, ltv: str) -> tuple[int, str]:
    """Score a cross-sell opportunity 0-100 based on spend + engagement + LTV.

    - Total spend (50%): higher spenders = higher value cross-sell
    - Engagement (25%): more transactions = more engaged
    - LTV tier (25%): A=best through E=lowest
    """
    # Spend score (0-50)
    if total_spend >= 20_000:
        spend_score = 50
    elif total_spend >= 10_000:
        spend_score = 40
    elif total_spend >= 5_000:
        spend_score = 30
    elif total_spend >= 2_000:
        spend_score = 20
    elif total_spend >= 500:
        spend_score = 10
    else:
        spend_score = 5

    # Engagement score (0-25)
    if opp_count >= 10:
        eng_score = 25
    elif opp_count >= 5:
        eng_score = 20
    elif opp_count >= 3:
        eng_score = 15
    elif opp_count >= 2:
        eng_score = 10
    else:
        eng_score = 5

    # LTV score (0-25)
    ltv_scores = {'A': 25, 'B': 20, 'C': 15, 'D': 10, 'E': 5}
    ltv_clean = (ltv or '').strip().upper()[:1]
    ltv_score = ltv_scores.get(ltv_clean, 8)

    total = spend_score + eng_score + ltv_score
    if total >= 70:
        priority = 'high'
    elif total >= 45:
        priority = 'medium'
    else:
        priority = 'low'

    return total, priority


def _build_reason(gap_type: str, total_spend: float, opp_count: int) -> str:
    """Build human-readable reason for the cross-sell recommendation."""
    spend_str = f"${total_spend:,.0f}"
    if gap_type == 'needs_insurance':
        return (
            f"Spent {spend_str} on travel ({opp_count} booking{'s' if opp_count != 1 else ''}) "
            f"— no insurance products on file"
        )
    else:
        return (
            f"Has {opp_count} insurance polic{'ies' if opp_count != 1 else 'y'} ({spend_str}) "
            f"— no travel bookings on file"
        )


def _enrich_accounts(account_ids: list[str]) -> dict[str, dict]:
    """Fetch Account details (name, phone, email, city, LTV) in batches."""
    result: dict[str, dict] = {}
    for i in range(0, len(account_ids), 200):
        batch = account_ids[i:i + 200]
        ids_csv = ','.join(f"'{aid}'" for aid in batch)
        rows = sf_query_all(
            f"SELECT Id, Name, Phone, PersonEmail, BillingCity, LTV__c "
            f"FROM Account WHERE Id IN ({ids_csv})"
        )
        for r in rows:
            result[r['Id']] = {
                'name': r.get('Name', ''),
                'phone': r.get('Phone', ''),
                'email': r.get('PersonEmail', ''),
                'city': r.get('BillingCity', ''),
                'ltv': r.get('LTV__c', ''),
            }
    return result


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/api/cross-sell/insights")
def cross_sell_insights(
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Product gap cross-sell: who can buy what they don't have yet."""
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"cross_sell_v2_{sd}_{ed}"

    def fetch():
        # Fetch raw opportunity records (no GROUP BY to avoid queryMore limit)
        data = sf_parallel(
            travel_raw=f"""
                SELECT AccountId, Amount
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                  AND Amount != null AND AccountId != null
            """,
            insurance_raw=f"""
                SELECT AccountId, Amount
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_INSURANCE_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                  AND Amount != null AND AccountId != null
            """,
        )

        # Aggregate in Python: AccountId → {total, cnt}
        travel_by_acct: dict[str, dict] = {}
        for r in data.get('travel_raw', []):
            aid = r.get('AccountId')
            amt = r.get('Amount') or 0
            if aid:
                if aid not in travel_by_acct:
                    travel_by_acct[aid] = {'total': 0, 'cnt': 0}
                travel_by_acct[aid]['total'] += amt
                travel_by_acct[aid]['cnt'] += 1

        ins_by_acct: dict[str, dict] = {}
        for r in data.get('insurance_raw', []):
            aid = r.get('AccountId')
            amt = r.get('Amount') or 0
            if aid:
                if aid not in ins_by_acct:
                    ins_by_acct[aid] = {'total': 0, 'cnt': 0}
                ins_by_acct[aid]['total'] += amt
                ins_by_acct[aid]['cnt'] += 1

        travel_account_ids = set(travel_by_acct.keys())
        ins_account_ids = set(ins_by_acct.keys())

        # Customers with travel but NO insurance
        needs_insurance_ids = travel_account_ids - ins_account_ids
        # Customers with insurance but NO travel
        needs_travel_ids = ins_account_ids - travel_account_ids
        # Customers with both (for summary stats)
        have_both_ids = travel_account_ids & ins_account_ids

        # Sort by spend descending, take top N for each
        needs_ins_sorted = sorted(
            needs_insurance_ids,
            key=lambda a: travel_by_acct[a]['total'],
            reverse=True,
        )[:TOP_N]

        needs_travel_sorted = sorted(
            needs_travel_ids,
            key=lambda a: ins_by_acct[a]['total'],
            reverse=True,
        )[:TOP_N]

        # Enrich top customers with Account details
        all_enrich_ids = list(set(needs_ins_sorted) | set(needs_travel_sorted))
        account_details = _enrich_accounts(all_enrich_ids) if all_enrich_ids else {}

        sf_base = sf_instance_url()

        # Build "needs insurance" opportunities
        needs_insurance = []
        for aid in needs_ins_sorted:
            spend = travel_by_acct[aid]
            acct = account_details.get(aid, {})
            score, priority = _score_customer(spend['total'], spend['cnt'], acct.get('ltv', ''))
            needs_insurance.append({
                'account_id': aid,
                'account_name': acct.get('name', ''),
                'phone': acct.get('phone', ''),
                'email': acct.get('email', ''),
                'city': acct.get('city', ''),
                'ltv': acct.get('ltv', ''),
                'products_owned': ['Travel'],
                'gap': 'Insurance',
                'gap_type': 'needs_insurance',
                'total_spend': round(spend['total'], 2),
                'transaction_count': spend['cnt'],
                'score': score,
                'priority': priority,
                'reason': _build_reason('needs_insurance', spend['total'], spend['cnt']),
                'sf_link': f"{sf_base}/{aid}",
            })

        # Build "needs travel" opportunities
        needs_travel = []
        for aid in needs_travel_sorted:
            spend = ins_by_acct[aid]
            acct = account_details.get(aid, {})
            score, priority = _score_customer(spend['total'], spend['cnt'], acct.get('ltv', ''))
            needs_travel.append({
                'account_id': aid,
                'account_name': acct.get('name', ''),
                'phone': acct.get('phone', ''),
                'email': acct.get('email', ''),
                'city': acct.get('city', ''),
                'ltv': acct.get('ltv', ''),
                'products_owned': ['Insurance'],
                'gap': 'Travel',
                'gap_type': 'needs_travel',
                'total_spend': round(spend['total'], 2),
                'transaction_count': spend['cnt'],
                'score': score,
                'priority': priority,
                'reason': _build_reason('needs_travel', spend['total'], spend['cnt']),
                'sf_link': f"{sf_base}/{aid}",
            })

        # Summary totals (computed from Python-aggregated data)
        total_travel_revenue = sum(v['total'] for v in travel_by_acct.values())
        total_insurance_revenue = sum(v['total'] for v in ins_by_acct.values())

        return {
            'summary': {
                'total_travel_customers': len(travel_account_ids),
                'total_insurance_customers': len(ins_account_ids),
                'customers_with_both': len(have_both_ids),
                'needs_insurance_count': len(needs_insurance_ids),
                'needs_travel_count': len(needs_travel_ids),
                'needs_insurance_value': round(
                    sum(travel_by_acct[a]['total'] for a in needs_insurance_ids), 2
                ),
                'needs_travel_value': round(
                    sum(ins_by_acct[a]['total'] for a in needs_travel_ids), 2
                ),
                'total_travel_revenue': round(total_travel_revenue, 2),
                'total_insurance_revenue': round(total_insurance_revenue, 2),
            },
            'needs_insurance': needs_insurance,
            'needs_travel': needs_travel,
            'date_range': {'start': sd, 'end': ed},
        }

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)
