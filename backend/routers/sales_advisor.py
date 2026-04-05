"""Advisor Performance — revenue, deals, win rate, leaderboard, trends."""

import logging
from typing import Optional
from fastapi import APIRouter, Query
from sf_client import sf_query_all, sf_parallel
import cache
from shared import (
    VALID_LINES, WON_STAGES,
    line_filter_opp as _line_filter,
    resolve_dates as _resolve_dates,
    prev_dates as _prev_dates,
    is_sales_agent,
)

router = APIRouter()
log = logging.getLogger('sales.advisor')


def _date_filter(sd: str, ed: str, field: str = 'CloseDate') -> str:
    """SOQL clause for a date range. Always uses explicit dates — no LAST_N_MONTHS."""
    return f"{field} >= {sd} AND {field} <= {ed}"


@router.get("/api/sales/advisors/summary")
def advisor_summary(
    line: str = "Travel",
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Division-level KPIs: total revenue, deals, win rate, avg deal size, pipeline."""
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"advisor_summary_{line}_{sd}_{ed}"

    def fetch():
        lf = _line_filter(line)
        df = _date_filter(sd, ed)
        p_sd, p_ed = _prev_dates(sd, ed)
        pdf = _date_filter(p_sd, p_ed)
        data = sf_parallel(
            won=f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev,
                       SUM(Earned_Commission_Amount__c) comm
                FROM Opportunity
                WHERE {WON_STAGES} AND {lf}
                  AND {df}
            """,
            lost=f"""
                SELECT COUNT(Id) cnt
                FROM Opportunity
                WHERE StageName = 'Closed Lost' AND {lf}
                  AND {df}
            """,
            pipeline=f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev
                FROM Opportunity
                WHERE IsClosed = false AND {lf}
                  AND Amount != null
                  AND CloseDate >= TODAY
                  AND CloseDate <= NEXT_N_MONTHS:12
            """,
            won_prev=f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev,
                       SUM(Earned_Commission_Amount__c) comm
                FROM Opportunity
                WHERE {WON_STAGES} AND {lf}
                  AND {pdf}
            """,
        )

        won = data['won'][0] if data['won'] else {}
        lost = data['lost'][0] if data['lost'] else {}
        pipe = data['pipeline'][0] if data['pipeline'] else {}
        prev = data['won_prev'][0] if data['won_prev'] else {}

        won_cnt = won.get('cnt', 0) or 0
        won_rev = won.get('rev', 0) or 0
        won_comm = won.get('comm', 0) or 0
        lost_cnt = lost.get('cnt', 0) or 0
        pipe_cnt = pipe.get('cnt', 0) or 0
        pipe_rev = pipe.get('rev', 0) or 0
        prev_rev = prev.get('rev', 0) or 0
        prev_comm = prev.get('comm', 0) or 0
        prev_cnt = prev.get('cnt', 0) or 0

        total_closed = won_cnt + lost_cnt
        win_rate = round(won_cnt / total_closed * 100, 1) if total_closed > 0 else 0
        avg_deal = round(won_rev / won_cnt, 0) if won_cnt > 0 else 0
        yoy_delta = round((won_rev - prev_rev) / prev_rev * 100, 1) if prev_rev > 0 else 0
        comm_yoy = round((won_comm - prev_comm) / prev_comm * 100, 1) if prev_comm > 0 else 0
        deals_yoy = round((won_cnt - prev_cnt) / prev_cnt * 100, 1) if prev_cnt > 0 else 0

        return {
            "bookings": won_rev,
            "bookings_prev": prev_rev,
            "bookings_yoy_pct": yoy_delta,
            "commission": won_comm,
            "commission_prev": prev_comm,
            "commission_yoy_pct": comm_yoy,
            # Keep "revenue" as alias for bookings for backward compat
            "revenue": won_rev,
            "revenue_prev": prev_rev,
            "revenue_yoy_pct": yoy_delta,
            "deals": won_cnt,
            "deals_prev": prev_cnt,
            "deals_yoy_pct": deals_yoy,
            "win_rate": win_rate,
            "avg_deal_size": avg_deal,
            "pipeline_value": pipe_rev,
            "pipeline_count": pipe_cnt,
            "period_months": period,
            "line": line,
        }

    return cache.cached_query(key, fetch, ttl=3600, disk_ttl=86400)


@router.get("/api/sales/advisors/leaderboard")
def advisor_leaderboard(
    line: str = "Travel",
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Ranked list of advisors with revenue, deals, win rate, avg deal size."""
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"advisor_leaderboard_{line}_{sd}_{ed}"

    def fetch():
        lf = _line_filter(line)
        df = _date_filter(sd, ed)
        # OwnerId eliminates the User cross-object join — 2-3x faster than Owner.Name in GROUP BY
        data = sf_parallel(
            won=f"""
                SELECT OwnerId, COUNT(Id) cnt, SUM(Amount) rev,
                       SUM(Earned_Commission_Amount__c) comm
                FROM Opportunity
                WHERE {WON_STAGES} AND {lf}
                  AND {df}
                  AND Amount != null
                GROUP BY OwnerId
                ORDER BY SUM(Amount) DESC
            """,
            closed=f"""
                SELECT OwnerId, COUNT(Id) cnt
                FROM Opportunity
                WHERE StageName IN ('Closed Won','Invoice','Closed Lost') AND {lf}
                  AND {df}
                GROUP BY OwnerId
            """,
            pipeline=f"""
                SELECT OwnerId, COUNT(Id) cnt, SUM(Amount) rev
                FROM Opportunity
                WHERE IsClosed = false AND {lf}
                  AND Amount != null
                  AND CloseDate >= TODAY
                  AND CloseDate <= NEXT_N_MONTHS:12
                GROUP BY OwnerId
            """,
            owners="""SELECT Id, Name FROM User WHERE IsActive = true LIMIT 500""",
        )

        owner_map = {r['Id']: r['Name'] for r in data.get('owners', [])}

        # Build lookup maps using OwnerId
        closed_map = {r['OwnerId']: r['cnt'] for r in data['closed']}
        pipe_map = {r['OwnerId']: {'cnt': r['cnt'], 'rev': r.get('rev', 0) or 0} for r in data['pipeline']}

        advisors = []
        for r in data['won']:
            owner_id = r.get('OwnerId', '')
            name = owner_map.get(owner_id, '')
            if not name:
                continue
            won_cnt = r['cnt'] or 0
            rev = r.get('rev', 0) or 0
            if rev <= 0:
                continue  # Skip non-sales people with $0 revenue
            total_closed = closed_map.get(owner_id, won_cnt)
            win_rate = round(won_cnt / total_closed * 100, 1) if total_closed > 0 else 0
            avg_deal = round(rev / won_cnt, 0) if won_cnt > 0 else 0
            pipe = pipe_map.get(owner_id, {})

            comm = r.get('comm', 0) or 0
            advisors.append({
                "name": name,
                "bookings": rev,
                "commission": comm,
                "revenue": rev,  # backward compat alias
                "deals": won_cnt,
                "win_rate": win_rate,
                "avg_deal_size": avg_deal,
                "pipeline_value": pipe.get('rev', 0),
                "pipeline_count": pipe.get('cnt', 0),
            })

        # Filter to whitelisted sales agents
        advisors = [a for a in advisors if is_sales_agent(a['name'], line)]

        # Rank after filtering
        for i, a in enumerate(advisors):
            a['rank'] = i + 1

        return {"advisors": advisors, "total": len(advisors), "line": line, "period": period}

    return cache.cached_query(key, fetch, ttl=3600, disk_ttl=86400)


@router.get("/api/sales/advisors/yoy")
def advisor_yoy(line: str = "Travel"):
    """Calendar year-over-year monthly revenue: current year vs prior year."""
    if line not in VALID_LINES:
        line = 'Travel'
    from datetime import date as _date
    today = _date.today()
    key = f"advisor_yoy_{line}_{today.isoformat()}"

    def fetch():
        lf = _line_filter(line)
        current_year = today.year
        prior_year = current_year - 1

        data = sf_parallel(
            current=f"""
                SELECT CALENDAR_MONTH(CloseDate) mo, COUNT(Id) cnt, SUM(Amount) rev,
                       SUM(Earned_Commission_Amount__c) comm
                FROM Opportunity
                WHERE {WON_STAGES} AND {lf}
                  AND CALENDAR_YEAR(CloseDate) = {current_year}
                  AND CloseDate <= TODAY
                  AND Amount != null
                GROUP BY CALENDAR_MONTH(CloseDate)
                ORDER BY CALENDAR_MONTH(CloseDate)
            """,
            prior=f"""
                SELECT CALENDAR_MONTH(CloseDate) mo, COUNT(Id) cnt, SUM(Amount) rev,
                       SUM(Earned_Commission_Amount__c) comm
                FROM Opportunity
                WHERE {WON_STAGES} AND {lf}
                  AND CALENDAR_YEAR(CloseDate) = {prior_year}
                  AND CloseDate <= TODAY
                  AND Amount != null
                GROUP BY CALENDAR_MONTH(CloseDate)
                ORDER BY CALENDAR_MONTH(CloseDate)
            """,
        )

        month_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        current_map = {r['mo']: {
            'revenue': r.get('rev', 0) or 0,
            'deals': r.get('cnt', 0) or 0,
            'commission': r.get('comm', 0) or 0,
        } for r in data['current']}
        prior_map = {r['mo']: {
            'revenue': r.get('rev', 0) or 0,
            'deals': r.get('cnt', 0) or 0,
            'commission': r.get('comm', 0) or 0,
        } for r in data['prior']}

        months = []
        current_total = 0
        prior_total = 0
        current_comm_total = 0
        prior_comm_total = 0
        for i in range(1, 13):
            cur = current_map.get(i, {})
            pri = prior_map.get(i, {})
            cur_rev = cur.get('revenue', 0)
            pri_rev = pri.get('revenue', 0)
            current_total += cur_rev
            prior_total += pri_rev
            current_comm_total += cur.get('commission', 0)
            prior_comm_total += pri.get('commission', 0)
            months.append({
                'month': i,
                'label': month_names[i - 1],
                'current_revenue': cur_rev,
                'prior_revenue': pri_rev,
                'current_commission': cur.get('commission', 0),
                'prior_commission': pri.get('commission', 0),
                'current_deals': cur.get('deals', 0),
                'prior_deals': pri.get('deals', 0),
            })

        yoy_pct = round((current_total - prior_total) / prior_total * 100, 1) if prior_total > 0 else 0

        # Same-period (YTD) comparison: only months up to current month
        current_month = date.today().month
        ytd_current = sum(m['current_revenue'] for m in months if m['month'] <= current_month)
        ytd_prior = sum(m['prior_revenue'] for m in months if m['month'] <= current_month)
        ytd_yoy_pct = round((ytd_current - ytd_prior) / ytd_prior * 100, 1) if ytd_prior > 0 else 0
        ytd_current_deals = sum(m['current_deals'] for m in months if m['month'] <= current_month)
        ytd_prior_deals = sum(m['prior_deals'] for m in months if m['month'] <= current_month)

        return {
            'months': months,
            'current_year': current_year,
            'prior_year': prior_year,
            'current_total': current_total,
            'prior_total': prior_total,
            'yoy_pct': yoy_pct,
            'ytd_current_total': ytd_current,
            'ytd_prior_total': ytd_prior,
            'ytd_yoy_pct': ytd_yoy_pct,
            'ytd_current_deals': ytd_current_deals,
            'ytd_prior_deals': ytd_prior_deals,
            'ytd_months': current_month,
            'line': line,
        }

    return cache.cached_query(key, fetch, ttl=3600, disk_ttl=86400)


@router.get("/api/sales/advisors/trend")
def advisor_trend(
    line: str = "Travel",
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Monthly revenue trend for the division (all advisors aggregated)."""
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"advisor_trend_{line}_{sd}_{ed}"

    def fetch():
        lf = _line_filter(line)
        df = _date_filter(sd, ed)
        records = sf_query_all(f"""
            SELECT CALENDAR_YEAR(CloseDate) yr, CALENDAR_MONTH(CloseDate) mo,
                   COUNT(Id) cnt, SUM(Amount) rev,
                   SUM(Earned_Commission_Amount__c) comm
            FROM Opportunity
            WHERE {WON_STAGES} AND {lf}
              AND {df}
              AND Amount != null
            GROUP BY CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate)
            ORDER BY CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate)
        """)

        months = []
        for r in records:
            months.append({
                "year": r.get('yr'),
                "month": r.get('mo'),
                "label": f"{r.get('yr')}-{str(r.get('mo', 0)).zfill(2)}",
                "revenue": r.get('rev', 0) or 0,
                "commission": r.get('comm', 0) or 0,
                "deals": r.get('cnt', 0) or 0,
            })

        return {"months": months, "line": line, "period": period}

    return cache.cached_query(key, fetch, ttl=3600, disk_ttl=86400)
