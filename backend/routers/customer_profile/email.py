from fastapi import APIRouter, Depends, HTTPException
import os
import logging
import requests as _req
from typing import Optional
from auth import get_current_user
from models import User
from schemas import CustomerEmailRequest
from .details import get_customer_profile

router = APIRouter()
log = logging.getLogger('salesinsight.customer')

# ── Email Customer Profile ────────────────────────────────────────────────────

from schemas import CustomerEmailRequest


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


