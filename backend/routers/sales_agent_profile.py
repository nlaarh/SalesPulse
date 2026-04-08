"""Agent Profile — individual advisor drill-down with AI manager's brief.

Provides comprehensive data for a single agent:
- Summary metrics with YoY comparison
- Monthly revenue/leads/opps breakdown (current + prior year)
- Top open opportunities with conversion scores
- Team comparison data
- Rule-based strengths & improvement areas
- Open tasks with overdue tracking & completion stats
- AI-generated manager's executive brief (OpenAI)
"""

import logging
from datetime import date
from typing import Optional
from fastapi import APIRouter, Query
from sf_client import sf_parallel, sf_query_all
import cache
from shared import (
    VALID_LINES,
    line_filter_opp as _line_filter_opp,
    line_filter_lead as _line_filter_lead,
    resolve_dates as _resolve_dates,
    escape_soql as _escape,
    val as _val,
    is_sales_agent,
    six_months_ago,
)
from routers.agent_brief import template_brief, ai_brief
from routers.agent_profile_queries import (
    win_rate as _win_rate,
    build_profile_queries,
    build_monthly_breakdown,
    build_opportunities_list,
    build_won_list,
    compute_team_averages,
    compute_insights,
    build_tasks_section,
)

router = APIRouter()
log = logging.getLogger('sales.agent_profile')


# ── Main Endpoint ────────────────────────────────────────────────────────────

@router.get("/api/sales/agent/profile")
def agent_profile(
    name: str,
    line: str = "Travel",
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    ai: bool = True,
):
    """Comprehensive agent profile: metrics, YoY, monthly, top opps, AI brief."""
    if line not in VALID_LINES:
        line = 'Travel'

    # Validate agent is on the sales whitelist for this line
    if not is_sales_agent(name, line):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Agent '{name}' is not a {line} sales agent")

    safe = _escape(name)
    sd, ed = _resolve_dates(start_date, end_date, period)
    today = date.today()
    cy, py = today.year, today.year - 1

    # Prior-year equivalent date range for apples-to-apples YoY comparison.
    sd_dt = date.fromisoformat(str(sd))
    ed_dt = date.fromisoformat(str(ed))
    try:
        p_sd = sd_dt.replace(year=sd_dt.year - 1).isoformat()
    except ValueError:  # Feb 29 leap year
        p_sd = sd_dt.replace(year=sd_dt.year - 1, day=28).isoformat()
    try:
        p_ed = ed_dt.replace(year=ed_dt.year - 1).isoformat()
    except ValueError:
        p_ed = ed_dt.replace(year=ed_dt.year - 1, day=28).isoformat()

    key = f"agent_profile_{name}_{line}_{sd}_{ed}"

    def fetch():
        sma = six_months_ago()
        lf = _line_filter_opp(line)
        lf_lead = _line_filter_lead(line)
        ow = f"Owner.Name = '{safe}'"

        queries = build_profile_queries(
            safe=safe, lf=lf, lf_lead=lf_lead, ow=ow,
            sd=sd, ed=ed, p_sd=p_sd, p_ed=p_ed,
            cy=cy, py=py, sma=sma,
        )
        data = sf_parallel(**queries)

        # ── Parse agent metrics ──────────────────────────────────────────
        # Insurance: Amount IS the commission (Earned_Commission_Amount__c is $0)
        # Travel: Amount = gross bookings, Earned_Commission_Amount__c = commission
        is_insurance = line and line.lower() == 'insurance'

        revenue = _val(data['won_cur'], 'rev')
        commission = revenue if is_insurance else _val(data['won_cur'], 'comm')
        deals = _val(data['won_cur'], 'cnt')
        avg_deal = round(revenue / deals) if deals else 0

        p_rev = _val(data['won_pri'], 'rev')
        p_comm = p_rev if is_insurance else _val(data['won_pri'], 'comm')
        p_deals = _val(data['won_pri'], 'cnt')
        p_avg = round(p_rev / p_deals) if p_deals else 0

        rev_yoy = round((revenue - p_rev) / p_rev * 100, 1) if p_rev else 0
        comm_yoy = round((commission - p_comm) / p_comm * 100, 1) if p_comm else 0
        deals_yoy = round((deals - p_deals) / p_deals * 100, 1) if p_deals else 0

        wr = _win_rate(data['closed_cur'])
        p_wr = _win_rate(data['closed_pri'])

        pipe_val = _val(data['pipeline'], 'rev')
        pipe_cnt = _val(data['pipeline'], 'cnt')

        months, leads_total, opps_total = build_monthly_breakdown(data, is_insurance)
        top_list = build_opportunities_list(data, today)
        won_list = build_won_list(data)

        pushed_cnt = _val(data['pushed'], 'cnt')
        pushed_val = _val(data['pushed'], 'rev')
        stale_cnt = _val(data['stale'], 'cnt')

        team = compute_team_averages(data, line, is_insurance)

        # Coverage
        ann_rev = revenue * (12 / max(period, 1))
        coverage = round(pipe_val / ann_rev, 1) if ann_rev > 0 else 0

        open_tasks_list, task_stats = build_tasks_section(data, sf_query_all, today)

        strengths, improvements = compute_insights(
            revenue=revenue, avg_deal=avg_deal, wr=wr, rev_yoy=rev_yoy,
            coverage=coverage, pipe_val=pipe_val,
            pushed_cnt=pushed_cnt, pushed_val=pushed_val, stale_cnt=stale_cnt,
            months=months, today=today, team=team, period=period,
            task_stats=task_stats, open_tasks_list=open_tasks_list,
        )

        # Extract advisor email
        agent_email = ''
        if data.get('agent_user'):
            agent_email = (data['agent_user'][0] or {}).get('Email', '') or ''

        return {
            'name': name, 'line': line, 'email': agent_email,
            'current_year': cy, 'prior_year': py,
            'period_start': str(sd), 'period_end': str(ed),
            'prior_start': p_sd, 'prior_end': p_ed,
            'has_separate_bookings': not is_insurance,
            'summary': {
                'revenue': revenue, 'commission': commission,
                'deals': deals, 'win_rate': wr,
                'avg_deal': avg_deal, 'pipeline_value': pipe_val,
                'pipeline_count': pipe_cnt, 'leads': leads_total,
                'opps_created': opps_total, 'coverage': coverage,
            },
            'prior': {
                'revenue': p_rev, 'commission': p_comm,
                'deals': p_deals,
                'win_rate': p_wr, 'avg_deal': p_avg,
            },
            'yoy': {
                'revenue_pct': rev_yoy, 'commission_pct': comm_yoy,
                'deals_pct': deals_yoy,
                'win_rate_delta': round(wr - p_wr, 1),
                'avg_deal_delta': avg_deal - p_avg,
            },
            'months': months,
            'top_opportunities': top_list,
            'won_opportunities': won_list,
            'team': team,
            'strengths': strengths,
            'improvements': improvements,
            'pushed_count': pushed_cnt, 'pushed_value': pushed_val,
            'stale_count': stale_cnt,
            'tasks': {
                'open_tasks': open_tasks_list,
                'stats': task_stats,
            },
        }

    profile = cache.cached_query(key, fetch, ttl=1800, disk_ttl=43200)

    # AI brief (outside cache — generated fresh)
    ai_powered = False
    writeup = template_brief(profile)
    if ai:
        ai_result = ai_brief(profile)
        if ai_result:
            writeup = ai_result
            ai_powered = True

    profile['writeup'] = writeup
    profile['ai_powered'] = ai_powered
    return profile
