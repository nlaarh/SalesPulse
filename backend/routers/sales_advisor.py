"""Advisor Performance — revenue, deals, win rate, leaderboard, trends.

Travel and Insurance use Power BI (SUMMARIZECOLUMNS, pre-aggregated).
All other lines use Salesforce.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from fastapi import APIRouter, Query
from sf_client import sf_query_all, sf_parallel
import cache
from pbi_client import (
    travel_by_advisor, travel_by_day, travel_by_branch_day,
    insurance_by_advisor, insurance_by_day, insurance_by_branch_day,
)
from shared import (
    VALID_LINES, WON_STAGES,
    line_filter_opp as _line_filter,
    resolve_dates as _resolve_dates,
    prev_dates as _prev_dates,
    is_sales_agent,
    get_owner_map,
)
from constants import CACHE_TTL_HOUR, CACHE_TTL_DAY

router = APIRouter()
log = logging.getLogger('sales.advisor')

_PBI_LINES = frozenset({'Travel', 'Insurance'})


def _date_filter(sd: str, ed: str, field: str = 'CloseDate') -> str:
    return f"{field} >= {sd} AND {field} <= {ed}"


# ── PBI dispatch helpers ──────────────────────────────────────────────────────

def _pbi_by_advisor(line: str, sd: str, ed: str) -> list[dict]:
    return travel_by_advisor(sd, ed) if line == 'Travel' else insurance_by_advisor(sd, ed)


def _pbi_by_day(line: str, sd: str, ed: str) -> list[dict]:
    return travel_by_day(sd, ed) if line == 'Travel' else insurance_by_day(sd, ed)


def _pbi_by_branch_day(line: str, sd: str, ed: str) -> list[dict]:
    return travel_by_branch_day(sd, ed) if line == 'Travel' else insurance_by_branch_day(sd, ed)


def _build_leaderboard(adv_rows: list[dict]) -> list[dict]:
    """Collapse by-advisor+branch rows into one row per advisor.

    For advisors that span multiple branches (common in Insurance), totals are
    summed and the branch with the highest commission is used as the display branch.
    """
    agg: dict = {}
    for r in adv_rows:
        name = r['name']
        if not name:
            continue
        if name not in agg:
            agg[name] = {
                'name': name, 'branch': r['branch'],
                '_top_comm': r['commission'],
                'commission': 0.0, 'sales': 0.0, 'txns': 0,
            }
        agg[name]['commission'] += r['commission']
        agg[name]['sales']      += r['sales']
        agg[name]['txns']       += r['txns']
        if r['commission'] > agg[name]['_top_comm']:
            agg[name]['_top_comm'] = r['commission']
            agg[name]['branch']    = r['branch']

    advisors = []
    for d in agg.values():
        if d['commission'] <= 0:
            continue
        txns = d['txns']
        advisors.append({
            'name':           d['name'],
            'branch':         d['branch'],
            'commission':     round(d['commission'], 2),
            'bookings':       round(d['sales'], 2),
            'revenue':        round(d['sales'], 2),
            'deals':          txns,
            'win_rate':       0,
            'avg_deal_size':  round(d['sales'] / txns, 0) if txns > 0 else 0,
            'pipeline_value': 0,
            'pipeline_count': 0,
        })

    advisors.sort(key=lambda x: x['commission'], reverse=True)
    for i, a in enumerate(advisors):
        a['rank'] = i + 1
    return advisors


# ── /summary ──────────────────────────────────────────────────────────────────

@router.get("/api/sales/advisors/summary")
def advisor_summary(
    line: str = "Travel",
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"advisor_summary_{line}_{sd}_{ed}"

    def fetch():
        if line in _PBI_LINES:
            p_sd, p_ed = _prev_dates(sd, ed)
            lf = _line_filter(line)
            df = _date_filter(sd, ed)

            # Run PBI (curr + prev) and SF pipeline/win-rate queries in parallel
            with ThreadPoolExecutor(max_workers=3) as ex:
                curr_f = ex.submit(_pbi_by_day, line, sd, ed)
                prev_f = ex.submit(_pbi_by_day, line, p_sd, p_ed)
                sf_f   = ex.submit(sf_parallel,
                    won=f"SELECT COUNT(Id) cnt FROM Opportunity"
                        f" WHERE {WON_STAGES} AND {lf} AND {df}",
                    lost=f"SELECT COUNT(Id) cnt FROM Opportunity"
                         f" WHERE StageName = 'Closed Lost' AND {lf} AND {df}",
                    pipeline=f"SELECT COUNT(Id) cnt, SUM(Amount) rev FROM Opportunity"
                             f" WHERE IsClosed = false AND {lf} AND Amount != null"
                             f" AND CloseDate >= TODAY AND CloseDate <= NEXT_N_MONTHS:12",
                )
                rows  = curr_f.result()
                prows = prev_f.result()
                sf    = sf_f.result()

            comm    = sum(r['commission'] for r in rows)
            sales   = sum(r['sales']      for r in rows)
            txns    = sum(r['txns']       for r in rows)
            p_comm  = sum(r['commission'] for r in prows)
            p_sales = sum(r['sales']      for r in prows)
            p_txns  = sum(r['txns']       for r in prows)

            won_cnt  = (sf['won'][0]  if sf.get('won')  else {}).get('cnt', 0) or 0
            lost_cnt = (sf['lost'][0] if sf.get('lost') else {}).get('cnt', 0) or 0
            pipe     = sf['pipeline'][0] if sf.get('pipeline') else {}
            pipe_cnt = pipe.get('cnt', 0) or 0
            pipe_rev = pipe.get('rev', 0) or 0
            total_closed = won_cnt + lost_cnt
            win_rate = round(won_cnt / total_closed * 100, 1) if total_closed > 0 else 0

            def _pct(a, b): return round((a - b) / b * 100, 1) if b > 0 else 0

            return {
                "bookings":           round(sales, 2),
                "bookings_prev":      round(p_sales, 2),
                "bookings_yoy_pct":   _pct(sales, p_sales),
                "commission":         round(comm, 2),
                "commission_prev":    round(p_comm, 2),
                "commission_yoy_pct": _pct(comm, p_comm),
                "revenue":            round(sales, 2),
                "revenue_prev":       round(p_sales, 2),
                "revenue_yoy_pct":    _pct(sales, p_sales),
                "deals":              txns,
                "deals_prev":         p_txns,
                "deals_yoy_pct":      _pct(txns, p_txns),
                "win_rate":           win_rate,
                "avg_deal_size":      round(sales / txns, 0) if txns > 0 else 0,
                "pipeline_value":     pipe_rev,
                "pipeline_count":     pipe_cnt,
                "period_months":      period,
                "line":               line,
            }

        # ── Salesforce ────────────────────────────────────────────────────
        lf = _line_filter(line)
        df = _date_filter(sd, ed)
        p_sd, p_ed = _prev_dates(sd, ed)
        pdf = _date_filter(p_sd, p_ed)
        data = sf_parallel(
            won=f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev,
                       SUM(Earned_Commission_Amount__c) comm
                FROM Opportunity
                WHERE {WON_STAGES} AND {lf} AND {df}
            """,
            lost=f"""
                SELECT COUNT(Id) cnt FROM Opportunity
                WHERE StageName = 'Closed Lost' AND {lf} AND {df}
            """,
            pipeline=f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev FROM Opportunity
                WHERE IsClosed = false AND {lf} AND Amount != null
                  AND CloseDate >= TODAY AND CloseDate <= NEXT_N_MONTHS:12
            """,
            won_prev=f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev,
                       SUM(Earned_Commission_Amount__c) comm
                FROM Opportunity
                WHERE {WON_STAGES} AND {lf} AND {pdf}
            """,
        )

        won  = data['won'][0]  if data['won']  else {}
        lost = data['lost'][0] if data['lost'] else {}
        pipe = data['pipeline'][0] if data['pipeline'] else {}
        prev = data['won_prev'][0] if data['won_prev'] else {}

        won_cnt  = won.get('cnt', 0) or 0
        won_rev  = won.get('rev', 0) or 0
        won_comm = won.get('comm', 0) or 0
        lost_cnt = lost.get('cnt', 0) or 0
        pipe_cnt = pipe.get('cnt', 0) or 0
        pipe_rev = pipe.get('rev', 0) or 0
        prev_rev  = prev.get('rev', 0) or 0
        prev_comm = prev.get('comm', 0) or 0
        prev_cnt  = prev.get('cnt', 0) or 0

        total_closed = won_cnt + lost_cnt
        win_rate = round(won_cnt / total_closed * 100, 1) if total_closed > 0 else 0
        avg_deal = round(won_rev / won_cnt, 0) if won_cnt > 0 else 0

        def _pct(a, b): return round((a - b) / b * 100, 1) if b > 0 else 0

        return {
            "bookings":           won_rev,
            "bookings_prev":      prev_rev,
            "bookings_yoy_pct":   _pct(won_rev, prev_rev),
            "commission":         won_comm,
            "commission_prev":    prev_comm,
            "commission_yoy_pct": _pct(won_comm, prev_comm),
            "revenue":            won_rev,
            "revenue_prev":       prev_rev,
            "revenue_yoy_pct":    _pct(won_rev, prev_rev),
            "deals":              won_cnt,
            "deals_prev":         prev_cnt,
            "deals_yoy_pct":      _pct(won_cnt, prev_cnt),
            "win_rate":           win_rate,
            "avg_deal_size":      avg_deal,
            "pipeline_value":     pipe_rev,
            "pipeline_count":     pipe_cnt,
            "period_months":      period,
            "line":               line,
        }

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


# ── /leaderboard ──────────────────────────────────────────────────────────────

@router.get("/api/sales/advisors/leaderboard")
def advisor_leaderboard(
    line: str = "Travel",
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"advisor_leaderboard_v2_{line}_{sd}_{ed}"

    def fetch():
        if line in _PBI_LINES:
            lf = _line_filter(line)
            df = _date_filter(sd, ed)
            with ThreadPoolExecutor(max_workers=2) as ex:
                adv_f = ex.submit(_pbi_by_advisor, line, sd, ed)
                sf_f  = ex.submit(sf_parallel,
                    won=f"SELECT OwnerId, COUNT(Id) cnt FROM Opportunity"
                        f" WHERE {WON_STAGES} AND {lf} AND {df} GROUP BY OwnerId",
                    closed=f"SELECT OwnerId, COUNT(Id) cnt FROM Opportunity"
                           f" WHERE StageName IN ('Closed Won','Invoice','Closed Lost')"
                           f" AND {lf} AND {df} GROUP BY OwnerId",
                    pipeline=f"SELECT OwnerId, COUNT(Id) cnt, SUM(Amount) rev"
                             f" FROM Opportunity WHERE IsClosed = false AND {lf}"
                             f" AND Amount != null AND CloseDate >= TODAY"
                             f" AND CloseDate <= NEXT_N_MONTHS:12 GROUP BY OwnerId",
                )
                adv_rows = adv_f.result()
                sf       = sf_f.result()

            owner_map  = get_owner_map()
            won_map    = {owner_map[r['OwnerId']]: r.get('cnt', 0) or 0
                          for r in sf.get('won', []) if r.get('OwnerId') in owner_map}
            closed_map = {owner_map[r['OwnerId']]: r.get('cnt', 0) or 0
                          for r in sf.get('closed', []) if r.get('OwnerId') in owner_map}
            pipe_map   = {owner_map[r['OwnerId']]: {'cnt': r.get('cnt', 0) or 0,
                                                     'rev': r.get('rev', 0) or 0}
                          for r in sf.get('pipeline', []) if r.get('OwnerId') in owner_map}

            advisors = _build_leaderboard(adv_rows)
            for a in advisors:
                name = a['name']
                won  = won_map.get(name, 0)
                total_closed = closed_map.get(name, won)
                a['win_rate']       = round(won / total_closed * 100, 1) if total_closed > 0 else 0
                pipe = pipe_map.get(name, {})
                a['pipeline_value'] = pipe.get('rev', 0)
                a['pipeline_count'] = pipe.get('cnt', 0)

            return {"advisors": advisors, "total": len(advisors), "line": line, "period": period}

        # ── Salesforce ────────────────────────────────────────────────────
        lf = _line_filter(line)
        df = _date_filter(sd, ed)
        data = sf_parallel(
            won=f"""
                SELECT OwnerId, COUNT(Id) cnt, SUM(Amount) rev,
                       SUM(Earned_Commission_Amount__c) comm
                FROM Opportunity
                WHERE {WON_STAGES} AND {lf} AND {df} AND Amount != null
                GROUP BY OwnerId ORDER BY SUM(Amount) DESC
            """,
            closed=f"""
                SELECT OwnerId, COUNT(Id) cnt FROM Opportunity
                WHERE StageName IN ('Closed Won','Invoice','Closed Lost')
                  AND {lf} AND {df}
                GROUP BY OwnerId
            """,
            pipeline=f"""
                SELECT OwnerId, COUNT(Id) cnt, SUM(Amount) rev FROM Opportunity
                WHERE IsClosed = false AND {lf} AND Amount != null
                  AND CloseDate >= TODAY AND CloseDate <= NEXT_N_MONTHS:12
                GROUP BY OwnerId
            """,
        )

        owner_map  = get_owner_map()
        closed_map = {r['OwnerId']: r['cnt'] for r in data['closed']}
        pipe_map   = {r['OwnerId']: {'cnt': r['cnt'], 'rev': r.get('rev', 0) or 0} for r in data['pipeline']}
        advisors   = []

        for r in data['won']:
            owner_id = r.get('OwnerId', '')
            name = owner_map.get(owner_id, '')
            if not name:
                continue
            won_cnt = r['cnt'] or 0
            rev = r.get('rev', 0) or 0
            if rev <= 0:
                continue
            total_closed = closed_map.get(owner_id, won_cnt)
            win_rate = round(won_cnt / total_closed * 100, 1) if total_closed > 0 else 0
            pipe = pipe_map.get(owner_id, {})
            advisors.append({
                'name':           name,
                'commission':     r.get('comm', 0) or 0,
                'bookings':       rev,
                'revenue':        rev,
                'deals':          won_cnt,
                'win_rate':       win_rate,
                'avg_deal_size':  round(rev / won_cnt, 0) if won_cnt > 0 else 0,
                'pipeline_value': pipe.get('rev', 0),
                'pipeline_count': pipe.get('cnt', 0),
            })

        advisors = [a for a in advisors if is_sales_agent(a['name'], line)]
        for i, a in enumerate(advisors):
            a['rank'] = i + 1

        return {"advisors": advisors, "total": len(advisors), "line": line, "period": period}

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


# ── /yoy ──────────────────────────────────────────────────────────────────────

@router.get("/api/sales/advisors/yoy")
def advisor_yoy(line: str = "Travel", year: Optional[int] = None):
    if line not in VALID_LINES:
        line = 'Travel'
    from datetime import date as _date
    today = _date.today()
    current_year = year if year else today.year
    key = f"advisor_yoy_{line}_{current_year}_{today.isoformat()}"

    def fetch():
        prior_year = current_year - 1
        month_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        if line in _PBI_LINES:
            with ThreadPoolExecutor(max_workers=2) as ex:
                curr_f = ex.submit(_pbi_by_day, line, f"{current_year}-01-01", f"{current_year}-12-31")
                prev_f = ex.submit(_pbi_by_day, line, f"{prior_year}-01-01",  f"{prior_year}-12-31")
                curr_rows = curr_f.result()
                prev_rows = prev_f.result()

            curr_map = {i: {'revenue': 0.0, 'commission': 0.0, 'deals': 0} for i in range(1, 13)}
            prev_map = {i: {'revenue': 0.0, 'commission': 0.0, 'deals': 0} for i in range(1, 13)}
            for r in curr_rows:
                mo = int(r['date'][5:7])
                curr_map[mo]['revenue']    += r['sales']
                curr_map[mo]['commission'] += r['commission']
                curr_map[mo]['deals']      += r['txns']
            for r in prev_rows:
                mo = int(r['date'][5:7])
                prev_map[mo]['revenue']    += r['sales']
                prev_map[mo]['commission'] += r['commission']
                prev_map[mo]['deals']      += r['txns']

            months = []
            current_total = prior_total = 0
            for i in range(1, 13):
                cur = curr_map[i]
                pri = prev_map[i]
                current_total += cur['revenue']
                prior_total   += pri['revenue']
                months.append({
                    'month': i, 'label': month_names[i - 1],
                    'current_revenue':     round(cur['revenue'], 2),
                    'prior_revenue':       round(pri['revenue'], 2),
                    'current_commission':  round(cur['commission'], 2),
                    'prior_commission':    round(pri['commission'], 2),
                    'current_deals':       cur['deals'],
                    'prior_deals':         pri['deals'],
                    'current_lost': 0, 'prior_lost': 0,
                    'current_lost_amount': 0, 'prior_lost_amount': 0,
                })

            yoy_pct = round((current_total - prior_total) / prior_total * 100, 1) if prior_total > 0 else 0
            cm = today.month
            ytd_curr  = sum(m['current_revenue'] for m in months if m['month'] <= cm)
            ytd_prior = sum(m['prior_revenue']   for m in months if m['month'] <= cm)
            ytd_yoy   = round((ytd_curr - ytd_prior) / ytd_prior * 100, 1) if ytd_prior > 0 else 0

            return {
                'months': months,
                'current_year': current_year, 'prior_year': prior_year,
                'current_total': round(current_total, 2),
                'prior_total':   round(prior_total, 2),
                'yoy_pct': yoy_pct,
                'ytd_current_total': round(ytd_curr, 2),
                'ytd_prior_total':   round(ytd_prior, 2),
                'ytd_yoy_pct': ytd_yoy,
                'ytd_current_deals': sum(m['current_deals'] for m in months if m['month'] <= cm),
                'ytd_prior_deals':   sum(m['prior_deals']   for m in months if m['month'] <= cm),
                'ytd_months': cm,
                'line': line,
            }

        # ── Salesforce ────────────────────────────────────────────────────
        lf = _line_filter(line)
        data = sf_parallel(
            current=f"""
                SELECT CALENDAR_MONTH(CloseDate) mo, COUNT(Id) cnt, SUM(Amount) rev,
                       SUM(Earned_Commission_Amount__c) comm
                FROM Opportunity
                WHERE {WON_STAGES} AND {lf}
                  AND CALENDAR_YEAR(CloseDate) = {current_year}
                  AND CloseDate <= TODAY AND Amount != null
                GROUP BY CALENDAR_MONTH(CloseDate) ORDER BY CALENDAR_MONTH(CloseDate)
            """,
            prior=f"""
                SELECT CALENDAR_MONTH(CloseDate) mo, COUNT(Id) cnt, SUM(Amount) rev,
                       SUM(Earned_Commission_Amount__c) comm
                FROM Opportunity
                WHERE {WON_STAGES} AND {lf}
                  AND CALENDAR_YEAR(CloseDate) = {prior_year}
                  AND CloseDate <= TODAY AND Amount != null
                GROUP BY CALENDAR_MONTH(CloseDate) ORDER BY CALENDAR_MONTH(CloseDate)
            """,
            lost_current=f"""
                SELECT CALENDAR_MONTH(CloseDate) mo, COUNT(Id) cnt, SUM(Amount) rev
                FROM Opportunity
                WHERE StageName = 'Closed Lost' AND {lf}
                  AND CALENDAR_YEAR(CloseDate) = {current_year} AND CloseDate <= TODAY
                GROUP BY CALENDAR_MONTH(CloseDate) ORDER BY CALENDAR_MONTH(CloseDate)
            """,
            lost_prior=f"""
                SELECT CALENDAR_MONTH(CloseDate) mo, COUNT(Id) cnt, SUM(Amount) rev
                FROM Opportunity
                WHERE StageName = 'Closed Lost' AND {lf}
                  AND CALENDAR_YEAR(CloseDate) = {prior_year} AND CloseDate <= TODAY
                GROUP BY CALENDAR_MONTH(CloseDate) ORDER BY CALENDAR_MONTH(CloseDate)
            """,
        )

        current_map = {r['mo']: {'revenue': r.get('rev', 0) or 0, 'deals': r.get('cnt', 0) or 0, 'commission': r.get('comm', 0) or 0} for r in data['current']}
        prior_map   = {r['mo']: {'revenue': r.get('rev', 0) or 0, 'deals': r.get('cnt', 0) or 0, 'commission': r.get('comm', 0) or 0} for r in data['prior']}
        lc_map = {r['mo']: {'count': r.get('cnt', 0) or 0, 'amount': r.get('rev', 0) or 0} for r in data.get('lost_current', [])}
        lp_map = {r['mo']: {'count': r.get('cnt', 0) or 0, 'amount': r.get('rev', 0) or 0} for r in data.get('lost_prior', [])}

        months = []
        current_total = prior_total = 0
        for i in range(1, 13):
            cur = current_map.get(i, {})
            pri = prior_map.get(i, {})
            current_total += cur.get('revenue', 0)
            prior_total   += pri.get('revenue', 0)
            months.append({
                'month': i, 'label': month_names[i - 1],
                'current_revenue':     cur.get('revenue', 0),
                'prior_revenue':       pri.get('revenue', 0),
                'current_commission':  cur.get('commission', 0),
                'prior_commission':    pri.get('commission', 0),
                'current_deals':       cur.get('deals', 0),
                'prior_deals':         pri.get('deals', 0),
                'current_lost':        lc_map.get(i, {}).get('count', 0),
                'prior_lost':          lp_map.get(i, {}).get('count', 0),
                'current_lost_amount': lc_map.get(i, {}).get('amount', 0),
                'prior_lost_amount':   lp_map.get(i, {}).get('amount', 0),
            })

        yoy_pct = round((current_total - prior_total) / prior_total * 100, 1) if prior_total > 0 else 0
        cm = today.month
        ytd_curr  = sum(m['current_revenue'] for m in months if m['month'] <= cm)
        ytd_prior = sum(m['prior_revenue']   for m in months if m['month'] <= cm)
        ytd_yoy   = round((ytd_curr - ytd_prior) / ytd_prior * 100, 1) if ytd_prior > 0 else 0

        return {
            'months': months,
            'current_year': current_year, 'prior_year': prior_year,
            'current_total': current_total, 'prior_total': prior_total,
            'yoy_pct': yoy_pct,
            'ytd_current_total': ytd_curr, 'ytd_prior_total': ytd_prior,
            'ytd_yoy_pct': ytd_yoy,
            'ytd_current_deals': sum(m['current_deals'] for m in months if m['month'] <= cm),
            'ytd_prior_deals':   sum(m['prior_deals']   for m in months if m['month'] <= cm),
            'ytd_months': cm,
            'line': line,
        }

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


# ── /trend ────────────────────────────────────────────────────────────────────

@router.get("/api/sales/advisors/trend")
def advisor_trend(
    line: str = "Travel",
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"advisor_trend_{line}_{sd}_{ed}"

    def fetch():
        if line in _PBI_LINES:
            rows = _pbi_by_day(line, sd, ed)
            month_map: dict = {}
            for r in rows:
                ym = r['date'][:7]
                if ym not in month_map:
                    yr, mo = ym.split('-')
                    month_map[ym] = {'year': int(yr), 'month': int(mo),
                                     'revenue': 0.0, 'commission': 0.0, 'deals': 0}
                month_map[ym]['revenue']    += r['sales']
                month_map[ym]['commission'] += r['commission']
                month_map[ym]['deals']      += r['txns']

            months = sorted(month_map.values(), key=lambda x: (x['year'], x['month']))
            for m in months:
                m['label']      = f"{m['year']}-{str(m['month']).zfill(2)}"
                m['revenue']    = round(m['revenue'], 2)
                m['commission'] = round(m['commission'], 2)
            return {"months": months, "line": line, "period": period}

        # ── Salesforce ────────────────────────────────────────────────────
        lf = _line_filter(line)
        df = _date_filter(sd, ed)
        records = sf_query_all(f"""
            SELECT CALENDAR_YEAR(CloseDate) yr, CALENDAR_MONTH(CloseDate) mo,
                   COUNT(Id) cnt, SUM(Amount) rev, SUM(Earned_Commission_Amount__c) comm
            FROM Opportunity
            WHERE {WON_STAGES} AND {lf} AND {df} AND Amount != null
            GROUP BY CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate)
            ORDER BY CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate)
        """)
        months = [{
            "year": r.get('yr'), "month": r.get('mo'),
            "label": f"{r.get('yr')}-{str(r.get('mo', 0)).zfill(2)}",
            "revenue":    r.get('rev', 0) or 0,
            "commission": r.get('comm', 0) or 0,
            "deals":      r.get('cnt', 0) or 0,
        } for r in records]
        return {"months": months, "line": line, "period": period}

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


# ── /branch-monthly ───────────────────────────────────────────────────────────

@router.get("/api/sales/advisors/branch-monthly")
def advisor_branch_monthly(
    line: str = "Travel",
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Monthly commission and gross sales by branch. Travel and Insurance (PBI source)."""
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"advisor_branch_monthly_{line}_{sd}_{ed}"

    def fetch():
        if line not in _PBI_LINES:
            return {"branches": [], "period_months": [], "line": line}

        rows = _pbi_by_branch_day(line, sd, ed)
        month_keys: set = set()
        branch_map: dict = {}

        for r in rows:
            branch = r['branch'] or 'Unknown'
            ym = r['date'][:7]
            month_keys.add(ym)
            if branch not in branch_map:
                branch_map[branch] = {}
            if ym not in branch_map[branch]:
                branch_map[branch][ym] = {'commission': 0.0, 'sales': 0.0}
            branch_map[branch][ym]['commission'] += r['commission']
            branch_map[branch][ym]['sales']      += r['sales']

        period_months = sorted(month_keys)

        branches = []
        for branch, month_data in branch_map.items():
            total_comm  = sum(d['commission'] for d in month_data.values())
            total_sales = sum(d['sales']      for d in month_data.values())
            if total_comm <= 0 and total_sales <= 0:
                continue
            months_list = []
            for ym in period_months:
                yr, mo = ym.split('-')
                d = month_data.get(ym, {'commission': 0.0, 'sales': 0.0})
                months_list.append({
                    'label': ym, 'year': int(yr), 'month': int(mo),
                    'commission': round(d['commission'], 2),
                    'sales':      round(d['sales'], 2),
                })
            branches.append({
                'branch':           branch,
                'months':           months_list,
                'total_commission': round(total_comm, 2),
                'total_sales':      round(total_sales, 2),
            })

        branches.sort(key=lambda x: x['total_commission'], reverse=True)
        return {'branches': branches, 'period_months': period_months, 'line': line}

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)
