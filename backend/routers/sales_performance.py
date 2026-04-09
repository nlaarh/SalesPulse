"""Agent Performance — monthly breakdown matching Travel Sales Report format.

KPIs per agent per month:
- Leads: Lead count by Owner
- Opps: Total Opportunity count by Owner
- Invoiced: Opportunities at Invoice stage or beyond (excl Closed Lost)
- Inv/Opp%: Invoiced / Opps
- Sales: Closed Won amount

Also provides conversion funnel and auto-generated insights.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Query
from sf_client import sf_parallel
import cache
from shared import (
    VALID_LINES, WON_STAGES, INVOICED_STAGES,
    line_filter_opp as _line_filter_opp,
    line_filter_lead as _line_filter_lead,
    resolve_dates as _resolve_dates,
    is_sales_agent,
    get_owner_map,
)
from constants import WIN_RATE_COACHING_THRESHOLD, MIN_CLOSED_DEALS_FOR_EVAL, PIPELINE_COVERAGE_HEALTHY, CACHE_TTL_HOUR, CACHE_TTL_MEDIUM, CACHE_TTL_DAY, CACHE_TTL_12H

router = APIRouter()
log = logging.getLogger('sales.performance')


# ── Agent Monthly Performance ────────────────────────────────────────────────

@router.get("/api/sales/performance/monthly")
def performance_monthly(
    line: str = "Travel",
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Agent monthly breakdown: Leads, Opps, Invoiced, Inv/Opp%, Sales — matching spreadsheet."""
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"perf_monthly_{line}_{sd}_{ed}"

    def fetch():
        lf_opp = _line_filter_opp(line)
        lf_lead = _line_filter_lead(line)

        # OwnerId in GROUP BY eliminates the User table cross-object join that
        # Owner.Name requires on every row — 3-5x faster on large aggregates.
        data = sf_parallel(
            leads=f"""
                SELECT OwnerId, CALENDAR_YEAR(CreatedDate) yr,
                       CALENDAR_MONTH(CreatedDate) mo, COUNT(Id) cnt
                FROM Lead
                WHERE {lf_lead}
                  AND CreatedDate >= {sd}T00:00:00Z
                  AND CreatedDate <= {ed}T23:59:59Z
                GROUP BY OwnerId, CALENDAR_YEAR(CreatedDate), CALENDAR_MONTH(CreatedDate)
            """,
            opps=f"""
                SELECT OwnerId, CALENDAR_YEAR(CreatedDate) yr,
                       CALENDAR_MONTH(CreatedDate) mo, COUNT(Id) cnt
                FROM Opportunity
                WHERE {lf_opp}
                  AND CreatedDate >= {sd}T00:00:00Z
                  AND CreatedDate <= {ed}T23:59:59Z
                GROUP BY OwnerId, CALENDAR_YEAR(CreatedDate), CALENDAR_MONTH(CreatedDate)
            """,
            invoiced=f"""
                SELECT OwnerId, CALENDAR_YEAR(CloseDate) yr,
                       CALENDAR_MONTH(CloseDate) mo, COUNT(Id) cnt
                FROM Opportunity
                WHERE {lf_opp}
                  AND StageName IN {INVOICED_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                GROUP BY OwnerId, CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate)
            """,
            sales=f"""
                SELECT OwnerId, CALENDAR_YEAR(CloseDate) yr,
                       CALENDAR_MONTH(CloseDate) mo, COUNT(Id) cnt,
                       SUM(Amount) rev, SUM(Earned_Commission_Amount__c) comm
                FROM Opportunity
                WHERE {lf_opp}
                  AND {WON_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                  AND Amount != null
                GROUP BY OwnerId, CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate)
            """,
        )

        owner_map = get_owner_map()

        agents: dict = {}

        def ensure(name: str, ym: str):
            if name not in agents:
                agents[name] = {}
            if ym not in agents[name]:
                agents[name][ym] = {'leads': 0, 'opps': 0, 'invoiced': 0, 'sales': 0, 'commission': 0}

        for r in data['leads']:
            name = owner_map.get(r.get('OwnerId', ''), '')
            if not name:
                continue
            ym = f"{r.get('yr')}-{str(r.get('mo', 0)).zfill(2)}"
            ensure(name, ym)
            agents[name][ym]['leads'] = r.get('cnt', 0) or 0

        for r in data['opps']:
            name = owner_map.get(r.get('OwnerId', ''), '')
            if not name:
                continue
            ym = f"{r.get('yr')}-{str(r.get('mo', 0)).zfill(2)}"
            ensure(name, ym)
            agents[name][ym]['opps'] = r.get('cnt', 0) or 0

        for r in data['invoiced']:
            name = owner_map.get(r.get('OwnerId', ''), '')
            if not name:
                continue
            ym = f"{r.get('yr')}-{str(r.get('mo', 0)).zfill(2)}"
            ensure(name, ym)
            agents[name][ym]['invoiced'] = r.get('cnt', 0) or 0

        is_insurance = line and line.lower() == 'insurance'

        for r in data['sales']:
            name = owner_map.get(r.get('OwnerId', ''), '')
            if not name:
                continue
            ym = f"{r.get('yr')}-{str(r.get('mo', 0)).zfill(2)}"
            ensure(name, ym)
            agents[name][ym]['sales'] = r.get('rev', 0) or 0
            # Insurance: Amount IS the commission (Earned_Commission_Amount__c is $0)
            # Travel: use Earned_Commission_Amount__c for actual commission
            if is_insurance:
                agents[name][ym]['commission'] = r.get('rev', 0) or 0
            else:
                agents[name][ym]['commission'] = r.get('comm', 0) or 0

        result = []
        for name, months_data in agents.items():
            agent_months = []
            t_leads = t_opps = t_inv = t_sales = t_commission = 0

            for ym in sorted(months_data.keys()):
                m = months_data[ym]
                inv_pct = round(m['invoiced'] / m['opps'] * 100, 1) if m['opps'] > 0 else 0
                agent_months.append({
                    'month': ym, 'leads': m['leads'], 'opps': m['opps'],
                    'invoiced': m['invoiced'], 'inv_opp_pct': inv_pct,
                    'sales': m['sales'], 'commission': m['commission'],
                })
                t_leads += m['leads']
                t_opps += m['opps']
                t_inv += m['invoiced']
                t_sales += m['sales']
                t_commission += m['commission']

            t_inv_pct = round(t_inv / t_opps * 100, 1) if t_opps > 0 else 0
            result.append({
                'name': name,
                'months': agent_months,
                'totals': {
                    'leads': t_leads, 'opps': t_opps, 'invoiced': t_inv,
                    'inv_opp_pct': t_inv_pct, 'sales': t_sales,
                    'commission': t_commission,
                },
            })

        # Remove agents with $0 total sales (non-sales people)
        result = [a for a in result if a['totals']['sales'] > 0]
        # Filter to whitelisted sales agents
        result = [a for a in result if is_sales_agent(a['name'], line)]
        result.sort(key=lambda x: x['totals']['sales'], reverse=True)
        for i, a in enumerate(result):
            a['rank'] = i + 1

        # Division totals
        div_leads = sum(a['totals']['leads'] for a in result)
        div_opps = sum(a['totals']['opps'] for a in result)
        div_inv = sum(a['totals']['invoiced'] for a in result)
        div_sales = sum(a['totals']['sales'] for a in result)
        div_commission = sum(a['totals']['commission'] for a in result)
        div_inv_pct = round(div_inv / div_opps * 100, 1) if div_opps > 0 else 0

        return {
            'agents': result,
            'total_agents': len(result),
            'division_totals': {
                'leads': div_leads, 'opps': div_opps, 'invoiced': div_inv,
                'inv_opp_pct': div_inv_pct, 'sales': div_sales,
                'commission': div_commission,
            },
            'line': line, 'start_date': sd, 'end_date': ed,
        }

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


# ── Conversion Funnel ────────────────────────────────────────────────────────

@router.get("/api/sales/performance/funnel")
def performance_funnel(
    line: str = "Travel",
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Conversion funnel: Leads → Converted → Opps → Invoiced → Won."""
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"perf_funnel_{line}_{sd}_{ed}"

    def fetch():
        lf_opp = _line_filter_opp(line)
        lf_lead = _line_filter_lead(line)

        data = sf_parallel(
            total_leads=f"""
                SELECT COUNT(Id) cnt FROM Lead
                WHERE {lf_lead}
                  AND CreatedDate >= {sd}T00:00:00Z AND CreatedDate <= {ed}T23:59:59Z
            """,
            converted_leads=f"""
                SELECT COUNT(Id) cnt FROM Lead
                WHERE {lf_lead} AND IsConverted = true
                  AND ConvertedDate >= {sd} AND ConvertedDate <= {ed}
            """,
            total_opps=f"""
                SELECT COUNT(Id) cnt FROM Opportunity
                WHERE {lf_opp}
                  AND CreatedDate >= {sd}T00:00:00Z AND CreatedDate <= {ed}T23:59:59Z
            """,
            invoiced_opps=f"""
                SELECT COUNT(Id) cnt FROM Opportunity
                WHERE {lf_opp} AND StageName IN {INVOICED_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
            """,
            won_opps=f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev FROM Opportunity
                WHERE {lf_opp} AND {WON_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed} AND Amount != null
            """,
            lost_opps=f"""
                SELECT COUNT(Id) cnt FROM Opportunity
                WHERE {lf_opp} AND StageName = 'Closed Lost'
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
            """,
        )

        def _get(key, field='cnt'):
            rows = data.get(key, [])
            if not rows:
                return 0
            return (rows[0] or {}).get(field, 0) or 0

        leads = _get('total_leads')
        converted = _get('converted_leads')
        opps = _get('total_opps')
        invoiced = _get('invoiced_opps')
        won = _get('won_opps')
        won_rev = _get('won_opps', 'rev')
        lost = _get('lost_opps')

        def rate(num, denom):
            return round(num / denom * 100, 1) if denom > 0 else 0

        steps = [
            {'step': 'Leads', 'count': leads, 'pct': 100},
            {'step': 'Converted', 'count': converted, 'pct': rate(converted, leads)},
            {'step': 'Opportunities', 'count': opps, 'pct': rate(opps, leads)},
            {'step': 'Invoiced', 'count': invoiced, 'pct': rate(invoiced, opps)},
            {'step': 'Won', 'count': won, 'pct': rate(won, opps)},
        ]

        return {
            'steps': steps,
            'won_revenue': won_rev,
            'lost_count': lost,
            'win_rate': rate(won, won + lost),
            'line': line, 'start_date': sd, 'end_date': ed,
        }

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_MEDIUM, disk_ttl=CACHE_TTL_12H)


# ── Auto-generated Insights ──────────────────────────────────────────────────

@router.get("/api/sales/performance/insights")
def performance_insights(
    line: str = "Travel",
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Auto-generated actionable insights — not data, but what to DO."""
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"perf_insights_{line}_{sd}_{ed}"

    def fetch():
        lf_opp = _line_filter_opp(line)

        data = sf_parallel(
            current=f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev FROM Opportunity
                WHERE {WON_STAGES} AND {lf_opp}
                  AND CloseDate >= {sd} AND CloseDate <= {ed} AND Amount != null
            """,
            top5=f"""
                SELECT OwnerId, SUM(Amount) rev, COUNT(Id) cnt
                FROM Opportunity
                WHERE {WON_STAGES} AND {lf_opp}
                  AND CloseDate >= {sd} AND CloseDate <= {ed} AND Amount != null
                GROUP BY OwnerId ORDER BY SUM(Amount) DESC LIMIT 5
            """,
            closed_by_agent=f"""
                SELECT OwnerId, StageName, COUNT(Id) cnt
                FROM Opportunity
                WHERE StageName IN ('Closed Won','Invoice','Closed Lost') AND {lf_opp}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                GROUP BY OwnerId, StageName
            """,
            pipeline=f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev FROM Opportunity
                WHERE IsClosed = false AND {lf_opp} AND Amount != null
                  AND CloseDate >= TODAY AND CloseDate <= NEXT_N_MONTHS:12
            """,
            at_risk=f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev FROM Opportunity
                WHERE IsClosed = false AND {lf_opp} AND PushCount >= 3
                  AND CloseDate >= TODAY AND CloseDate <= NEXT_N_MONTHS:12
            """,
        )

        owner_map = get_owner_map()

        # Enrich OwnerId → Name and filter to whitelisted agents
        def enrich(rows):
            out = []
            for r in rows:
                name = owner_map.get(r.get('OwnerId', ''), '')
                if name:
                    out.append({**r, 'Name': name})
            return out

        data['top5'] = [r for r in enrich(data['top5']) if is_sales_agent(r['Name'], line)]
        data['closed_by_agent'] = [r for r in enrich(data['closed_by_agent']) if is_sales_agent(r['Name'], line)]

        insights = []
        current = data['current'][0] if data['current'] else {}
        total_rev = current.get('rev', 0) or 0
        total_cnt = current.get('cnt', 0) or 0

        # ── Top performer
        if data['top5']:
            top = data['top5'][0]
            top_rev = top.get('rev', 0) or 0
            top_name = top.get('Name', '?')
            share = round(top_rev / total_rev * 100) if total_rev > 0 else 0
            insights.append({
                'type': 'success',
                'title': 'Top Performer',
                'text': f"{top_name} leads {line} with ${top_rev:,.0f} in bookings "
                        f"({share}% of total, {top.get('cnt', 0)} deals).",
            })

        # ── Win rate analysis — find agents needing coaching
        won_map: dict = {}
        total_map: dict = {}
        for r in data['closed_by_agent']:
            name = r.get('Name', '')
            cnt = r.get('cnt', 0) or 0
            if r.get('StageName') in ('Closed Won', 'Invoice'):
                won_map[name] = won_map.get(name, 0) + cnt
            total_map[name] = total_map.get(name, 0) + cnt

        low_wr = []
        for name, total in total_map.items():
            if total < MIN_CLOSED_DEALS_FOR_EVAL:
                continue
            wr = round(won_map.get(name, 0) / total * 100, 1)
            if wr < WIN_RATE_COACHING_THRESHOLD:
                low_wr.append((name, wr))
        low_wr.sort(key=lambda x: x[1])

        if low_wr:
            names = ', '.join(n for n, _ in low_wr[:3])
            insights.append({
                'type': 'warning',
                'title': 'Coaching Needed',
                'text': f"{len(low_wr)} advisor(s) have win rates below {WIN_RATE_COACHING_THRESHOLD}%: {names}. "
                        "Schedule 1:1 coaching sessions to improve close rates.",
            })

        # ── Pipeline health
        pipe = data['pipeline'][0] if data['pipeline'] else {}
        pipe_rev = pipe.get('rev', 0) or 0
        pipe_cnt = pipe.get('cnt', 0) or 0
        if total_rev > 0:
            coverage = round(pipe_rev / total_rev, 1)
            if coverage >= PIPELINE_COVERAGE_HEALTHY:
                insights.append({
                    'type': 'success',
                    'title': 'Pipeline Health',
                    'text': f"Pipeline coverage is {coverage}x (${pipe_rev:,.0f} pipeline vs "
                            f"${total_rev:,.0f} closed). Healthy position — focus on conversion.",
                })
            else:
                insights.append({
                    'type': 'danger' if coverage < 1 else 'warning',
                    'title': 'Pipeline Alert',
                    'text': f"Pipeline coverage is only {coverage}x (${pipe_rev:,.0f} in {pipe_cnt} deals). "
                            f"{'Critical — need to generate more pipeline immediately.' if coverage < 1 else f'Below {PIPELINE_COVERAGE_HEALTHY}x target — increase prospecting activity.'}",
                })

        # ── Deals at risk
        risk = data['at_risk'][0] if data['at_risk'] else {}
        risk_cnt = risk.get('cnt', 0) or 0
        risk_rev = risk.get('rev', 0) or 0
        if risk_cnt > 0:
            insights.append({
                'type': 'danger',
                'title': f'{risk_cnt} Deals at Risk',
                'text': f"${risk_rev:,.0f} in deals pushed 3+ times. "
                        "Review each deal and decide: re-engage, discount, or cut.",
            })

        if not insights:
            insights.append({
                'type': 'info',
                'title': 'Summary',
                'text': f'{line}: ${total_rev:,.0f} from {total_cnt} deals.',
            })

        return {'insights': insights, 'line': line, 'start_date': sd, 'end_date': ed}

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_MEDIUM, disk_ttl=CACHE_TTL_12H)
