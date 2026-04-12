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


def _build_reason(gap_type: str, total_spend: float, opp_count: int,
                   acct: dict | None = None, has_medicare: bool = False) -> str:
    """Build smart, actionable reason using spend + age + membership + LTV + product ownership."""
    spend_str = f"${total_spend:,.0f}"
    age = acct.get('age') if acct else None
    membership = acct.get('membership', '') or '' if acct else ''
    tenure = acct.get('tenure_years') if acct else None
    ltv = (acct.get('ltv', '') or '').upper()[:1] if acct else ''

    parts = []

    if gap_type == 'needs_insurance':
        parts.append(f"{spend_str} travel spend ({opp_count} booking{'s' if opp_count != 1 else ''})")
        # Age-based recommendation — check what they already have
        if age:
            if age >= 60:
                if has_medicare:
                    parts.append(f"Age {age}, already has Medicare — focus on auto, home, umbrella")
                else:
                    parts.append(f"Age {age} — strong Medicare supplement + auto candidate")
            elif age >= 40:
                parts.append(f"Age {age} — home, auto, and umbrella insurance fit")
            elif age >= 25:
                parts.append(f"Age {age} — auto + renters insurance fit")
            else:
                parts.append(f"Age {age} — auto insurance starter candidate")
        elif not age and has_medicare:
            parts.append("Already has Medicare — focus on auto, home, umbrella")
        if membership:
            parts.append(f"{membership} member{f' ({tenure}yr)' if tenure else ''} — bundled offer candidate")
        if ltv in ('A', 'B'):
            parts.append(f"LTV {ltv} — high-value, prioritize outreach")
    else:
        parts.append(f"{opp_count} insurance polic{'ies' if opp_count != 1 else 'y'} ({spend_str})")
        if age:
            if age >= 55:
                parts.append(f"Age {age} — cruise, escorted tour, or destination travel")
            elif age >= 35:
                parts.append(f"Age {age} — family vacation + group travel packages")
            else:
                parts.append(f"Age {age} — adventure + budget travel packages")
        if membership:
            parts.append(f"{membership} member{f' ({tenure}yr)' if tenure else ''} — travel discounts available")
        if ltv in ('A', 'B'):
            parts.append(f"LTV {ltv} — premium travel packages likely fit")

    return '. '.join(parts)


def _enrich_accounts(account_ids: list[str]) -> dict[str, dict]:
    """Fetch Account details (name, phone, email, city, LTV, age, membership) in batches."""
    from datetime import date
    today = date.today()
    result: dict[str, dict] = {}
    for i in range(0, len(account_ids), 200):
        batch = account_ids[i:i + 200]
        ids_csv = ','.join(f"'{aid}'" for aid in batch)
        rows = sf_query_all(
            f"SELECT Id, Name, Phone, PersonEmail, BillingCity, LTV__c, "
            f"PersonBirthdate, ImportantActiveMemCoverage__c, Account_Member_Since__c, Type "
            f"FROM Account WHERE Id IN ({ids_csv})"
        )
        for r in rows:
            age = None
            bd = r.get('PersonBirthdate')
            if bd:
                try:
                    born = date.fromisoformat(bd)
                    age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
                except Exception:
                    pass
            # Normalize membership level
            raw_mem = (r.get('ImportantActiveMemCoverage__c') or '').strip().upper()
            membership = {'PLUS': 'Plus', 'PREMIER': 'Premier', 'B': 'Basic',
                          'BASIC': 'Basic', 'CLASSIC': 'Classic'}.get(raw_mem, raw_mem.title() if raw_mem else '')
            # Calculate tenure in years
            tenure = None
            ms = r.get('Account_Member_Since__c')
            if ms:
                try:
                    since = date.fromisoformat(ms)
                    tenure = today.year - since.year
                except Exception:
                    pass
            result[r['Id']] = {
                'name': r.get('Name', ''),
                'phone': r.get('Phone', ''),
                'email': r.get('PersonEmail', ''),
                'city': r.get('BillingCity', ''),
                'ltv': r.get('LTV__c', ''),
                'age': age,
                'membership': membership,
                'tenure_years': tenure,
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
        from datetime import date
        three_yr_ago = f"{date.today().year - 3}-01-01"

        # ── Fetch activity data (current period) + ownership data (all-time) ──
        data = sf_parallel(
            # Current period travel activity (for spend/engagement scoring)
            travel_raw=f"""
                SELECT AccountId, Amount
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                  AND Amount != null AND AccountId != null
            """,
            # Current period insurance activity
            insurance_raw=f"""
                SELECT AccountId, Amount
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_INSURANCE_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                  AND Amount != null AND AccountId != null
            """,
            # ALL-TIME insurance customers (by Insurance Customer ID on Account)
            ins_customers_alltime=f"""
                SELECT Id
                FROM Account
                WHERE Insuance_Customer_ID__c != null
                  AND Id IN (
                    SELECT AccountId FROM Opportunity
                    WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                      AND {WON_STAGES}
                      AND CloseDate >= {sd} AND CloseDate <= {ed}
                      AND Amount != null
                  )
            """,
            # ALL-TIME travel customers (opp in last 3 years = still active)
            travel_customers_3yr=f"""
                SELECT AccountId
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {three_yr_ago}
                  AND AccountId != null
            """,
            # ALL-TIME Medicare holders
            medicare_holders=f"""
                SELECT AccountId
                FROM Opportunity
                WHERE RecordType.Name = 'Medicare'
                  AND AccountId != null
            """,
            # ALL-TIME insurance opp holders (broader than current period)
            ins_opp_alltime=f"""
                SELECT AccountId
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_INSURANCE_ID}'
                  AND {WON_STAGES}
                  AND AccountId != null
            """,
        )

        # ── Aggregate current-period activity by account ──
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

        # ── Build TRUE product ownership sets (all-time, not just current period) ──
        # Someone IS an insurance customer if they have Insurance_Customer_ID OR any insurance opp ever
        ins_customer_by_id = {r.get('Id') for r in data.get('ins_customers_alltime', []) if r.get('Id')}
        ins_opp_ever = {r.get('AccountId') for r in data.get('ins_opp_alltime', []) if r.get('AccountId')}
        true_ins_customers = ins_customer_by_id | ins_opp_ever | set(ins_by_acct.keys())

        # Someone IS a travel customer if they have a travel opp in the last 3 years
        true_travel_customers = {r.get('AccountId') for r in data.get('travel_customers_3yr', []) if r.get('AccountId')}
        true_travel_customers |= set(travel_by_acct.keys())

        # Medicare holders
        medicare_ids = {r.get('AccountId') for r in data.get('medicare_holders', []) if r.get('AccountId')}

        travel_account_ids = set(travel_by_acct.keys())
        ins_account_ids = set(ins_by_acct.keys())

        # ── TRUE product gaps (using all-time ownership, not just current period) ──
        # "Needs insurance" = active travel customer but NOT an insurance customer (ever)
        needs_insurance_ids = travel_account_ids - true_ins_customers
        # "Needs travel" = active insurance customer but NOT a travel customer (last 3yr)
        needs_travel_ids = ins_account_ids - true_travel_customers
        # Both = has both product lines
        have_both_ids = (travel_account_ids & true_ins_customers) | (ins_account_ids & true_travel_customers)

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

        def _build_row(aid, spend, gap_type, gap_label, products_owned):
            acct = account_details.get(aid, {})
            has_medicare = aid in medicare_ids
            score, priority = _score_customer(spend['total'], spend['cnt'], acct.get('ltv', ''))
            return {
                'account_id': aid,
                'account_name': acct.get('name', ''),
                'phone': acct.get('phone', ''),
                'email': acct.get('email', ''),
                'city': acct.get('city', ''),
                'ltv': acct.get('ltv', ''),
                'membership': acct.get('membership', ''),
                'age': acct.get('age'),
                'has_medicare': has_medicare,
                'products_owned': products_owned,
                'gap': gap_label,
                'gap_type': gap_type,
                'total_spend': round(spend['total'], 2),
                'transaction_count': spend['cnt'],
                'score': score,
                'priority': priority,
                'reason': _build_reason(gap_type, spend['total'], spend['cnt'], acct, has_medicare),
                'sf_link': f"{sf_base}/{aid}",
            }

        needs_insurance = [
            _build_row(aid, travel_by_acct[aid], 'needs_insurance', 'Insurance', ['Travel'])
            for aid in needs_ins_sorted
        ]
        needs_travel = [
            _build_row(aid, ins_by_acct[aid], 'needs_travel', 'Travel', ['Insurance'])
            for aid in needs_travel_sorted
        ]

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
