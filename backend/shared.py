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

# ── Owner Map (OwnerId → Name) ────────────────────────────────────────────────
# Cached once per process. Allows all SOQL GROUP BY queries to use OwnerId
# (a direct indexed field) instead of Owner.Name (cross-object join per row).

_OWNER_MAP: dict[str, str] | None = None
_OWNER_MAP_LOCK = threading.Lock()


def get_owner_map() -> dict[str, str]:
    """Return cached OwnerId → Name mapping for all active SF users.

    Loaded once at first call, shared across all workers (preload_app=True).
    Thread-safe via double-checked locking. Avoids repeated User queries.
    """
    global _OWNER_MAP
    if _OWNER_MAP is None:
        with _OWNER_MAP_LOCK:
            if _OWNER_MAP is None:
                try:
                    from sf_client import sf_query_all
                    records = sf_query_all(
                        "SELECT Id, Name FROM User WHERE IsActive = true LIMIT 500"
                    )
                    _OWNER_MAP = {r['Id']: r['Name'] for r in records}
                    _log.info("Loaded %d users into owner_map", len(_OWNER_MAP))
                except Exception as exc:
                    _log.error("Failed to load owner_map: %s", exc)
                    _OWNER_MAP = {}
    return _OWNER_MAP

# ── Travel (dynamic from SF) ──────────────────────────────────────────────

_TRAVEL_AGENTS: set[str] | None = None


def _is_travel_sales_title(title: str) -> bool:
    """Return True if a User.Title indicates a Travel sales agent."""
    t = title.lower()
    # TSC roles (Travel Sales Center) are always sales
    if 'tsc' in t:
        return True
    # "Travel Advisor" variants — but exclude Member Experience,
    # Call Center, and Group Travel roles (support/management).
    if 'travel advisor' in t:
        return ('member experience' not in t
                and 'call center' not in t
                and 'group travel' not in t)
    return False


def _load_travel_agents() -> set[str]:
    """Query SF for Travel/Support User profiles and apply title rules."""
    try:
        from sf_client import sf_query_all
        records = sf_query_all("""
            SELECT Name, Profile.Name, Title
            FROM User
            WHERE IsActive = true
              AND (Profile.Name = 'Travel User' OR Profile.Name = 'Support User')
        """)
        names: set[str] = set()
        excluded: list[str] = []
        for r in records:
            uname = r.get('Name', '').strip()
            title = r.get('Title') or ''
            if not uname or uname == 'Travel User':
                continue
            if _is_travel_sales_title(title):
                names.add(uname.lower())
            else:
                excluded.append(f"{uname} ({title})")
        _log.info(
            f"Loaded {len(names)} travel sales agents from SF "
            f"(excluded {len(excluded)} non-sales)"
        )
        return names
    except Exception as e:
        _log.error(f"Failed to load travel agents from SF: {e}")
        return set()


def get_travel_sales_agents() -> set[str]:
    """Return the cached set of travel sales agent names (lowercased)."""
    global _TRAVEL_AGENTS
    if _TRAVEL_AGENTS is None:
        _TRAVEL_AGENTS = _load_travel_agents()
    return _TRAVEL_AGENTS


def is_travel_sales_agent(name: str) -> bool:
    """Check if a name is a travel sales agent (case-insensitive)."""
    return name.strip().lower() in get_travel_sales_agents()


# ── Insurance (dynamic from SF) ───────────────────────────────────────────

# Non-sales title keywords — agents with these in their Title are excluded.
_INS_EXCLUDE_TITLE_KEYWORDS = [
    'manager', 'supervisor', 'quality control', 'training',
    'specialist', 'administrator', 'coordinator',
]

_INSURANCE_AGENTS: set[str] | None = None


def _load_insurance_agents() -> set[str]:
    """Query SF for Insurance User profiles and exclude non-sales titles."""
    try:
        from sf_client import sf_query_all
        records = sf_query_all("""
            SELECT Name, Profile.Name, Title
            FROM User
            WHERE IsActive = true
              AND Profile.Name = 'Insurance User'
        """)
        names: set[str] = set()
        excluded: list[str] = []
        for r in records:
            uname = r.get('Name', '').strip()
            title = (r.get('Title') or '').lower()
            if any(kw in title for kw in _INS_EXCLUDE_TITLE_KEYWORDS):
                excluded.append(f"{uname} ({r.get('Title', '')})")
                continue
            names.add(uname.lower())
        _log.info(
            f"Loaded {len(names)} insurance sales agents from SF "
            f"(excluded {len(excluded)} non-sales)"
        )
        return names
    except Exception as e:
        _log.error(f"Failed to load insurance agents from SF: {e}")
        return set()


def get_insurance_sales_agents() -> set[str]:
    """Return the cached set of insurance sales agent names (lowercased)."""
    global _INSURANCE_AGENTS
    if _INSURANCE_AGENTS is None:
        _INSURANCE_AGENTS = _load_insurance_agents()
    return _INSURANCE_AGENTS


def is_insurance_sales_agent(name: str) -> bool:
    """Check if a name is an insurance sales agent."""
    return name.strip().lower() in get_insurance_sales_agents()


# ── Unified filter ─────────────────────────────────────────────────────────

def is_sales_agent(name: str, line: str) -> bool:
    """Check if an agent should be included in reports for the given line.

    Both lines are dynamically loaded from Salesforce User profiles + titles.
    No hardcoded lists — when SF users change, restart the backend to pick up.
    """
    if line == 'Travel':
        return is_travel_sales_agent(name)
    if line == 'Insurance':
        return is_insurance_sales_agent(name)
    # line == 'All': agent is valid if in either list
    return is_travel_sales_agent(name) or is_insurance_sales_agent(name)
