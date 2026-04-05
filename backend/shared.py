"""Shared helpers used across multiple SalesInsight routers.

Import from any router via:
    from shared import VALID_LINES, WON_STAGES, resolve_dates, ...
"""

import logging
from datetime import date
from typing import Optional

# ── Constants ────────────────────────────────────────────────────────────────

VALID_LINES = {'Travel', 'Insurance', 'All'}

# Invoice = booked sale (not yet paid); Closed Won = fully paid.
# Both count as revenue -- Invoice -> Closed Won takes 2-3 months.
WON_STAGES = "StageName IN ('Closed Won','Invoice')"

# Stages that count as "invoiced" (booking confirmed, invoice created).
INVOICED_STAGES = "('Invoice','Invoiced','Booked','Closed Won')"

MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


# ── Date helpers ─────────────────────────────────────────────────────────────

def resolve_dates(
    start_date: Optional[str],
    end_date: Optional[str],
    period: int,
) -> tuple[str, str]:
    """Return (start_iso, end_iso) date strings for SOQL filters.

    If explicit dates are provided, pass them through.
    Otherwise compute from *period* months back to today.
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


# ── SOQL filter builders ────────────────────────────────────────────────────

def line_filter_opp(line: str) -> str:
    """SOQL WHERE fragment to filter Opportunities by record type / division."""
    if line == 'All':
        return "RecordType.Name IN ('Travel','Insurance')"
    return f"RecordType.Name = '{line}'"


def line_filter_lead(line: str) -> str:
    """SOQL WHERE fragment to filter Leads by record type / division.

    Leads include extra record types that don't exist on Opportunities.
    """
    if line == 'All':
        return "RecordType.Name IN ('Travel','Insurance','Financial Services','Outbound Lead')"
    return f"RecordType.Name = '{line}'"


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
