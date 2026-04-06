"""Customer 360 — member profile, product holdings, transactions, AI upsell."""

import logging
from fastapi import APIRouter, Depends, Query
from auth import require_user
from models import User
from sf_client import sf_parallel, sf_query_all
from routers.ai_config import call_ai, get_ai_config

router = APIRouter()
log = logging.getLogger('salesinsight.customer')

MEMBER_STATUS = {'A': 'Active', 'X': 'Expired', 'C': 'Cancelled', 'L': 'Lapsed', 'P': 'Pending'}


# ── Search ──────────────────────────────────────────────────────────────────

@router.get('/api/customers/search')
def search_customers(
    q: str = Query(..., min_length=2),
    _user: User = Depends(require_user),
):
    safe = q.replace("'", "\\'")
    try:
        records = sf_query_all(f"""
            SELECT Id, Name, PersonEmail,
                   Account_Member_ID__c, Member_Status__c,
                   Account_Member_Since__c, ImportantActiveMemCoverage__c,
                   Region__c, MPI__c, BillingCity, BillingState
            FROM Account
            WHERE RecordType.Name = 'Person Account'
              AND (Name LIKE '%{safe}%' OR Account_Member_ID__c LIKE '%{safe}%')
            ORDER BY Name
            LIMIT 20
        """)
        return {'results': [_fmt_summary(r) for r in records]}
    except Exception as e:
        log.error(f'Customer search error: {e}')
        return {'results': []}


# ── 360 Profile ─────────────────────────────────────────────────────────────

@router.get('/api/customers/{account_id}')
def get_customer_profile(
    account_id: str,
    _user: User = Depends(require_user),
):
    try:
        data = sf_parallel(
            account=f"""
                SELECT Id, Name, PersonEmail, Phone, PersonBirthdate,
                       Account_Member_ID__c, Member_Status__c,
                       Account_Member_Since__c, ImportantActiveMemCoverage__c,
                       ImportantActiveMemExpiryDate__c,
                       Insuance_Customer_ID__c, EPIC_GUID__c,
                       Region__c, MPI__c, LTV__c,
                       FinServ__InsuranceCustomerSince__c,
                       FinServ__TotalHouseholdPremiums__c,
                       BillingStreet, BillingCity, BillingState, BillingPostalCode,
                       ERS_Calls_Made_CP__c, ERS_Calls_Available_CP__c
                FROM Account WHERE Id = '{account_id}' LIMIT 1
            """,
            memberships=f"""
                SELECT Id, Name, Status, SerialNumber, PurchaseDate, UsageEndDate, Price
                FROM Asset
                WHERE AccountId = '{account_id}' AND RecordType.Name = 'Membership'
                ORDER BY PurchaseDate DESC NULLS LAST LIMIT 10
            """,
            vehicles=f"""
                SELECT Id, Name, Status, SerialNumber, Description
                FROM Asset
                WHERE AccountId = '{account_id}' AND RecordType.Name = 'Vehicle'
                ORDER BY Name LIMIT 10
            """,
            opportunities=f"""
                SELECT Id, Name, StageName, Amount, Earned_Commission_Amount__c,
                       CloseDate, CreatedDate, RecordType.Name,
                       Destination_Region__c, Axis_Trip_ID__c, Owner.Name
                FROM Opportunity
                WHERE AccountId = '{account_id}'
                ORDER BY CreatedDate DESC LIMIT 50
            """,
        )
    except Exception as e:
        log.error(f'Customer profile error {account_id}: {e}')
        return {'error': str(e)}

    acct_list = data.get('account', {}).get('records', [])
    if not acct_list:
        return {'error': 'Customer not found'}

    acct   = acct_list[0]
    mships = data.get('memberships', {}).get('records', [])
    vehs   = data.get('vehicles', {}).get('records', [])
    opps   = data.get('opportunities', {}).get('records', [])

    # Product 360 — which product families does this customer have?
    opp_types = {(o.get('RecordType') or {}).get('Name', 'Other') for o in opps}
    product_360 = {
        'membership': bool(mships or acct.get('Account_Member_ID__c')),
        'travel':     'Travel' in opp_types,
        'insurance':  'Insurance' in opp_types or bool(acct.get('Insuance_Customer_ID__c')),
        'medicare':   'Medicare' in opp_types,
        'membership_services': 'Membership Services' in opp_types,
        'financial':  'Financial Services' in opp_types,
        'driver':     'Driver Programs' in opp_types,
        'ers':        bool(acct.get('ERS_Calls_Made_CP__c')),
    }

    # Transactions — last 20 opportunities as history
    transactions = [_fmt_opp(o) for o in opps[:20]]

    # Opportunity groups for product breakdown
    opp_groups: dict = {}
    for o in opps:
        rt = (o.get('RecordType') or {}).get('Name', 'Other')
        opp_groups.setdefault(rt, []).append(_fmt_opp(o))

    return {
        'account':      _fmt_account(acct),
        'memberships':  [_fmt_membership(m) for m in mships],
        'vehicles':     [_fmt_vehicle(v) for v in vehs],
        'product_360':  product_360,
        'transactions': transactions,
        'opportunities': opp_groups,
    }


# ── AI Upsell ────────────────────────────────────────────────────────────────

@router.post('/api/customers/{account_id}/upsell')
def get_upsell_analysis(
    account_id: str,
    _user: User = Depends(require_user),
):
    """Generate AI upsell recommendations for this customer."""
    profile_data = get_customer_profile(account_id, _user)
    if 'error' in profile_data:
        return profile_data

    acct    = profile_data['account']
    p360    = profile_data['product_360']
    txns    = profile_data['transactions']
    mships  = profile_data['memberships']

    active_products = [k.replace('_', ' ').title() for k, v in p360.items() if v]
    missing = [k.replace('_', ' ').title() for k, v in p360.items() if not v]
    recent_txns = '\n'.join(
        f"- {t['created_date']}: {t['record_type']} — {t['name']} — ${t['amount'] or 0:,.0f} ({t['stage']})"
        for t in txns[:10]
    )
    current_membership = mships[0]['level'] if mships else 'Unknown'
    member_since = acct.get('member_since', 'Unknown')
    mpi = acct.get('mpi') or 0

    cfg = get_ai_config()
    if not cfg.get('api_key'):
        return {'analysis': None, 'error': 'AI not configured'}

    prompt = f"""You are a AAA sales advisor analyzing a member profile to identify upsell and cross-sell opportunities.

## Member Profile
- Name: {acct['name']}
- Member Since: {member_since}
- Membership Level: {current_membership}
- Member Product Index (MPI): {mpi} (higher = more engaged, max ~5)
- Region: {acct.get('region', 'N/A')}
- Active Products: {', '.join(active_products) if active_products else 'None'}
- Products NOT yet held: {', '.join(missing) if missing else 'None'}
- Insurance Customer Since: {acct.get('insurance_since', 'N/A')}
- Total Household Premiums: ${acct.get('total_premiums') or 0:,.0f}

## Recent Transactions (last 10)
{recent_txns if recent_txns else 'No transactions found'}

## Your Task
Provide concise upsell/cross-sell recommendations. Use ## headers and bullet points.
Focus on:
1. **Membership upgrade** if on Basic/Plus (upgrade to Plus/Premier)
2. **Missing products** the member doesn't have yet
3. **Specific next actions** for the advisor based on transaction history
4. **Risk signals** — any signs of churn or disengagement

Be specific, actionable, and brief. Max 300 words."""

    try:
        text = call_ai(
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=600,
            cfg=cfg,
        )
        return {'analysis': text}
    except Exception as e:
        log.error(f'Upsell AI error: {e}')
        return {'analysis': None, 'error': str(e)}


# ── Formatters ───────────────────────────────────────────────────────────────

def _fmt_summary(r: dict) -> dict:
    return {
        'id':           r.get('Id'),
        'name':         r.get('Name'),
        'email':        r.get('PersonEmail'),
        'member_id':    r.get('Account_Member_ID__c'),
        'member_status': r.get('Member_Status__c'),
        'member_status_label': MEMBER_STATUS.get(r.get('Member_Status__c', ''), r.get('Member_Status__c', '')),
        'member_since': r.get('Account_Member_Since__c'),
        'coverage':     r.get('ImportantActiveMemCoverage__c'),
        'region':       r.get('Region__c'),
        'mpi':          r.get('MPI__c'),
        'city':         r.get('BillingCity'),
        'state':        r.get('BillingState'),
    }


def _fmt_account(r: dict) -> dict:
    status = r.get('Member_Status__c', '')
    return {
        'id':                    r.get('Id'),
        'name':                  r.get('Name'),
        'email':                 r.get('PersonEmail'),
        'phone':                 r.get('Phone'),
        'birthdate':             r.get('PersonBirthdate'),
        'member_id':             r.get('Account_Member_ID__c'),
        'member_status':         status,
        'member_status_label':   MEMBER_STATUS.get(status, status),
        'member_since':          r.get('Account_Member_Since__c'),
        'coverage':              r.get('ImportantActiveMemCoverage__c'),
        'membership_expiry':     r.get('ImportantActiveMemExpiryDate__c'),
        'insurance_customer_id': r.get('Insuance_Customer_ID__c'),
        'insurance_since':       r.get('FinServ__InsuranceCustomerSince__c'),
        'total_premiums':        r.get('FinServ__TotalHouseholdPremiums__c'),
        'region':                r.get('Region__c'),
        'mpi':                   r.get('MPI__c'),
        'ltv':                   r.get('LTV__c'),
        'address': {
            'street': r.get('BillingStreet'),
            'city':   r.get('BillingCity'),
            'state':  r.get('BillingState'),
            'zip':    r.get('BillingPostalCode'),
        },
        'ers_calls_made':      r.get('ERS_Calls_Made_CP__c'),
        'ers_calls_available': r.get('ERS_Calls_Available_CP__c'),
    }


def _fmt_membership(r: dict) -> dict:
    parts = [p.strip() for p in (r.get('Name') or '').split(' - ')]
    return {
        'id':           r.get('Id'),
        'name':         r.get('Name'),
        'level':        parts[1] if len(parts) > 1 else None,
        'member_number': parts[0] if parts else None,
        'status':       r.get('Status'),
        'purchase_date': r.get('PurchaseDate'),
        'expiry_date':  r.get('UsageEndDate'),
        'price':        r.get('Price'),
    }


def _fmt_vehicle(r: dict) -> dict:
    return {
        'id':          r.get('Id'),
        'name':        r.get('Name'),
        'status':      r.get('Status'),
        'vin':         r.get('SerialNumber'),
        'description': r.get('Description'),
    }


def _fmt_opp(r: dict) -> dict:
    return {
        'id':           r.get('Id'),
        'name':         r.get('Name'),
        'stage':        r.get('StageName'),
        'amount':       r.get('Amount'),
        'commission':   r.get('Earned_Commission_Amount__c'),
        'close_date':   r.get('CloseDate'),
        'created_date': (r.get('CreatedDate') or '')[:10],
        'record_type':  (r.get('RecordType') or {}).get('Name', 'Other'),
        'destination':  r.get('Destination_Region__c'),
        'trip_id':      r.get('Axis_Trip_ID__c'),
        'owner':        (r.get('Owner') or {}).get('Name'),
    }
