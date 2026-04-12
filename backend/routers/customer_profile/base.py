from fastapi import APIRouter, Depends, Query
from typing import Optional
import logging
import cache
from auth import get_current_user
from models import User
from sf_client import sf_query_all, sf_sosl
from shared import VALID_LINES, line_filter_opp as _line_filter, resolve_dates as _resolve_dates
from constants import CACHE_TTL_HOUR
from .utils import _fmt_summary

router = APIRouter()
log = logging.getLogger('salesinsight.customer')

# ── Top Customers by Revenue ─────────────────────────────────────────────────

@router.get('/api/customers/top-revenue')
def get_top_customers(
    line: str = Query('Travel'),
    limit: int = Query(25, ge=10, le=100),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    _user: User = Depends(get_current_user),
):
    """Top N customers by closed-won revenue. Uses Opportunity aggregation — no Account table scan."""
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, 12)
    key = f"top_customers_{line}_{limit}_{sd}_{ed}"

    def fetch():
        lf = _line_filter(line)
        # Step 1: aggregate by AccountId only (Account.Name can't be used in GROUP BY)
        agg_rows = sf_query_all(f"""
            SELECT AccountId,
                   COUNT(Id) deal_count,
                   SUM(Amount) total_rev,
                   AVG(Amount) avg_deal
            FROM Opportunity
            WHERE StageName IN ('Closed Won','Invoice')
              AND CloseDate >= {sd} AND CloseDate <= {ed}
              AND Amount != null
              AND {lf}
            GROUP BY AccountId
            ORDER BY SUM(Amount) DESC
            LIMIT {limit}
        """)
        if not agg_rows:
            return []

        # Step 2: fetch names for top AccountIds
        ids_csv = ','.join(f"'{r['AccountId']}'" for r in agg_rows if r.get('AccountId'))
        name_map: dict = {}
        advisor_map: dict = {}
        if ids_csv:
            name_rows = sf_query_all(f"""
                SELECT Id, Name FROM Account WHERE Id IN ({ids_csv})
            """)
            name_map = {r['Id']: r.get('Name', '') for r in name_rows}

            # Step 3: fetch primary advisor (most deals) per account
            adv_rows = sf_query_all(f"""
                SELECT AccountId, Owner.Name, COUNT(Id) cnt
                FROM Opportunity
                WHERE AccountId IN ({ids_csv})
                  AND StageName IN ('Closed Won','Invoice')
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                  AND Amount != null AND {lf}
                GROUP BY AccountId, Owner.Name
                ORDER BY AccountId, COUNT(Id) DESC
            """)
            for ar in adv_rows:
                aid = ar.get('AccountId', '')
                if aid not in advisor_map:
                    advisor_map[aid] = ar.get('Name', '')

        result = []
        for r in agg_rows:
            aid = r.get('AccountId', '')
            result.append({
                'account_id': aid,
                'name': name_map.get(aid, aid),
                'total_rev': float(r.get('total_rev') or 0),
                'deal_count': int(r.get('deal_count') or 0),
                'avg_deal': float(r.get('avg_deal') or 0),
                'advisor': advisor_map.get(aid, ''),
            })
        return result

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=21600)



# ── Search ──────────────────────────────────────────────────────────────────

@router.get('/api/customers/search')
def search_customers(
    q: str = Query(..., min_length=2),
    _user: User = Depends(get_current_user),
):
    """Search customers by name, member ID, or email using SOSL full-text search."""
    safe = q.replace('"', '').replace("'", '').replace('\\', '').strip()
    try:
        # Use SOSL for name search (works on encrypted Name fields)
        sosl = (
            f"FIND {{{safe}}} IN ALL FIELDS "
            f"RETURNING Account("
            f"Id, Name, PersonEmail, Account_Member_ID__c, Member_Status__c, "
            f"Account_Member_Since__c, ImportantActiveMemCoverage__c, "
            f"Region__c, MPI__c, BillingCity, BillingState "
            f"WHERE RecordType.Name = 'Person Account') "
            f"LIMIT 20"
        )
        records = sf_sosl(sosl)
        return {'results': [_fmt_summary(r) for r in records]}
    except Exception as e:
        log.error(f'Customer search error: {e}')
        return {'results': []}


