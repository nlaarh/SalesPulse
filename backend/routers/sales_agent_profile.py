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
    today = date.today()
    cy, py = today.year, today.year - 1

    # Prior-year equivalent date range for apples-to-apples YoY comparison.
    sd_dt = date.fromisoformat(str(sd))
    ed_dt = date.fromisoformat(str(ed))
    try:
        p_sd = sd_dt.replace(year=sd_dt.year - 1).isoformat()
    except ValueError:  # Feb 29 leap year
        p_sd = sd_dt.replace(year=sd_dt.year - 1, day=28).isoformat()
    try:
        p_ed = ed_dt.replace(year=ed_dt.year - 1).isoformat()
    except ValueError:
        p_ed = ed_dt.replace(year=ed_dt.year - 1, day=28).isoformat()

    key = f"agent_profile_{name}_{line}_{sd}_{ed}"

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

        # ── Parse agent metrics ──────────────────────────────────────────
        # Insurance: Amount IS the commission (Earned_Commission_Amount__c is $0)
        # Travel: Amount = gross bookings, Earned_Commission_Amount__c = commission
        is_insurance = line and line.lower() == 'insurance'

        revenue = _val(data['won_cur'], 'rev')
        commission = revenue if is_insurance else _val(data['won_cur'], 'comm')
        deals = _val(data['won_cur'], 'cnt')
        avg_deal = round(revenue / deals) if deals else 0

        p_rev = _val(data['won_pri'], 'rev')
        p_comm = p_rev if is_insurance else _val(data['won_pri'], 'comm')
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

        team = compute_team_averages(data, line, is_insurance)

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
            'name': name, 'line': line, 'email': agent_email,
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

    # AI brief (outside cache — generated fresh)
    ai_powered = False
    writeup = template_brief(profile)
    if ai:
        ai_result = ai_brief(profile)
        if ai_result:
            writeup = ai_result
            ai_powered = True

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
        SELECT Id, Name, AccountId, Amount, CloseDate, StageName, Earned_Commission_Amount__c
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
                'commission': round(d.get('Earned_Commission_Amount__c') or 0, 2),
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
