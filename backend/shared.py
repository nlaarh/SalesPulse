"""Shared helpers used across multiple SalesInsight routers.

Import from any router via:
    from shared import VALID_LINES, WON_STAGES, resolve_dates, ...
"""

import logging
import threading
from datetime import date
from typing import Optional
from dateutil.relativedelta import relativedelta

# ── Constants ────────────────────────────────────────────────────────────────

VALID_LINES = {'Travel', 'Insurance', 'All'}

# Invoice = booked sale (not yet paid); Closed Won = fully paid.
# Both count as revenue -- Invoice -> Closed Won takes 2-3 months.
WON_STAGES = "StageName IN ('Closed Won','Invoice')"

# Stages that count as "invoiced" (booking confirmed, invoice created).
INVOICED_STAGES = "('Invoice','Invoiced','Booked','Closed Won')"

MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

# ── RecordType IDs ────────────────────────────────────────────────────────────
# Use RecordTypeId (direct indexed field) instead of RecordType.Name (cross-object join).
# Switching from RecordType.Name to RecordTypeId eliminates a per-row join in SF,
# delivering 2-4x speedup on every Opportunity and Lead query.

_OPP_RT_TRAVEL    = '012Pb0000006hIjIAI'
_OPP_RT_INSURANCE = '012Pb0000006hIgIAI'
_OPP_RT_ALL       = f"'{_OPP_RT_TRAVEL}','{_OPP_RT_INSURANCE}'"

_LEAD_RT_TRAVEL    = '012Pb0000006hIdIAI'
_LEAD_RT_INSURANCE = '012Pb0000006hIbIAI'
_LEAD_RT_FINSVCS   = '012Pb0000006hIaIAI'
_LEAD_RT_DRIVERS   = '012Pb0000006hIZIAY'
_LEAD_RT_ALL       = f"'{_LEAD_RT_TRAVEL}','{_LEAD_RT_INSURANCE}','{_LEAD_RT_FINSVCS}','{_LEAD_RT_DRIVERS}'"

# Expose Travel RT ID for routers that filter directly (e.g. sales_travel.py)
OPP_RT_TRAVEL_ID    = _OPP_RT_TRAVEL
OPP_RT_INSURANCE_ID = _OPP_RT_INSURANCE


# ── Date helpers ─────────────────────────────────────────────────────────────

def resolve_dates(
    start_date: Optional[str],
    end_date: Optional[str],
    period: int,
) -> tuple[str, str]:
    """Return (start_iso, end_iso) date strings for SOQL filters.

    If explicit dates are provided, pass them through.
    Otherwise compute from *period* months back to today.
    Always returns concrete dates — never LAST_N_MONTHS.
    """
    if start_date and end_date:
        return start_date, end_date
    today = date.today()
    m = today.month - period
    y = today.year
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1).isoformat(), today.isoformat()


def prev_dates(sd: str, ed: str) -> tuple[str, str]:
    """Shift an explicit date range back one year for YoY comparison."""
    start = date.fromisoformat(sd) - relativedelta(years=1)
    end   = date.fromisoformat(ed) - relativedelta(years=1)
    return start.isoformat(), end.isoformat()


def six_months_ago() -> str:
    """ISO date for 6 months ago — used to exclude stale pipeline opps.

    Rule: any open/non-won opportunity older than 6 months is considered stale
    and should be excluded from all pipeline views. Won opps are never stale.
    """
    return (date.today() - relativedelta(months=6)).isoformat()


# ── SOQL filter builders ────────────────────────────────────────────────────

def line_filter_opp(line: str) -> str:
    """SOQL WHERE fragment to filter Opportunities by record type.

    Uses RecordTypeId (direct indexed field) — 2-4x faster than RecordType.Name
    which requires a cross-object join on every row.
    """
    if line == 'All':
        return f"RecordTypeId IN ({_OPP_RT_ALL})"
    if line == 'Travel':
        return f"RecordTypeId = '{_OPP_RT_TRAVEL}'"
    if line == 'Insurance':
        return f"RecordTypeId = '{_OPP_RT_INSURANCE}'"
    return f"RecordType.Name = '{line}'"  # safe fallback for unknown lines


def line_filter_lead(line: str) -> str:
    """SOQL WHERE fragment to filter Leads by record type.

    Uses RecordTypeId (direct indexed field) — 2-4x faster than RecordType.Name.
    Includes Travel, Insurance, Financial Services, and Driver Programs.
    """
    if line == 'All':
        return f"RecordTypeId IN ({_LEAD_RT_ALL})"
    if line == 'Travel':
        return f"RecordTypeId = '{_LEAD_RT_TRAVEL}'"
    if line == 'Insurance':
        return f"RecordTypeId = '{_LEAD_RT_INSURANCE}'"
    if line == 'Financial Services':
        return f"RecordTypeId = '{_LEAD_RT_FINSVCS}'"
    return f"RecordType.Name = '{line}'"  # safe fallback for unknown lines


def escape_soql(s: str) -> str:
    """Escape single quotes for SOQL string literals."""
    return s.replace("\\", "\\\\").replace("'", "\\'")


# ── Result helpers ───────────────────────────────────────────────────────────

def val(rows, field: str = 'cnt'):
    """Safely extract a value from a single-row SOQL result."""
    if not rows:
        return 0
    return (rows[0] or {}).get(field, 0) or 0


# ── Sales Agent Filtering (Dynamic — queried from Salesforce) ──────────────
#
# Both Travel and Insurance agent lists are built dynamically from the SF
# User object at startup. No hardcoded name lists — when HR adds/removes
# a user in Salesforce, the app picks it up on next restart.
#
# Travel rule:  Profile IN (Travel User, Support User)
#               AND title contains "Travel Advisor" or "TSC"
#               AND title does NOT contain "Member Experience", "Call Center",
#               or "Group Travel" (those are support/management roles).
#
# Insurance rule: Profile = Insurance User
#                 AND title does NOT contain manager/supervisor/QC/training
#                 keywords (those are non-sales roles).

_log = logging.getLogger('shared')

# ── User data — single query populates owner map + both agent sets ────────────
# One SF call replaces the previous three separate User queries (owner_map,
# travel agents, insurance agents). Called lazily on first use; preloaded at
# startup by main.py to eliminate cold-start serial blocking.

_OWNER_MAP: dict[str, str] | None = None
_TRAVEL_AGENTS: set[str] | None = None
_INSURANCE_AGENTS: set[str] | None = None
_USERS_LOCK = threading.Lock()

# Non-sales title keywords for insurance agents.
_INS_EXCLUDE_TITLE_KEYWORDS = [
    'manager', 'supervisor', 'quality control', 'training',
    'specialist', 'administrator', 'coordinator',
]


def _is_travel_sales_title(title: str) -> bool:
    t = title.lower()
    if 'tsc' in t:
        return True
    if 'travel advisor' in t:
        return ('member experience' not in t
                and 'call center' not in t
                and 'group travel' not in t)
    return False


def _load_all_users() -> None:
    """One SOQL query builds owner_map, travel_agents, and insurance_agents."""
    global _OWNER_MAP, _TRAVEL_AGENTS, _INSURANCE_AGENTS
    try:
        from sf_client import sf_query_all
        records = sf_query_all(
            "SELECT Id, Name, Title, Profile.Name FROM User WHERE IsActive = true LIMIT 2000"
        )
        if not records:
            _log.warning("User query returned 0 records — not caching")
            return

        owner_map: dict[str, str] = {}
        travel_names: set[str] = set()
        insurance_names: set[str] = set()
        travel_excluded: list[str] = []
        insurance_excluded: list[str] = []

        for r in records:
            uid = r.get('Id', '')
            uname = (r.get('Name') or '').strip()
            title = (r.get('Title') or '').strip()
            profile = ((r.get('Profile') or {}).get('Name') or '')

            if uid and uname:
                owner_map[uid] = uname

            if not uname or uname == 'Travel User':
                continue

            lname = uname.lower()

            if profile in ('Travel User', 'Support User'):
                if _is_travel_sales_title(title):
                    travel_names.add(lname)
                else:
                    travel_excluded.append(f"{uname} ({title})")

            if profile == 'Insurance User':
                if any(kw in title.lower() for kw in _INS_EXCLUDE_TITLE_KEYWORDS):
                    insurance_excluded.append(f"{uname} ({title})")
                else:
                    insurance_names.add(lname)

        _OWNER_MAP = owner_map
        _TRAVEL_AGENTS = travel_names
        _INSURANCE_AGENTS = insurance_names
        _log.info(
            "Loaded %d users: %d travel agents, %d insurance agents "
            "(excluded travel=%d, ins=%d)",
            len(owner_map), len(travel_names), len(insurance_names),
            len(travel_excluded), len(insurance_excluded),
        )
    except Exception as exc:
        _log.error("Failed to load users: %s", exc)


def _ensure_users_loaded(force_refresh: bool = False) -> None:
    """Load user data if any cache is missing or force_refresh is set."""
    global _OWNER_MAP, _TRAVEL_AGENTS, _INSURANCE_AGENTS
    if (not force_refresh
            and _OWNER_MAP is not None
            and _TRAVEL_AGENTS is not None
            and _INSURANCE_AGENTS is not None):
        return
    with _USERS_LOCK:
        if (not force_refresh
                and _OWNER_MAP is not None
                and _TRAVEL_AGENTS is not None
                and _INSURANCE_AGENTS is not None):
            return
        if force_refresh:
            _OWNER_MAP = None
            _TRAVEL_AGENTS = None
            _INSURANCE_AGENTS = None
        _load_all_users()


def get_owner_map(force_refresh: bool = False) -> dict[str, str]:
    """Return cached OwnerId → Name mapping for all active SF users."""
    _ensure_users_loaded(force_refresh=force_refresh)
    return _OWNER_MAP or {}


def get_travel_sales_agents() -> set[str]:
    """Return the cached set of travel sales agent names (lowercased)."""
    _ensure_users_loaded()
    return _TRAVEL_AGENTS or set()


def get_insurance_sales_agents() -> set[str]:
    """Return the cached set of insurance sales agent names (lowercased)."""
    _ensure_users_loaded()
    return _INSURANCE_AGENTS or set()


def is_travel_sales_agent(name: str) -> bool:
    return name.strip().lower() in get_travel_sales_agents()


def is_insurance_sales_agent(name: str) -> bool:
    return name.strip().lower() in get_insurance_sales_agents()


# ── Unified filter ─────────────────────────────────────────────────────────

def is_sales_agent(name: str, line: str) -> bool:
    """Check if an agent should be included in reports for the given line."""
    if line == 'Travel':
        return is_travel_sales_agent(name)
    if line == 'Insurance':
        return is_insurance_sales_agent(name)
    return is_travel_sales_agent(name) or is_insurance_sales_agent(name)


# ── Data extraction helpers ────────────────────────────────────────────────

def safe_get(obj, *keys, default=''):
    """Safely traverse nested dicts — replaces (r.get('X') or {}).get('Y')."""
    current = obj
    for key in keys:
        if isinstance(current, dict):
            current = current.get(key)
        else:
            return default
        if current is None:
            return default
    return current


def enrich_owner_names(records, owner_field='OwnerId', name_field='OwnerName'):
    """Add resolved owner names to records using the cached owner map."""
    om = get_owner_map()
    for r in records:
        oid = r.get(owner_field, '')
        r[name_field] = om.get(oid, oid)
    return records


def date_range_filter(field: str, sd: str, ed: str) -> str:
    """Build a SOQL DateTime range filter — handles CreatedDate (DateTime) vs Date fields."""
    if field in ('CreatedDate', 'LastModifiedDate', 'SystemModstamp', 'LastActivityDate_dt'):
        return f"{field} >= {sd}T00:00:00Z AND {field} <= {ed}T23:59:59Z"
    return f"{field} >= {sd} AND {field} <= {ed}"
