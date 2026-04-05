"""Agent Report — Email and PDF-print endpoints.

POST /api/advisor/email  — sends an HTML agent scorecard via AgentMail.

Requires env vars:
  AGENTMAIL_API_KEY   — AgentMail bearer token
  AGENTMAIL_INBOX     — sender inbox address (default: salespulse@agentmail.to)
"""

import os
import logging
import requests as _req
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

from routers.sales_agent_profile import agent_profile as _agent_profile

router = APIRouter()
log = logging.getLogger('email_report')


# ── Request body ─────────────────────────────────────────────────────────────

class EmailReportRequest(BaseModel):
    to: str                    # recipient email
    agent_name: str            # advisor name (used to fetch data)
    line: str = 'Travel'
    period: int = 12
    start_date: Optional[str] = None
    end_date: Optional[str] = None


# ── HTML builder ─────────────────────────────────────────────────────────────

def _sc(pct: float | None) -> str:
    """Color hex for a performance percentage."""
    if pct is None:
        return '#999'
    if pct >= 80:
        return '#10b981'
    if pct >= 50:
        return '#f59e0b'
    return '#ef4444'


def _fmt_currency(v: float | None, compact: bool = False) -> str:
    if v is None:
        return '—'
    if compact and v >= 1_000_000:
        return f'${v / 1_000_000:.1f}M'
    if compact and v >= 1_000:
        return f'${v / 1_000:.0f}K'
    return f'${v:,.0f}'


def _delta_color(pct: float | None) -> str:
    if pct is None:
        return '#999'
    return '#10b981' if pct >= 0 else '#ef4444'


def build_report_html(p: dict, start_date: str, end_date: str) -> str:
    """Build a standalone HTML email body from an agent profile dict."""
    name  = p.get('name', 'Advisor')
    line  = p.get('line', 'Travel')
    s     = p.get('summary', {})
    yoy   = p.get('yoy', {})
    team  = p.get('team', {})
    months = p.get('months', [])
    top_opps = p.get('top_opportunities', [])
    strengths = p.get('strengths', [])
    improvements = p.get('improvements', [])
    brief = p.get('writeup', '')
    cy    = p.get('current_year', '')

    nl = '\n'

    def sign(v):
        return '+' if (v or 0) >= 0 else ''

    # KPI row — precompute all cell HTML
    rev_delta  = f"{sign(yoy.get('revenue_pct'))}{yoy.get('revenue_pct', 0):.1f}% YoY"
    deal_delta = f"{sign(yoy.get('deals_pct'))}{yoy.get('deals_pct', 0):.1f}% YoY"
    kpis = [
        ('Revenue',    _fmt_currency(s.get('revenue'), True),
         rev_delta,    _delta_color(yoy.get('revenue_pct'))),
        ('Commission', _fmt_currency(s.get('commission'), True),
         'PY: ' + _fmt_currency(s.get('prior_commission')), '#6366f1'),
        ('Deals',      str(s.get('deals', 0)),
         deal_delta,   _delta_color(yoy.get('deals_pct'))),
        ('Win Rate',   f"{s.get('win_rate', 0):.1f}%",
         f"Team: {team.get('win_rate', 0):.1f}%", '#6366f1'),
        ('Pipeline',   _fmt_currency(s.get('pipeline_value'), True),
         f"{s.get('pipeline_count', 0)} open deals", '#6366f1'),
    ]
    kpi_cells = ''.join(
        '<td style="padding:12px 8px;text-align:center;background:#f8fafc;border-radius:6px">'
        f'<div style="font-size:11px;color:#64748b;margin-bottom:4px">{k}</div>'
        f'<div style="font-size:20px;font-weight:800;color:#0f172a">{v}</div>'
        f'<div style="font-size:10px;color:{dc}">{d}</div>'
        '</td>'
        for k, v, d, dc in kpis
    )

    # Monthly sparkline (last 6 months)
    recent = months[-6:] if len(months) >= 6 else months
    max_rev = max((m.get('revenue', 0) or 0 for m in recent), default=1) or 1
    sparkline_cells = ''.join(
        '<td style="vertical-align:bottom;padding:0 2px;width:40px">'
        f'<div style="background:#6366f1;width:100%;height:{max(4, int((m.get("revenue", 0) or 0) / max_rev * 40))}px;border-radius:3px 3px 0 0"></div>'
        f'<div style="font-size:8px;color:#94a3b8;text-align:center;margin-top:2px">{str(m.get("month",""))[:3]}</div>'
        '</td>'
        for m in recent
    )
    sparkline_section = (
        '<div style="margin-bottom:16px">'
        '<p style="margin:0 0 6px;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">Recent 6-Month Revenue</p>'
        f'<table style="border-collapse:collapse"><tr>{sparkline_cells}</tr></table>'
        '</div>'
    ) if recent else ''

    # Top opportunities table
    top_rows = ''
    for opp in top_opps[:5]:
        stage_color = '#10b981' if opp.get('stage', '') in ('Closed Won', 'Invoice') else '#6366f1'
        opp_name  = (opp.get('name') or '—')[:40]
        opp_amt   = _fmt_currency(opp.get('amount'))
        opp_stage = opp.get('stage', '—')
        opp_date  = opp.get('close_date', '—')
        top_rows += (
            '<tr>'
            f'<td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-weight:600;font-size:12px">{opp_name}</td>'
            f'<td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:12px">{opp_amt}</td>'
            f'<td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;text-align:center">'
            f'<span style="background:{stage_color}20;color:{stage_color};padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600">{opp_stage}</span>'
            '</td>'
            f'<td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:11px;color:#64748b">{opp_date}</td>'
            '</tr>'
        )
    opp_section = (
        '<h3 style="margin:0 0 8px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px">Top Opportunities</h3>'
        '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">'
        '<tr style="background:#f8fafc">'
        '<th style="padding:6px 10px;text-align:left;font-size:10px;color:#94a3b8">Opportunity</th>'
        '<th style="padding:6px 10px;text-align:center;font-size:10px;color:#94a3b8">Amount</th>'
        '<th style="padding:6px 10px;text-align:center;font-size:10px;color:#94a3b8">Stage</th>'
        '<th style="padding:6px 10px;text-align:center;font-size:10px;color:#94a3b8">Close Date</th>'
        '</tr>'
        f'{top_rows}'
        '</table>'
    ) if top_rows else ''

    # Strengths + areas
    strength_li = ''.join(f'<li style="margin:4px 0;color:#065f46">{x}</li>' for x in strengths[:3])
    improve_li  = ''.join(f'<li style="margin:4px 0;color:#92400e">{x}</li>' for x in improvements[:3])
    coaching_section = ''
    if strength_li or improve_li:
        coaching_section = (
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">'
        )
        if strength_li:
            coaching_section += (
                '<div style="background:#f0fdf4;border:1px solid #a7f3d0;border-radius:8px;padding:12px">'
                '<p style="margin:0 0 6px;font-size:10px;color:#065f46;font-weight:700;text-transform:uppercase">Strengths</p>'
                f'<ul style="margin:0;padding-left:16px">{strength_li}</ul>'
                '</div>'
            )
        if improve_li:
            coaching_section += (
                '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px">'
                '<p style="margin:0 0 6px;font-size:10px;color:#92400e;font-weight:700;text-transform:uppercase">Areas to Improve</p>'
                f'<ul style="margin:0;padding-left:16px">{improve_li}</ul>'
                '</div>'
            )
        coaching_section += '</div>'

    # Brief section
    brief_html = brief.replace(nl, '<br>')
    brief_section = (
        '<div style="background:#f0fdf4;border:1px solid #a7f3d0;border-radius:8px;padding:16px;margin-bottom:16px">'
        "<h3 style=\"margin:0 0 8px;color:#065f46;font-size:13px\">Manager's Brief</h3>"
        f'<p style="margin:0;font-size:13px;line-height:1.6;color:#134e4a">{brief_html}</p>'
        '</div>'
    ) if brief else ''

    return (
        '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:700px;color:#1e293b">'
        '<div style="background:linear-gradient(135deg,#312e81 0%,#4f46e5 100%);border-radius:12px;padding:24px;margin-bottom:20px;color:#fff">'
        f'<h1 style="margin:0 0 4px;font-size:22px;font-weight:800">{name}</h1>'
        f'<p style="margin:0;opacity:0.8;font-size:13px">{line} Division &nbsp;&middot;&nbsp; {cy} Performance Report</p>'
        f'<p style="margin:4px 0 0;opacity:0.6;font-size:11px">{start_date} to {end_date}</p>'
        '</div>'
        f'{brief_section}'
        f'<table style="width:100%;border-collapse:separate;border-spacing:4px;margin-bottom:16px"><tr>{kpi_cells}</tr></table>'
        f'{sparkline_section}'
        f'{opp_section}'
        f'{coaching_section}'
        '<p style="font-size:10px;color:#94a3b8;margin:20px 0 0;border-top:1px solid #f1f5f9;padding-top:12px">'
        f'Generated by <strong style="color:#4f46e5">SalesPulse</strong> &nbsp;&middot;&nbsp; {line} Division &nbsp;&middot;&nbsp; {start_date} to {end_date}'
        '&nbsp;&middot;&nbsp; salespulse-nyaaa.azurewebsites.net'
        '</p>'
        '</div>'
    )


# ── Email endpoint ────────────────────────────────────────────────────────────

@router.post("/api/advisor/email")
def send_agent_report(body: EmailReportRequest):
    """Send an agent performance report HTML email via AgentMail."""

    # Validate recipient
    to_email = (body.to or '').strip()
    if not to_email or '@' not in to_email:
        raise HTTPException(400, "Valid email address required")

    agentmail_key   = os.environ.get('AGENTMAIL_API_KEY', '')
    agentmail_inbox = os.environ.get('AGENTMAIL_INBOX', 'salespulse@agentmail.to')
    if not agentmail_key:
        raise HTTPException(500, "Email service not configured (AGENTMAIL_API_KEY missing)")

    # Fetch agent profile (reuses cached data when available)
    try:
        profile = _agent_profile(
            name=body.agent_name,
            line=body.line,
            period=body.period,
            start_date=body.start_date,
            end_date=body.end_date,
            ai=False,   # skip AI for email — use cached writeup
        )
    except Exception as exc:
        log.warning("Failed to fetch agent profile for email: %s", exc)
        raise HTTPException(422, f"Could not load agent data: {exc}") from exc

    sd = body.start_date or profile.get('summary', {}).get('start_date', '')
    ed = body.end_date   or profile.get('summary', {}).get('end_date', '')
    html = build_report_html(profile, sd or '', ed or '')
    subject = f"{body.agent_name} — {body.line} Performance Report"

    resp = _req.post(
        f"https://api.agentmail.to/v0/inboxes/{agentmail_inbox}/messages/send",
        headers={
            "Authorization": f"Bearer {agentmail_key}",
            "Content-Type": "application/json",
        },
        json={"to": [to_email], "subject": subject, "html": html},
        timeout=15,
    )
    if resp.status_code >= 400:
        log.warning("AgentMail failed: %s %s", resp.status_code, resp.text[:200])
        raise HTTPException(500, f"Failed to send email: {resp.text[:200]}")

    log.info("Agent report emailed: %s → %s", body.agent_name, to_email)
    return {"status": "sent", "to": to_email}
