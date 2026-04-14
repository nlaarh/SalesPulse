"""Top Opportunities — conversion scoring + AI-generated write-ups."""

import os
import logging
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Query
from sf_client import sf_query_all
import cache
from shared import VALID_LINES, line_filter_opp as _line_filter, resolve_dates as _resolve_dates, six_months_ago, is_sales_agent
from constants import CACHE_TTL_SHORT, CACHE_TTL_MEDIUM, CACHE_TTL_HOUR
from routers.opportunity_scoring import _days_between, _score_opportunity, _template_writeup

router = APIRouter()
log = logging.getLogger('sales.opportunities')


def _ai_writeups_batch(opportunities: list[dict]) -> dict[str, str]:
    """Generate AI write-ups for a batch of opportunities using OpenAI."""
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        return {}

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
    except Exception as e:
        log.warning(f"OpenAI client init failed: {e}")
        return {}

    # Build a single prompt with all opportunities for efficiency
    opp_summaries = []
    for i, opp in enumerate(opportunities[:100]):
        name = opp.get('name', 'Unknown')
        stage = opp.get('stage', '')
        amount = opp.get('amount', 0)
        score = opp.get('score', 0)
        owner = opp.get('owner', '')
        close = opp.get('close_date', '')
        push = opp.get('push_count', 0)
        last_act = opp.get('last_activity', '')
        prob = opp.get('probability', 0)
        reasons = opp.get('reasons', [])

        opp_summaries.append(
            f"{i+1}. {name} | ${amount:,.0f} | Stage: {stage} | Prob: {prob}% | "
            f"Push: {push} | Close: {close} | LastActivity: {last_act} | "
            f"Owner: {owner} | Score: {score}/100 | Signals: {'; '.join(reasons[:3])}"
        )

    prompt = f"""You are a sales analytics AI for a travel/insurance agency.
For each opportunity below, write a 1-2 sentence executive summary explaining:
- WHY this deal has a high/medium/low chance of converting
- What specific action the advisor should take next
- Any risk factors to watch

Be specific and actionable. Use the data signals provided. No generic advice.

Format: Return a numbered list matching the input numbers. Each entry should be 1-2 sentences max.

Opportunities:
{chr(10).join(opp_summaries)}"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=4000,
        )
        text = response.choices[0].message.content or ''

        # Parse numbered responses
        writeups = {}
        lines = text.strip().split('\n')
        current_num = None
        current_text = []

        for line in lines:
            line = line.strip()
            if not line:
                continue
            # Check if line starts with a number
            for i in range(len(opportunities)):
                prefix = f"{i+1}."
                if line.startswith(prefix):
                    # Save previous
                    if current_num is not None and current_text:
                        writeups[opportunities[current_num]['name']] = ' '.join(current_text)
                    current_num = i
                    current_text = [line[len(prefix):].strip()]
                    break
            else:
                if current_num is not None:
                    current_text.append(line)

        # Save last one
        if current_num is not None and current_text:
            writeups[opportunities[current_num]['name']] = ' '.join(current_text)

        return writeups

    except Exception as e:
        log.warning(f"OpenAI API call failed: {e}")
        return {}


@router.get("/api/sales/opportunities/top")
def top_opportunities(
    line: str = "Travel", limit: int = 100, ai: bool = True,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Top opportunities ranked by conversion score with optional AI write-ups."""
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, 12)
    # Don't cache AI results (they're dynamic), but cache the SF query
    key = f"top_opps_{line}_{limit}_{sd}_{ed}"

    def fetch_opps():
        sma = six_months_ago()
        lf = _line_filter(line)
        records = sf_query_all(f"""
            SELECT Id, Name, Amount, StageName, Probability, ForecastCategory,
                   CloseDate, CreatedDate, LastActivityDate, PushCount,
                   LastStageChangeDate, Owner.Name, RecordType.Name
            FROM Opportunity
            WHERE IsClosed = false AND {lf}
              AND Amount != null
              AND CloseDate >= {sma}
              AND CloseDate <= {ed}
            ORDER BY Amount DESC
            LIMIT 500
        """)
        return records

    records = cache.cached_query(key, fetch_opps, ttl=CACHE_TTL_MEDIUM, disk_ttl=CACHE_TTL_HOUR)

    today = date.today()
    scored = []
    for r in records:
        s = _score_opportunity(r, today)
        scored.append({
            'id': r.get('Id', ''),
            'name': r.get('Name', ''),
            'amount': r.get('Amount', 0) or 0,
            'stage': r.get('StageName', ''),
            'probability': r.get('Probability', 0) or 0,
            'forecast_category': r.get('ForecastCategory', ''),
            'close_date': r.get('CloseDate', ''),
            'created_date': r.get('CreatedDate', ''),
            'last_activity': r.get('LastActivityDate', ''),
            'push_count': r.get('PushCount', 0) or 0,
            'owner': (r.get('Owner') or {}).get('Name', ''),
            'record_type': (r.get('RecordType') or {}).get('Name', ''),
            'score': s['score'],
            'reasons': s['reasons'],
            'writeup': _template_writeup(r, s),  # Default template
        })

    # Filter to whitelisted sales agents
    scored = [s for s in scored if is_sales_agent(s['owner'], line)]

    # Sort by score descending, then by amount
    scored.sort(key=lambda x: (-x['score'], -x['amount']))
    top = scored[:limit]

    # Try AI write-ups if enabled (cached to avoid 60s OpenAI calls on every request)
    ai_used = False
    if ai and top:
        ai_key = f"ai_writeups_{line}_{limit}_{sd}_{ed}"
        ai_writeups = cache.cached_query(
            ai_key, lambda: _ai_writeups_batch(top),
            ttl=CACHE_TTL_MEDIUM, disk_ttl=CACHE_TTL_HOUR,
        )
        if ai_writeups:
            ai_used = True
            for opp in top:
                if opp['name'] in ai_writeups:
                    opp['writeup'] = ai_writeups[opp['name']]

    # Assign ranks
    for i, opp in enumerate(top):
        opp['rank'] = i + 1

    return {
        'opportunities': top,
        'total': len(top),
        'line': line,
        'ai_powered': ai_used,
        'score_factors': [
            'Deal value (25%)',
            'Activity recency (20%)',
            'Close date urgency (20%)',
            'Push-back history (15%)',
            'Stage actionability (10%)',
            'Forecast category (10%)',
        ],
    }


@router.get("/api/sales/opportunities/{opp_id}")
def opportunity_detail(opp_id: str):
    """Full detail for a single opportunity: fields + stage history + activity timeline + AI analysis."""

    def fetch():
        # 1. Opportunity record
        opp_records = sf_query_all(f"""
            SELECT Id, Name, StageName, Amount, CloseDate, Probability,
                   ForecastCategory, PushCount, Description,
                   CreatedDate, LastActivityDate, LastStageChangeDate,
                   Owner.Name, AccountId, Account.Name,
                   Account.Member_Status__c, Account.Account_Member_Since__c,
                   Account.ImportantActiveMemCoverage__c, Account.MPI__c,
                   RecordType.Name, Type, LeadSource,
                   Earned_Commission_Amount__c, Destination_Region__c,
                   Axis_Trip_ID__c, Number_Traveling__c
            FROM Opportunity
            WHERE Id = '{opp_id}'
            LIMIT 1
        """)
        if not opp_records:
            return None
        opp = opp_records[0]

        # 2. Stage history
        history_records = sf_query_all(f"""
            SELECT StageName, Amount, CloseDate, CreatedDate, CreatedBy.Name
            FROM OpportunityHistory
            WHERE OpportunityId = '{opp_id}'
            ORDER BY CreatedDate DESC
            LIMIT 50
        """)

        # 3. Tasks
        task_records = sf_query_all(f"""
            SELECT Subject, Status, ActivityDate, Description, Priority,
                   CreatedDate, Owner.Name, IsClosed
            FROM Task
            WHERE WhatId = '{opp_id}'
            ORDER BY CreatedDate DESC
            LIMIT 30
        """)

        # 4. Events
        event_records = sf_query_all(f"""
            SELECT Subject, StartDateTime, EndDateTime, Description,
                   CreatedDate, Owner.Name, IsAllDayEvent
            FROM Event
            WHERE WhatId = '{opp_id}'
            ORDER BY StartDateTime DESC
            LIMIT 30
        """)

        today = date.today()
        score_info = _score_opportunity(opp, today)

        result = {
            'id': opp.get('Id'),
            'name': opp.get('Name', ''),
            'stage': opp.get('StageName', ''),
            'amount': opp.get('Amount') or 0,
            'close_date': opp.get('CloseDate', ''),
            'probability': opp.get('Probability') or 0,
            'forecast_category': opp.get('ForecastCategory', ''),
            'push_count': opp.get('PushCount') or 0,
            'description': opp.get('Description', ''),
            'created_date': opp.get('CreatedDate', ''),
            'last_activity': opp.get('LastActivityDate', ''),
            'last_stage_change': opp.get('LastStageChangeDate', ''),
            'owner': (opp.get('Owner') or {}).get('Name', ''),
            'account_id': opp.get('AccountId', ''),
            'account': (opp.get('Account') or {}).get('Name', ''),
            'account_member_status': (opp.get('Account') or {}).get('Member_Status__c'),
            'account_member_since': (opp.get('Account') or {}).get('Account_Member_Since__c'),
            'account_coverage': (opp.get('Account') or {}).get('ImportantActiveMemCoverage__c'),
            'account_mpi': (opp.get('Account') or {}).get('MPI__c'),
            'record_type': (opp.get('RecordType') or {}).get('Name', ''),
            'type': opp.get('Type', ''),
            'lead_source': opp.get('LeadSource', ''),
            'commission': opp.get('Earned_Commission_Amount__c'),
            'destination': opp.get('Destination_Region__c'),
            'trip_id': opp.get('Axis_Trip_ID__c'),
            'num_traveling': opp.get('Number_Traveling__c'),
            'score': score_info['score'],
            'score_reasons': score_info['reasons'],
            'history': [
                {
                    'stage': h.get('StageName', ''),
                    'amount': h.get('Amount') or 0,
                    'close_date': h.get('CloseDate', ''),
                    'date': h.get('CreatedDate', ''),
                    'by': (h.get('CreatedBy') or {}).get('Name', ''),
                }
                for h in history_records
            ],
            'tasks': [
                {
                    'type': 'task',
                    'subject': t.get('Subject', ''),
                    'status': t.get('Status', ''),
                    'due': t.get('ActivityDate', ''),
                    'description': t.get('Description', ''),
                    'priority': t.get('Priority', ''),
                    'date': t.get('CreatedDate', ''),
                    'owner': (t.get('Owner') or {}).get('Name', ''),
                    'closed': t.get('IsClosed', False),
                }
                for t in task_records
            ],
            'events': [
                {
                    'type': 'event',
                    'subject': e.get('Subject', ''),
                    'start': e.get('StartDateTime', ''),
                    'end': e.get('EndDateTime', ''),
                    'description': e.get('Description', ''),
                    'date': e.get('StartDateTime') or e.get('CreatedDate', ''),
                    'owner': (e.get('Owner') or {}).get('Name', ''),
                    'all_day': e.get('IsAllDayEvent', False),
                }
                for e in event_records
            ],
        }

        # Build merged timeline sorted newest first
        timeline = []
        for h in result['history']:
            timeline.append({'kind': 'stage', 'date': h['date'], 'data': h})
        for t in result['tasks']:
            timeline.append({'kind': 'task', 'date': t['date'], 'data': t})
        for e in result['events']:
            timeline.append({'kind': 'event', 'date': e['date'], 'data': e})
        timeline.sort(key=lambda x: x['date'] or '', reverse=True)
        result['timeline'] = timeline

        # AI analysis
        result['ai_analysis'] = _ai_deal_analysis(result)
        return result

    return cache.cached_query(f"opp_detail_{opp_id}", fetch, ttl=CACHE_TTL_SHORT, disk_ttl=CACHE_TTL_HOUR)


def _ai_deal_analysis(detail: dict) -> str:
    """Generate an AI narrative analyzing the deal health and recommending next steps."""
    try:
        from routers.ai_config import get_ai_config
        cfg = get_ai_config()
        if not cfg.get('api_key'):
            return ''
        from openai import OpenAI
        kwargs: dict = {'api_key': cfg['api_key']}
        if cfg.get('base_url'):
            kwargs['base_url'] = cfg['base_url']
        client = OpenAI(**kwargs)

        days_overdue = ''
        if detail.get('close_date'):
            try:
                cd = datetime.strptime(detail['close_date'], '%Y-%m-%d').date()
                diff = (date.today() - cd).days
                if diff > 0:
                    days_overdue = f'{diff} days overdue'
                else:
                    days_overdue = f'closes in {-diff} days'
            except Exception:
                pass

        recent_tasks = '; '.join(
            f"{t['subject']} ({t['status']})" for t in detail['tasks'][:5]
        )
        stage_changes = ' → '.join(
            h['stage'] for h in reversed(detail['history'][:10])
        )

        prompt = f"""You are a senior sales manager at AAA reviewing a deal.

Deal: {detail['name']}
Owner: {detail['owner']} | Account: {detail['account']}
Stage: {detail['stage']} | Amount: ${detail['amount']:,.0f} | Close Date: {detail['close_date']} ({days_overdue})
Probability: {detail['probability']}% | Push Count: {detail['push_count']}
Stage History: {stage_changes or 'No changes recorded'}
Recent Tasks: {recent_tasks or 'None'}
Days since last activity: {_days_between(detail.get('last_activity'), date.today()) or 'Unknown'}

Write a deal health assessment using **Markdown formatting**:
- Use **bold** for key findings
- Use ## headers: Deal Health, Risk Factors, Next Action
- Use bullet lists for multiple risk factors or action items

Be direct and actionable. No fluff."""

        resp = client.chat.completions.create(
            model=cfg['model'],
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=300,
            temperature=0.4,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        log.warning(f"AI deal analysis failed: {e}")
        return ''


# ── Opportunity Email ─────────────────────────────────────────────────────────

import requests as _req
from fastapi import HTTPException

from schemas import OppEmailRequest

def _fmt(v, compact=False):
    if v is None: return '—'
    if compact and v >= 1_000_000: return f'${v/1_000_000:.1f}M'
    if compact and v >= 1_000: return f'${v/1_000:.0f}K'
    return f'${v:,.0f}'

def _build_opp_email_html(d: dict) -> str:
    stage_color = '#10b981' if 'won' in d.get('stage','').lower() else '#6366f1'
    score = d.get('score', 0)
    score_color = '#10b981' if score >= 70 else '#f59e0b' if score >= 40 else '#ef4444'
    hist_rows = ''.join(
        f'<tr><td style="padding:4px 8px;font-size:11px;color:#6b7280">{h.get("date","")[:10]}</td>'
        f'<td style="padding:4px 8px;font-size:11px">{h.get("stage","")}</td>'
        f'<td style="padding:4px 8px;font-size:11px;text-align:right">${h.get("amount") or 0:,.0f}</td></tr>'
        for h in (d.get('history') or [])[:8]
    )
    tasks = ''.join(
        f'<li style="font-size:11px;margin:3px 0">{t.get("subject","")} — <span style="color:#6b7280">{t.get("status","")}</span></li>'
        for t in (d.get('activities') or [])[:5]
    )
    fields = [
        ('Owner', d.get('owner')), ('Account', d.get('account')),
        ('Record Type', d.get('record_type')), ('Close Date', d.get('close_date')),
        ('Probability', f"{d.get('probability',0)}%"), ('Forecast', d.get('forecast_category')),
        ('Destination', d.get('destination')), ('Trip ID', d.get('trip_id')),
        ('# Travelers', d.get('num_traveling')), ('Commission', _fmt(d.get('commission'))),
    ]
    fields_html = ''.join(
        f'<tr><td style="padding:4px 8px;font-size:12px;color:#6b7280;width:140px">{k}</td>'
        f'<td style="padding:4px 8px;font-size:12px;font-weight:500">{v or "—"}</td></tr>'
        for k, v in fields if v is not None
    )
    return f"""<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f9fafb">
<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)">
  <div style="background:#1e293b;padding:20px 28px">
    <p style="margin:0 0 4px;font-size:12px;color:#94a3b8">Opportunity Detail · SalesPulse</p>
    <h1 style="margin:0;font-size:18px;color:#fff;font-weight:700">{d.get('name','')}</h1>
    <div style="margin-top:10px;display:flex;gap:12px;flex-wrap:wrap">
      <span style="background:{stage_color}20;color:{stage_color};padding:3px 12px;border-radius:20px;font-size:12px;font-weight:600">{d.get('stage','')}</span>
      <span style="font-size:20px;font-weight:800;color:#fff">{_fmt(d.get('amount'), True)}</span>
      <span style="background:{score_color}20;color:{score_color};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600">Health: {score}/100</span>
    </div>
  </div>
  <div style="padding:20px 28px">
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px">{fields_html}</table>
    {'<h3 style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin:0 0 6px">Stage History</h3><table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:18px"><thead><tr style="background:#f8fafc"><th style="padding:5px 8px;text-align:left;color:#6b7280">Date</th><th style="padding:5px 8px;text-align:left;color:#6b7280">Stage</th><th style="padding:5px 8px;text-align:right;color:#6b7280">Amount</th></tr></thead><tbody>' + hist_rows + '</tbody></table>' if hist_rows else ''}
    {'<h3 style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin:0 0 6px">Recent Activities</h3><ul style="margin:0;padding-left:16px">' + tasks + '</ul>' if tasks else ''}
    <p style="font-size:10px;color:#9ca3af;margin-top:20px;border-top:1px solid #f3f4f6;padding-top:10px">
      Generated by SalesPulse · AAA Western &amp; Central NY · Data from Salesforce
    </p>
  </div>
</div></body></html>"""


@router.post('/api/opportunities/{opp_id}/email')
def email_opportunity(opp_id: str, body: OppEmailRequest):
    to_email = (body.to or '').strip()
    if not to_email or '@' not in to_email:
        raise HTTPException(400, 'Valid email address required')
    agentmail_key   = os.environ.get('AGENTMAIL_API_KEY', '')
    agentmail_inbox = os.environ.get('AGENTMAIL_INBOX', 'salespulse@agentmail.to')
    if not agentmail_key:
        raise HTTPException(500, 'Email service not configured')
    detail = opportunity_detail(opp_id)
    if not detail or detail.get('error'):
        raise HTTPException(422, 'Could not load opportunity')
    html = _build_opp_email_html(detail)
    subject = f"Opportunity: {detail.get('name','')} — {detail.get('stage','')}"
    resp = _req.post(
        f'https://api.agentmail.to/v0/inboxes/{agentmail_inbox}/messages/send',
        headers={'Authorization': f'Bearer {agentmail_key}', 'Content-Type': 'application/json'},
        json={'to': [to_email], 'subject': subject, 'html': html},
        timeout=15,
    )
    if resp.status_code >= 400:
        raise HTTPException(500, f'Failed to send email: {resp.text[:200]}')
    return {'status': 'sent', 'to': to_email}
