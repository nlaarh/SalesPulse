"""Top Opportunities — conversion scoring + AI-generated write-ups."""

import os
import logging
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Query
from sf_client import sf_query_all
import cache
from shared import VALID_LINES, line_filter_opp as _line_filter, resolve_dates as _resolve_dates, is_sales_agent
from constants import (
    OPP_SCORE_AMOUNT_HIGH, OPP_SCORE_AMOUNT_SIGNIFICANT,
    OPP_SCORE_AMOUNT_MEDIUM, OPP_SCORE_AMOUNT_LOW,
    OPP_SCORE_AMOUNT_PTS_HIGH, OPP_SCORE_AMOUNT_PTS_SIGNIFICANT,
    OPP_SCORE_AMOUNT_PTS_MEDIUM, OPP_SCORE_AMOUNT_PTS_LOW,
    OPP_SCORE_AMOUNT_PTS_MINIMAL,
    OPP_SCORE_ACTIVITY_HOT_DAYS, OPP_SCORE_ACTIVITY_WARM_DAYS,
    OPP_SCORE_ACTIVITY_COOLING_DAYS, OPP_SCORE_ACTIVITY_COLD_DAYS,
    OPP_SCORE_ACTIVITY_ATRISK_DAYS,
    OPP_SCORE_ACTIVITY_PTS_HOT, OPP_SCORE_ACTIVITY_PTS_WARM,
    OPP_SCORE_ACTIVITY_PTS_COOLING, OPP_SCORE_ACTIVITY_PTS_COLD,
    OPP_SCORE_ACTIVITY_PTS_ATRISK,
    OPP_SCORE_CLOSE_THISWEEK_DAYS, OPP_SCORE_CLOSE_TWOWEEKS_DAYS,
    OPP_SCORE_CLOSE_THISMONTH_DAYS, OPP_SCORE_CLOSE_TWOMONTHS_DAYS,
)

router = APIRouter()
log = logging.getLogger('sales.opportunities')


def _days_between(d1: str | None, d2: date) -> int | None:
    """Days between an ISO date string and a date object."""
    if not d1:
        return None
    try:
        dt = datetime.strptime(d1[:10], '%Y-%m-%d').date()
        return (d2 - dt).days
    except Exception:
        return None


def _score_opportunity(opp: dict, today: date) -> dict:
    """Actionability score (0-100): ranks deals by how much manager action
    can influence the outcome. See docs/opportunity-scoring.md for full rationale."""
    score = 0.0
    reasons = []

    # 1. Deal value — 25% (manager's time should go to biggest deals)
    amount = opp.get('Amount') or 0
    if amount >= OPP_SCORE_AMOUNT_HIGH:
        score += OPP_SCORE_AMOUNT_PTS_HIGH
        reasons.append(f"High-value deal (${amount:,.0f})")
    elif amount >= OPP_SCORE_AMOUNT_SIGNIFICANT:
        score += OPP_SCORE_AMOUNT_PTS_SIGNIFICANT
        reasons.append(f"Significant deal (${amount:,.0f})")
    elif amount >= OPP_SCORE_AMOUNT_MEDIUM:
        score += OPP_SCORE_AMOUNT_PTS_MEDIUM
    elif amount >= OPP_SCORE_AMOUNT_LOW:
        score += OPP_SCORE_AMOUNT_PTS_LOW
    else:
        score += OPP_SCORE_AMOUNT_PTS_MINIMAL

    # 2. Activity recency — 20% (cold deals need intervention)
    last_act = opp.get('LastActivityDate')
    days_since_activity = _days_between(last_act, today)
    if days_since_activity is not None:
        # Negative = scheduled future activity in SF, treat as very active
        dsa = max(days_since_activity, 0)
        if dsa <= OPP_SCORE_ACTIVITY_HOT_DAYS:
            score += OPP_SCORE_ACTIVITY_PTS_HOT
            reasons.append(f"Active {dsa}d ago (hot)" if days_since_activity >= 0
                           else "Scheduled activity upcoming (engaged)")
        elif dsa <= OPP_SCORE_ACTIVITY_WARM_DAYS:
            score += OPP_SCORE_ACTIVITY_PTS_WARM
            reasons.append(f"Active {dsa}d ago (warm)")
        elif dsa <= OPP_SCORE_ACTIVITY_COOLING_DAYS:
            score += OPP_SCORE_ACTIVITY_PTS_COOLING
            reasons.append(f"Last activity {dsa}d ago (cooling)")
        elif dsa <= OPP_SCORE_ACTIVITY_COLD_DAYS:
            score += OPP_SCORE_ACTIVITY_PTS_COLD
            reasons.append(f"Last activity {dsa}d ago (going cold)")
        elif dsa <= OPP_SCORE_ACTIVITY_ATRISK_DAYS:
            score += OPP_SCORE_ACTIVITY_PTS_ATRISK
            reasons.append(f"No activity in {dsa}d (at risk)")
        else:
            reasons.append(f"No activity in {dsa}d (stale)")
    else:
        reasons.append("No activity recorded")

    # 3. Close date urgency — 20% (closing soon = act now)
    close_str = opp.get('CloseDate')
    dtc = _days_between(close_str, today)
    if dtc is not None:
        # dtc is days FROM today TO close date (negative = overdue)
        days_to_close = -dtc  # flip sign: positive = days until close
        if days_to_close < 0:
            score += 20
            reasons.append(f"Overdue by {-days_to_close}d (needs immediate action)")
        elif days_to_close <= OPP_SCORE_CLOSE_THISWEEK_DAYS:
            score += 18
            reasons.append(f"Closing in {days_to_close}d (this week)")
        elif days_to_close <= OPP_SCORE_CLOSE_TWOWEEKS_DAYS:
            score += 15
            reasons.append(f"Closing in {days_to_close}d")
        elif days_to_close <= OPP_SCORE_CLOSE_THISMONTH_DAYS:
            score += 10
            reasons.append(f"Closing in {days_to_close}d (this month)")
        elif days_to_close <= OPP_SCORE_CLOSE_TWOMONTHS_DAYS:
            score += 5
        elif days_to_close <= 90:
            score += 2

    # 4. Push-back history — 15% (U-shaped: 0 = on track, 2+ = needs help)
    pushes = opp.get('PushCount') or 0
    if pushes == 0:
        score += 15
        reasons.append("No push-backs (reliable timeline)")
    elif pushes == 1:
        score += 10
    elif pushes == 2:
        score += 12
        reasons.append(f"Pushed {pushes}x (warrants conversation)")
    elif pushes == 3:
        score += 14
        reasons.append(f"Pushed {pushes}x (manager should step in)")
    else:
        score += 15
        reasons.append(f"Pushed {pushes}x (persistent problem)")

    # 5. Stage actionability — 10% (Quote = highest leverage)
    stage = opp.get('StageName') or ''
    if stage == 'Quote':
        score += 10
        reasons.append("Quote stage (customer is deciding)")
    elif stage in ('Qualifying/Research', 'Qualifying'):
        score += 6
        reasons.append("Qualifying stage (being worked)")
    elif stage == 'New':
        score += 3
        reasons.append("New stage (early)")
    else:
        score += 2

    # 6. Forecast category — 10% (BestCase = agent thinks it's winnable)
    fc = opp.get('ForecastCategory') or ''
    if fc == 'BestCase':
        score += 10
        reasons.append("Forecast: Best Case (winnable with a push)")
    elif fc == 'Forecast':
        score += 7
        reasons.append("Forecast: Committed")
    elif fc == 'Pipeline':
        score += 4
        reasons.append("Forecast: Pipeline (needs qualification)")
    else:
        score += 1

    return {
        'score': round(min(score, 100), 1),
        'reasons': reasons,
    }


def _template_writeup(_opp: dict, scoring: dict) -> str:
    """Generate a template-based narrative (fallback when AI is unavailable)."""
    score = scoring['score']
    reasons = scoring['reasons']

    if score >= 80:
        verdict = "High priority — act today."
    elif score >= 60:
        verdict = "Warm — schedule follow-up this week."
    elif score >= 40:
        verdict = "Monitor — keep on radar, agent should handle."
    else:
        verdict = "Lower priority — review in weekly pipeline meeting."

    bullets = ' '.join(reasons[:4])
    return f"{verdict} {bullets}"


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
        lf = _line_filter(line)
        records = sf_query_all(f"""
            SELECT Id, Name, Amount, StageName, Probability, ForecastCategory,
                   CloseDate, CreatedDate, LastActivityDate, PushCount,
                   LastStageChangeDate, Owner.Name, RecordType.Name
            FROM Opportunity
            WHERE IsClosed = false AND {lf}
              AND Amount != null
              AND CloseDate <= {ed}
            ORDER BY Amount DESC
            LIMIT 500
        """)
        return records

    records = cache.cached_query(key, fetch_opps, ttl=1800, disk_ttl=3600)

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

    # Try AI write-ups if enabled
    ai_used = False
    if ai and top:
        ai_writeups = _ai_writeups_batch(top)
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
