"""Extracted query builders and processing helpers for agent_profile.

Keeps the main endpoint file focused on orchestration and response assembly.
"""

import logging, re
from datetime import date

from shared import (
    WON_STAGES, MONTHS,
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

log = logging.getLogger('sales.agent_profile')


# ── Helpers ──────────────────────────────────────────────────────────────────

def win_rate(rows):
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


# ── SOQL Query Builder ──────────────────────────────────────────────────────

def build_profile_queries(*, safe, lf, lf_lead, ow, sd, ed, p_sd, p_ed,
                          cy, py, sma):
    """Return dict of named SOQL queries for sf_parallel(**queries)."""
    return dict(
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
              AND CloseDate >= {sma}
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
        # Agent: early-stage open opportunities (Qualifying, Quote, New, etc.) — within 6 months
        early_opps=f"""
            SELECT Id, Name, Amount, StageName, Probability, ForecastCategory,
                   CloseDate, LastActivityDate, PushCount
            FROM Opportunity
            WHERE {ow} AND IsClosed = false AND {lf}
              AND StageName NOT IN ('Invoice','Booked','Closed Won')
              AND CloseDate >= {sma}
            ORDER BY Amount DESC NULLS LAST LIMIT 100
        """,
        # Agent: Invoice/Booked open opportunities — within 6 months
        top_opps=f"""
            SELECT Id, Name, Amount, StageName, Probability, ForecastCategory,
                   CloseDate, LastActivityDate, PushCount
            FROM Opportunity
            WHERE {ow} AND IsClosed = false AND {lf}
              AND StageName IN ('Invoice','Booked')
              AND CloseDate >= {sma}
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
        # Agent: risk — pushed deals (within 6 months)
        pushed=f"""
            SELECT COUNT(Id) cnt, SUM(Amount) rev FROM Opportunity
            WHERE {ow} AND IsClosed = false AND {lf}
              AND PushCount >= 2 AND Amount != null
              AND CloseDate >= {sma}
        """,
        # Agent: risk — stale deals (within 6 months)
        stale=f"""
            SELECT COUNT(Id) cnt FROM Opportunity
            WHERE {ow} AND IsClosed = false AND {lf}
              AND LastActivityDate < LAST_N_DAYS:30
              AND CloseDate >= {sma}
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


# ── Monthly Breakdown Builder ────────────────────────────────────────────────

def build_monthly_breakdown(data, is_insurance):
    """Parse monthly revenue/leads/opps from SOQL results into 12-month list."""
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
    return months, leads_total, opps_total


# ── Opportunity List Builders ────────────────────────────────────────────────

def build_opportunities_list(data, today):
    """Build scored top-opportunities list (early-stage + Invoice/Booked)."""
    from routers.sales_opportunities import _score_opportunity

    def _build_opp(r: dict) -> dict:
        sc = _score_opportunity(r, today)
        return {
            'id': r.get('Id', ''), 'name': r.get('Name', ''),
            'amount': r.get('Amount', 0) or 0, 'stage': r.get('StageName', ''),
            'probability': r.get('Probability', 0) or 0,
            'forecast_category': r.get('ForecastCategory', ''),
            'close_date': r.get('CloseDate', ''),
            'last_activity': r.get('LastActivityDate', ''),
            'push_count': r.get('PushCount', 0) or 0,
            'score': sc['score'], 'reasons': sc['reasons'],
        }

    early_list = [_build_opp(r) for r in data.get('early_opps', [])]
    early_list.sort(key=lambda x: -x['score'])

    remaining = max(0, 50 - len(early_list))
    late_list = [_build_opp(r) for r in data.get('top_opps', [])[:remaining]]
    late_list.sort(key=lambda x: -x['score'])

    return early_list + late_list


def build_won_list(data):
    """Build recently-won opportunities list."""
    won_list = []
    for r in data.get('recent_won', []):
        won_list.append({
            'id': r.get('Id', ''), 'name': r.get('Name', ''),
            'amount': r.get('Amount', 0) or 0, 'stage': r.get('StageName', ''),
            'probability': r.get('Probability', 0) or 0,
            'close_date': r.get('CloseDate', ''),
            'commission': r.get('Earned_Commission_Amount__c', 0) or 0,
        })
    return won_list


# ── Team Averages ────────────────────────────────────────────────────────────

def compute_team_averages(data, line, is_insurance):
    """Compute team-level comparison metrics."""
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

    return {
        'avg_revenue': t_avg_rev, 'avg_commission': t_avg_comm,
        'win_rate': t_wr, 'avg_deal': t_avg_deal,
        'total_agents': n_agents,
    }


# ── Strengths & Improvements ────────────────────────────────────────────────

def compute_insights(*, revenue, avg_deal, wr, rev_yoy, coverage,
                     pipe_val, pushed_cnt, pushed_val, stale_cnt,
                     months, today, team, period,
                     task_stats, open_tasks_list):
    """Rule-based strengths & improvement areas."""
    t_wr = team['win_rate']
    t_avg_deal = team['avg_deal']
    t_avg_rev = team['avg_revenue']

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
        strengths.append(f"Bookings {pct}% above team average")
    elif t_avg_rev > 0 and revenue < t_avg_rev * REVENUE_BELOW_TEAM_FACTOR:
        improvements.append(f"Bookings below {int(REVENUE_BELOW_TEAM_FACTOR * 100)}% of team average")

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
        improvements.append(f"{zero_m} zero-bookings months this year")

    # Task-related insights
    tasks_overdue = task_stats['overdue']
    completion_rate = task_stats['completion_rate']
    tasks_total = task_stats['total_period']

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

    return strengths[:5], improvements[:5]


# ── Tasks Section Builder ────────────────────────────────────────────────────

def build_tasks_section(data, sf_query_all, today):
    """Build open-tasks list, fetch related opp amounts, compute stats."""
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

    return open_tasks_list, task_stats
