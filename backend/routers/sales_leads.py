"""Lead Conversion Funnel — volume, conversion, time-to-convert, source effectiveness."""

import logging
from typing import Optional
from fastapi import APIRouter, Query
from sf_client import sf_query_all, sf_parallel
import cache
from shared import VALID_LINES, resolve_dates as _resolve_dates, line_filter_lead as _line_filter, line_filter_opp as _opp_line_filter, is_sales_agent
from constants import CACHE_TTL_HOUR, CACHE_TTL_DAY

router = APIRouter()
log = logging.getLogger('sales.leads')


@router.get("/api/sales/leads/volume")
def leads_volume(
    line: str = "Travel", period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Lead volume by status and source."""
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"leads_volume_{line}_{sd}_{ed}"

    def fetch():
        lf = _line_filter(line)
        data = sf_parallel(
            by_status=f"""
                SELECT Status, COUNT(Id) cnt
                FROM Lead
                WHERE CreatedDate >= {sd}T00:00:00Z AND CreatedDate <= {ed}T23:59:59Z
                  AND {lf}
                GROUP BY Status
                ORDER BY COUNT(Id) DESC
            """,
            by_source=f"""
                SELECT LeadSource, COUNT(Id) cnt
                FROM Lead
                WHERE CreatedDate >= {sd}T00:00:00Z AND CreatedDate <= {ed}T23:59:59Z
                  AND {lf} AND LeadSource != null
                GROUP BY LeadSource
                ORDER BY COUNT(Id) DESC
            """,
            total=f"""
                SELECT COUNT(Id) cnt
                FROM Lead
                WHERE CreatedDate >= {sd}T00:00:00Z AND CreatedDate <= {ed}T23:59:59Z
                  AND {lf}
            """,
            converted=f"""
                SELECT COUNT(Id) cnt
                FROM Lead
                WHERE IsConverted = true
                  AND ConvertedDate >= {sd} AND ConvertedDate <= {ed}
                  AND {lf}
            """,
        )

        total = data['total'][0].get('cnt', 0) if data['total'] else 0
        converted = data['converted'][0].get('cnt', 0) if data['converted'] else 0
        by_status = [{"status": r['Status'], "count": r['cnt']} for r in data['by_status']]
        by_source = [{"source": r['LeadSource'], "count": r['cnt']} for r in data['by_source']]

        expired_cnt = next((s['count'] for s in by_status if s['status'] == 'Expired'), 0)
        expired_pct = round(expired_cnt / total * 100, 1) if total > 0 else 0

        return {
            "total": total,
            "converted": converted,
            "by_status": by_status,
            "by_source": by_source,
            "expired_count": expired_cnt,
            "expired_rate": expired_pct,
            "line": line,
            "period": period,
        }

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


@router.get("/api/sales/leads/conversion")
def leads_conversion(
    line: str = "Travel", period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Conversion rates by source — converted count and total by source."""
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"leads_conversion_{line}_{sd}_{ed}"

    def fetch():
        lf = _line_filter(line)
        data = sf_parallel(
            converted=f"""
                SELECT LeadSource, COUNT(Id) cnt
                FROM Lead
                WHERE IsConverted = true
                  AND ConvertedDate >= {sd} AND ConvertedDate <= {ed}
                  AND {lf} AND LeadSource != null
                GROUP BY LeadSource
                ORDER BY COUNT(Id) DESC
            """,
            total=f"""
                SELECT LeadSource, COUNT(Id) cnt
                FROM Lead
                WHERE CreatedDate >= {sd}T00:00:00Z AND CreatedDate <= {ed}T23:59:59Z
                  AND {lf} AND LeadSource != null AND Status != 'Expired'
                GROUP BY LeadSource
            """,
        )

        total_map = {r['LeadSource']: r['cnt'] for r in data['total']}
        sources = []
        for r in data['converted']:
            src = r['LeadSource']
            conv = r['cnt'] or 0
            tot = total_map.get(src, conv)
            rate = round(conv / tot * 100, 1) if tot > 0 else 0
            sources.append({
                "source": src,
                "converted": conv,
                "total_non_expired": tot,
                "conversion_rate": rate,
            })
        sources.sort(key=lambda x: x['conversion_rate'], reverse=True)
        return {"sources": sources, "line": line, "period": period}

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


@router.get("/api/sales/leads/time-to-convert")
def leads_time_to_convert(
    line: str = "Travel", period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Distribution of days from Lead creation to conversion."""
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"leads_ttc_{line}_{sd}_{ed}"

    def fetch():
        lf = _line_filter(line)
        records = sf_query_all(f"""
            SELECT CreatedDate, ConvertedDate, LeadSource
            FROM Lead
            WHERE IsConverted = true
              AND ConvertedDate >= {sd} AND ConvertedDate <= {ed}
              AND {lf}
            ORDER BY ConvertedDate DESC
            LIMIT 5000
        """)

        from datetime import datetime
        days_list = []
        for r in records:
            try:
                created = datetime.fromisoformat(r['CreatedDate'].replace('+0000', '+00:00'))
                converted = datetime.fromisoformat(r['ConvertedDate'].replace('+0000', '+00:00'))
                days = (converted - created).days
                days_list.append({"days": days, "source": r.get('LeadSource')})
            except Exception:
                continue

        if not days_list:
            return {"avg_days": 0, "median_days": 0, "buckets": [], "by_source": [], "line": line}

        all_days = sorted(d['days'] for d in days_list)
        avg = round(sum(all_days) / len(all_days), 1)
        median = all_days[len(all_days) // 2]

        # Bucket into ranges for histogram
        bucket_map = {'0-1': 0, '2-3': 0, '4-7': 0, '8-14': 0, '15-30': 0, '31-60': 0, '60+': 0}
        for d in all_days:
            if d <= 1: bucket_map['0-1'] += 1
            elif d <= 3: bucket_map['2-3'] += 1
            elif d <= 7: bucket_map['4-7'] += 1
            elif d <= 14: bucket_map['8-14'] += 1
            elif d <= 30: bucket_map['15-30'] += 1
            elif d <= 60: bucket_map['31-60'] += 1
            else: bucket_map['60+'] += 1

        buckets = [{"range": k, "count": v} for k, v in bucket_map.items()]

        # Avg days by source
        source_days: dict[str, list] = {}
        for d in days_list:
            src = d['source'] or '(Unknown)'
            source_days.setdefault(src, []).append(d['days'])
        by_source = sorted([
            {"source": src, "avg_days": round(sum(days) / len(days), 1), "count": len(days)}
            for src, days in source_days.items()
            if len(days) >= 3
        ], key=lambda x: x['avg_days'])

        return {
            "avg_days": avg, "median_days": median,
            "total_converted": len(days_list),
            "buckets": buckets,
            "by_source": by_source,
            "line": line, "period": period,
        }

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


@router.get("/api/sales/leads/source-effectiveness")
def leads_source_effectiveness(
    line: str = "Travel", period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Sources ranked by converted opportunity value — which sources produce highest-value deals."""
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"leads_source_eff_{line}_{sd}_{ed}"

    def fetch():
        lf = _line_filter(line)
        data = sf_parallel(
            converted_opps=f"""
                SELECT LeadSource, ConvertedOpportunity.Amount
                FROM Lead
                WHERE IsConverted = true
                  AND ConvertedDate >= {sd} AND ConvertedDate <= {ed}
                  AND {lf} AND LeadSource != null
                  AND ConvertedOpportunity.Amount != null
                ORDER BY ConvertedOpportunity.Amount DESC
                LIMIT 5000
            """,
            leads_by_source=f"""
                SELECT LeadSource, COUNT(Id) cnt
                FROM Lead
                WHERE CreatedDate >= {sd}T00:00:00Z AND CreatedDate <= {ed}T23:59:59Z
                  AND {lf} AND LeadSource != null
                GROUP BY LeadSource
            """,
        )

        # Build total leads per source for conversion rate
        total_by_source = {r['LeadSource']: r['cnt'] for r in data['leads_by_source']}

        source_data: dict = {}
        for r in data['converted_opps']:
            src = r.get('LeadSource')
            amt = (r.get('ConvertedOpportunity') or {}).get('Amount', 0) or 0
            if src not in source_data:
                source_data[src] = {'opp_total': 0, 'count': 0}
            source_data[src]['opp_total'] += amt
            source_data[src]['count'] += 1

        sources = []
        for src, d in source_data.items():
            total_leads = total_by_source.get(src, d['count'])
            conv_rate = round(d['count'] / total_leads * 100, 1) if total_leads > 0 else 0
            avg = round(d['opp_total'] / d['count'], 0) if d['count'] > 0 else 0
            sources.append({
                "source": src,
                "total": total_leads,
                "converted_with_value": d['count'],
                "conversion_rate": conv_rate,
                "total_opp_value": d['opp_total'],
                "avg_opp_value": avg,
            })
        sources.sort(key=lambda x: x['total_opp_value'], reverse=True)
        return {"sources": sources, "line": line, "period": period}

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


@router.get("/api/sales/leads/agent-close-speed")
def agent_close_speed(
    line: str = "Travel", period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Avg days from Opp creation → Closed Won per agent."""
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"agent_close_speed_{line}_{sd}_{ed}"

    def fetch():
        from datetime import datetime
        lf = _opp_line_filter(line)
        records = sf_query_all(f"""
            SELECT Owner.Name, CreatedDate, CloseDate
            FROM Opportunity
            WHERE StageName IN ('Closed Won','Invoice')
              AND {lf}
              AND CloseDate >= {sd} AND CloseDate <= {ed}
            ORDER BY CloseDate DESC
            LIMIT 10000
        """)

        agent_days: dict[str, list] = {}
        for r in records:
            try:
                owner = r.get('Owner', {}).get('Name', '')
                if not owner:
                    continue
                created = datetime.fromisoformat(
                    r['CreatedDate'].replace('+0000', '+00:00')
                )
                closed = datetime.fromisoformat(
                    r['CloseDate'] + 'T00:00:00+00:00'
                    if 'T' not in r['CloseDate']
                    else r['CloseDate'].replace('+0000', '+00:00')
                )
                days = max((closed - created).days, 0)
                agent_days.setdefault(owner, []).append(days)
            except Exception:
                continue

        agents = []
        for name, days_list in agent_days.items():
            if len(days_list) < 3:
                continue
            avg = round(sum(days_list) / len(days_list), 1)
            median = sorted(days_list)[len(days_list) // 2]
            agents.append({
                "name": name,
                "avg_days": avg,
                "median_days": median,
                "deals": len(days_list),
            })

        # Filter to whitelisted sales agents
        agents = [a for a in agents if is_sales_agent(a['name'], line)]

        agents.sort(key=lambda a: a['avg_days'])
        return {"agents": agents, "line": line, "period": period}

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)
