"""Customer 360 — member profile, product holdings, transactions, AI upsell, email."""

import os
import logging
import requests as _req
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from auth import get_current_user
from models import User
from sf_client import sf_parallel, sf_query_all, sf_instance_url
from routers.ai_config import call_ai, get_ai_config
import cache
from shared import VALID_LINES, line_filter_opp as _line_filter, resolve_dates as _resolve_dates

router = APIRouter()
log = logging.getLogger('salesinsight.customer')

MEMBER_STATUS = {'A': 'Active', 'X': 'Expired', 'C': 'Cancelled', 'L': 'Lapsed', 'P': 'Pending'}

# ── Top Customers by Revenue ─────────────────────────────────────────────────

@router.get('/api/customers/top-revenue')
def get_top_customers(
    line: str = Query('Travel'),
    limit: int = Query(25, ge=10, le=100),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    _user: User = Depends(get_current_user),
):
    """Top N customers by closed-won revenue. Uses Opportunity aggregation — no Account table scan."""
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, 12)
    key = f"top_customers_{line}_{limit}_{sd}_{ed}"

    def fetch():
        lf = _line_filter(line)
        # Step 1: aggregate by AccountId only (Account.Name can't be used in GROUP BY)
        agg_rows = sf_query_all(f"""
            SELECT AccountId,
                   COUNT(Id) deal_count,
                   SUM(Amount) total_rev,
                   AVG(Amount) avg_deal
            FROM Opportunity
            WHERE StageName IN ('Closed Won','Invoice')
              AND CloseDate >= {sd} AND CloseDate <= {ed}
              AND Amount != null
              AND {lf}
            GROUP BY AccountId
            ORDER BY SUM(Amount) DESC
            LIMIT {limit}
        """)
        if not agg_rows:
            return []

        # Step 2: fetch names for top AccountIds
        ids_csv = ','.join(f"'{r['AccountId']}'" for r in agg_rows if r.get('AccountId'))
        name_map: dict = {}
        if ids_csv:
            name_rows = sf_query_all(f"""
                SELECT Id, Name FROM Account WHERE Id IN ({ids_csv})
            """)
            name_map = {r['Id']: r.get('Name', '') for r in name_rows}

        result = []
        for r in agg_rows:
            aid = r.get('AccountId', '')
            result.append({
                'account_id': aid,
                'name': name_map.get(aid, aid),
                'total_rev': float(r.get('total_rev') or 0),
                'deal_count': int(r.get('deal_count') or 0),
                'avg_deal': float(r.get('avg_deal') or 0),
            })
        return result

    return cache.cached_query(key, fetch, ttl=3600, disk_ttl=21600)


# ── Search ──────────────────────────────────────────────────────────────────

@router.get('/api/customers/search')
def search_customers(
    q: str = Query(..., min_length=2),
    _user: User = Depends(get_current_user),
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
                ORDER BY CreatedDate DESC LIMIT 60
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

    # Product 360 — which product families does this customer have?
    try:
        base_url = sf_instance_url()
    except Exception:
        base_url = ''

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

    # Transactions — last 30 opportunities as history
    transactions = [_fmt_opp(o, base_url) for o in opps[:30]]

    # Opportunity groups for product breakdown
    opp_groups: dict = {}
    for o in opps:
        rt = (o.get('RecordType') or {}).get('Name', 'Other')
        opp_groups.setdefault(rt, []).append(_fmt_opp(o, base_url))

    return {
        'account':      _fmt_account(acct, base_url),
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
    _user: User = Depends(get_current_user),
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


# ── Email Customer Profile ────────────────────────────────────────────────────

class CustomerEmailRequest(BaseModel):
    to: str
    note: Optional[str] = None


def _build_customer_email_html(profile: dict) -> str:
    acct   = profile.get('account', {})
    p360   = profile.get('product_360', {})
    txns   = profile.get('transactions', [])[:15]
    mships = profile.get('memberships', [])

    def _c(v): return f'${v:,.0f}' if v else '—'
    def _d(v): return (v or '—')[:10]

    status_color = '#10b981' if acct.get('member_status') == 'A' else '#f59e0b'
    products_html = ''.join(
        f'<span style="display:inline-block;margin:2px 4px;padding:2px 10px;border-radius:12px;font-size:11px;'
        f'background:{"#d1fae5" if v else "#f3f4f6"};color:{"#065f46" if v else "#9ca3af"}">'
        f'{"✓" if v else "○"} {k.replace("_", " ").title()}</span>'
        for k, v in p360.items()
    )
    txn_rows = ''.join(
        f'<tr style="border-bottom:1px solid #f3f4f6">'
        f'<td style="padding:6px 10px;font-size:12px;color:#6b7280">{_d(t.get("created_date"))}</td>'
        f'<td style="padding:6px 10px;font-size:12px">{t.get("record_type","")}</td>'
        f'<td style="padding:6px 10px;font-size:12px">{t.get("name","")[:50]}</td>'
        f'<td style="padding:6px 10px;font-size:12px;text-align:right;font-weight:600">{_c(t.get("amount"))}</td>'
        f'<td style="padding:6px 10px;font-size:12px;color:#6b7280">{t.get("stage","")}</td>'
        f'</tr>'
        for t in txns
    )
    ms_rows = ''.join(
        f'<div style="font-size:12px;margin:2px 0;color:#374151">'
        f'<strong>{m.get("level","")}</strong> — {m.get("member_number","")} '
        f'({m.get("status","")}) Exp: {_d(m.get("expiry_date"))}</div>'
        for m in mships[:3]
    )

    return f"""<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f9fafb">
<div style="max-width:700px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
  <div style="background:#1e293b;padding:24px 32px">
    <h1 style="margin:0;font-size:20px;color:#fff">{acct.get('name','')}</h1>
    <p style="margin:4px 0 0;font-size:13px;color:#94a3b8">Customer 360 Profile · SalesPulse</p>
  </div>
  <div style="padding:24px 32px">
    <!-- Member info -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#6b7280;width:160px">Member ID</td>
        <td style="padding:4px 0;font-size:13px;font-weight:600">{acct.get('member_id') or '—'}</td>
        <td style="padding:4px 0;font-size:13px;color:#6b7280;width:160px">Status</td>
        <td style="padding:4px 0"><span style="background:{status_color}20;color:{status_color};padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600">{acct.get('member_status_label') or '—'}</span></td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#6b7280">Coverage</td>
        <td style="padding:4px 0;font-size:13px;font-weight:600">{acct.get('coverage') or '—'}</td>
        <td style="padding:4px 0;font-size:13px;color:#6b7280">Member Since</td>
        <td style="padding:4px 0;font-size:13px">{_d(acct.get('member_since'))}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#6b7280">LTV Tier</td>
        <td style="padding:4px 0;font-size:13px;font-weight:600">{acct.get('ltv') or '—'}</td>
        <td style="padding:4px 0;font-size:13px;color:#6b7280">MPI</td>
        <td style="padding:4px 0;font-size:13px">{acct.get('mpi') or '—'}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#6b7280">Email</td>
        <td style="padding:4px 0;font-size:13px">{acct.get('email') or '—'}</td>
        <td style="padding:4px 0;font-size:13px;color:#6b7280">Phone</td>
        <td style="padding:4px 0;font-size:13px">{acct.get('phone') or '—'}</td>
      </tr>
    </table>

    <!-- Memberships -->
    {f'<div style="margin-bottom:20px"><h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em">Memberships</h3>{ms_rows}</div>' if ms_rows else ''}

    <!-- Product 360 -->
    <div style="margin-bottom:20px">
      <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em">Product 360</h3>
      <div>{products_html}</div>
    </div>

    <!-- Transactions -->
    <div style="margin-bottom:20px">
      <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em">Recent Transactions</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
          <th style="padding:6px 10px;text-align:left;color:#6b7280">Date</th>
          <th style="padding:6px 10px;text-align:left;color:#6b7280">Type</th>
          <th style="padding:6px 10px;text-align:left;color:#6b7280">Name</th>
          <th style="padding:6px 10px;text-align:right;color:#6b7280">Amount</th>
          <th style="padding:6px 10px;text-align:left;color:#6b7280">Stage</th>
        </tr></thead>
        <tbody>{txn_rows}</tbody>
      </table>
    </div>

    <p style="font-size:11px;color:#9ca3af;margin-top:24px;border-top:1px solid #f3f4f6;padding-top:12px">
      Generated by SalesPulse · AAA Western &amp; Central NY · Data from Salesforce
    </p>
  </div>
</div></body></html>"""


@router.post('/api/customers/{account_id}/email')
def email_customer_profile(
    account_id: str,
    body: CustomerEmailRequest,
    user: User = Depends(get_current_user),
):
    to_email = (body.to or '').strip()
    if not to_email or '@' not in to_email:
        raise HTTPException(400, 'Valid email address required')

    agentmail_key   = os.environ.get('AGENTMAIL_API_KEY', '')
    agentmail_inbox = os.environ.get('AGENTMAIL_INBOX', 'salespulse@agentmail.to')
    if not agentmail_key:
        raise HTTPException(500, 'Email service not configured (AGENTMAIL_API_KEY missing)')

    profile = get_customer_profile(account_id, user)
    if 'error' in profile:
        raise HTTPException(422, profile['error'])

    name = profile.get('account', {}).get('name', 'Customer')
    html = _build_customer_email_html(profile)
    if body.note:
        html = html.replace(
            'Generated by SalesPulse',
            f'<em style="color:#374151">{body.note}</em><br>Generated by SalesPulse'
        )

    resp = _req.post(
        f'https://api.agentmail.to/v0/inboxes/{agentmail_inbox}/messages/send',
        headers={'Authorization': f'Bearer {agentmail_key}', 'Content-Type': 'application/json'},
        json={'to': [to_email], 'subject': f'{name} — Customer 360 Profile', 'html': html},
        timeout=15,
    )
    if resp.status_code >= 400:
        log.warning('AgentMail failed: %s %s', resp.status_code, resp.text[:200])
        raise HTTPException(500, f'Failed to send email: {resp.text[:200]}')

    log.info('Customer profile emailed: %s → %s (by %s)', name, to_email, user.email)
    return {'status': 'sent', 'to': to_email}



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


def _fmt_account(r: dict, base_url: str = '') -> dict:
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
        'sf_url': f"{base_url}/lightning/r/Account/{r.get('Id')}/view" if base_url else None,
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


def _fmt_opp(r: dict, base_url: str = '') -> dict:
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
        'sf_url': f"{base_url}/lightning/r/Opportunity/{r.get('Id')}/view" if base_url else None,
    }
