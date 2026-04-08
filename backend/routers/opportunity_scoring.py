"""Opportunity scoring and template write-up helpers (pure functions, no FastAPI)."""

from datetime import date, datetime
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
