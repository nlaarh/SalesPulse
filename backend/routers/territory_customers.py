"""Territory Zip Customer Drill-down — per-zip insurance/travel customer lists."""

from typing import Optional

from fastapi import APIRouter, Query

from shared import resolve_dates as _resolve_dates
from constants import CACHE_TTL_HOUR, CACHE_TTL_DAY
from sf_client import sf_instance_url
import cache

router = APIRouter()


@router.get("/api/territory/zip-customers")
def zip_customers(
    zip_code: str = Query(..., min_length=5, max_length=5),
    type: str = Query("insurance", regex="^(insurance|travel)$"),
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Return customer list for a specific zip code — insurance or travel.

    Insurance: Active members with Insurance Customer ID in that zip.
    Travel: Accounts with won travel opportunities in the date range.
    """
    from sf_client import sf_query_all

    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"zip_customers_{zip_code}_{type}_{sd}_{ed}"

    def fetch():
        if type == "insurance":
            records = sf_query_all(f"""
                SELECT Id, Name, PersonEmail, Phone,
                       Account_Member_ID__c, Member_Status__c,
                       ImportantActiveMemCoverage__c,
                       Insuance_Customer_ID__c,
                       BillingCity, BillingState
                FROM Account
                WHERE BillingPostalCode LIKE '{zip_code}%'
                  AND IsPersonAccount = true
                  AND Member_Status__c = 'A'
                  AND Insuance_Customer_ID__c != null
                LIMIT 200
            """)
            customers = [{
                'id': r.get('Id'),
                'name': r.get('Name', ''),
                'email': r.get('PersonEmail', ''),
                'phone': r.get('Phone', ''),
                'member_id': r.get('Account_Member_ID__c', ''),
                'status': r.get('Member_Status__c', ''),
                'plan': r.get('ImportantActiveMemCoverage__c', ''),
                'insurance_id': r.get('Insuance_Customer_ID__c', ''),
                'city': r.get('BillingCity', ''),
            } for r in records]

        else:  # travel
            # Two-step: get opp aggregates by AccountId, then fetch account details
            opp_records = sf_query_all(f"""
                SELECT AccountId, SUM(Amount) total_rev,
                       COUNT(Id) trip_count, MAX(CloseDate) last_trip
                FROM Opportunity
                WHERE Account.BillingPostalCode LIKE '{zip_code}%'
                  AND StageName IN ('Closed Won','Invoice')
                  AND CloseDate >= {sd} AND CloseDate <= {ed}
                  AND RecordType.Name = 'Travel'
                  AND Amount != null
                GROUP BY AccountId
                ORDER BY SUM(Amount) DESC
                LIMIT 200
            """)

            if not opp_records:
                return {'zip_code': zip_code, 'type': type, 'count': 0, 'customers': []}

            # Build lookup of revenue data
            rev_by_acct = {}
            acct_ids = []
            for r in opp_records:
                aid = r.get('AccountId')
                if aid:
                    rev_by_acct[aid] = {
                        'total_rev': r.get('total_rev', 0) or 0,
                        'trip_count': r.get('trip_count', 0) or 0,
                        'last_trip': r.get('last_trip', ''),
                    }
                    acct_ids.append(f"'{aid}'")

            # Fetch account details in batch
            ids_str = ','.join(acct_ids[:200])
            acct_records = sf_query_all(f"""
                SELECT Id, Name, PersonEmail, Phone,
                       Account_Member_ID__c, Member_Status__c,
                       ImportantActiveMemCoverage__c, BillingCity
                FROM Account
                WHERE Id IN ({ids_str})
            """)

            customers = []
            for a in acct_records:
                aid = a.get('Id')
                rev = rev_by_acct.get(aid, {})
                customers.append({
                    'id': aid,
                    'name': a.get('Name', ''),
                    'email': a.get('PersonEmail', ''),
                    'phone': a.get('Phone', ''),
                    'member_id': a.get('Account_Member_ID__c', ''),
                    'status': a.get('Member_Status__c', ''),
                    'plan': a.get('ImportantActiveMemCoverage__c', ''),
                    'total_rev': rev.get('total_rev', 0),
                    'trip_count': rev.get('trip_count', 0),
                    'last_trip': rev.get('last_trip', ''),
                    'city': a.get('BillingCity', ''),
                })
            # Sort by revenue desc
            customers.sort(key=lambda c: c.get('total_rev', 0), reverse=True)

        return {
            'zip_code': zip_code,
            'type': type,
            'count': len(customers),
            'customers': customers,
            'sf_base_url': sf_instance_url(),
        }

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_HOUR, disk_ttl=CACHE_TTL_DAY)
