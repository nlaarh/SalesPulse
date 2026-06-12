"""Membership snapshot endpoint — active count + YTD new/renew/cancel + monthly breakdown."""

from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import cache
from auth import get_current_user
from database import get_db
from models import User
from pbi_client import dax_query, PBI_WS

router = APIRouter()

MEMBERSHIP_DS = "d7cdf3bc-dcf4-48ed-b4bb-200563dcfd7f"


def _fetch_membership_snapshot() -> dict:
    today = date.today()
    year = today.year
    jan1 = f"DATE({year}, 1, 1)"
    today_dax = f"DATE({today.year}, {today.month}, {today.day})"
    prior_jan1 = f"DATE({year - 1}, 1, 1)"
    prior_today = f"DATE({today.year - 1}, {today.month}, {today.day})"

    # Active members (current snapshot from membership_consolidated)
    active_rows = dax_query(PBI_WS, MEMBERSHIP_DS, """
EVALUATE
ROW(
    "active", CALCULATE(COUNTROWS(membership_consolidated), membership_consolidated[membership_status_code] IN {"A", "L", "B", "C", "P", "T"})
)
""")
    active = int(active_rows[0].get("[active]") or 0) if active_rows else 0

    # YTD totals helper
    def _ytd_txn(from_dax: str, to_dax: str) -> dict:
        rows = dax_query(PBI_WS, MEMBERSHIP_DS, f"""
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        membership_transactions[transaction_code],
        "Count", COUNTROWS(membership_transactions)
    ),
    FILTER(
        ALL(membership_transactions),
        membership_transactions[business_date] >= {from_dax}
        && membership_transactions[business_date] <= {to_dax}
    )
)
""")
        # Accumulate by category — include all known cancel variants
        new_codes    = {"ADD"}
        renew_codes  = {"PAY"}
        cancel_codes = {"CAN", "CANC", "CXL", "LPS"}
        totals = {"ADD": 0, "PAY": 0, "CAN": 0}
        for r in rows:
            code = (r.get("membership_transactions[transaction_code]") or "").strip().upper()
            cnt  = int(r.get("[Count]") or 0)
            if code in new_codes:
                totals["ADD"] += cnt
            elif code in renew_codes:
                totals["PAY"] += cnt
            elif code in cancel_codes:
                totals["CAN"] += cnt
        return totals

    curr = _ytd_txn(jan1, today_dax)
    prior = _ytd_txn(prior_jan1, prior_today)

    # Renewal rate = PAY / (PAY + ADD + CAN) — MCR transactions only, no Epic/consolidated
    total_txn = curr["PAY"] + curr["ADD"] + curr["CAN"]
    renewal_rate = round(curr["PAY"] / total_txn, 4) if total_txn > 0 else None

    prior_total = prior["PAY"] + prior["ADD"] + prior["CAN"]
    prior_renewal_rate = round(prior["PAY"] / prior_total, 4) if prior_total > 0 else None

    # Monthly breakdown for current year — group by fiscal_period (native to transactions table)
    # Calendar Table join fails in SUMMARIZECOLUMNS context; fiscal_period 'JAN26' is reliable
    MONTH_MAP = {'JAN':1,'FEB':2,'MAR':3,'APR':4,'MAY':5,'JUN':6,
                 'JUL':7,'AUG':8,'SEP':9,'OCT':10,'NOV':11,'DEC':12}
    MONTH_NAMES = {1:'Jan',2:'Feb',3:'Mar',4:'Apr',5:'May',6:'Jun',
                   7:'Jul',8:'Aug',9:'Sep',10:'Oct',11:'Nov',12:'Dec'}

    monthly_rows = dax_query(PBI_WS, MEMBERSHIP_DS, f"""
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        membership_transactions[transaction_code],
        membership_transactions[fiscal_period],
        "Count", COUNTROWS(membership_transactions)
    ),
    FILTER(
        ALL(membership_transactions),
        membership_transactions[business_date] >= DATE({year}, 1, 1)
        && membership_transactions[business_date] <= DATE({today.year}, {today.month}, {today.day})
    )
)
ORDER BY membership_transactions[fiscal_period] ASC
""")

    # Pivot: fiscal_period 'JAN26' -> month_no 1, month 'Jan'
    # Only capture ADD/PAY from transactions — attrition comes from consolidated below
    monthly_map: dict[int, dict] = {}
    for r in monthly_rows:
        fp = (r.get("membership_transactions[fiscal_period]") or "").strip().upper()
        if not fp or len(fp) < 3:
            continue
        mo = MONTH_MAP.get(fp[:3], 0)
        if mo == 0:
            continue
        mn = MONTH_NAMES[mo]
        code = r.get("membership_transactions[transaction_code]", "")
        count = int(r.get("[Count]") or 0)
        if mo not in monthly_map:
            monthly_map[mo] = {"month_no": mo, "month": mn, "new": 0, "renew": 0, "cancel": 0}
        if code == "ADD":
            monthly_map[mo]["new"] += count
        elif code == "PAY":
            monthly_map[mo]["renew"] += count
        # CAN from transactions is only ~2.7K — real attrition loaded from consolidated below

    # Monthly attrition from membership_consolidated (all real cancels + lapses, excl AXIS artifact)
    monthly_cancel_rows = dax_query(PBI_WS, MEMBERSHIP_DS, f"""
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        membership_consolidated[membership_cancelled_reason_desc],
        membership_consolidated[membership_cancelled_date],
        "Count", COUNTROWS(membership_consolidated)
    ),
    FILTER(
        ALL(membership_consolidated),
        membership_consolidated[membership_cancelled_date] >= DATE({year}, 1, 1)
        && membership_consolidated[membership_cancelled_date] <= DATE({today.year}, {today.month}, {today.day})
    )
)
""")

    _LEGACY_ARTIFACT = "CANCEL LEGACY AXIS SUSPENDS CANCELLING PRE-SALESFORCE"
    for r in monthly_cancel_rows:
        reason = (r.get("membership_consolidated[membership_cancelled_reason_desc]") or "").strip()
        if reason == _LEGACY_ARTIFACT:
            continue
        date_str = r.get("membership_consolidated[membership_cancelled_date]") or ""
        cnt = int(r.get("[Count]") or 0)
        if not date_str or not cnt:
            continue
        try:
            mo = int(date_str[5:7])  # "2026-01-15T00:00:00" → 1
        except (ValueError, IndexError):
            continue
        mn = MONTH_NAMES.get(mo, "")
        if not mn:
            continue
        if mo not in monthly_map:
            monthly_map[mo] = {"month_no": mo, "month": mn, "new": 0, "renew": 0, "cancel": 0}
        monthly_map[mo]["cancel"] += cnt

    monthly = sorted(monthly_map.values(), key=lambda x: x["month_no"])

    # True attrition from membership_consolidated (cancelled_date YTD)
    # Exclude legacy AXIS migration artifact — those are system cleanup, not real 2026 attrition
    attrition_rows = dax_query(PBI_WS, MEMBERSHIP_DS, f"""
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        membership_consolidated[membership_cancelled_reason_desc],
        "Count", COUNTROWS(membership_consolidated)
    ),
    membership_consolidated[membership_cancelled_date] >= DATE({year}, 1, 1)
    && membership_consolidated[membership_cancelled_date] <= DATE({today.year}, {today.month}, {today.day})
)
ORDER BY [Count] DESC
""")

    _LEGACY_ARTIFACT = "CANCEL LEGACY AXIS SUSPENDS CANCELLING PRE-SALESFORCE"
    ytd_lapsed   = 0  # non-renewal (90-day past due)
    ytd_explicit = 0  # voluntary / involuntary cancels (real)
    for r in attrition_rows:
        reason = (r.get("membership_consolidated[membership_cancelled_reason_desc]") or "").strip()
        cnt    = int(r.get("[Count]") or 0)
        if reason == _LEGACY_ARTIFACT:
            continue  # system migration artifact — not real attrition
        if "90 DAY PAST DUE" in reason.upper():
            ytd_lapsed += cnt
        else:
            ytd_explicit += cnt

    return {
        "active_members": active,
        "year": year,
        "ytd_new": curr["ADD"],
        "ytd_renew": curr["PAY"],
        "ytd_cancel": curr["CAN"],          # explicit CAN transactions
        "ytd_lapsed": ytd_lapsed,           # non-renewals (90-day past due)
        "ytd_explicit_cancel": ytd_explicit, # voluntary/involuntary real cancels
        "prior_ytd_new": prior["ADD"],
        "prior_ytd_renew": prior["PAY"],
        "prior_ytd_cancel": prior["CAN"],
        "renewal_rate": renewal_rate,
        "prior_renewal_rate": prior_renewal_rate,
        "monthly": monthly,
    }


def get_membership_snapshot() -> dict:
    return cache.cached_query(
        "membership_snapshot_v6",
        _fetch_membership_snapshot,
        ttl=3600,
        disk_ttl=86400,
    )


@router.get("/api/membership/snapshot")
def membership_snapshot(_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_membership_snapshot()


@router.get("/api/membership/probe-codes")
def membership_probe_codes(_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Enumerate all transaction_code and membership_sales_source_desc values — for validation only."""
    today = date.today()
    year = today.year

    codes = dax_query(PBI_WS, MEMBERSHIP_DS, f"""
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        membership_transactions[transaction_code],
        "Count", COUNTROWS(membership_transactions)
    ),
    FILTER(ALL(membership_transactions),
        membership_transactions[business_date] >= DATE({year}, 1, 1)
        && membership_transactions[business_date] <= DATE({today.year}, {today.month}, {today.day}))
)
ORDER BY [Count] DESC
""")

    channels = dax_query(PBI_WS, MEMBERSHIP_DS, f"""
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        membership_transactions[membership_sales_source_desc],
        "Count", COUNTROWS(membership_transactions)
    ),
    FILTER(ALL(membership_transactions),
        membership_transactions[business_date] >= DATE({year}, 1, 1)
        && membership_transactions[business_date] <= DATE({today.year}, {today.month}, {today.day}))
)
ORDER BY [Count] DESC
""")

    return {
        "transaction_codes": [
            {"code": r.get("membership_transactions[transaction_code]"), "count": int(r.get("[Count]") or 0)}
            for r in codes
        ],
        "channels": [
            {"channel": r.get("membership_transactions[membership_sales_source_desc]"), "count": int(r.get("[Count]") or 0)}
            for r in channels
        ],
    }
