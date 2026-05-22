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
            parts.append(f"{name} is performing at team level with ${rev:,.0f} in bookings.")
        else:
            parts.append(f"{name} is trailing at ${rev:,.0f}, "
                         f"{abs(pct)}% below team average.")
    else:
        parts.append(f"{name} generated ${rev:,.0f} in bookings this period.")

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
    line = profile.get('line', 'Travel')
    is_ins = line.lower() == 'insurance'

    # Recent monthly trend from PBI (last 3 months with data)
    months = profile.get('months', [])
    recent = [m for m in months if m.get('commission', 0) > 0 or m.get('revenue', 0) > 0][-3:]
    trend_str = ' → '.join(
        f"{m['label']} ${m['commission']:,.0f} comm" if is_ins
        else f"{m['label']} ${m['commission']:,.0f} comm / ${m['revenue']:,.0f} bkgs"
        for m in recent
    ) if recent else 'no recent data'

    # Overdue tasks (all of them, named)
    overdue_tasks = [
        f"\"{t['subject']}\"" + (f" (re: {t['related_to']})" if t.get('related_to') else '')
        for t in profile.get('tasks', {}).get('open_tasks', [])
        if t.get('overdue')
    ]

    context = f"""Sales Advisor: {profile['name']} | Division: {line} | Period: Last 12 months

── PBI DATA (live, authoritative) ──
Commission (PBI): ${s['commission']:,.0f} ({yoy['commission_pct']:+.1f}% YoY) vs prior ${pr['commission']:,.0f}"""

    if not is_ins:
        context += f"\nBookings (PBI):   ${s['revenue']:,.0f} ({yoy['revenue_pct']:+.1f}% YoY) vs prior ${pr['revenue']:,.0f}"

    context += f"""
Recent trend (PBI): {trend_str}
Team avg commission (PBI): ${team['avg_commission']:,.0f} across {team['total_agents']} advisors

── SF DATA (pipeline, activity) ──
Deals Won: {s['deals']} ({yoy['deals_pct']:+.1f}% YoY) | Win Rate: {s['win_rate']}% (team {team['win_rate']}%) | Avg Deal: ${s['avg_deal']:,.0f}
Pipeline: ${s['pipeline_value']:,.0f} ({s['pipeline_count']} deals) | Coverage: {s.get('coverage', 0)}x | Leads: {s['leads']} | Opps: {s['opps_created']}
Pushed 2+×: {profile.get('pushed_count', 0)} deals (${profile.get('pushed_value', 0):,.0f}) | Stale 30d+: {profile.get('stale_count', 0)} deals

── TASKS (SF) ──
Open: {profile.get('tasks', {}).get('stats', {}).get('total_open', 0)} | Overdue: {profile.get('tasks', {}).get('stats', {}).get('overdue', 0)} | Completion: {profile.get('tasks', {}).get('stats', {}).get('completion_rate', 0)}%
Overdue tasks: {'; '.join(overdue_tasks) if overdue_tasks else 'none'}

── OPEN OPPORTUNITIES (SF scored) ──
""" + '\n'.join(
        f"  • {o['name']}: ${o['amount']:,.0f} | {o['stage']} | Score {o['score']} | Close {o.get('close_date', '?')}"
        for o in profile.get('top_opportunities', [])[:5]
    ) + f"""

STRENGTHS: {'; '.join(profile.get('strengths', [])[:3])}
IMPROVEMENTS: {'; '.join(profile.get('improvements', [])[:3])}"""

    prompt = f"""{context}

Write a sharp manager's brief using **Markdown**. Rules:
- One-sentence verdict first: top-tier / on-track / at-risk (use PBI commission vs team avg to decide)
- Sections: ## Performance, ## Pipeline & Risks, ## Tasks, ## Action This Week
- Use **bold** for dollar amounts, percentages, and advisor/deal names
- In "Action This Week": ONE specific action — name the deal or customer, state the dollar amount, give a deadline
- List EVERY overdue task by exact name under ## Tasks
- Cite the data source when you use it: (PBI) for revenue/commission, (SF) for pipeline/tasks
- Max 400 words. Zero filler. Specific numbers only."""

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
