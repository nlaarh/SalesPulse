"""Agent Brief — template and AI-generated manager's executive briefs.

Extracted from sales_agent_profile to keep files under 600 lines.
Both functions accept a fully-built profile dict and return a brief string.
"""

import os, logging
from constants import (
    COVERAGE_LOW, COVERAGE_HEALTHY,
    TASK_COMPLETION_STRONG, TASK_COMPLETION_POOR, TASK_MIN_SAMPLE,
    WIN_RATE_DELTA,
    YOY_STRONG_GROWTH, YOY_REVENUE_UP, YOY_REVENUE_DOWN, YOY_DEALS_DRIVER, YOY_TRAILING,
)

log = logging.getLogger('sales.agent_brief')


# ── Template Manager's Brief ────────────────────────────────────────────────

def template_brief(p: dict) -> str:
    """Generate a template-based manager's brief (fallback when AI unavailable)."""
    name = p['name']
    s = p['summary']
    yoy = p['yoy']
    team = p['team']
    parts = []

    # Overall performance
    rev = s['revenue']
    team_avg = team['avg_revenue']
    if team_avg > 0:
        pct = round((rev - team_avg) / team_avg * 100)
        if pct > YOY_STRONG_GROWTH:
            parts.append(f"{name} is a strong performer with ${rev:,.0f} in revenue, "
                         f"{pct}% above team average.")
        elif pct > YOY_TRAILING:
            parts.append(f"{name} is performing at team level with ${rev:,.0f} in revenue.")
        else:
            parts.append(f"{name} is trailing at ${rev:,.0f}, "
                         f"{abs(pct)}% below team average.")
    else:
        parts.append(f"{name} generated ${rev:,.0f} in revenue this period.")

    # YoY
    if yoy['revenue_pct'] > YOY_REVENUE_UP:
        driver = 'higher volume' if yoy['deals_pct'] > YOY_DEALS_DRIVER else 'larger deals'
        parts.append(f"Year-over-year growth is strong at +{yoy['revenue_pct']}%, "
                     f"driven by {driver}.")
    elif yoy['revenue_pct'] < YOY_REVENUE_DOWN:
        parts.append(f"Revenue declined {abs(yoy['revenue_pct'])}% versus prior year — "
                     "investigate cause and consider coaching.")
    else:
        parts.append(f"Revenue is roughly flat year-over-year ({yoy['revenue_pct']:+.1f}%).")

    # Win rate vs team
    wr = s['win_rate']
    twr = team['win_rate']
    if wr > twr + WIN_RATE_DELTA:
        parts.append(f"Win rate of {wr}% exceeds team average ({twr}%) by {round(wr - twr)}pts.")
    elif wr < twr - WIN_RATE_DELTA:
        parts.append(f"Win rate {wr}% is {round(twr - wr)}pts below team ({twr}%) — "
                     "coaching on qualification recommended.")

    # Pipeline risk
    cov = s.get('coverage', 0)
    if cov < COVERAGE_LOW and s['pipeline_value'] > 0:
        parts.append(f"Pipeline coverage at {cov}x is below the {COVERAGE_HEALTHY}x target — "
                     "needs more prospecting activity.")
    if p.get('pushed_count', 0) >= 2:
        parts.append(f"{p['pushed_count']} deals (${p.get('pushed_value', 0):,.0f}) "
                     "pushed multiple times — review with management.")

    # Tasks
    tasks = p.get('tasks', {})
    ts = tasks.get('stats', {})
    open_count = ts.get('total_open', 0)
    overdue_count = ts.get('overdue', 0)
    cr = ts.get('completion_rate', 0)
    if overdue_count > 0:
        overdue_subjects = list(dict.fromkeys(
            t['subject'] for t in tasks.get('open_tasks', []) if t.get('overdue')
        ))[:2]
        subj_str = f" ({', '.join(overdue_subjects)})" if overdue_subjects else ""
        parts.append(f"Has {overdue_count} overdue task(s){subj_str} — "
                     "needs immediate follow-up.")
    elif open_count > 0:
        parts.append(f"{open_count} open tasks, none overdue — task management is on track.")
    if cr > 0 and ts.get('total_period', 0) >= TASK_MIN_SAMPLE:
        if cr >= TASK_COMPLETION_STRONG:
            parts.append(f"Task completion rate {cr}% over 90 days is strong.")
        elif cr < TASK_COMPLETION_POOR:
            parts.append(f"Task completion rate {cr}% is concerning — may be dropping follow-ups.")

    return ' '.join(parts)


# ── AI Manager's Brief ──────────────────────────────────────────────────────

def ai_brief(profile: dict) -> str | None:
    """Generate an AI executive brief using OpenAI gpt-4o-mini."""
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        return None

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
    except Exception as e:
        log.warning(f"OpenAI init failed: {e}")
        return None

    s = profile['summary']
    pr = profile['prior']
    yoy = profile['yoy']
    team = profile['team']

    context = f"""Sales Advisor: {profile['name']}
Division: {profile['line']} | Period: Last 12 months

CURRENT: Revenue ${s['revenue']:,.0f} ({yoy['revenue_pct']:+.1f}% YoY) | \
Deals {s['deals']} ({yoy['deals_pct']:+.1f}% YoY) | Win Rate {s['win_rate']}% | \
Avg Deal ${s['avg_deal']:,.0f} | Pipeline ${s['pipeline_value']:,.0f} ({s['pipeline_count']} deals) | \
Coverage {s.get('coverage',0)}x | Leads {s['leads']} | Opps {s['opps_created']}

PRIOR YEAR: Revenue ${pr['revenue']:,.0f} | Win Rate {pr['win_rate']}% | Avg Deal ${pr['avg_deal']:,.0f}

TEAM: Avg Revenue ${team['avg_revenue']:,.0f} | Win Rate {team['win_rate']}% | \
Avg Deal ${team['avg_deal']:,.0f} | {team['total_agents']} agents

RISKS: {profile.get('pushed_count',0)} deals pushed 2+ times (${profile.get('pushed_value',0):,.0f}) | \
{profile.get('stale_count',0)} stale deals (30+ days no activity)

TASKS: {profile.get('tasks',{}).get('stats',{}).get('total_open',0)} open | \
{profile.get('tasks',{}).get('stats',{}).get('overdue',0)} overdue | \
Completion rate {profile.get('tasks',{}).get('stats',{}).get('completion_rate',0)}%
Overdue tasks: {'; '.join(t['subject'] + ' — ' + t.get('related_to','') for t in profile.get('tasks',{}).get('open_tasks',[]) if t.get('overdue'))[:5]}

STRENGTHS: {'; '.join(profile.get('strengths',[])[:3])}
IMPROVEMENTS: {'; '.join(profile.get('improvements',[])[:3])}

TOP OPPS: """ + ' | '.join(
        f"{o['name']}: ${o['amount']:,.0f}, {o['stage']}, Score {o['score']}"
        for o in profile.get('top_opportunities', [])[:5]
    )

    prompt = f"""{context}

Write a manager's briefing for this advisor using **Markdown formatting**:
- Use **bold** for key metrics (dollar amounts, percentages, names)
- Use ## headers for sections: Performance, Trends, Risks, Action Items
- Use bullet lists for multiple points

Cover:
1. Overall performance assessment vs team
2. Key YoY trend and what's driving it
3. One strength to recognize
4. Task management — flag overdue tasks by name and which ones need immediate attention
5. One specific action item (with numbers)
6. Any deal-level or task-level risk needing attention

No fluff, no generic advice. Use dollar amounts and percentages."""

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=400,
        )
        return (resp.choices[0].message.content or '').strip()
    except Exception as e:
        log.warning(f"OpenAI brief failed: {e}")
        return None
