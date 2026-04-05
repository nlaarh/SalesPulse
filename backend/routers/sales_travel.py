"""Travel & Destination Analytics — destination revenue, seasonal, party size."""

import logging
from datetime import date
from typing import Optional
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Query
from sf_client import sf_query_all, sf_parallel
import cache
from shared import WON_STAGES, resolve_dates as _resolve_dates, OPP_RT_TRAVEL_ID

router = APIRouter()
log = logging.getLogger('sales.travel')


def _prev_dates(sd: str, ed: str):
    """Compute prior-period comparison dates (same duration, shifted back)."""
    start = date.fromisoformat(sd)
    end   = date.fromisoformat(ed)
    delta = relativedelta(end, start)
    prev_end   = start - relativedelta(days=1)
    prev_start = prev_end - delta
    return prev_start.isoformat(), prev_end.isoformat()


@router.get("/api/sales/travel/destinations")
def travel_destinations(
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Top destinations by revenue and volume."""
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"travel_destinations_{sd}_{ed}"

    def fetch():
        psd, ped = _prev_dates(sd, ed)
        data = sf_parallel(
            current=f"""
                SELECT Destination_Region__c dest, COUNT(Id) cnt, SUM(Amount) rev
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}' AND {WON_STAGES}
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                  AND Destination_Region__c != null AND Amount != null
                GROUP BY Destination_Region__c
                ORDER BY SUM(Amount) DESC
            """,
            previous=f"""
                SELECT Destination_Region__c dest, COUNT(Id) cnt, SUM(Amount) rev
                FROM Opportunity
                WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}' AND {WON_STAGES}
                  AND CloseDate >= {psd} AND CloseDate <= {ped}
                  AND Destination_Region__c != null AND Amount != null
                GROUP BY Destination_Region__c
            """,
        )

        prev_map = {r['dest']: r for r in data['previous']}
        destinations = []
        for r in data['current']:
            dest = r['dest']
            rev = r.get('rev', 0) or 0
            cnt = r.get('cnt', 0) or 0
            prev = prev_map.get(dest, {})
            prev_rev = prev.get('rev', 0) or 0
            yoy = round((rev - prev_rev) / prev_rev * 100, 1) if prev_rev > 0 else None
            avg_booking = round(rev / cnt, 0) if cnt > 0 else 0

            destinations.append({
                "destination": dest,
                "revenue": rev,
                "volume": cnt,
                "avg_booking": avg_booking,
                "yoy_growth_pct": yoy,
                "prev_revenue": prev_rev,
            })

        return {"destinations": destinations, "period": period}

    return cache.cached_query(key, fetch, ttl=3600, disk_ttl=86400)


@router.get("/api/sales/travel/seasonal")
def travel_seasonal(
    period: int = 24,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Monthly revenue by destination — for seasonal heatmap."""
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"travel_seasonal_{sd}_{ed}"

    def fetch():
        records = sf_query_all(f"""
            SELECT CALENDAR_YEAR(CloseDate) yr, CALENDAR_MONTH(CloseDate) mo,
                   Destination_Region__c dest, COUNT(Id) cnt, SUM(Amount) rev
            FROM Opportunity
            WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}' AND {WON_STAGES}
              AND CloseDate >= {sd} AND CloseDate <= {ed}
              AND Destination_Region__c != null AND Amount != null
            GROUP BY CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate), Destination_Region__c
            ORDER BY CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate)
        """)
        points = []
        for r in records:
            points.append({
                "year": r.get('yr'),
                "month": r.get('mo'),
                "destination": r.get('dest'),
                "revenue": r.get('rev', 0) or 0,
                "volume": r.get('cnt', 0) or 0,
            })
        return {"data": points, "period": period}

    return cache.cached_query(key, fetch, ttl=3600, disk_ttl=86400)


@router.get("/api/sales/travel/party-size")
def travel_party_size(
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Party size distribution for Travel bookings."""
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"travel_party_size_{sd}_{ed}"

    def fetch():
        records = sf_query_all(f"""
            SELECT Number_Traveling__c size, COUNT(Id) cnt, SUM(Amount) rev, AVG(Amount) avg_rev
            FROM Opportunity
            WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}' AND {WON_STAGES}
              AND CloseDate >= {sd} AND CloseDate <= {ed}
              AND Number_Traveling__c != null AND Amount != null
            GROUP BY Number_Traveling__c
            ORDER BY Number_Traveling__c
        """)
        sizes = []
        for r in records:
            sizes.append({
                "party_size": r.get('size'),
                "count": r.get('cnt', 0) or 0,
                "revenue": r.get('rev', 0) or 0,
                "avg_revenue": round(r.get('avg_rev', 0) or 0, 0),
            })
        return {"sizes": sizes, "period": period}

    return cache.cached_query(key, fetch, ttl=3600, disk_ttl=86400)


@router.get("/api/sales/travel/destination-trend")
def destination_trend(
    dest: str = "Caribbean",
    period: int = 24,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Monthly trend for a single destination."""
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"travel_dest_trend_{dest}_{sd}_{ed}"

    def fetch():
        records = sf_query_all(f"""
            SELECT CALENDAR_YEAR(CloseDate) yr, CALENDAR_MONTH(CloseDate) mo,
                   COUNT(Id) cnt, SUM(Amount) rev
            FROM Opportunity
            WHERE RecordTypeId = '{OPP_RT_TRAVEL_ID}' AND {WON_STAGES}
              AND Destination_Region__c = '{dest}'
              AND CloseDate >= {sd} AND CloseDate <= {ed}
              AND Amount != null
            GROUP BY CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate)
            ORDER BY CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate)
        """)
        months = []
        for r in records:
            months.append({
                "label": f"{r.get('yr')}-{str(r.get('mo', 0)).zfill(2)}",
                "revenue": r.get('rev', 0) or 0,
                "volume": r.get('cnt', 0) or 0,
            })
        return {"destination": dest, "months": months, "period": period}

    return cache.cached_query(key, fetch, ttl=3600, disk_ttl=86400)
