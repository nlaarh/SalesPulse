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

import logging, re
from datetime import date
from typing import Optional
from fastapi import APIRouter, Query
from sf_client import sf_parallel, sf_query_all
import cache
from shared import (
    VALID_LINES, WON_STAGES, MONTHS,
    line_filter_opp as _line_filter_opp,
    line_filter_lead as _line_filter_lead,
    resolve_dates as _resolve_dates,
    escape_soql as _escape,
    val as _val,
    is_sales_agent,
)
from constants import (
    COVERAGE_LOW, COVERAGE_HEALTHY,
    TASK_COMPLETION_STRONG, TASK_COMPLETION_POOR, TASK_MIN_SAMPLE,
    WIN_RATE_DELTA,
    YOY_REVENUE_UP, YOY_REVENUE_DOWN,
    AVG_DEAL_ABOVE_FACTOR, AVG_DEAL_BELOW_FACTOR, REVENUE_BELOW_TEAM_FACTOR,
)
from routers.agent_brief import template_brief, ai_brief

router = APIRouter()
log = logging.getLogger('sales.agent_profile')


def _win_rate(rows):
    """Compute win rate from StageName-grouped rows.
    Invoice = booked sale (won but not yet paid)."""
    w = l = 0
    for r in rows:
        stage = r.get('StageName', '')
        cnt = r.get('cnt', 0) or 0
        if stage in ('Closed Won', 'Invoice'):
            w += cnt
        else:
            l += cnt
    t = w + l
    return round(w / t * 100, 1) if t else 0


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
    # If current range is 2026-01-01 → 2026-03-29, prior is 2025-01-01 → 2025-03-29.
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
        lf = _line_filter_opp(line)
        lf_lead = _line_filter_lead(line)
        ow = f"Owner.Name = '{safe}'"

        data = sf_parallel(
            # Agent: email lookup
            agent_user=f"""
                SELECT Email FROM User
                WHERE Name = '{safe}' AND IsActive = true
                LIMIT 1
            """,
            # Agent: current period won
            won_cur=f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev,
                       SUM(Earned_Commission_Amount__c) comm
                FROM Opportunity
                WHERE {ow} AND {WON_STAGES} AND {lf}
                  AND CloseDate >= {sd} AND CloseDate <= {ed} AND Amount != null
            """,
            # Agent: prior year won (same date range shifted back 1 year)
            won_pri=f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev,
                       SUM(Earned_Commission_Amount__c) comm
                FROM Opportunity
                WHERE {ow} AND {WON_STAGES} AND {lf}
                  AND CloseDate >= {p_sd} AND CloseDate <= {p_ed} AND Amount != null
            """,
            # Agent: monthly revenue current year
            mo_rev_cur=f"""
                SELECT CALENDAR_MONTH(CloseDate) mo, COUNT(Id) cnt, SUM(Amount) rev,
                       SUM(Earned_Commission_Amount__c) comm
                FROM Opportunity
                WHERE {ow} AND {WON_STAGES} AND {lf}
                  AND CALENDAR_YEAR(CloseDate) = {cy} AND Amount != null
                GROUP BY CALENDAR_MONTH(CloseDate) ORDER BY CALENDAR_MONTH(CloseDate)
            """,
            # Agent: monthly revenue prior year
            mo_rev_pri=f"""
                SELECT CALENDAR_MONTH(CloseDate) mo, COUNT(Id) cnt, SUM(Amount) rev,
                       SUM(Earned_Commission_Amount__c) comm
                FROM Opportunity
                WHERE {ow} AND {WON_STAGES} AND {lf}
                  AND CALENDAR_YEAR(CloseDate) = {py} AND Amount != null
                GROUP BY CALENDAR_MONTH(CloseDate) ORDER BY CALENDAR_MONTH(CloseDate)
            """,
            # Agent: win rate current period
            closed_cur=f"""
                SELECT StageName, COUNT(Id) cnt FROM Opportunity
                WHERE {ow} AND StageName IN ('Closed Won','Invoice','Closed Lost') AND {lf}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                GROUP BY StageName
            """,
            # Agent: win rate prior year (same date range shifted back 1 year)
            closed_pri=f"""
                SELECT StageName, COUNT(Id) cnt FROM Opportunity
                WHERE {ow} AND StageName IN ('Closed Won','Invoice','Closed Lost') AND {lf}
                  AND CloseDate >= {p_sd} AND CloseDate <= {p_ed}
                GROUP BY StageName
            """,
            # Agent: pipeline
            pipeline=f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev FROM Opportunity
                WHERE {ow} AND IsClosed = false AND {lf} AND Amount != null
                  AND CloseDate <= NEXT_N_MONTHS:12
            """,
            # Agent: monthly leads current year
            mo_leads=f"""
                SELECT CALENDAR_MONTH(CreatedDate) mo, COUNT(Id) cnt FROM Lead
                WHERE {ow} AND {lf_lead} AND CALENDAR_YEAR(CreatedDate) = {cy}
                GROUP BY CALENDAR_MONTH(CreatedDate)
            """,
            # Agent: monthly opps created current year
            mo_opps=f"""
                SELECT CALENDAR_MONTH(CreatedDate) mo, COUNT(Id) cnt FROM Opportunity
                WHERE {ow} AND {lf} AND CALENDAR_YEAR(CreatedDate) = {cy}
                GROUP BY CALENDAR_MONTH(CreatedDate)
            """,
            # Agent: top open opportunities (all stages, including without amount)
            top_opps=f"""
                SELECT Id, Name, Amount, StageName, Probability, ForecastCategory,
                       CloseDate, LastActivityDate, PushCount
                FROM Opportunity
                WHERE {ow} AND IsClosed = false AND {lf}
                ORDER BY Amount DESC NULLS LAST LIMIT 50
            """,
            # Agent: recently won opportunities
            recent_won=f"""
                SELECT Id, Name, Amount, StageName, CloseDate, Probability,
                       Earned_Commission_Amount__c
                FROM Opportunity
                WHERE {ow} AND {WON_STAGES} AND {lf}
                  AND CloseDate >= {sd} AND CloseDate <= {ed} AND Amount != null
                ORDER BY CloseDate DESC LIMIT 20
            """,
            # Agent: risk — pushed deals
            pushed=f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev FROM Opportunity
                WHERE {ow} AND IsClosed = false AND {lf}
                  AND PushCount >= 2 AND Amount != null
            """,
            # Agent: risk — stale deals
            stale=f"""
                SELECT COUNT(Id) cnt FROM Opportunity
                WHERE {ow} AND IsClosed = false AND {lf}
                  AND LastActivityDate < LAST_N_DAYS:30
            """,
            # Team: total won (for comparison)
            t_won=f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev,
                       SUM(Earned_Commission_Amount__c) comm
                FROM Opportunity
                WHERE {WON_STAGES} AND {lf}
                  AND CloseDate >= {sd} AND CloseDate <= {ed} AND Amount != null
            """,
            # Team: total closed (for win rate)
            t_closed=f"""
                SELECT COUNT(Id) cnt FROM Opportunity
                WHERE StageName IN ('Closed Won','Invoice','Closed Lost') AND {lf}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
            """,
            # Team: per-agent won (for agent count)
            t_agents=f"""
                SELECT Owner.Name, COUNT(Id) cnt FROM Opportunity
                WHERE {WON_STAGES} AND {lf}
                  AND CloseDate >= {sd} AND CloseDate <= {ed} AND Amount != null
                GROUP BY Owner.Name
            """,
            # Open tasks for this agent
            open_tasks=f"""
                SELECT Id, Subject, Status, Priority, ActivityDate,
                       What.Name, WhatId, CreatedDate
                FROM Task
                WHERE {ow} AND IsClosed = false
                ORDER BY ActivityDate ASC NULLS LAST
                LIMIT 25
            """,
            # Tasks completed within selected period
            tasks_done_period=f"""
                SELECT COUNT(Id) cnt FROM Task
                WHERE {ow} AND IsClosed = true
                  AND LastModifiedDate >= {sd}T00:00:00Z
                  AND LastModifiedDate <= {ed}T23:59:59Z
            """,
            # Total tasks created within selected period
            tasks_total_period=f"""
                SELECT COUNT(Id) cnt FROM Task
                WHERE {ow}
                  AND CreatedDate >= {sd}T00:00:00Z
                  AND CreatedDate <= {ed}T23:59:59Z
            """,
        )

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

        # ── Monthly breakdown ────────────────────────────────────────────
        c_rev = {r['mo']: (r.get('rev', 0) or 0) for r in data['mo_rev_cur']}
        c_comm = c_rev if is_insurance else {r['mo']: (r.get('comm', 0) or 0) for r in data['mo_rev_cur']}
        c_dls = {r['mo']: (r.get('cnt', 0) or 0) for r in data['mo_rev_cur']}
        p_mrev = {r['mo']: (r.get('rev', 0) or 0) for r in data['mo_rev_pri']}
        p_mcomm = p_mrev if is_insurance else {r['mo']: (r.get('comm', 0) or 0) for r in data['mo_rev_pri']}
        c_lds = {r['mo']: (r.get('cnt', 0) or 0) for r in data['mo_leads']}
        c_ops = {r['mo']: (r.get('cnt', 0) or 0) for r in data['mo_opps']}

        months = [{
            'month': i, 'label': MONTHS[i - 1],
            'revenue': c_rev.get(i, 0), 'prior_revenue': p_mrev.get(i, 0),
            'commission': c_comm.get(i, 0), 'prior_commission': p_mcomm.get(i, 0),
            'deals': c_dls.get(i, 0), 'leads': c_lds.get(i, 0), 'opps': c_ops.get(i, 0),
        } for i in range(1, 13)]

        leads_total = sum(c_lds.values())
        opps_total = sum(c_ops.values())

        # ── Top opportunities with scoring ───────────────────────────────
        from routers.sales_opportunities import _score_opportunity
        top_list = []
        for r in data['top_opps']:
            sc = _score_opportunity(r, today)
            top_list.append({
                'id': r.get('Id', ''), 'name': r.get('Name', ''),
                'amount': r.get('Amount', 0) or 0, 'stage': r.get('StageName', ''),
                'probability': r.get('Probability', 0) or 0,
                'forecast_category': r.get('ForecastCategory', ''),
                'close_date': r.get('CloseDate', ''),
                'last_activity': r.get('LastActivityDate', ''),
                'push_count': r.get('PushCount', 0) or 0,
                'score': sc['score'], 'reasons': sc['reasons'],
            })
        top_list.sort(key=lambda x: -x['score'])

        # ── Recently won opportunities ────────────────────────────────────
        won_list = []
        for r in data.get('recent_won', []):
            won_list.append({
                'id': r.get('Id', ''), 'name': r.get('Name', ''),
                'amount': r.get('Amount', 0) or 0, 'stage': r.get('StageName', ''),
                'probability': r.get('Probability', 0) or 0,
                'close_date': r.get('CloseDate', ''),
                'commission': r.get('Earned_Commission_Amount__c', 0) or 0,
            })

        pushed_cnt = _val(data['pushed'], 'cnt')
        pushed_val = _val(data['pushed'], 'rev')
        stale_cnt = _val(data['stale'], 'cnt')

        # ── Team averages ────────────────────────────────────────────────
        t_rev = _val(data['t_won'], 'rev')
        t_comm = t_rev if is_insurance else _val(data['t_won'], 'comm')
        t_won_cnt = _val(data['t_won'], 'cnt')
        t_closed_cnt = _val(data['t_closed'], 'cnt')
        t_agent_list = [a for a in data['t_agents'] if (a.get('cnt', 0) or 0) > 0]
        t_agent_list = [a for a in t_agent_list if is_sales_agent(a.get('Name', ''), line)]
        n_agents = len(t_agent_list)

        t_wr = round(t_won_cnt / t_closed_cnt * 100, 1) if t_closed_cnt else 0
        t_avg_rev = round(t_rev / n_agents) if n_agents else 0
        t_avg_comm = round(t_comm / n_agents) if n_agents else 0
        t_avg_deal = round(t_rev / t_won_cnt) if t_won_cnt else 0

        # Coverage
        ann_rev = revenue * (12 / max(period, 1))
        coverage = round(pipe_val / ann_rev, 1) if ann_rev > 0 else 0

        # ── Strengths & improvements ─────────────────────────────────────
        strengths, improvements = [], []

        if wr > t_wr + WIN_RATE_DELTA:
            strengths.append(f"Win rate {wr}% is {round(wr - t_wr)}pts above team avg ({t_wr}%)")
        elif wr < t_wr - WIN_RATE_DELTA:
            improvements.append(f"Win rate {wr}% is {round(t_wr - wr)}pts below team avg ({t_wr}%)")

        if avg_deal > t_avg_deal * AVG_DEAL_ABOVE_FACTOR:
            strengths.append(f"Avg deal ${avg_deal:,.0f} exceeds team avg (${t_avg_deal:,.0f})")
        elif avg_deal < t_avg_deal * AVG_DEAL_BELOW_FACTOR:
            improvements.append(f"Avg deal ${avg_deal:,.0f} below team avg (${t_avg_deal:,.0f})")

        if rev_yoy > YOY_REVENUE_UP:
            strengths.append(f"Revenue up {rev_yoy}% year-over-year")
        elif rev_yoy < YOY_REVENUE_DOWN:
            improvements.append(f"Revenue down {abs(rev_yoy)}% year-over-year")

        if t_avg_rev > 0 and revenue > t_avg_rev:
            pct = round((revenue - t_avg_rev) / t_avg_rev * 100)
            strengths.append(f"Revenue {pct}% above team average")
        elif t_avg_rev > 0 and revenue < t_avg_rev * REVENUE_BELOW_TEAM_FACTOR:
            improvements.append(f"Revenue below {int(REVENUE_BELOW_TEAM_FACTOR * 100)}% of team average")

        if coverage >= COVERAGE_HEALTHY:
            strengths.append(f"Pipeline coverage {coverage}x (healthy)")
        elif coverage < COVERAGE_LOW and pipe_val > 0:
            improvements.append(f"Pipeline coverage {coverage}x — below {COVERAGE_HEALTHY}x target")

        if pushed_cnt > 0:
            improvements.append(f"{pushed_cnt} deal(s) pushed 2+ times (${pushed_val:,.0f})")
        if stale_cnt > 0:
            improvements.append(f"{stale_cnt} open deal(s) idle 30+ days")

        zero_m = sum(1 for m in months[:today.month] if m['revenue'] == 0)
        if zero_m == 0 and today.month >= 3:
            strengths.append("Consistent monthly production")
        elif zero_m >= 3:
            improvements.append(f"{zero_m} zero-revenue months this year")

        # ── Tasks ───────────────────────────────────────────────────────
        # Collect opportunity IDs from tasks for amount lookup
        opp_ids = [
            t.get('WhatId') for t in data.get('open_tasks', [])
            if t.get('WhatId') and str(t['WhatId']).startswith('006')
        ]
        opp_amounts: dict[str, float] = {}
        if opp_ids:
            try:
                ids_str = ",".join(f"'{oid}'" for oid in opp_ids)
                opp_rows = sf_query_all(
                    f"SELECT Id, Amount FROM Opportunity WHERE Id IN ({ids_str})"
                )
                opp_amounts = {
                    r['Id']: (r.get('Amount', 0) or 0) for r in opp_rows
                }
            except Exception as e:
                log.warning(f"Opp amount lookup failed: {e}")

        open_tasks_list = []
        for t in data.get('open_tasks', []):
            due = t.get('ActivityDate')
            days_overdue = None
            overdue = False
            if due:
                try:
                    parts = due.split('-')
                    due_dt = date(int(parts[0]), int(parts[1]), int(parts[2]))
                    diff = (today - due_dt).days
                    if diff > 0:
                        overdue = True
                        days_overdue = diff
                except Exception:
                    pass
            what_id = t.get('WhatId') or ''
            is_opp = what_id.startswith('006')
            open_tasks_list.append({
                'id': t.get('Id', ''),
                'subject': t.get('Subject', ''),
                'status': t.get('Status', ''),
                'priority': t.get('Priority', 'Normal'),
                'due_date': due,
                'related_to': re.sub(r'\s*[-–]\s*\d{4}-\d{2}-\d{2}\s*$', '', (t.get('What') or {}).get('Name', '')),
                'what_id': what_id,
                'opp_amount': opp_amounts.get(what_id) if is_opp else None,
                'overdue': overdue,
                'days_overdue': days_overdue,
                'created': t.get('CreatedDate', ''),
            })

        tasks_done = _val(data.get('tasks_done_period', []), 'cnt')
        tasks_total = _val(data.get('tasks_total_period', []), 'cnt')
        tasks_overdue = sum(1 for tk in open_tasks_list if tk['overdue'])
        completion_rate = round(tasks_done / tasks_total * 100, 1) if tasks_total > 0 else 0

        task_stats = {
            'total_open': len(open_tasks_list),
            'overdue': tasks_overdue,
            'completed_period': tasks_done,
            'total_period': tasks_total,
            'completion_rate': completion_rate,
        }

        # Task-related insights for strengths/improvements
        if tasks_overdue > 0:
            unique_subjects = list(dict.fromkeys(
                tk['subject'] for tk in open_tasks_list if tk['overdue']
            ))[:3]
            improvements.append(
                f"{tasks_overdue} overdue task(s): {', '.join(unique_subjects)}"
            )
        if completion_rate >= TASK_COMPLETION_STRONG and tasks_total >= TASK_MIN_SAMPLE:
            strengths.append(f"Task completion rate {completion_rate}%")
        elif completion_rate < TASK_COMPLETION_POOR and tasks_total >= TASK_MIN_SAMPLE:
            improvements.append(f"Task completion rate {completion_rate}% — below {TASK_COMPLETION_POOR}% threshold")

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
            'team': {
                'avg_revenue': t_avg_rev, 'avg_commission': t_avg_comm,
                'win_rate': t_wr,
                'avg_deal': t_avg_deal, 'total_agents': n_agents,
            },
            'strengths': strengths[:5],
            'improvements': improvements[:5],
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
