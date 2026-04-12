from fastapi import APIRouter, Depends
import logging
from auth import get_current_user
from models import User
from sf_client import sf_parallel, sf_query_all, sf_instance_url
from shared import six_months_ago
from .utils import _fmt_account, _fmt_membership, _fmt_vehicle, _fmt_opp, _fmt_lead

router = APIRouter()
log = logging.getLogger('salesinsight.customer')

# ── 360 Profile ─────────────────────────────────────────────────────────────

@router.get('/api/customers/{account_id}')
def get_customer_profile(
    account_id: str,
    _user: User = Depends(get_current_user),
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
                  AND (StageName IN ('Closed Won','Invoice') OR CloseDate >= {six_months_ago()})
                ORDER BY CreatedDate DESC LIMIT 60
            """,
            leads=f"""
                SELECT Id, Name, Status, IsConverted, ConvertedDate, CreatedDate,
                       RecordType.Name, Owner.Name, LeadSource
                FROM Lead
                WHERE ConvertedAccountId = '{account_id}'
                ORDER BY CreatedDate DESC LIMIT 30
            """,
        )
    except Exception as e:
        log.error(f'Customer profile error {account_id}: {e}')
        return {'error': str(e)}

    acct_list = data.get('account') or []
    if not acct_list:
        return {'error': 'Customer not found'}

    acct   = acct_list[0]
    mships = data.get('memberships') or []
    vehs   = data.get('vehicles') or []
    opps   = data.get('opportunities') or []
    raw_leads = data.get('leads') or []

    # Also try email-based lead lookup for unlinked leads
    email = acct.get('PersonEmail')
    if email:
        try:
            email_leads = sf_query_all(f"""
                SELECT Id, Name, Status, IsConverted, ConvertedDate, CreatedDate,
                       RecordType.Name, Owner.Name, LeadSource
                FROM Lead
                WHERE Email = '{email}' AND ConvertedAccountId = null
                ORDER BY CreatedDate DESC LIMIT 10
            """)
            # Deduplicate by Id
            seen = {l['Id'] for l in raw_leads}
            for l in email_leads:
                if l.get('Id') not in seen:
                    raw_leads.append(l)
        except Exception:
            pass

    # Product 360 — which product families does this customer have?
    try:
        base_url = sf_instance_url()
    except Exception:
        base_url = ''

    opp_types = {(o.get('RecordType') or {}).get('Name', 'Other') for o in opps}
    active_mship = any(m.get('Status') == 'A' for m in mships)
    member_status = acct.get('Member_Status__c')
    ers_calls = acct.get('ERS_Calls_Made_CP__c') or 0
    product_360 = {
        'membership': active_mship or member_status == 'A',
        'travel':     'Travel' in opp_types,
        'insurance':  'Insurance' in opp_types or bool(acct.get('Insuance_Customer_ID__c')),
        'medicare':   'Medicare' in opp_types,
        'driver':     'Driver Programs' in opp_types,
        'ers':        ers_calls > 0,
    }

    # Transactions — last 30 opportunities as history
    transactions = [_fmt_opp(o, base_url) for o in opps[:30]]

    # Opportunity groups for product breakdown
    opp_groups: dict = {}
    for o in opps:
        rt = (o.get('RecordType') or {}).get('Name', 'Other')
        opp_groups.setdefault(rt, []).append(_fmt_opp(o, base_url))

    # Top advisors — derived from opportunity owners, most recent interaction first
    advisor_map: dict = {}
    for o in opps:
        owner = (o.get('Owner') or {}).get('Name')
        if not owner:
            continue
        if owner not in advisor_map:
            advisor_map[owner] = {
                'name': owner,
                'deal_count': 0,
                'total_revenue': 0,
                'last_interaction': o.get('CreatedDate', ''),
            }
        advisor_map[owner]['deal_count'] += 1
        advisor_map[owner]['total_revenue'] += o.get('Amount') or 0
        opp_date = o.get('CreatedDate', '')
        if opp_date > advisor_map[owner]['last_interaction']:
            advisor_map[owner]['last_interaction'] = opp_date
    top_advisors = sorted(advisor_map.values(), key=lambda a: a['last_interaction'], reverse=True)[:3]

    return {
        'account':      _fmt_account(acct, base_url),
        'memberships':  [_fmt_membership(m, base_url) for m in mships],
        'vehicles':     [_fmt_vehicle(v) for v in vehs],
        'product_360':  product_360,
        'transactions': transactions,
        'opportunities': opp_groups,
        'leads':        [_fmt_lead(l, base_url) for l in raw_leads],
        'top_advisors': top_advisors,
    }


