"""Membership performance endpoints — channel breakdown + agent rankings."""

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

# Codes that mean "acquisition" vs "renewal" vs "cancellation"
# CAN is the primary cancel code; include all known variants defensively
_NEW_CODES    = {"ADD"}
_RENEW_CODES  = {"PAY"}
_CANCEL_CODES = {"CAN", "CANC", "CXL", "LPS"}  # lapse counts as a lost member

# Batch processors / internet channels to exclude from AGENT rankings
_EXCLUDE_AGENTS = {
    "INTERNET", "INTERNET2", "BATCH", "AUTO RENEW", "AUTORENEW",
    "ONLINE", "AAA.COM", "E-COMMERCE", "ECOMMERCE",
}
_EXCLUDE_BRANCH_FRAGMENTS = ["AUTO RENEWAL", "AAA.COM", "56 - AAA.COM"]
_BATCH_THRESHOLD = 5000  # agents processing >5K transactions are automated

# Map raw membership_sales_source_desc → clean channel category.
# Prefix rules checked first (order matters — longer prefixes first within each group).
# Contains rules are checked only after all prefix rules fail.
_CHANNEL_PREFIXES: list[tuple[str, str]] = [
    # Digital / Online
    ("INTERNET",        "Digital / Online"),
    ("WEBADDFREE",      "Digital / Online"),
    ("ONLINE",          "Digital / Online"),
    ("HALF_ONLINE",     "Digital / Online"),
    ("DIGITAL",         "Digital / Online"),
    ("AAA.COM",         "Digital / Online"),
    ("WUNDERKIND",      "Digital / Online"),   # Wunderkind = digital marketing platform
    ("NOJOKE",          "Digital / Online"),   # e.g. NOJOKE24 ONLINE MEMBERSHIP OFFER
    # Call Center
    ("MBR CONTACT CTR", "Call Center"),
    ("CALL CENTER",     "Call Center"),
    ("CONTACT CTR",     "Call Center"),
    ("TELESALES",       "Call Center"),
    ("TELE SALES",      "Call Center"),
    # Auto Renewal (system/batch)
    ("AUTO RENEW",      "Auto Renewal"),
    ("AUTORENEW",       "Auto Renewal"),
    ("AUTO-RENEW",      "Auto Renewal"),
    ("EFT",             "Auto Renewal"),
    ("PS2021",          "Auto Renewal"),       # PS2021 AB TEST CHARGE ENT FEE — batch entrance-fee reprocessing
    # ERS / Emergency Conversion
    ("ERS CALL",        "ERS Conversion"),
    ("ERS",             "ERS Conversion"),
    ("SAME DAY",        "ERS Conversion"),
    ("IMMEDIATE",       "ERS Conversion"),
    # Direct Mail (explicit prefix)
    ("DIRECT MAIL",     "Direct Mail"),
    ("DIRECTMAIL",      "Direct Mail"),
    # Reinstatement
    ("REINSTATE",       "Reinstatement"),
    ("SALVAGE BILLING", "Reinstatement"),
    ("UPAT",            "Reinstatement"),       # UPAT = update at account (lapsed reinstate)
    # Win-back / Salvage campaigns  (WINA*, WIN0*, WINQ*, SAVE_, LUCKY_)
    ("WINA",            "Win-back Campaign"),
    ("WINQ",            "Win-back Campaign"),
    ("WINC",            "Win-back Campaign"),
    ("WIN0",            "Win-back Campaign"),
    ("WINBACK",         "Win-back Campaign"),
    ("SAVE_",           "Win-back Campaign"),
    ("LUCKY_",          "Win-back Campaign"),
    # Associate Add-on
    ("ASSOCIATE",       "Associate Add-on"),
    # Transfer from another club
    ("TRANSFER",        "Transfer"),
    # Gift membership
    ("GIFT",            "Gift Membership"),
    # Upgrade / Upsell
    ("ONGOING",         "Upgrade / Upsell"),
    # Travel cross-sell
    ("TRAVEL",          "Travel Cross-sell"),
    # Partnership (T-Mobile, Military, etc.)
    ("QUALIFIED NEW",   "Partnership"),
    ("MILITARY",        "Partnership"),
    # Walk-in / Branch
    ("WALKIN",          "Branch / Walk-in"),
    ("WALK IN",         "Branch / Walk-in"),
    ("OFFICE",          "Branch / Walk-in"),
]

# Substring rules — applied only if no prefix matched
_CHANNEL_CONTAINS: list[tuple[str, str]] = [
    ("_DM_",    "Direct Mail"),   # e.g. MAR26A_DM_FREE ASOC
    ("_DM ",    "Direct Mail"),   # e.g. MAR23A_DM HALF OFF ASOC
    ("_SLVG_",  "Win-back Campaign"),
    ("SLVG",    "Win-back Campaign"),
    ("SALVAGE", "Win-back Campaign"),
    ("_BRANCH", "Branch / Walk-in"),  # e.g. ADD24_ADD FREE ASSOC_BRANCH
]

def _map_channel(raw: str) -> str:
    if not raw or not raw.strip():
        return "Unknown"
    upper = raw.strip().upper()
    for prefix, label in _CHANNEL_PREFIXES:
        if upper.startswith(prefix):
            return label
    for substr, label in _CHANNEL_CONTAINS:
        if substr in upper:
            return label
    return "Other / Promotional"


def _date_filter(year: int, today: date) -> str:
    end_year  = min(year, today.year)
    end_month = today.month if end_year == today.year else 12
    end_day   = today.day   if end_year == today.year else 31
    return (
        f"membership_transactions[business_date] >= DATE({year}, 1, 1) "
        f"&& membership_transactions[business_date] <= DATE({end_year}, {end_month}, {end_day})"
    )


# ── Channel breakdown ─────────────────────────────────────────────────────────

def _fetch_channels(year: int) -> list[dict]:
    today = date.today()
    df = _date_filter(year, today)

    rows = dax_query(PBI_WS, MEMBERSHIP_DS, f"""
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        membership_transactions[membership_sales_source_desc],
        membership_transactions[transaction_code],
        "Count", COUNTROWS(membership_transactions),
        "Revenue", SUMX(membership_transactions, membership_transactions[transactor_paid_amount])
    ),
    FILTER(ALL(membership_transactions), {df})
)
""")

    channels: dict[str, dict] = {}
    for r in rows:
        raw  = (r.get("membership_transactions[membership_sales_source_desc]") or "Unknown").strip()
        ch   = _map_channel(raw)
        code = (r.get("membership_transactions[transaction_code]") or "").strip().upper()
        cnt  = int(r.get("[Count]") or 0)
        rev  = float(r.get("[Revenue]") or 0)

        if ch not in channels:
            channels[ch] = {"channel": ch, "new": 0, "renew": 0, "cancel": 0, "revenue": 0.0}
        if code in _NEW_CODES:
            channels[ch]["new"]    += cnt
            channels[ch]["revenue"] += rev
        elif code in _RENEW_CODES:
            channels[ch]["renew"]   += cnt
            channels[ch]["revenue"] += rev
        elif code in _CANCEL_CODES:
            channels[ch]["cancel"]  += cnt

    result = sorted(channels.values(), key=lambda x: x["renew"] + x["new"], reverse=True)
    return result


def get_channels(year: int) -> list[dict]:
    return cache.cached_query(
        f"membership_channels_v2_{year}",
        lambda: _fetch_channels(year),
        ttl=3600,
        disk_ttl=86400,
    )


# ── Agent / sales performance rankings ───────────────────────────────────────

def _fetch_agents(year: int) -> list[dict]:
    today = date.today()
    df = _date_filter(year, today)

    rows = dax_query(PBI_WS, MEMBERSHIP_DS, f"""
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        membership_transactions[incentive_teller_name],
        membership_transactions[transaction_code],
        membership_transactions[revenue_branch_name],
        "Count", COUNTROWS(membership_transactions),
        "Revenue", SUMX(membership_transactions, membership_transactions[transactor_paid_amount])
    ),
    FILTER(ALL(membership_transactions), {df})
)
""")

    agents: dict[str, dict] = {}
    for r in rows:
        name   = (r.get("membership_transactions[incentive_teller_name]") or "").strip()
        branch = (r.get("membership_transactions[revenue_branch_name]") or "").strip()
        code   = (r.get("membership_transactions[transaction_code]") or "").strip().upper()
        cnt    = int(r.get("[Count]") or 0)
        rev    = float(r.get("[Revenue]") or 0)

        if not name or name.upper() in _EXCLUDE_AGENTS:
            continue
        if any(frag.upper() in branch.upper() for frag in _EXCLUDE_BRANCH_FRAGMENTS):
            continue

        if name not in agents:
            agents[name] = {"name": name, "branch": branch, "new": 0, "renew": 0, "cancel": 0, "revenue": 0.0}
        if code in _NEW_CODES:
            agents[name]["new"]    += cnt
            agents[name]["revenue"] += rev
        elif code in _RENEW_CODES:
            agents[name]["renew"]   += cnt
            agents[name]["revenue"] += rev
        elif code in _CANCEL_CODES:
            agents[name]["cancel"]  += cnt

    filtered = [
        a for a in agents.values()
        if (a["new"] + a["renew"] + a["cancel"]) <= _BATCH_THRESHOLD
    ]
    filtered.sort(key=lambda x: x["renew"], reverse=True)
    return filtered


def get_agents(year: int) -> list[dict]:
    return cache.cached_query(
        f"membership_agents_v2_{year}",
        lambda: _fetch_agents(year),
        ttl=3600,
        disk_ttl=86400,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/api/membership/channels")
def membership_channels(
    year: int | None = None,
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    y = year or date.today().year
    return {"channels": get_channels(y), "year": y}


@router.get("/api/membership/leaderboard")
def membership_leaderboard(
    year: int | None = None,
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    y = year or date.today().year
    return {"agents": get_agents(y), "year": y}


@router.get("/api/membership/probe-channels")
def probe_channels(
    year: int | None = None,
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Show every raw membership_sales_source_desc value, its mapped category, and count — for validation."""
    today = date.today()
    y = year or today.year
    df = _date_filter(y, today)

    rows = dax_query(PBI_WS, MEMBERSHIP_DS, f"""
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        membership_transactions[membership_sales_source_desc],
        "Count", COUNTROWS(membership_transactions)
    ),
    FILTER(ALL(membership_transactions), {df})
)
ORDER BY [Count] DESC
""")

    return {
        "year": y,
        "sources": [
            {
                "raw": r.get("membership_transactions[membership_sales_source_desc]") or "",
                "mapped": _map_channel(r.get("membership_transactions[membership_sales_source_desc]") or ""),
                "count": int(r.get("[Count]") or 0),
            }
            for r in rows
        ],
    }
