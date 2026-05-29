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
    """Fetch Account details in parallel batches of 200."""
    from datetime import date
    today = date.today()

    if not account_ids:
        return {}

    # Build one query per batch of 200
    batch_queries = {}
    for i in range(0, len(account_ids), 200):
        batch = account_ids[i:i + 200]
        ids_csv = ','.join(f"'{aid}'" for aid in batch)
        batch_queries[f"batch_{i}"] = (
            f"SELECT Id, Name, Phone, PersonEmail, BillingCity, LTV__c, "
            f"PersonBirthdate, ImportantActiveMemCoverage__c, Account_Member_Since__c, Type, "
            f"Member_Status__c, ImportantActiveMemExpiryDate__c "
            f"FROM Account WHERE Id IN ({ids_csv})"
        )

    # Run all batches concurrently
    data = sf_parallel(**batch_queries)

    # Flatten all batch results
    result: dict[str, dict] = {}
    all_rows = []
    for rows in data.values():
        all_rows.extend(rows or [])

    for r in all_rows:
        age = None
        bd = r.get('PersonBirthdate')
        if bd:
            try:
                born = date.fromisoformat(bd)
                age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
            except Exception:
                pass

        # Determine if they are currently an active member
        status = r.get('Member_Status__c')
        expiry = r.get('ImportantActiveMemExpiryDate__c')
        is_active_member = False
        if status == 'A' and expiry:
            try:
                exp_date = date.fromisoformat(expiry)
                if exp_date >= today:
                    is_active_member = True
            except Exception:
                pass

        # Normalize membership level
        raw_mem = (r.get('ImportantActiveMemCoverage__c') or '').strip().upper()
        membership = {'PLUS': 'Plus', 'PREMIER': 'Premier', 'B': 'Basic',
                      'BASIC': 'Basic', 'CLASSIC': 'Classic'}.get(raw_mem, raw_mem.title() if raw_mem else '')

        # If they are active member but have no tier, default to 'Basic'
        if is_active_member and not membership:
            membership = 'Basic'

        # If they are NOT an active member, treat them as non-member (empty tier)
        if not is_active_member:
            membership = ''

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
        today = date.today()
        three_yr_ago = f"{today.year - 3}-01-01"
        five_yr_ago  = f"{today.year - 5}-01-01"

        # ── Fetch activity data (current period) + ownership data (recent history) ──
        data = sf_parallel(
            # Current period travel — pre-aggregated by account; one row per account vs raw rows
            travel_raw=f"""
                SELECT AccountId, COUNT(Id) cnt, SUM(Amount) total
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                  AND Amount != null AND AccountId != null
                GROUP BY AccountId
                LIMIT 2000
            """,
            # Current period insurance — pre-aggregated by account
            insurance_raw=f"""
                SELECT AccountId, COUNT(Id) cnt, SUM(Amount) total
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_INSURANCE_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                  AND Amount != null AND AccountId != null
                GROUP BY AccountId
                LIMIT 2000
            """,
            # Insurance customers (by Insurance Customer ID on Account)
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
            # Travel customers in last 3 years - restricted to current period insurance accounts to prevent limit-based omission
            travel_customers_3yr=f"""
                SELECT Id FROM Account
                WHERE Id IN (
                    SELECT AccountId FROM Opportunity
                    WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                      AND {WON_STAGES}
                      AND CloseDate >= {three_yr_ago}
                ) AND Id IN (
                    SELECT AccountId FROM Opportunity
                    WHERE RecordTypeId = '{OPP_RT_INSURANCE_ID}'
                      AND {WON_STAGES}
                      AND CloseDate >= {sd} AND CloseDate <= {ed}
                      AND Amount != null
                )
            """,
            # Insurance opp holders - restricted to current period travel accounts to prevent limit-based omission
            ins_opp_alltime=f"""
                SELECT Id FROM Account
                WHERE Id IN (
                    SELECT AccountId FROM Opportunity
                    WHERE RecordTypeId = '{OPP_RT_INSURANCE_ID}'
                      AND {WON_STAGES}
                      AND CloseDate >= {five_yr_ago}
                ) AND Id IN (
                    SELECT AccountId FROM Opportunity
                    WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                      AND {WON_STAGES}
                      AND CloseDate >= {sd} AND CloseDate <= {ed}
                      AND Amount != null
                )
            """,
            # True totals for dashboard summary cards (consolidated to 1 query)
            true_totals_combined=f"""
                SELECT RecordTypeId, SUM(Amount) total, COUNT_DISTINCT(AccountId) cnt
                FROM Opportunity
                WHERE RecordTypeId IN ('{OPP_RT_TRAVEL_ID}', '{OPP_RT_INSURANCE_ID}')
                  AND {WON_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                  AND Amount != null
                GROUP BY RecordTypeId
            """,
        )

        # SF returns one pre-aggregated row per account — no Python summing needed
        travel_by_acct: dict[str, dict] = {
            r['AccountId']: {'total': r.get('total') or 0, 'cnt': r.get('cnt') or 0}
            for r in data.get('travel_raw', []) if r.get('AccountId')
        }
        ins_by_acct: dict[str, dict] = {
            r['AccountId']: {'total': r.get('total') or 0, 'cnt': r.get('cnt') or 0}
            for r in data.get('insurance_raw', []) if r.get('AccountId')
        }

        # ── Build TRUE product ownership sets (all-time, not just current period) ──
        # Someone IS an insurance customer if they have Insurance_Customer_ID OR any insurance opp ever
        ins_customer_by_id = {r.get('Id') for r in data.get('ins_customers_alltime', []) if r.get('Id')}
        ins_opp_ever = {r.get('Id') or r.get('AccountId') for r in data.get('ins_opp_alltime', []) if r.get('Id') or r.get('AccountId')}
        true_ins_customers = ins_customer_by_id | ins_opp_ever | set(ins_by_acct.keys())

        # Someone IS a travel customer if they have a travel opp in the last 3 years
        true_travel_customers = {r.get('Id') or r.get('AccountId') for r in data.get('travel_customers_3yr', []) if r.get('Id') or r.get('AccountId')}
        true_travel_customers |= set(travel_by_acct.keys())

        # Medicare detection uses ImportantActiveMemCoverage__c from _enrich_accounts
        medicare_ids: set = set()

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

        # True counts and sums from the database
        combined_rows = data.get('true_totals_combined', []) or []
        true_t_rev = 0.0
        true_i_rev = 0.0
        true_t_custs = 0
        true_i_custs = 0
        for r in combined_rows:
            rt_id = r.get('RecordTypeId')
            if rt_id == OPP_RT_TRAVEL_ID:
                true_t_rev = r.get('total') or 0.0
                true_t_custs = r.get('cnt') or 0
            elif rt_id == OPP_RT_INSURANCE_ID:
                true_i_rev = r.get('total') or 0.0
                true_i_custs = r.get('cnt') or 0

        # Python-side set arithmetic for remaining counts (100% accurate)
        ins_customer_by_id = {r.get('Id') for r in data.get('ins_customers_alltime', []) if r.get('Id')}
        ins_opp_ever = {r.get('Id') or r.get('AccountId') for r in data.get('ins_opp_alltime', []) if r.get('Id') or r.get('AccountId')}

        # Customers with both products
        both_opp_in_period = len(set(travel_by_acct.keys()) & set(ins_by_acct.keys()) - ins_customer_by_id)
        true_b_custs = len(ins_customer_by_id) + both_opp_in_period

        # Needs insurance count (Travel customer in period, no insurance ID, no insurance opp in 5yr)
        true_n_ins_custs = true_t_custs - len(ins_customer_by_id | ins_opp_ever)
        # Needs travel count (Insurance customer in period, no travel opp in 3yr)
        true_n_trv_custs = true_i_custs - len(true_travel_customers)

        return {
            'summary': {
                'total_travel_customers': true_t_custs,
                'total_insurance_customers': true_i_custs,
                'customers_with_both': max(0, true_b_custs),
                'needs_insurance_count': max(0, true_n_ins_custs),
                'needs_travel_count': max(0, true_n_trv_custs),
                'needs_insurance_value': round(
                    sum(travel_by_acct[a]['total'] for a in needs_insurance_ids), 2
                ),
                'needs_travel_value': round(
                    sum(ins_by_acct[a]['total'] for a in needs_travel_ids), 2
                ),
                'total_travel_revenue': round(true_t_rev, 2),
                'total_insurance_revenue': round(true_i_rev, 2),
            },
            'needs_insurance': needs_insurance,
            'needs_travel': needs_travel,
            'date_range': {'start': sd, 'end': ed},
        }

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


# ── Membership Upgrade Cross-Sell ─────────────────────────────────────────────

# Membership tiers in order (lowest to highest)
_MEMBERSHIP_TIERS = ['Classic', 'Basic', 'Plus', 'Premier']
_UPGRADEABLE_TIERS = {'Classic', 'Basic', 'Plus'}  # Premier is top, can't upgrade


def _build_membership_reason(acct: dict, total_spend: float, opp_count: int, current_tier: str) -> str:
    """Build actionable reason for membership upgrade or enrollment."""
    spend_str = f"${total_spend:,.0f}"
    age = acct.get('age')
    tenure = acct.get('tenure_years')
    ltv = (acct.get('ltv', '') or '').upper()[:1]

    parts = []
    if not current_tier:
        next_tier = 'Basic'
        parts.append(f"Non-member with {spend_str} active spend ({opp_count} transaction{'s' if opp_count != 1 else ''})")
        parts.append(f"Strong prospect for {next_tier} membership enrollment")
        if total_spend >= 2000:
            parts.append("Active spending qualifies them for high-value membership benefits")
    else:
        tier_idx = _MEMBERSHIP_TIERS.index(current_tier) if current_tier in _MEMBERSHIP_TIERS else 0
        next_tier = _MEMBERSHIP_TIERS[min(tier_idx + 1, len(_MEMBERSHIP_TIERS) - 1)]
        parts.append(f"Currently {current_tier} member with {spend_str} spend ({opp_count} transaction{'s' if opp_count != 1 else ''})")

        if total_spend >= 10_000:
            parts.append(f"High spender — strong candidate for {next_tier} upgrade")
        elif total_spend >= 5_000:
            parts.append(f"Moderate spender — would benefit from {next_tier} perks")

        if tenure and tenure >= 5:
            parts.append(f"Loyal {tenure}-year member — retention upgrade opportunity")
        elif tenure and tenure >= 2:
            parts.append(f"{tenure}-year member — reward loyalty with upgrade")

    if ltv in ('A', 'B'):
        parts.append(f"LTV tier {ltv} — high-value, prioritize")

    if age and age >= 55:
        parts.append("Travel benefits of higher tier align with demographic")

    return '. '.join(parts)


@router.get("/api/cross-sell/membership-upgrades")
def membership_upgrade_insights(
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Find customers eligible for membership upgrade or enrollment based on spend and tier."""
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"membership_upgrades_v2_{sd}_{ed}"

    def fetch():
        # Get accounts with low-tier memberships or no membership that have recent activity
        data = sf_parallel(
            # Active customers (travel or insurance) in the period
            active_travel=f"""
                SELECT AccountId, COUNT(Id) cnt, SUM(Amount) total
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                  AND Amount != null AND AccountId != null
                GROUP BY AccountId
                LIMIT 2000
            """,
            active_insurance=f"""
                SELECT AccountId, COUNT(Id) cnt, SUM(Amount) total
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_INSURANCE_ID}'
                  AND {WON_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                  AND Amount != null AND AccountId != null
                GROUP BY AccountId
                LIMIT 2000
            """,
            true_needs_mem_custs=f"""
                SELECT COUNT(Id) cnt FROM Account
                WHERE (ImportantActiveMemCoverage__c = null OR (NOT ImportantActiveMemCoverage__c IN ('B','PLUS','PREMIER','Classic')))
                  AND (Member_Status__c != 'A' OR ImportantActiveMemExpiryDate__c < TODAY OR ImportantActiveMemExpiryDate__c = null)
                  AND Id IN (
                      SELECT AccountId FROM Opportunity
                      WHERE RecordTypeId IN ('{OPP_RT_TRAVEL_ID}', '{OPP_RT_INSURANCE_ID}')
                        AND {WON_STAGES}
                        AND CloseDate >= {sd} AND CloseDate <= {ed}
                        AND Amount != null
                  )
            """
        )

        # Merge all active accounts with spend totals
        acct_spend: dict[str, dict] = {}
        for r in data.get('active_travel', []):
            aid = r.get('AccountId')
            if aid:
                acct_spend.setdefault(aid, {'total': 0, 'cnt': 0})
                acct_spend[aid]['total'] += (r.get('total') or 0)
                acct_spend[aid]['cnt'] += (r.get('cnt') or 0)
        for r in data.get('active_insurance', []):
            aid = r.get('AccountId')
            if aid:
                acct_spend.setdefault(aid, {'total': 0, 'cnt': 0})
                acct_spend[aid]['total'] += (r.get('total') or 0)
                acct_spend[aid]['cnt'] += (r.get('cnt') or 0)

        if not acct_spend:
            return {
                'summary': {
                    'total_upgradeable': 0,
                    'upgrade_value': 0,
                    'total_needs_membership': 0,
                    'needs_membership_value': 0,
                    'by_tier': {},
                },
                'upgrades': [],
                'needs_membership': [],
                'customers': [],
                'date_range': {'start': sd, 'end': ed},
            }

        # Enrich all active accounts to get membership level
        all_ids = list(acct_spend.keys())
        account_details = _enrich_accounts(all_ids)

        sf_base = sf_instance_url()

        upgrades = []
        needs_membership = []
        tier_counts: dict[str, int] = defaultdict(int)
        for aid, spend in acct_spend.items():
            acct = account_details.get(aid, {})
            membership = acct.get('membership', '')

            score, priority = _score_customer(spend['total'], spend['cnt'], acct.get('ltv', ''))

            # Case 1: Non-member (needs membership)
            if not membership:
                needs_membership.append({
                    'account_id': aid,
                    'account_name': acct.get('name', ''),
                    'phone': acct.get('phone', ''),
                    'email': acct.get('email', ''),
                    'city': acct.get('city', ''),
                    'ltv': acct.get('ltv', ''),
                    'current_tier': 'Non-Member',
                    'upgrade_to': 'Basic',
                    'total_spend': round(spend['total'], 2),
                    'transaction_count': spend['cnt'],
                    'score': score,
                    'priority': priority,
                    'reason': _build_membership_reason(acct, spend['total'], spend['cnt'], ''),
                    'sf_link': f"{sf_base}/{aid}",
                })
                continue

            # Case 2: Upgradeable member
            if membership not in _UPGRADEABLE_TIERS:
                continue

            tier_counts[membership] += 1
            tier_idx = _MEMBERSHIP_TIERS.index(membership)
            next_tier = _MEMBERSHIP_TIERS[min(tier_idx + 1, len(_MEMBERSHIP_TIERS) - 1)]

            upgrades.append({
                'account_id': aid,
                'account_name': acct.get('name', ''),
                'phone': acct.get('phone', ''),
                'email': acct.get('email', ''),
                'city': acct.get('city', ''),
                'ltv': acct.get('ltv', ''),
                'current_tier': membership,
                'upgrade_to': next_tier,
                'total_spend': round(spend['total'], 2),
                'transaction_count': spend['cnt'],
                'score': score,
                'priority': priority,
                'reason': _build_membership_reason(acct, spend['total'], spend['cnt'], membership),
                'sf_link': f"{sf_base}/{aid}",
            })

        # Sort by score descending, take top N
        upgrades.sort(key=lambda c: c['score'], reverse=True)
        needs_membership.sort(key=lambda c: c['score'], reverse=True)

        top_upgrades = upgrades[:TOP_N]
        top_needs_membership = needs_membership[:TOP_N]

        # Get true needs-membership count from Salesforce query
        true_needs_mem = (data.get('true_needs_mem_custs', [{}])[0] or {}).get('cnt', 0) or 0

        return {
            'summary': {
                'total_upgradeable': len(upgrades),
                'upgrade_value': round(sum(c['total_spend'] for c in upgrades), 2),
                'total_needs_membership': true_needs_mem,
                'needs_membership_value': round(sum(c['total_spend'] for c in needs_membership), 2),
                'by_tier': dict(tier_counts),
            },
            'upgrades': top_upgrades,
            'needs_membership': top_needs_membership,
            'customers': top_upgrades,  # Backward compatibility
            'date_range': {'start': sd, 'end': ed},
        }

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


# ── Medicare Eligibility Cross-Sell ───────────────────────────────────────────

def _score_medicare_candidate(ltv: str, membership: str) -> tuple[int, str]:
    """Score a Medicare eligibility candidate 0-100 based on LTV and membership tier."""
    # LTV score (0-50): A=50, B=40, C=30, D=20, E=10
    ltv_scores = {'A': 50, 'B': 40, 'C': 30, 'D': 20, 'E': 10}
    ltv_clean = (ltv or '').strip().upper()[:1]
    ltv_score = ltv_scores.get(ltv_clean, 25)

    # Membership score (0-50): Premier=50, Plus=40, Basic/Classic=20
    mem_scores = {'PREMIER': 50, 'PLUS': 40, 'BASIC': 20, 'CLASSIC': 20, 'B': 20}
    mem_clean = (membership or '').strip().upper()
    mem_score = mem_scores.get(mem_clean, 20)

    total = ltv_score + mem_score
    if total >= 80:
        priority = 'high'
    elif total >= 50:
        priority = 'medium'
    else:
        priority = 'low'

    return total, priority


def _build_medicare_reason(acct: dict, age: int, days_until_65: int) -> str:
    """Build actionable reason for Medicare outreach."""
    membership = acct.get('membership', '')
    ltv = (acct.get('ltv', '') or '').upper()[:1]

    parts = []
    if days_until_65 > 0:
        parts.append(f"Turns 65 in {days_until_65} days (IEP window opening soon)")
    elif days_until_65 == 0:
        parts.append("Turns 65 today! IEP window active")
    else:
        parts.append(f"Age {age} (within Medicare eligibility range)")

    if membership:
        parts.append(f"{membership} member")
    if ltv:
        parts.append(f"LTV {ltv}")

    parts.append("Target for Medicare Specialist outreach")
    return '. '.join(parts)


@router.get("/api/cross-sell/medicare-eligibility")
def medicare_eligibility_insights(
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Find active members turning 65 (aged 64-65) who do not have any Medicare opportunity."""
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"medicare_eligibility_v1_{sd}_{ed}"

    def fetch():
        from datetime import date
        today = date.today()

        # Birthdate range for members turning 65 (currently aged 64 or 65)
        # Born between 66 years ago and 64 years ago
        birth_start = date(today.year - 66, today.month, today.day).isoformat()
        birth_end = date(today.year - 64, today.month, today.day).isoformat()

        _exp_base = (
            f"IsPersonAccount = true AND Member_Status__c = 'A'"
            f" AND Out_of_Territory_Member__c = false"
            f" AND Billing_Region__c IN ('Western','Rochester','Central')"
            f" AND ImportantActiveMemCoverage__c IN ('B','PLUS','PREMIER')"
            f" AND ImportantActiveMemExpiryDate__c >= {today.isoformat()}"
        )

        OPP_RT_MEDICARE_ID = '012Pb0000006hIhIAI'
        data = sf_parallel(
            candidates=f"""
                SELECT Id, Name, Phone, PersonEmail, BillingCity, LTV__c, PersonBirthdate,
                       ImportantActiveMemCoverage__c, Account_Member_Since__c
                FROM Account
                WHERE {_exp_base}
                  AND PersonBirthdate != null
                  AND PersonBirthdate >= {birth_start}
                  AND PersonBirthdate <= {birth_end}
                LIMIT 2000
            """,
            medicare_opps=f"""
                SELECT AccountId
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_MEDICARE_ID}'
                  AND AccountId != null
                LIMIT 5000
            """
        )

        candidate_accounts = data.get('candidates', [])
        medicare_opps = data.get('medicare_opps', [])

        # Build set of AccountIds that already have Medicare opportunities
        excluded_ids = {opp.get('AccountId') for opp in medicare_opps if opp.get('AccountId')}

        # Filter and score candidates
        eligible_candidates = []
        for r in candidate_accounts:
            aid = r['Id']
            if aid in excluded_ids:
                continue

            bd_str = r.get('PersonBirthdate')
            age = None
            days_until_65 = 0
            if bd_str:
                try:
                    born = date.fromisoformat(bd_str)
                    age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
                    # 65th birthday
                    try:
                        bday_65 = date(born.year + 65, born.month, born.day)
                    except ValueError:
                        bday_65 = date(born.year + 65, born.month, 28)
                    days_until_65 = (bday_65 - today).days
                except Exception:
                    pass

            raw_mem = (r.get('ImportantActiveMemCoverage__c') or '').strip().upper()
            membership = {'PLUS': 'Plus', 'PREMIER': 'Premier', 'B': 'Basic',
                          'BASIC': 'Basic', 'CLASSIC': 'Classic'}.get(raw_mem, raw_mem.title() if raw_mem else '')

            score, priority = _score_medicare_candidate(r.get('LTV__c', ''), membership)

            acct_info = {
                'membership': membership,
                'ltv': r.get('LTV__c', ''),
            }

            sf_base = sf_instance_url()
            eligible_candidates.append({
                'account_id': aid,
                'account_name': r.get('Name', ''),
                'phone': r.get('Phone', ''),
                'email': r.get('PersonEmail', ''),
                'city': r.get('BillingCity', ''),
                'ltv': r.get('LTV__c', ''),
                'membership': membership,
                'age': age,
                'birthdate': bd_str,
                'days_until_65': days_until_65,
                'score': score,
                'priority': priority,
                'reason': _build_medicare_reason(acct_info, age or 64, days_until_65),
                'sf_link': f"{sf_base}/{aid}",
            })

        # Sort by score descending, then by days_until_65 ascending (closer to 65 first)
        eligible_candidates.sort(key=lambda c: (-c['score'], c['days_until_65']))
        top_candidates = eligible_candidates[:TOP_N]

        # Tier breakdown counts
        priority_counts = {'high': 0, 'medium': 0, 'low': 0}
        for c in eligible_candidates:
            priority_counts[c['priority']] += 1

        return {
            'summary': {
                'total_eligible': len(eligible_candidates),
                'high_priority_count': priority_counts['high'],
                'medium_priority_count': priority_counts['medium'],
                'low_priority_count': priority_counts['low'],
            },
            'customers': top_candidates,
            'date_range': {'start': sd, 'end': ed},
        }

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)

