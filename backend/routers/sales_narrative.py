"""AI-powered executive narrative generation for all 5 Summary tabs.

GET /api/sales/narrative?page=advisor&line=Travel&period=12[&start_date=...&end_date=...]
Returns { "narrative": "AI text with **bold** markers", "cached": true/false }
"""

import os, logging, time, threading
from typing import Optional
from fastapi import APIRouter, Query
import cache
from shared import VALID_LINES

router = APIRouter()
log = logging.getLogger('sales.narrative')

VALID_PAGES = {'advisor', 'pipeline', 'top-opps', 'travel', 'monthly'}


# ── OpenAI client (lazy init, thread-safe) ───────────────────────────────────

_client = None
_client_lock = threading.Lock()


def _get_client():
    global _client
    if _client is not None:
        return _client
    with _client_lock:
        if _client is not None:   # double-check after acquiring lock
            return _client
        try:
            from routers.ai_config import get_ai_config
            cfg = get_ai_config()
            api_key = cfg.get('api_key') or os.getenv('OPENAI_API_KEY')
        except Exception:
            api_key = os.getenv('OPENAI_API_KEY')
            cfg = {}
        if not api_key:
            return None
        try:
            from openai import OpenAI
            kwargs: dict = {'api_key': api_key}
            if cfg.get('base_url'):
                kwargs['base_url'] = cfg['base_url']
            _client = OpenAI(**kwargs)
        except Exception as e:
            log.warning(f"OpenAI init failed: {e}")
    return _client


# ── System prompts per page ───────────────────────────────────────────────────

_BASE_SYSTEM = """You are a VP-level sales analytics briefer for AAA Western & Central New York.
Write a 4-5 paragraph executive briefing. Be specific — use exact dollar amounts, percentages, names.
Use **bold** for key metrics and verdicts. Use ## headers to separate sections when appropriate.
Use bullet lists (- item) for multiple data points. Audience: VP of Sales needing actionable insights in 30s.
No fluff, no generic advice. Every sentence must cite data. Output clean Markdown."""

_PAGE_ADDONS = {
    'advisor': """
Focus on: YoY revenue assessment, pipeline outlook and coverage ratio, risk from slipping deals,
top performer recognition, and one concrete action item with numbers.
Include deal velocity / close speed if data is provided.""",

    'pipeline': """
Focus on: Stage composition health (where deals cluster), velocity and age of deals,
at-risk/slipping deals by name and amount, forecast coverage verdict,
and one concrete action item.""",

    'top-opps': """
Focus on: Quality mix (high-score vs low-score deals), near-term execution priorities,
deal integrity issues (missing close dates, stale stages), concentration risk,
and top 3 deals that need immediate attention.""",

    'travel': """
Focus on: Destination concentration risk, growth/decline momentum by destination,
top 5 destinations by revenue, YoY trends, booking volume patterns,
and one strategic recommendation.""",

    'monthly': """
Focus on: Cross-metric trends (leads→opps→invoiced→sales conversion),
top and bottom performing agents by name with numbers, conversion rate health,
month-over-month trajectory, and coaching recommendations for underperformers.""",
}


# ── Data gathering per page ───────────────────────────────────────────────────

def _gather_advisor(line: str, period: int, **kw) -> str:
    from routers.sales_advisor import advisor_summary, advisor_leaderboard
    from routers.sales_pipeline import pipeline_slipping
    from routers.sales_leads import agent_close_speed

    sd = kw.get('start_date')
    ed = kw.get('end_date')
    summary = advisor_summary(line, period, sd, ed)
    leaders = advisor_leaderboard(line, period, sd, ed)
    slipping = pipeline_slipping(line)
    speed = agent_close_speed(line, period, sd, ed)

    s = summary
    top5 = leaders.get('advisors', [])[:5]
    slip = slipping.get('deals', [])[:5]
    all_agents_speed = speed.get('agents', [])
    agents_speed = all_agents_speed[:5]

    # Compute coverage ratio from pipeline / bookings
    bookings = s.get('bookings', 0) or 0
    pipe_val = s.get('pipeline_value', 0) or 0
    coverage = round(pipe_val / bookings, 1) if bookings > 0 else 0

    # Compute overall close speed from all agents
    all_days = [a.get('avg_days', 0) for a in all_agents_speed if a.get('avg_days')]
    overall_avg_days = round(sum(all_days) / len(all_days), 1) if all_days else 0
    overall_median_days = sorted(all_days)[len(all_days) // 2] if all_days else 0

    ctx = f"""DIVISION: {line} | PERIOD: Last {period} months

SUMMARY: Revenue **${s.get('bookings',0):,.0f}** ({s.get('bookings_yoy_pct',0):+.1f}% YoY) | \
Deals {s.get('deals',0)} ({s.get('deals_yoy_pct',0):+.1f}% YoY) | \
Win Rate {s.get('win_rate',0)}% | Avg Deal ${s.get('avg_deal_size',0):,.0f} | \
Pipeline ${pipe_val:,.0f} ({s.get('pipeline_count',0)} deals) | \
Coverage {coverage:.1f}x

TOP ADVISORS:
"""
    for a in top5:
        ctx += f"- {a.get('name','?')}: ${a.get('bookings',0):,.0f} rev, {a.get('deals',0)} deals, {a.get('win_rate',0)}% win rate\n"

    if slip:
        ctx += f"\nAT-RISK DEALS ({slipping.get('count',0)} deals, ${slipping.get('total_at_risk',0):,.0f}):\n"
        for d in slip:
            ctx += f"- {d.get('name','?')}: ${d.get('amount',0):,.0f}, {d.get('stage','?')}, {d.get('days_overdue',0)} days overdue, Owner: {d.get('owner','?')}\n"

    if agents_speed:
        ctx += f"\nCLOSE SPEED (avg {overall_avg_days} days, median {overall_median_days} days):\n"
        for a in agents_speed:
            ctx += f"- {a.get('name','?')}: {a.get('avg_days',0)} days avg ({a.get('deals',0)} deals)\n"

    return ctx


def _gather_pipeline(line: str, period: int, **kw) -> str:
    from routers.sales_pipeline import pipeline_stages, pipeline_forecast, pipeline_slipping

    sd = kw.get('start_date')
    ed = kw.get('end_date')
    stages = pipeline_stages(line)
    forecast = pipeline_forecast(line, period, sd, ed)
    slipping_data = pipeline_slipping(line)

    ctx = f"DIVISION: {line} | PERIOD: Last {period} months\n\nPIPELINE STAGES:\n"
    for st in stages.get('stages', []):
        ctx += f"- {st.get('stage','?')}: {st.get('count',0)} deals, ${st.get('amount',0):,.0f}\n"

    ctx += "\nFORECAST (monthly):\n"
    for m in forecast.get('months', [])[-6:]:
        ctx += f"- {m.get('label','?')}: Won ${m.get('won_revenue',0):,.0f} ({m.get('won_count',0)} deals), Lost {m.get('lost_count',0)}, Close Rate {m.get('close_rate',0)}%\n"

    slip = slipping_data.get('deals', [])[:8]
    if slip:
        ctx += f"\nSLIPPING DEALS ({slipping_data.get('count',0)} deals, ${slipping_data.get('total_at_risk',0):,.0f} at risk):\n"
        for d in slip:
            ctx += f"- {d.get('name','?')}: ${d.get('amount',0):,.0f}, {d.get('stage','?')}, {d.get('days_overdue',0)} days overdue, Owner: {d.get('owner','?')}\n"

    return ctx


def _gather_top_opps(line: str, period: int, **kw) -> str:
    from routers.sales_opportunities import top_opportunities

    sd = kw.get('start_date')
    ed = kw.get('end_date')
    data = top_opportunities(line, limit=20, ai=False, start_date=sd, end_date=ed)
    opps = data.get('opportunities', [])

    ctx = f"DIVISION: {line} | TOP {len(opps)} OPPORTUNITIES:\n\n"
    for i, o in enumerate(opps, 1):
        reasons = ', '.join(o.get('reasons', [])[:3]) if o.get('reasons') else 'N/A'
        ctx += f"{i}. {o.get('name','?')}: ${o.get('amount',0):,.0f} | Stage: {o.get('stage','?')} | Score: {o.get('score',0)} | Reasons: {reasons}\n"

    scores = [o.get('score', 0) for o in opps]
    high = sum(1 for s in scores if s >= 80)
    mid = sum(1 for s in scores if 50 <= s < 80)
    low = sum(1 for s in scores if s < 50)
    total_val = sum(o.get('amount', 0) for o in opps)
    ctx += f"\nSCORE DISTRIBUTION: {high} high (80+), {mid} medium (50-79), {low} low (<50)\n"
    ctx += f"TOTAL PIPELINE VALUE: ${total_val:,.0f}\n"

    return ctx


def _gather_travel(line: str, period: int, **kw) -> str:
    from routers.sales_travel import travel_destinations

    sd = kw.get('start_date')
    ed = kw.get('end_date')
    data = travel_destinations(period, sd, ed)
    dests = data.get('destinations', [])

    ctx = f"PERIOD: Last {period} months | TOP DESTINATIONS:\n\n"
    total_rev = sum(d.get('revenue', 0) for d in dests)
    for i, d in enumerate(dests[:15], 1):
        share = (d.get('revenue', 0) / total_rev * 100) if total_rev else 0
        yoy = d.get('yoy_growth_pct')
        yoy_str = f"{yoy:+.1f}% YoY" if yoy is not None else "N/A YoY"
        ctx += f"{i}. {d.get('destination','?')}: ${d.get('revenue',0):,.0f} ({share:.1f}% share), {d.get('volume',0)} bookings, {yoy_str}\n"

    ctx += f"\nTOTAL REVENUE: ${total_rev:,.0f} across {len(dests)} destinations\n"
    top3_share = sum(d.get('revenue', 0) for d in dests[:3]) / total_rev * 100 if total_rev else 0
    ctx += f"TOP 3 CONCENTRATION: {top3_share:.1f}% of total revenue\n"

    return ctx


def _gather_monthly(line: str, period: int, **kw) -> str:
    from routers.sales_performance import performance_monthly
    from routers.sales_advisor import advisor_summary

    start_date = kw.get('start_date')
    end_date = kw.get('end_date')
    perf = performance_monthly(line, period, start_date, end_date)
    summary = advisor_summary(line, period, start_date, end_date)

    ctx = f"DIVISION: {line} | PERIOD: Last {period} months\n"
    ctx += f"DIVISION TOTALS: Revenue ${summary.get('bookings',0):,.0f}, Deals {summary.get('deals',0)}, Win Rate {summary.get('win_rate',0)}%\n\n"

    agents = perf.get('agents', [])
    ctx += f"AGENT MONTHLY BREAKDOWN ({len(agents)} agents):\n\n"
    for agent in agents[:10]:
        name = agent.get('name', '?')
        months = agent.get('months', [])
        if not months:
            continue
        total_leads = sum(m.get('leads', 0) for m in months)
        total_opps = sum(m.get('opps', 0) for m in months)
        total_invoiced = sum(m.get('invoiced', 0) for m in months)
        total_sales = sum(m.get('sales', 0) for m in months)
        conv = (total_invoiced / total_opps * 100) if total_opps else 0
        ctx += f"- {name}: {total_leads} leads → {total_opps} opps → {total_invoiced} invoiced ({conv:.0f}%) → ${total_sales:,.0f} sales\n"

    div = perf.get('division_totals', {})
    if div:
        ctx += f"\nDIVISION TOTALS: {div.get('leads',0)} leads → {div.get('opps',0)} opps → {div.get('invoiced',0)} invoiced → ${div.get('sales',0):,.0f} sales\n"

    return ctx


_GATHERERS = {
    'advisor': _gather_advisor,
    'pipeline': _gather_pipeline,
    'top-opps': _gather_top_opps,
    'travel': _gather_travel,
    'monthly': _gather_monthly,
}


# ── Generate narrative ────────────────────────────────────────────────────────

def _generate(page: str, line: str, period: int, **kw) -> str | None:
    client = _get_client()
    if not client:
        return None

    gatherer = _GATHERERS.get(page)
    if not gatherer:
        return None

    try:
        data_context = gatherer(line, period, **kw)
    except Exception as e:
        log.warning(f"Data gathering failed for {page}: {e}")
        return None

    system = _BASE_SYSTEM + _PAGE_ADDONS.get(page, '')

    try:
        t0 = time.time()
        try:
            from routers.ai_config import get_ai_config
            _model = get_ai_config().get('model', 'gpt-4o-mini')
        except Exception:
            _model = os.getenv('AI_MODEL', 'gpt-4o-mini')
        resp = client.chat.completions.create(
            model=_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": data_context},
            ],
            temperature=0.3,
            max_tokens=600,
        )
        text = (resp.choices[0].message.content or '').strip()
        log.info(f"AI narrative for {page}/{line}/{period}: {len(text)} chars in {time.time()-t0:.1f}s")
        return text
    except Exception as e:
        log.warning(f"OpenAI narrative failed for {page}: {e}")
        return None


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/api/sales/narrative")
def narrative(
    page: str = "advisor",
    line: str = "Travel",
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """AI-generated executive narrative for a Summary tab."""
    if page not in VALID_PAGES:
        return {"narrative": None, "cached": False, "error": f"Invalid page: {page}"}
    if line not in VALID_LINES:
        line = 'Travel'

    key = f"ai_narrative_{page}_{line}_{period}_{start_date}_{end_date}"

    # Check cache first
    cached = cache.get(key)
    if cached is not None:
        return {"narrative": cached, "cached": True, "ai_generated": True}

    # Generate fresh
    text = _generate(page, line, period, start_date=start_date, end_date=end_date)
    if text:
        cache.put(key, text, 3600)        # L1: 1 hour
        cache.disk_put(key, text, 43200)   # L2: 12 hours
    return {"narrative": text, "cached": False, "ai_generated": text is not None}
