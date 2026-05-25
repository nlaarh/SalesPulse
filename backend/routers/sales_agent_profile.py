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

import logging
from datetime import date
from typing import Optional
from fastapi import APIRouter, Query
from sf_client import sf_parallel, sf_query_all
import cache
from shared import (
    VALID_LINES,
    line_filter_opp as _line_filter_opp,
    line_filter_lead as _line_filter_lead,
    resolve_dates as _resolve_dates,
    escape_soql as _escape,
    val as _val,
    is_sales_agent,
    six_months_ago,
    get_owner_map,
)
from routers.agent_brief import template_brief, ai_brief
from routers.agent_profile_queries import (
    win_rate as _win_rate,
    build_profile_queries,
    build_monthly_breakdown,
    build_opportunities_list,
    build_won_list,
    compute_team_averages,
    compute_insights,
    build_tasks_section,
)

router = APIRouter()
log = logging.getLogger('sales.agent_profile')


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
    sd_dt = date.fromisoformat(str(sd))
    ed_dt = date.fromisoformat(str(ed))
    today = ed_dt
    cy, py = today.year, today.year - 1

    # Prior-year equivalent date range for apples-to-apples YoY comparison.
    try:
        p_sd = sd_dt.replace(year=sd_dt.year - 1).isoformat()
    except ValueError:  # Feb 29 leap year
        p_sd = sd_dt.replace(year=sd_dt.year - 1, day=28).isoformat()
    try:
        p_ed = ed_dt.replace(year=ed_dt.year - 1).isoformat()
    except ValueError:
        p_ed = ed_dt.replace(year=ed_dt.year - 1, day=28).isoformat()

    key = f"agent_profile_v3_{name}_{line}_{sd}_{ed}"

    def fetch():
        sma = six_months_ago()
        lf = _line_filter_opp(line)
        lf_lead = _line_filter_lead(line)
        # Resolve OwnerId for indexed filter — avoids per-row User cross-join on ~12 queries
        _owner_map = get_owner_map()
        _name_to_id = {v.strip().lower(): k for k, v in _owner_map.items()}
        _owner_id = _name_to_id.get(name.strip().lower())
        ow = f"OwnerId = '{_owner_id}'" if _owner_id else f"Owner.Name = '{safe}'"

        queries = build_profile_queries(
            safe=safe, lf=lf, lf_lead=lf_lead, ow=ow,
            sd=sd, ed=ed, p_sd=p_sd, p_ed=p_ed,
            cy=cy, py=py, sma=sma, today=today,
        )
        data = sf_parallel(**queries)

        # Reconstruct opportunity subsets in Python from consolidated agent_opportunities list
        from dateutil.relativedelta import relativedelta
        agent_opportunities = data.get('agent_opportunities') or []
        next_12_months_date = (today + relativedelta(months=12)).isoformat()
        thirty_days_ago = (today - relativedelta(days=30)).isoformat()

        # 1. won_cur
        won_cur_opps = [
            o for o in agent_opportunities
            if o.get('StageName') in ('Closed Won', 'Invoice')
            and o.get('CloseDate') and sd <= o['CloseDate'] <= ed
            and o.get('Amount') is not None
        ]
        data['won_cur'] = [{
            'cnt': len(won_cur_opps),
            'rev': sum(o['Amount'] for o in won_cur_opps),
            'comm': sum(o.get('Earned_Commission_Amount__c') or 0 for o in won_cur_opps)
        }]

        # 2. won_pri
        won_pri_opps = [
            o for o in agent_opportunities
            if o.get('StageName') in ('Closed Won', 'Invoice')
            and o.get('CloseDate') and p_sd <= o['CloseDate'] <= p_ed
            and o.get('Amount') is not None
        ]
        data['won_pri'] = [{
            'cnt': len(won_pri_opps),
            'rev': sum(o['Amount'] for o in won_pri_opps),
            'comm': sum(o.get('Earned_Commission_Amount__c') or 0 for o in won_pri_opps)
        }]

        # 3. mo_rev_cur
        mo_rev_cur_map = {}
        for o in agent_opportunities:
            if (o.get('StageName') in ('Closed Won', 'Invoice')
                and o.get('CloseDate')
                and o.get('Amount') is not None):
                try:
                    dt_parts = o['CloseDate'].split('-')
                    y = int(dt_parts[0])
                    m = int(dt_parts[1])
                    if y == cy:
                        if m not in mo_rev_cur_map:
                            mo_rev_cur_map[m] = {'mo': m, 'cnt': 0, 'rev': 0.0, 'comm': 0.0}
                        mo_rev_cur_map[m]['cnt'] += 1
                        mo_rev_cur_map[m]['rev'] += o['Amount']
                        mo_rev_cur_map[m]['comm'] += o.get('Earned_Commission_Amount__c') or 0
                except Exception:
                    pass
        data['mo_rev_cur'] = sorted(mo_rev_cur_map.values(), key=lambda x: x['mo'])

        # 4. mo_rev_pri
        mo_rev_pri_map = {}
        for o in agent_opportunities:
            if (o.get('StageName') in ('Closed Won', 'Invoice')
                and o.get('CloseDate')
                and o.get('Amount') is not None):
                try:
                    dt_parts = o['CloseDate'].split('-')
                    y = int(dt_parts[0])
                    m = int(dt_parts[1])
                    if y == py:
                        if m not in mo_rev_pri_map:
                            mo_rev_pri_map[m] = {'mo': m, 'cnt': 0, 'rev': 0.0, 'comm': 0.0}
                        mo_rev_pri_map[m]['cnt'] += 1
                        mo_rev_pri_map[m]['rev'] += o['Amount']
                        mo_rev_pri_map[m]['comm'] += o.get('Earned_Commission_Amount__c') or 0
                except Exception:
                    pass
        data['mo_rev_pri'] = sorted(mo_rev_pri_map.values(), key=lambda x: x['mo'])

        # ── PBI overlay: replace commission+sales with authoritative PBI data ──
        from pbi_utils import PBI_COMMISSION_LINES, pbi_monthly_map, norm_name, overlay_pbi_on_month_map, pbi_period_totals, pbi_by_day, pbi_by_advisor
        n_agents = None
        if line in PBI_COMMISSION_LINES:
            nk = norm_name(name)
            pbi_cur = pbi_monthly_map(line, f"{cy}-01-01", f"{cy}-12-31")
            pbi_pri = pbi_monthly_map(line, f"{py}-01-01", f"{py}-12-31")
            overlay_pbi_on_month_map(mo_rev_cur_map, pbi_cur, nk, cy)
            overlay_pbi_on_month_map(mo_rev_pri_map, pbi_pri, nk, py)
            data['mo_rev_cur'] = sorted(mo_rev_cur_map.values(), key=lambda x: x['mo'])
            data['mo_rev_pri'] = sorted(mo_rev_pri_map.values(), key=lambda x: x['mo'])
            # Recompute period totals from PBI using exact day ranges
            curr_advs = pbi_by_advisor(line, str(sd), str(ed))
            pri_advs = pbi_by_advisor(line, str(p_sd), str(p_ed))
            p_comm_pbi = sum(a['commission'] for a in curr_advs if norm_name(a['name']) == nk)
            p_rev_pbi = sum(a['sales'] for a in curr_advs if norm_name(a['name']) == nk)
            pp_comm_pbi = sum(a['commission'] for a in pri_advs if norm_name(a['name']) == nk)
            pp_rev_pbi = sum(a['sales'] for a in pri_advs if norm_name(a['name']) == nk)

            data['won_cur'] = [{'cnt': data['won_cur'][0]['cnt'] if data.get('won_cur') else 0,
                                 'rev': p_rev_pbi, 'comm': p_comm_pbi}]
            data['won_pri'] = [{'cnt': data['won_pri'][0]['cnt'] if data.get('won_pri') else 0,
                                 'rev': pp_rev_pbi, 'comm': pp_comm_pbi}]

            # Count of agents in PBI with commission > 0
            pbi_agent_comm = {}
            for a in curr_advs:
                if a['name']:
                    pbi_agent_comm[a['name'].strip().lower()] = pbi_agent_comm.get(a['name'].strip().lower(), 0.0) + a['commission']
            n_agents = sum(1 for comm in pbi_agent_comm.values() if comm > 0)

            # ── PBI override for division-level team comparison bars ──
            # t_won / t_won_month / t_won_ytd came from SF; replace rev+comm with PBI totals.
            _today_iso = today.isoformat()
            _month_start_div = f"{cy}-{today.month:02d}-01"
            _ytd_start_div   = f"{cy}-01-01"

            def _sum_pbi_day(rows: list) -> dict:
                return {
                    'rev':  round(sum(r.get('sales', 0)      for r in rows)),
                    'comm': round(sum(r.get('commission', 0)  for r in rows)),
                }

            div_period = _sum_pbi_day(pbi_by_day(line, str(sd), str(ed)))
            div_month  = _sum_pbi_day(pbi_by_day(line, _month_start_div, _today_iso))
            div_ytd    = _sum_pbi_day(pbi_by_day(line, _ytd_start_div,   _today_iso))

            period_cnt = (data['t_won'][0].get('cnt') or 0) if data.get('t_won') else 0
            data['t_won']       = [{**div_period, 'cnt': period_cnt}]
            data['t_won_month'] = [{**div_month}]
            data['t_won_ytd']   = [{**div_ytd}]

        # YoY Date Capping: if cy is current calendar year, blank out prior year months that are current/future
        current_year_sys = today.year
        current_month_sys = today.month
        if cy == current_year_sys:
            capped_mo_rev_pri = []
            for r in data.get('mo_rev_pri', []):
                m = r.get('mo')
                if m and m >= current_month_sys:
                    capped_mo_rev_pri.append({**r, 'rev': 0.0, 'comm': 0.0, 'cnt': 0})
                else:
                    capped_mo_rev_pri.append(r)
            data['mo_rev_pri'] = capped_mo_rev_pri

        # 5. closed_cur
        closed_cur_map = {}
        for o in agent_opportunities:
            stage = o.get('StageName')
            if (stage in ('Closed Won', 'Invoice', 'Closed Lost')
                and o.get('CloseDate')
                and sd <= o['CloseDate'] <= ed):
                closed_cur_map[stage] = closed_cur_map.get(stage, 0) + 1
        data['closed_cur'] = [{'StageName': k, 'cnt': v} for k, v in closed_cur_map.items()]

        # 6. closed_pri
        closed_pri_map = {}
        for o in agent_opportunities:
            stage = o.get('StageName')
            if (stage in ('Closed Won', 'Invoice', 'Closed Lost')
                and o.get('CloseDate')
                and p_sd <= o['CloseDate'] <= p_ed):
                closed_pri_map[stage] = closed_pri_map.get(stage, 0) + 1
        data['closed_pri'] = [{'StageName': k, 'cnt': v} for k, v in closed_pri_map.items()]

        # 7. pipeline
        pipeline_opps = [
            o for o in agent_opportunities
            if o.get('IsClosed') is False
            and o.get('Amount') is not None
            and o.get('CloseDate')
            and sma <= o['CloseDate'] <= next_12_months_date
        ]
        data['pipeline'] = [{
            'cnt': len(pipeline_opps),
            'rev': sum(o['Amount'] for o in pipeline_opps)
        }]

        # 8. mo_opps
        mo_opps_map = {}
        for o in agent_opportunities:
            cdate = o.get('CreatedDate')
            if cdate:
                try:
                    dt_str = cdate.split('T')[0]
                    dt_parts = dt_str.split('-')
                    y = int(dt_parts[0])
                    m = int(dt_parts[1])
                    if y == cy:
                        mo_opps_map[m] = mo_opps_map.get(m, 0) + 1
                except Exception:
                    pass
        data['mo_opps'] = [{'mo': k, 'cnt': v} for k, v in mo_opps_map.items()]

        # 9. early_opps
        early_opps_list = [
            o for o in agent_opportunities
            if o.get('IsClosed') is False
            and o.get('StageName') not in ('Invoice', 'Booked', 'Closed Won')
            and o.get('CloseDate') and o['CloseDate'] >= sma
        ]
        early_opps_list.sort(key=lambda x: x.get('Amount') or 0, reverse=True)
        data['early_opps'] = early_opps_list[:100]

        # 10. top_opps
        top_opps_list = [
            o for o in agent_opportunities
            if o.get('IsClosed') is False
            and o.get('StageName') in ('Invoice', 'Booked')
            and o.get('CloseDate') and o['CloseDate'] >= sma
        ]
        top_opps_list.sort(key=lambda x: x.get('Amount') or 0, reverse=True)
        data['top_opps'] = top_opps_list[:50]

        # 11. recent_won
        recent_won_list = [
            o for o in agent_opportunities
            if o.get('StageName') in ('Closed Won', 'Invoice')
            and o.get('CloseDate') and sd <= o['CloseDate'] <= ed
            and o.get('Amount') is not None
        ]
        recent_won_list.sort(key=lambda x: x.get('CloseDate') or '', reverse=True)
        data['recent_won'] = recent_won_list[:20]

        # 12. pushed
        pushed_opps = [
            o for o in agent_opportunities
            if o.get('IsClosed') is False
            and o.get('PushCount') is not None and o['PushCount'] >= 2
            and o.get('Amount') is not None
            and o.get('CloseDate') and o['CloseDate'] >= sma
        ]
        data['pushed'] = [{
            'cnt': len(pushed_opps),
            'rev': sum(o['Amount'] for o in pushed_opps)
        }]

        # 13. stale
        stale_opps = [
            o for o in agent_opportunities
            if o.get('IsClosed') is False
            and o.get('LastActivityDate') is not None
            and o['LastActivityDate'] < thirty_days_ago
            and o.get('CloseDate') and o['CloseDate'] >= sma
        ]
        data['stale'] = [{
            'cnt': len(stale_opps)
        }]

        # ── Parse agent metrics ──────────────────────────────────────────
        is_insurance = line and line.lower() == 'insurance'

        revenue = _val(data['won_cur'], 'rev')
        # PBI overlay sets comm correctly for both Travel and Insurance.
        # Never override comm with rev: for Insurance, rev=transaction_amount, comm=commission_amount.
        commission = _val(data['won_cur'], 'comm')
        deals = _val(data['won_cur'], 'cnt')
        avg_deal = round(revenue / deals) if deals else 0

        p_rev = _val(data['won_pri'], 'rev')
        p_comm = _val(data['won_pri'], 'comm')
        p_deals = _val(data['won_pri'], 'cnt')
        p_avg = round(p_rev / p_deals) if p_deals else 0

        rev_yoy = round((revenue - p_rev) / p_rev * 100, 1) if p_rev else 0
        comm_yoy = round((commission - p_comm) / p_comm * 100, 1) if p_comm else 0
        deals_yoy = round((deals - p_deals) / p_deals * 100, 1) if p_deals else 0

        wr = _win_rate(data['closed_cur'])
        p_wr = _win_rate(data['closed_pri'])

        pipe_val = _val(data['pipeline'], 'rev')
        pipe_cnt = _val(data['pipeline'], 'cnt')

        months, leads_total, opps_total = build_monthly_breakdown(data, is_insurance)
        top_list = build_opportunities_list(data, today)
        won_list = build_won_list(data)

        pushed_cnt = _val(data['pushed'], 'cnt')
        pushed_val = _val(data['pushed'], 'rev')
        stale_cnt = _val(data['stale'], 'cnt')

        team = compute_team_averages(data, line, is_insurance, n_agents=n_agents)

        # Coverage
        ann_rev = revenue * (12 / max(period, 1))
        coverage = round(pipe_val / ann_rev, 1) if ann_rev > 0 else 0

        open_tasks_list, task_stats = build_tasks_section(data, sf_query_all, today)

        strengths, improvements = compute_insights(
            revenue=revenue, avg_deal=avg_deal, wr=wr, rev_yoy=rev_yoy,
            coverage=coverage, pipe_val=pipe_val,
            pushed_cnt=pushed_cnt, pushed_val=pushed_val, stale_cnt=stale_cnt,
            months=months, today=today, team=team, period=period,
            task_stats=task_stats, open_tasks_list=open_tasks_list,
        )

        # Extract advisor email
        agent_email = ''
        if data.get('agent_user'):
            agent_email = (data['agent_user'][0] or {}).get('Email', '') or ''

        return {
            'name': name, 'line': line, 'email': agent_email, 'sf_id': _owner_id or '',
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
            'team': team,
            'strengths': strengths,
            'improvements': improvements,
            'pushed_count': pushed_cnt, 'pushed_value': pushed_val,
            'stale_count': stale_cnt,
            'tasks': {
                'open_tasks': open_tasks_list,
                'stats': task_stats,
            },
        }

    profile = cache.cached_query(key, fetch, ttl=1800, disk_ttl=43200)

    # AI brief (cached to prevent redundant OpenAI calls and speed up loads)
    ai_powered = False
    writeup = template_brief(profile)
    if ai:
        brief_key = f"agent_ai_brief_v3_{name}_{line}_{sd}_{ed}"
        def fetch_brief():
            res = ai_brief(profile)
            if not res:
                raise ValueError("AI brief generation failed")
            return res
        try:
            ai_result = cache.cached_query(brief_key, fetch_brief, ttl=1800, disk_ttl=43200)
            if ai_result:
                writeup = ai_result
                ai_powered = True
        except Exception as e:
            log.warning(f"Failed to fetch/generate cached AI brief: {e}")

    # Ensure profile is copied or mutated safely without leaking cache issues
    profile = dict(profile)
    profile['writeup'] = writeup
    profile['ai_powered'] = ai_powered
    return profile



@router.get("/api/sales/agent/top-customers")
def agent_top_customers(
    name: str,
    line: str = "Travel",
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Top 50 customers by spend for this advisor, with membership/insurance/travel flags + deal drill-down."""
    from shared import (
        resolve_dates as _resolve_dates,
        line_filter_opp as _line_filter_opp,
        get_owner_map,
        escape_soql as _escape,
    )
    from sf_client import sf_query_all, sf_instance_url

    safe = _escape(name)
    sd, ed = _resolve_dates(start_date, end_date, period)
    owner_map = get_owner_map()
    name_to_id = {v.strip().lower(): k for k, v in owner_map.items()}
    owner_id = name_to_id.get(name.strip().lower())
    ow = f"OwnerId = '{owner_id}'" if owner_id else f"Owner.Name = '{safe}'"
    lf = _line_filter_opp(line)

    rows = sf_query_all(f"""
        SELECT AccountId, COUNT(Id) cnt, SUM(Amount) total, MAX(CloseDate) last_close
        FROM Opportunity
        WHERE {ow} AND StageName IN ('Closed Won','Invoice') AND {lf}
          AND CloseDate >= {sd} AND CloseDate <= {ed}
          AND Amount != null AND AccountId != null
        GROUP BY AccountId
        ORDER BY SUM(Amount) DESC
        LIMIT 50
    """)
    if not rows:
        return {"customers": [], "total_revenue": 0}

    account_ids = [r.get('AccountId') for r in rows if r.get('AccountId')]
    ids_csv = ",".join(f"'{aid}'" for aid in account_ids)

    # Parallel: account details + travel portfolios + individual deals
    acct_rows = sf_query_all(f"""
        SELECT Id, Name, Phone, PersonMobilePhone, PersonEmail, BillingCity,
               Account_Member_ID__c, ImportantActiveMemCoverage__c,
               Insuance_Customer_ID__c, Member_Status__c, Account_Member_Since__c
        FROM Account
        WHERE Id IN ({ids_csv})
    """)
    tp_rows = sf_query_all(f"""
        SELECT Account__c
        FROM Travel_Portfolio__c
        WHERE Account__c IN ({ids_csv})
    """)
    deal_rows = sf_query_all(f"""
        SELECT Id, Name, AccountId, Amount, CloseDate, StageName
        FROM Opportunity
        WHERE AccountId IN ({ids_csv}) AND {ow} AND StageName IN ('Closed Won','Invoice') AND {lf}
          AND CloseDate >= {sd} AND CloseDate <= {ed}
          AND Amount != null
        ORDER BY CloseDate DESC
        LIMIT 500
    """)

    acct_map = {r.get('Id', ''): r for r in acct_rows if r.get('Id')}
    has_travel = {r.get('Account__c') for r in tp_rows if r.get('Account__c')}
    sf_base = sf_instance_url()

    # Group deals by AccountId
    from collections import defaultdict
    deals_by_acct: dict = defaultdict(list)
    for d in deal_rows:
        aid = d.get('AccountId', '')
        if aid:
            deals_by_acct[aid].append({
                'id': d.get('Id', ''),
                'name': d.get('Name', '') or '',
                'amount': round(d.get('Amount') or 0, 2),
                'close_date': d.get('CloseDate', '') or '',
                'stage': d.get('StageName', '') or '',
                'sf_link': f"{sf_base}/{d.get('Id', '')}",
            })

    def _mem_label(raw):
        value = (raw or '').strip().upper()
        labels = {'PLUS': 'Plus', 'PREMIER': 'Premier', 'B': 'Basic', 'BASIC': 'Basic',
                  'PLRV': 'Plus RV', 'PMRV': 'Premier RV'}
        return labels.get(value, value.title()) if value else ''

    def _phone(acct):
        return (acct.get('Phone') or acct.get('PersonMobilePhone') or '').strip()

    def _tenure(ms):
        try:
            from datetime import date as _date
            since = _date.fromisoformat(ms)
            return _date.today().year - since.year
        except Exception:
            return None

    total_revenue = sum(r.get('total') or 0 for r in rows)
    customers = []
    for row in rows:
        aid = row.get('AccountId')
        if not aid:
            continue
        acct = acct_map.get(aid, {})
        spend = round(row.get('total', 0) or 0, 2)
        customers.append({
            'account_id': aid,
            'name': acct.get('Name', '') or '',
            'phone': _phone(acct),
            'email': acct.get('PersonEmail', '') or '',
            'city': acct.get('BillingCity', '') or '',
            'total_spend': spend,
            'revenue_share': round(spend / total_revenue * 100, 1) if total_revenue else 0,
            'deal_count': row.get('cnt', 0) or 0,
            'last_close': row.get('last_close', '') or '',
            'membership': _mem_label(acct.get('ImportantActiveMemCoverage__c')),
            'tenure_years': _tenure(acct.get('Account_Member_Since__c', '') or ''),
            'member_status': acct.get('Member_Status__c', '') or '',
            'has_insurance': bool(acct.get('Insuance_Customer_ID__c')),
            'has_travel': aid in has_travel,
            'sf_link': f"{sf_base}/{aid}",
            'deals': deals_by_acct.get(aid, []),
        })

    return {"customers": customers, "total_revenue": round(total_revenue, 2)}


@router.get("/api/sales/agent/cross-sell")
def agent_cross_sell(
    name: str,
    line: str = "Travel",
):
    """Members owned by this agent: who needs insurance, travel, upgrade, or new membership."""
    from shared import (
        get_owner_map,
        escape_soql as _escape,
        line_filter_opp as _line_filter_opp,
    )
    from sf_client import sf_query_all, sf_instance_url

    safe = _escape(name)
    owner_map = get_owner_map()
    name_to_id = {v.strip().lower(): k for k, v in owner_map.items()}
    owner_id = name_to_id.get(name.strip().lower())
    ow = f"OwnerId = '{owner_id}'" if owner_id else f"Owner.Name = '{safe}'"
    lf = _line_filter_opp(line)

    members = sf_query_all(f"""
        SELECT Id, Name, PersonEmail, Phone, BillingCity, Account_Member_ID__c,
               ImportantActiveMemCoverage__c, Insuance_Customer_ID__c,
               Account_Member_Since__c, Member_Status__c
        FROM Account
        WHERE {ow} AND Member_Status__c = 'A' AND RecordType.Name = 'Person Account'
        ORDER BY CreatedDate DESC
        LIMIT 500
    """)

    today = date.today()
    sf_base = sf_instance_url()

    def _mem_label(raw):
        value = (raw or '').strip().upper()
        labels = {'PLUS': 'Plus', 'PREMIER': 'Premier', 'B': 'Basic', 'BASIC': 'Basic',
                  'PLRV': 'Plus RV', 'PMRV': 'Premier RV'}
        return labels.get(value, value.title()) if value else 'Basic'

    def _is_basic(raw):
        v = (raw or '').strip().upper()
        return v in ('', 'B', 'BASIC')

    def _tenure(ms):
        try:
            since = date.fromisoformat(ms)
            return today.year - since.year
        except Exception:
            return None

    if not members:
        # Still query non-member customers even if no active members
        won_rows = sf_query_all(f"""
            SELECT AccountId, SUM(Amount) total, COUNT(Id) cnt
            FROM Opportunity
            WHERE {ow} AND StageName IN ('Closed Won','Invoice') AND {lf}
              AND AccountId != null AND Amount != null
            GROUP BY AccountId
            ORDER BY SUM(Amount) DESC
            LIMIT 50
        """)
        non_member_customers = []
        if won_rows:
            acct_ids = [r.get('AccountId') for r in won_rows if r.get('AccountId')]
            ids_csv = ",".join(f"'{aid}'" for aid in acct_ids)
            acct_rows = sf_query_all(f"SELECT Id, Name, BillingCity FROM Account WHERE Id IN ({ids_csv})")
            acct_map = {r.get('Id'): r for r in acct_rows if r.get('Id')}
            for r in won_rows:
                aid = r.get('AccountId', '')
                acct = acct_map.get(aid, {})
                non_member_customers.append({
                    'account_id': aid, 'name': acct.get('Name', '') or '',
                    'city': acct.get('BillingCity', '') or '',
                    'total_spend': round(r.get('total') or 0, 2),
                    'deal_count': r.get('cnt') or 0,
                    'sf_link': f"{sf_base}/{aid}",
                })
        return {
            'members_no_insurance': [], 'members_no_travel': [],
            'members_upgrade': [], 'non_member_customers': non_member_customers,
            'summary': {'total_active_members': 0, 'with_insurance': 0,
                        'with_travel': 0, 'basic_tier': 0},
        }

    member_ids = [m.get('Id') for m in members if m.get('Id')]
    member_id_set = set(member_ids)
    ids_csv = ",".join(f"'{aid}'" for aid in member_ids)

    tp_rows = sf_query_all(f"""
        SELECT Account__c FROM Travel_Portfolio__c WHERE Account__c IN ({ids_csv})
    """)
    has_travel_set = {r.get('Account__c') for r in tp_rows if r.get('Account__c')}

    # Non-member customers: had won deals with this agent but not an active member
    won_rows = sf_query_all(f"""
        SELECT AccountId, SUM(Amount) total, COUNT(Id) cnt
        FROM Opportunity
        WHERE {ow} AND StageName IN ('Closed Won','Invoice') AND {lf}
          AND AccountId != null AND Amount != null
        GROUP BY AccountId
        ORDER BY SUM(Amount) DESC
        LIMIT 50
    """)
    non_member_customers = []
    if won_rows:
        non_member_ids = [r.get('AccountId') for r in won_rows
                          if r.get('AccountId') and r.get('AccountId') not in member_id_set]
        if non_member_ids:
            nm_csv = ",".join(f"'{aid}'" for aid in non_member_ids)
            nm_rows = sf_query_all(f"SELECT Id, Name, BillingCity FROM Account WHERE Id IN ({nm_csv})")
            nm_map = {r.get('Id'): r for r in nm_rows if r.get('Id')}
            spend_map = {r.get('AccountId'): r for r in won_rows}
            for aid in non_member_ids:
                acct = nm_map.get(aid, {})
                if not acct:
                    continue
                r = spend_map.get(aid, {})
                non_member_customers.append({
                    'account_id': aid,
                    'name': acct.get('Name', '') or '',
                    'city': acct.get('BillingCity', '') or '',
                    'total_spend': round(r.get('total') or 0, 2),
                    'deal_count': r.get('cnt') or 0,
                    'sf_link': f"{sf_base}/{aid}",
                })

    members_no_insurance = []
    members_no_travel = []
    members_upgrade = []
    with_insurance = 0
    with_travel = 0
    basic_count = 0

    for member in members:
        aid = member.get('Id', '')
        has_ins = bool(member.get('Insuance_Customer_ID__c'))
        has_trv = aid in has_travel_set
        mem_raw = member.get('ImportantActiveMemCoverage__c')
        is_basic = _is_basic(mem_raw)

        if has_ins:
            with_insurance += 1
        if has_trv:
            with_travel += 1
        if is_basic:
            basic_count += 1

        row = {
            'account_id': aid,
            'name': member.get('Name', '') or '',
            'email': member.get('PersonEmail', '') or '',
            'phone': member.get('Phone', '') or '',
            'city': member.get('BillingCity', '') or '',
            'membership': _mem_label(mem_raw),
            'tenure_years': _tenure(member.get('Account_Member_Since__c', '') or ''),
            'has_insurance': has_ins,
            'has_travel': has_trv,
            'sf_link': f"{sf_base}/{aid}",
        }
        if not has_ins:
            members_no_insurance.append(row)
        if not has_trv:
            members_no_travel.append(row)
        if is_basic:
            members_upgrade.append(row)

    return {
        'members_no_insurance': members_no_insurance[:100],
        'members_no_travel': members_no_travel[:100],
        'members_upgrade': members_upgrade[:100],
        'non_member_customers': non_member_customers[:50],
        'summary': {
            'total_active_members': len(members),
            'with_insurance': with_insurance,
            'with_travel': with_travel,
            'basic_tier': basic_count,
        },
    }
