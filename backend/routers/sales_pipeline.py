"""Pipeline & Forecasting — funnel, forecast vs actual, velocity, at-risk deals."""

import logging
from datetime import date, datetime, timezone
from typing import Optional
from fastapi import APIRouter, Query
from sf_client import sf_query_all
import cache
from shared import VALID_LINES, line_filter_opp as _line_filter, resolve_dates as _resolve_dates, is_sales_agent, six_months_ago

router = APIRouter()
log = logging.getLogger('sales.pipeline')


@router.get("/api/sales/pipeline/stages")
def pipeline_stages(line: str = "Travel"):
    """Active pipeline by stage — only deals closing in next 12 months."""
    if line not in VALID_LINES:
        line = 'Travel'
    today = date.today().isoformat()
    key = f"pipeline_stages_v2_{line}_{today}"

    def fetch():
        lf = _line_filter(line)
        records = sf_query_all(f"""
            SELECT StageName, ForecastCategory, COUNT(Id) cnt, SUM(Amount) rev
            FROM Opportunity
            WHERE IsClosed = false AND {lf}
              AND Amount != null
              AND CloseDate >= TODAY
              AND CloseDate <= NEXT_N_MONTHS:12
            GROUP BY StageName, ForecastCategory
        """)
        stages = []
        for r in records:
            stages.append({
                "stage": r.get('StageName'),
                "forecast_category": r.get('ForecastCategory'),
                "count": r.get('cnt', 0) or 0,
                "amount": r.get('rev', 0) or 0,
            })
        return {"stages": stages, "line": line}

    return cache.cached_query(key, fetch, ttl=1800, disk_ttl=43200)


@router.get("/api/sales/pipeline/forecast")
def pipeline_forecast(
    line: str = "Travel", period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Monthly forecast vs actual — Closed Won revenue by month."""
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"pipeline_forecast_{line}_{sd}_{ed}"

    def fetch():
        lf = _line_filter(line)
        records = sf_query_all(f"""
            SELECT CALENDAR_YEAR(CloseDate) yr, CALENDAR_MONTH(CloseDate) mo,
                   StageName, COUNT(Id) cnt, SUM(Amount) rev
            FROM Opportunity
            WHERE StageName IN ('Closed Won','Invoice','Closed Lost') AND {lf}
              AND CloseDate >= {sd} AND CloseDate <= {ed}
            GROUP BY CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate), StageName
            ORDER BY CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate)
        """)
        months = {}
        for r in records:
            label = f"{r.get('yr')}-{str(r.get('mo', 0)).zfill(2)}"
            if label not in months:
                months[label] = {"label": label, "year": r.get('yr'), "month": r.get('mo'),
                                 "won_revenue": 0, "won_count": 0, "lost_count": 0}
            if r.get('StageName') in ('Closed Won', 'Invoice'):
                months[label]["won_revenue"] += r.get('rev', 0) or 0
                months[label]["won_count"] += r.get('cnt', 0) or 0
            else:
                months[label]["lost_count"] += r.get('cnt', 0) or 0
        result = sorted(months.values(), key=lambda x: x['label'])
        for m in result:
            total = m['won_count'] + m['lost_count']
            m['close_rate'] = round(m['won_count'] / total * 100, 1) if total > 0 else 0
        return {"months": result, "line": line, "period": period}

    return cache.cached_query(key, fetch, ttl=1800, disk_ttl=43200)


@router.get("/api/sales/pipeline/velocity")
def pipeline_velocity(line: str = "Travel"):
    """Stage velocity — active pipeline deals only (closing in next 12 months)."""
    if line not in VALID_LINES:
        line = 'Travel'
    today = date.today().isoformat()
    key = f"pipeline_velocity_v2_{line}_{today}"

    def fetch():
        lf = _line_filter(line)
        records = sf_query_all(f"""
            SELECT StageName, COUNT(Id) cnt, AVG(Amount) avg_amt
            FROM Opportunity
            WHERE IsClosed = false AND {lf}
              AND Amount != null
              AND CloseDate >= TODAY
              AND CloseDate <= NEXT_N_MONTHS:12
            GROUP BY StageName
            ORDER BY COUNT(Id) DESC
        """)
        stages = []
        for r in records:
            stages.append({
                "stage": r.get('StageName'),
                "count": r.get('cnt', 0) or 0,
                "avg_amount": round(r.get('avg_amt', 0) or 0, 0),
            })
        return {"stages": stages, "line": line}

    return cache.cached_query(key, fetch, ttl=1800, disk_ttl=43200)


@router.get("/api/sales/pipeline/slipping")
def pipeline_slipping(line: str = "Travel"):
    """At-risk deals: open opps past their close date, sorted by amount."""
    if line not in VALID_LINES:
        line = 'Travel'
    today = date.today().isoformat()
    key = f"pipeline_slipping_v2_{line}_{today}"

    def fetch():
        sma = six_months_ago()
        lf = _line_filter(line)
        records = sf_query_all(f"""
            SELECT Id, Name, StageName, Amount, CloseDate,
                   Owner.Name, RecordType.Name, LastStageChangeDate,
                   LastActivityDate
            FROM Opportunity
            WHERE IsClosed = false AND {lf}
              AND Amount != null
              AND CloseDate >= {sma}
              AND CloseDate < TODAY
            ORDER BY Amount DESC
            LIMIT 50
        """)
        deals = []
        now = datetime.now(timezone.utc)
        today = now.date()
        for r in records:
            days_in_stage = None
            if r.get('LastStageChangeDate'):
                try:
                    lsc = datetime.fromisoformat(r['LastStageChangeDate'].replace('+0000', '+00:00'))
                    days_in_stage = (now - lsc).days
                except Exception:
                    pass

            days_overdue = None
            if r.get('CloseDate'):
                try:
                    from datetime import date as dt_date
                    parts = r['CloseDate'].split('-')
                    cd = dt_date(int(parts[0]), int(parts[1]), int(parts[2]))
                    days_overdue = (today - cd).days
                except Exception:
                    pass

            days_since_activity = None
            if r.get('LastActivityDate'):
                try:
                    from datetime import date as dt_date
                    parts = r['LastActivityDate'].split('-')
                    la = dt_date(int(parts[0]), int(parts[1]), int(parts[2]))
                    days_since_activity = (today - la).days
                except Exception:
                    pass

            deals.append({
                "id": r.get('Id'),
                "name": r.get('Name'),
                "stage": r.get('StageName'),
                "amount": r.get('Amount', 0) or 0,
                "close_date": r.get('CloseDate'),
                "days_overdue": days_overdue,
                "days_since_activity": days_since_activity,
                "owner": (r.get('Owner') or {}).get('Name', ''),
                "record_type": (r.get('RecordType') or {}).get('Name', ''),
                "days_in_stage": days_in_stage,
            })
        # Filter to whitelisted sales agents
        deals = [d for d in deals if is_sales_agent(d['owner'], line)]

        total_at_risk = sum(d['amount'] for d in deals)
        return {"deals": deals, "total_at_risk": total_at_risk, "count": len(deals), "line": line}

    return cache.cached_query(key, fetch, ttl=1800, disk_ttl=43200)
