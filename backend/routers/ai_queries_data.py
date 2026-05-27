"""AI Query data fetching functions — pulled from Salesforce for each intent."""

import logging
from sf_client import sf_query_all
import cache
from shared import line_filter_opp as _line_filter, line_filter_lead
from constants import CACHE_TTL_HOUR, CACHE_TTL_DAY

log = logging.getLogger('salesinsight.ai')


def fetch_pipeline_health(line: str = "Travel") -> dict:
    """Get overall pipeline health metrics."""
    cache_key = f"ai:pipeline_health_{line}"

    def fetch():
        lf = _line_filter(line)
        pipeline_query = f"""
            SELECT StageName, COUNT(Id) cnt, SUM(Amount) total
            FROM Opportunity
            WHERE IsClosed = false AND {lf}
              AND Amount != null
              AND CloseDate >= TODAY
              AND CloseDate <= NEXT_N_MONTHS:12
            GROUP BY StageName
            ORDER BY COUNT(Id) DESC
        """
        pipeline = sf_query_all(pipeline_query)

        at_risk_query = f"""
            SELECT COUNT(Id) cnt, SUM(Amount) total
            FROM Opportunity
            WHERE IsClosed = false AND {lf}
              AND Amount != null
              AND CloseDate < TODAY
        """
        at_risk = sf_query_all(at_risk_query)

        return {
            "by_stage": [
                {"name": r.get("StageName", "Unknown"), "deals": r.get("cnt", 0), "value": r.get("total", 0) or 0}
                for r in pipeline
            ],
            "at_risk_count": at_risk[0].get("cnt", 0) if at_risk else 0,
            "at_risk_value": at_risk[0].get("total", 0) or 0 if at_risk else 0,
            "line": line,
        }

    return cache.cached_query(cache_key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


def fetch_at_risk_deals(line: str = "Travel") -> dict:
    """Get all open deals closing in next 30 days + past-due. LLM decides what's at risk."""
    cache_key = f"ai:at_risk_{line}"

    def fetch():
        lf = _line_filter(line)
        query = f"""
            SELECT Id, Name, Amount, CloseDate, StageName, Days_In_Stage__c,
                   OwnerId, LastActivityDate
            FROM Opportunity
            WHERE IsClosed = false AND {lf}
              AND Amount != null
              AND CloseDate <= NEXT_N_DAYS:30
            ORDER BY CloseDate ASC
            LIMIT 30
        """
        results = sf_query_all(query)

        from shared import get_owner_map
        owner_map = get_owner_map()

        deals = []
        for r in results:
            deals.append({
                "name": r.get("Name"),
                "owner": owner_map.get(r.get("OwnerId"), "Unknown"),
                "amount": r.get("Amount") or 0,
                "close_date": r.get("CloseDate"),
                "stage": r.get("StageName"),
                "days_in_stage": r.get("Days_In_Stage__c") or 0,
                "last_activity": r.get("LastActivityDate"),
            })

        return {"deals": deals, "total_value": sum(d["amount"] for d in deals), "line": line}

    return cache.cached_query(cache_key, fetch, ttl=CACHE_TTL_HOUR // 2, disk_ttl=CACHE_TTL_DAY)


def fetch_advisor_rankings(line: str = "Travel") -> dict:
    """Get top performing advisors."""
    cache_key = f"ai:advisors_{line}"

    def fetch():
        if line in ('Travel', 'Insurance'):
            from datetime import date, timedelta
            from pbi_utils import pbi_by_advisor
            ed = date.today().isoformat()
            sd = (date.today() - timedelta(days=90)).isoformat()
            try:
                pbi_rows = pbi_by_advisor(line, sd, ed)
            except Exception as e:
                log.error(f"Failed to fetch PBI advisors for rankings: {e}")
                pbi_rows = []
            
            pbi_rows.sort(key=lambda r: r.get('sales', 0.0), reverse=True)
            advisors = []
            for r in pbi_rows[:10]:
                advisors.append({
                    "name": r['name'],
                    "deals_won": r.get('txns', 0),
                    "revenue": r.get('sales', 0.0)
                })
            return {"advisors": advisors, "line": line}

        lf = _line_filter(line)
        query = f"""
            SELECT OwnerId, COUNT(Id) cnt, SUM(Amount) total
            FROM Opportunity
            WHERE IsWon = true AND {lf}
              AND CloseDate >= LAST_N_MONTHS:3
              AND Amount != null
            GROUP BY OwnerId
            ORDER BY SUM(Amount) DESC
            LIMIT 10
        """
        results = sf_query_all(query)

        from shared import get_owner_map
        owner_map = get_owner_map()

        advisors = []
        for r in results:
            owner_id = r.get("OwnerId")
            name = owner_map.get(owner_id, "Unknown")
            advisors.append({
                "name": name,
                "deals_won": r.get("cnt", 0),
                "revenue": r.get("total", 0) or 0
            })

        return {"advisors": advisors, "line": line}

    return cache.cached_query(cache_key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


def fetch_revenue_trends(line: str = "Travel") -> dict:
    """Revenue by month for the last 12 months (won + invoiced)."""
    cache_key = f"ai:revenue_{line}"

    def fetch():
        if line in ('Travel', 'Insurance'):
            from datetime import date, timedelta
            from pbi_utils import pbi_by_day
            ed = date.today().isoformat()
            sd = (date.today() - timedelta(days=365)).isoformat()
            try:
                pbi_rows = pbi_by_day(line, sd, ed)
            except Exception as e:
                log.error(f"Failed to fetch PBI by day for revenue trends: {e}")
                pbi_rows = []
            
            monthly_agg = {}
            for r in pbi_rows:
                yr = int(r['date'][:4])
                mo = int(r['date'][5:7])
                key = (yr, mo)
                if key not in monthly_agg:
                    monthly_agg[key] = {"deals": 0, "revenue": 0.0}
                monthly_agg[key]["deals"] += r.get('txns', 0)
                monthly_agg[key]["revenue"] += r.get('sales', 0.0)
            
            months = []
            total_rev = 0.0
            total_deals = 0
            for (yr, mo), data in sorted(monthly_agg.items()):
                months.append({
                    "year": yr,
                    "month": mo,
                    "deals": data["deals"],
                    "revenue": data["revenue"]
                })
                total_rev += data["revenue"]
                total_deals += data["deals"]
            
            return {"monthly": months, "total_revenue": total_rev, "total_deals": total_deals, "line": line}

        lf = _line_filter(line)
        from shared import WON_STAGES
        q = f"""
            SELECT CALENDAR_YEAR(CloseDate) yr, CALENDAR_MONTH(CloseDate) mo,
                   COUNT(Id) cnt, SUM(Amount) rev
            FROM Opportunity
            WHERE {lf} AND {WON_STAGES}
              AND CloseDate >= LAST_N_MONTHS:12
              AND CloseDate <= TODAY
              AND Amount != null
            GROUP BY CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate)
            ORDER BY CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate)
        """
        rows = sf_query_all(q)
        months = []
        total_rev = 0
        total_deals = 0
        for r in rows:
            rev = r.get("rev") or 0
            cnt = r.get("cnt") or 0
            months.append({"year": r["yr"], "month": r["mo"], "deals": cnt, "revenue": rev})
            total_rev += rev
            total_deals += cnt
        return {"monthly": months, "total_revenue": total_rev, "total_deals": total_deals, "line": line}

    return cache.cached_query(cache_key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


def fetch_forecasting_data(line: str = "Travel") -> dict:
    """Open pipeline by stage + weighted forecast value."""
    cache_key = f"ai:forecast_{line}"

    def fetch():
        lf = _line_filter(line)
        q = f"""
            SELECT StageName, COUNT(Id) cnt, SUM(Amount) rev, AVG(Probability) avg_prob
            FROM Opportunity
            WHERE IsClosed = false AND {lf}
              AND Amount != null
              AND CloseDate >= TODAY
              AND CloseDate <= NEXT_N_MONTHS:6
            GROUP BY StageName
            ORDER BY SUM(Amount) DESC
        """
        rows = sf_query_all(q)
        stages = []
        total_pipeline = 0
        weighted_total = 0
        for r in rows:
            rev = r.get("rev") or 0
            prob = r.get("avg_prob") or 0
            weighted = rev * (prob / 100) if prob else 0
            stages.append({
                "stage": r.get("StageName"),
                "deals": r.get("cnt", 0),
                "value": rev,
                "avg_probability": round(prob, 1),
                "weighted_value": round(weighted, 2),
            })
            total_pipeline += rev
            weighted_total += weighted
        return {
            "stages": stages,
            "total_pipeline": total_pipeline,
            "weighted_forecast": round(weighted_total, 2),
            "line": line,
        }

    return cache.cached_query(cache_key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


def fetch_win_rate_data(line: str = "Travel") -> dict:
    """Win rate: won / (won + lost) over last 12 months."""
    cache_key = f"ai:win_rate_{line}"

    def fetch():
        lf = _line_filter(line)
        if line in ('Travel', 'Insurance'):
            from datetime import date, timedelta
            from pbi_utils import pbi_by_day, pbi_by_advisor
            ed = date.today().isoformat()
            sd = (date.today() - timedelta(days=365)).isoformat()
            
            try:
                pbi_day = pbi_by_day(line, sd, ed)
                won_cnt = sum(r.get('txns', 0) for r in pbi_day)
                won_rev = sum(r.get('sales', 0.0) for r in pbi_day)
            except Exception as e:
                log.error(f"Failed to fetch PBI day for win rate: {e}")
                won_cnt = 0
                won_rev = 0.0

            try:
                pbi_adv = pbi_by_advisor(line, sd, ed)
                pbi_adv.sort(key=lambda r: r.get('sales', 0.0), reverse=True)
                top_winners = []
                for r in pbi_adv[:10]:
                    top_winners.append({
                        "name": r['name'],
                        "deals": r.get('txns', 0),
                        "revenue": r.get('sales', 0.0)
                    })
            except Exception as e:
                log.error(f"Failed to fetch PBI advisor for win rate: {e}")
                top_winners = []

            lost_q = f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev
                FROM Opportunity
                WHERE {lf} AND StageName = 'Closed Lost'
                  AND CloseDate >= {sd}
                  AND CloseDate <= {ed}
            """
            try:
                lost_data = sf_query_all(lost_q)
                lost_cnt = lost_data[0].get("cnt", 0) if lost_data else 0
                lost_rev = lost_data[0].get("rev", 0) or 0 if lost_data else 0
            except Exception as e:
                log.error(f"Failed to fetch SF lost data for win rate: {e}")
                lost_cnt = 0
                lost_rev = 0.0

            total = won_cnt + lost_cnt
            win_rate = round(won_cnt / total * 100, 1) if total else 0

            return {
                "win_rate": win_rate,
                "won_count": won_cnt, "won_revenue": won_rev,
                "lost_count": lost_cnt, "lost_revenue": lost_rev,
                "total_closed": total,
                "top_winners": top_winners,
                "line": line,
            }

        from shared import WON_STAGES
        won_q = f"""
            SELECT COUNT(Id) cnt, SUM(Amount) rev
            FROM Opportunity
            WHERE {lf} AND {WON_STAGES}
              AND CloseDate >= LAST_N_MONTHS:12
              AND CloseDate <= TODAY
              AND Amount != null
        """
        lost_q = f"""
            SELECT COUNT(Id) cnt, SUM(Amount) rev
            FROM Opportunity
            WHERE {lf} AND StageName = 'Closed Lost'
              AND CloseDate >= LAST_N_MONTHS:12
              AND CloseDate <= TODAY
        """
        top_q = f"""
            SELECT OwnerId, COUNT(Id) cnt, SUM(Amount) rev
            FROM Opportunity
            WHERE {lf} AND {WON_STAGES}
              AND CloseDate >= LAST_N_MONTHS:12
              AND CloseDate <= TODAY
              AND Amount != null
            GROUP BY OwnerId
            ORDER BY SUM(Amount) DESC
            LIMIT 10
        """
        from sf_client import sf_parallel
        data = sf_parallel(won=won_q, lost=lost_q, top=top_q)

        won_cnt = data["won"][0].get("cnt", 0) if data["won"] else 0
        won_rev = data["won"][0].get("rev", 0) or 0 if data["won"] else 0
        lost_cnt = data["lost"][0].get("cnt", 0) if data["lost"] else 0
        lost_rev = data["lost"][0].get("rev", 0) or 0 if data["lost"] else 0
        total = won_cnt + lost_cnt
        win_rate = round(won_cnt / total * 100, 1) if total else 0

        from shared import get_owner_map
        owner_map = get_owner_map()
        top_winners = []
        for r in data.get("top", []):
            name = owner_map.get(r.get("OwnerId"), "Unknown")
            top_winners.append({"name": name, "deals": r.get("cnt", 0), "revenue": r.get("rev", 0) or 0})

        return {
            "win_rate": win_rate,
            "won_count": won_cnt, "won_revenue": won_rev,
            "lost_count": lost_cnt, "lost_revenue": lost_rev,
            "total_closed": total,
            "top_winners": top_winners,
            "line": line,
        }

    return cache.cached_query(cache_key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


def fetch_funnel_data(line: str = "Travel") -> dict:
    """Conversion funnel: leads → converted → invoiced → won → lost."""
    cache_key = f"ai:funnel_{line}"

    def fetch():
        from shared import line_filter_lead, WON_STAGES, INVOICED_STAGES
        lf_opp = _line_filter(line)
        lf_lead = line_filter_lead(line)

        if line in ('Travel', 'Insurance'):
            from datetime import date, timedelta
            from pbi_utils import pbi_by_day
            from sf_client import sf_parallel
            ed = date.today().isoformat()
            sd = (date.today() - timedelta(days=365)).isoformat()

            leads_q = f"""
                SELECT COUNT(Id) cnt FROM Lead
                WHERE {lf_lead}
                  AND CreatedDate >= {sd}T00:00:00Z
            """
            converted_q = f"""
                SELECT COUNT(Id) cnt FROM Lead
                WHERE {lf_lead} AND IsConverted = true
                  AND ConvertedDate >= {sd} AND ConvertedDate <= {ed}
            """
            invoiced_q = f"""
                SELECT COUNT(Id) cnt FROM Opportunity
                WHERE {lf_opp} AND StageName IN {INVOICED_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
            """
            lost_q = f"""
                SELECT COUNT(Id) cnt FROM Opportunity
                WHERE {lf_opp} AND StageName = 'Closed Lost'
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
            """
            sf_data = sf_parallel(leads=leads_q, converted=converted_q,
                                  invoiced=invoiced_q, lost=lost_q)

            try:
                pbi_day = pbi_by_day(line, sd, ed)
                won = sum(r.get('txns', 0) for r in pbi_day)
                won_rev = sum(r.get('sales', 0.0) for r in pbi_day)
            except Exception as e:
                log.error(f"Failed to fetch PBI day for funnel: {e}")
                won = 0
                won_rev = 0.0

            leads = sf_data["leads"][0].get("cnt", 0) if sf_data["leads"] else 0
            converted = sf_data["converted"][0].get("cnt", 0) if sf_data["converted"] else 0
            invoiced = sf_data["invoiced"][0].get("cnt", 0) if sf_data["invoiced"] else 0
            lost = sf_data["lost"][0].get("cnt", 0) if sf_data["lost"] else 0

            return {
                "leads": leads,
                "converted": converted,
                "conversion_rate": round(converted / leads * 100, 1) if leads else 0,
                "invoiced": invoiced,
                "won": won,
                "won_revenue": won_rev,
                "lost": lost,
                "win_rate": round(won / (won + lost) * 100, 1) if (won + lost) else 0,
                "line": line,
            }

        leads_q = f"""
            SELECT COUNT(Id) cnt FROM Lead
            WHERE {lf_lead}
              AND CreatedDate >= LAST_N_MONTHS:12
        """
        converted_q = f"""
            SELECT COUNT(Id) cnt FROM Lead
            WHERE {lf_lead} AND IsConverted = true
              AND ConvertedDate >= LAST_N_MONTHS:12
        """
        invoiced_q = f"""
            SELECT COUNT(Id) cnt FROM Opportunity
            WHERE {lf_opp} AND StageName IN {INVOICED_STAGES}
              AND CloseDate >= LAST_N_MONTHS:12 AND CloseDate <= TODAY
        """
        won_q = f"""
            SELECT COUNT(Id) cnt, SUM(Amount) rev FROM Opportunity
            WHERE {lf_opp} AND {WON_STAGES}
              AND CloseDate >= LAST_N_MONTHS:12 AND CloseDate <= TODAY
              AND Amount != null
        """
        lost_q = f"""
            SELECT COUNT(Id) cnt FROM Opportunity
            WHERE {lf_opp} AND StageName = 'Closed Lost'
              AND CloseDate >= LAST_N_MONTHS:12 AND CloseDate <= TODAY
        """

        from sf_client import sf_parallel
        data = sf_parallel(leads=leads_q, converted=converted_q,
                           invoiced=invoiced_q, won=won_q, lost=lost_q)

        leads = data["leads"][0].get("cnt", 0) if data["leads"] else 0
        converted = data["converted"][0].get("cnt", 0) if data["converted"] else 0
        invoiced = data["invoiced"][0].get("cnt", 0) if data["invoiced"] else 0
        won = data["won"][0].get("cnt", 0) if data["won"] else 0
        won_rev = data["won"][0].get("rev", 0) or 0 if data["won"] else 0
        lost = data["lost"][0].get("cnt", 0) if data["lost"] else 0

        return {
            "leads": leads,
            "converted": converted,
            "conversion_rate": round(converted / leads * 100, 1) if leads else 0,
            "invoiced": invoiced,
            "won": won,
            "won_revenue": won_rev,
            "lost": lost,
            "win_rate": round(won / (won + lost) * 100, 1) if (won + lost) else 0,
            "line": line,
        }

    return cache.cached_query(cache_key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


def fetch_general_metrics(line: str = "Travel") -> dict:
    """General sales metrics: deal count, avg size, recent top wins."""
    cache_key = f"ai:general_{line}"

    def fetch():
        lf = _line_filter(line)
        from shared import WON_STAGES

        if line in ('Travel', 'Insurance'):
            from datetime import date, timedelta
            from pbi_utils import pbi_by_day
            from sf_client import sf_parallel
            
            today = date.today()
            month_start = today.replace(day=1).isoformat()
            today_iso = today.isoformat()
            next_week = (today + timedelta(days=7)).isoformat()
            
            open_q = f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev, AVG(Amount) avg_amt
                FROM Opportunity
                WHERE IsClosed = false AND {lf}
                  AND Amount != null
                  AND CloseDate >= TODAY AND CloseDate <= NEXT_N_MONTHS:12
            """
            top_wins_q = f"""
                SELECT Name, Amount, CloseDate, OwnerId
                FROM Opportunity
                WHERE {lf} AND {WON_STAGES}
                  AND CloseDate >= LAST_N_MONTHS:3 AND CloseDate <= TODAY
                  AND Amount != null
                ORDER BY Amount DESC
                LIMIT 5
            """
            closing_q = f"""
                SELECT COUNT(Id) cnt, SUM(Amount) rev
                FROM Opportunity
                WHERE IsClosed = false AND {lf}
                  AND Amount != null
                  AND CloseDate >= TODAY AND CloseDate <= {next_week}
            """
            
            sf_data = sf_parallel(open_pipe=open_q, top_wins=top_wins_q, closing=closing_q)
            
            try:
                pbi_day = pbi_by_day(line, month_start, today_iso)
                won_this_month = sum(r.get('txns', 0) for r in pbi_day)
                won_this_month_rev = sum(r.get('sales', 0.0) for r in pbi_day)
            except Exception as e:
                log.error(f"Failed to fetch PBI day for general metrics: {e}")
                won_this_month = 0
                won_this_month_rev = 0.0
                
            from shared import get_owner_map
            owner_map = get_owner_map()
            
            open_d = sf_data["open_pipe"][0] if sf_data["open_pipe"] else {}
            closing_d = sf_data["closing"][0] if sf_data["closing"] else {}
            
            top_wins = []
            for r in sf_data.get("top_wins", []):
                name = owner_map.get(r.get("OwnerId"), "Unknown")
                top_wins.append({
                    "deal": r.get("Name"),
                    "amount": r.get("Amount") or 0,
                    "close_date": r.get("CloseDate"),
                    "advisor": name,
                })
                
            return {
                "open_deals": open_d.get("cnt", 0),
                "open_pipeline_value": open_d.get("rev", 0) or 0,
                "avg_deal_size": round(open_d.get("avg_amt", 0) or 0, 2),
                "won_this_month": won_this_month,
                "won_this_month_rev": won_this_month_rev,
                "closing_this_week": closing_d.get("cnt", 0),
                "closing_this_week_value": closing_d.get("rev", 0) or 0,
                "top_recent_wins": top_wins,
                "line": line,
            }

        open_q = f"""
            SELECT COUNT(Id) cnt, SUM(Amount) rev, AVG(Amount) avg_amt
            FROM Opportunity
            WHERE IsClosed = false AND {lf}
              AND Amount != null
              AND CloseDate >= TODAY AND CloseDate <= NEXT_N_MONTHS:12
        """
        won_month_q = f"""
            SELECT COUNT(Id) cnt, SUM(Amount) rev
            FROM Opportunity
            WHERE {lf} AND {WON_STAGES}
              AND CloseDate >= THIS_MONTH AND CloseDate <= TODAY
              AND Amount != null
        """
        top_wins_q = f"""
            SELECT Name, Amount, CloseDate, OwnerId
            FROM Opportunity
            WHERE {lf} AND {WON_STAGES}
              AND CloseDate >= LAST_N_MONTHS:3 AND CloseDate <= TODAY
              AND Amount != null
            ORDER BY Amount DESC
            LIMIT 5
        """
        closing_q = f"""
            SELECT COUNT(Id) cnt, SUM(Amount) rev
            FROM Opportunity
            WHERE IsClosed = false AND {lf}
              AND Amount != null
              AND CloseDate >= TODAY AND CloseDate <= NEXT_N_DAYS:7
        """

        from sf_client import sf_parallel
        data = sf_parallel(open_pipe=open_q, won_month=won_month_q,
                           top_wins=top_wins_q, closing=closing_q)

        from shared import get_owner_map
        owner_map = get_owner_map()

        open_d = data["open_pipe"][0] if data["open_pipe"] else {}
        won_m = data["won_month"][0] if data["won_month"] else {}
        closing_d = data["closing"][0] if data["closing"] else {}

        top_wins = []
        for r in data.get("top_wins", []):
            name = owner_map.get(r.get("OwnerId"), "Unknown")
            top_wins.append({
                "deal": r.get("Name"),
                "amount": r.get("Amount") or 0,
                "close_date": r.get("CloseDate"),
                "advisor": name,
            })

        return {
            "open_deals": open_d.get("cnt", 0),
            "open_pipeline_value": open_d.get("rev", 0) or 0,
            "avg_deal_size": round(open_d.get("avg_amt", 0) or 0, 2),
            "won_this_month": won_m.get("cnt", 0),
            "won_this_month_rev": won_m.get("rev", 0) or 0,
            "closing_this_week": closing_d.get("cnt", 0),
            "closing_this_week_value": closing_d.get("rev", 0) or 0,
            "top_recent_wins": top_wins,
            "line": line,
        }

    return cache.cached_query(cache_key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


def fetch_industry_data(line: str = "Travel") -> dict:
    """Win/loss counts by Account.Industry (post-processed, no SUM(IF))."""
    cache_key = f"ai:industry_{line}"

    def fetch():
        lf = _line_filter(line)
        from shared import WON_STAGES
        won_q = f"""
            SELECT Account.Industry ind, COUNT(Id) cnt, SUM(Amount) rev
            FROM Opportunity
            WHERE {lf} AND {WON_STAGES}
              AND CloseDate >= LAST_N_MONTHS:12 AND CloseDate <= TODAY
              AND Amount != null AND Account.Industry != null
            GROUP BY Account.Industry
            ORDER BY SUM(Amount) DESC
        """
        lost_q = f"""
            SELECT Account.Industry ind, COUNT(Id) cnt
            FROM Opportunity
            WHERE {lf} AND StageName = 'Closed Lost'
              AND CloseDate >= LAST_N_MONTHS:12 AND CloseDate <= TODAY
              AND Account.Industry != null
            GROUP BY Account.Industry
            ORDER BY COUNT(Id) DESC
        """
        from sf_client import sf_parallel
        data = sf_parallel(won=won_q, lost=lost_q)

        won_map = {r.get("ind", "Unknown"): r for r in data.get("won", [])}
        lost_map = {r.get("ind", "Unknown"): r for r in data.get("lost", [])}
        all_industries = set(won_map.keys()) | set(lost_map.keys())

        industries = []
        for ind in all_industries:
            w = won_map.get(ind, {})
            l = lost_map.get(ind, {})
            won_cnt = w.get("cnt", 0)
            lost_cnt = l.get("cnt", 0)
            total = won_cnt + lost_cnt
            industries.append({
                "industry": ind,
                "won": won_cnt,
                "lost": lost_cnt,
                "total": total,
                "revenue": w.get("rev", 0) or 0,
                "win_rate": round(won_cnt / total * 100, 1) if total else 0,
            })
        industries.sort(key=lambda x: x["revenue"], reverse=True)
        return {"industries": industries[:15], "line": line}

    return cache.cached_query(cache_key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


def fetch_territory_intelligence(line: str = "Travel") -> dict:
    """Territory/census intelligence: members, penetration, demographics, growth opportunities."""
    cache_key = f"ai:territory_{line}"

    def fetch():
        from routers.territory_map import territory_map_data
        from shared import resolve_dates
        sd, ed = resolve_dates(None, None, 12)
        raw = territory_map_data(period=12, start_date=sd, end_date=ed)

        zips = raw.get("zips", [])
        totals = raw.get("totals", {})
        regions = raw.get("regions", {})

        region_list = []
        for name, r in regions.items():
            mem = r.get("members", 0)
            pop = r.get("population", 1) or 1
            region_list.append({
                "region": name, "mbr": mem, "pop": pop,
                "mkt%": round(mem / pop * 100, 1),
                "ins": r.get("ins_cy", 0), "trv": r.get("travel_3yr", 0),
                "i_rev": round(r.get("ins_rev_cy", 0)), "t_rev": round(r.get("travel_rev_cy", 0)),
            })
        region_list.sort(key=lambda x: x["mbr"], reverse=True)

        from collections import defaultdict
        city_agg = defaultdict(lambda: {
            "members": 0, "ins_customers": 0, "travel_customers_3yr": 0,
            "population": 0, "ins_rev_cy": 0, "travel_rev_cy": 0,
            "median_income": 0, "_pop_w_income": 0, "region": "",
        })
        for z in zips:
            city = z.get("city") or "Unknown"
            c = city_agg[city]
            c["members"] += z.get("members", 0)
            c["ins_customers"] += z.get("ins_customers_cy", 0)
            c["travel_customers_3yr"] += z.get("travel_customers_3yr", 0)
            c["population"] += z.get("population", 0)
            c["ins_rev_cy"] += z.get("ins_rev_cy", 0)
            c["travel_rev_cy"] += z.get("travel_rev_cy", 0)
            pop = z.get("population", 0) or 0
            c["_pop_w_income"] += (z.get("median_income", 0) or 0) * pop
            if not c["region"]:
                c["region"] = z.get("region", "")

        cities = []
        for name, c in city_agg.items():
            pop = c["population"] or 1
            mem = c["members"]
            if mem < 50:
                continue
            cities.append({
                "city": name,
                "rgn": c["region"][:1],
                "mbr": mem,
                "pop": c["population"],
                "mkt%": round(mem / pop * 100, 1),
                "ins": c["ins_customers"],
                "ins%": round(c["ins_customers"] / mem * 100, 1) if mem else 0,
                "trv": c["travel_customers_3yr"],
                "trv%": round(c["travel_customers_3yr"] / mem * 100, 1) if mem else 0,
                "i_rev": round(c["ins_rev_cy"]),
                "t_rev": round(c["travel_rev_cy"]),
                "inc": round(c["_pop_w_income"] / pop) if pop else 0,
            })

        cities.sort(key=lambda x: x["mbr"], reverse=True)

        return {
            "_legend": "rgn=region(W=Western,R=Rochester,C=Central) mbr=members pop=population mkt%=market_share ins=ins_customers ins%=ins_penetration trv=travel_customers trv%=travel_penetration i_rev=ins_revenue t_rev=travel_revenue inc=median_income",
            "totals": {
                "mbr": totals.get("members", 0),
                "ins": totals.get("ins_customers", 0),
                "trv": totals.get("travel_customers_3yr", 0),
                "pop": totals.get("population", 0),
                "mkt%": totals.get("market_share", 0),
                "zips": totals.get("zip_count", 0),
            },
            "regions": region_list,
            "cities": cities[:30],
        }

    return cache.cached_query(cache_key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)


INTENT_DATA_FETCHERS = {
    "pipeline_health": lambda line: fetch_pipeline_health(line),
    "at_risk": lambda line: fetch_at_risk_deals(line),
    "advisor_performance": lambda line: fetch_advisor_rankings(line),
    "revenue": lambda line: fetch_revenue_trends(line),
    "forecasting": lambda line: fetch_forecasting_data(line),
    "win_rate": lambda line: fetch_win_rate_data(line),
    "funnel": lambda line: fetch_funnel_data(line),
    "general": lambda line: fetch_general_metrics(line),
    "industry": lambda line: fetch_industry_data(line),
    "territory": lambda line: fetch_territory_intelligence(line),
}
