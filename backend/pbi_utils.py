"""Shared PBI helpers — commission/revenue overlay for Travel and Insurance.

PBI is the authoritative source for commission and bookings (sales).
All endpoints that display these figures must use PBI data, NOT Salesforce
Earned_Commission_Amount__c (which is incomplete/unreliable).
"""

import cache

# Lines that use PBI as the authoritative commission+sales source
PBI_COMMISSION_LINES = frozenset({'Travel', 'Insurance'})

_PBI_NOISE_FRAGMENTS = ('misc', 'aaa.com', 'dept agent', 'group dept')


def norm_name(n: str) -> str:
    """Lowercase, strip single-letter middle names for fuzzy matching."""
    if not n:
        return ""
    try:
        from routers.advisor_targets import _normalize_name
        n = _normalize_name(n)
    except ImportError:
        pass
    return ' '.join(p for p in n.lower().split() if len(p) > 1)


def is_pbi_noise(name: str) -> bool:
    nl = name.lower()
    return any(f in nl for f in _PBI_NOISE_FRAGMENTS)


def get_pbi_advisor_id_map(line: str) -> dict[str, str]:
    """Return a mapping from lowercased PBI code to Salesforce name (canonical_name).

    Travel: Tellercode -> Email -> Salesforce Name
    Insurance: Epic_ID -> Salesforce Name
    """
    key = f"pbi_advisor_id_map_v1_{line}"
    return cache.cached_query(key, lambda: _fetch_pbi_advisor_id_map(line), ttl=3600, disk_ttl=86400)


def _fetch_pbi_advisor_id_map(line: str) -> dict[str, str]:
    from sf_client import sf_query_all

    mapping = {}
    try:
        if line == 'Travel':
            from pbi_client import dax_query, PBI_WS, TRAVEL_TRANSACTIONS_DS
            # Query PBI Employee table for tellercode -> email
            q_pbi = """
            EVALUATE 
                FILTER(
                    SUMMARIZECOLUMNS(
                        Employee[Tellercode],
                        Employee[Email]
                    ),
                    Employee[Tellercode] <> "No Data" && 
                    NOT(ISBLANK(Employee[Tellercode])) && 
                    Employee[Email] <> "" &&
                    NOT(ISBLANK(Employee[Email]))
                )
            """
            pbi_rows = dax_query(PBI_WS, TRAVEL_TRANSACTIONS_DS, q_pbi)

            # Query SF for email -> name
            sf_users = sf_query_all("SELECT Name, Email FROM User WHERE IsActive = true")

            # Map email to Salesforce Name
            email_to_name = {u['Email'].lower().strip(): u['Name'] for u in sf_users if u.get('Email')}

            # Map tellercode to name via email
            for r in pbi_rows:
                code = r.get("Employee[Tellercode]")
                email = r.get("Employee[Email]")
                if code and email:
                    code_lower = code.lower().strip()
                    email_lower = email.lower().strip()
                    if email_lower in email_to_name:
                        mapping[code_lower] = email_to_name[email_lower]
        else:  # Insurance
            # Query SF for Epic_ID -> name
            sf_users = sf_query_all("SELECT Name, Epic_ID__c FROM User WHERE IsActive = true AND Epic_ID__c != null")
            for u in sf_users:
                epic = u.get("Epic_ID__c")
                if epic:
                    mapping[epic.lower().strip()] = u['Name']
    except Exception as e:
        import logging
        logging.getLogger('salesinsight.pbi').error(f"Failed to fetch PBI advisor ID map for {line}: {e}")

    return mapping


def pbi_monthly_map(line: str, sd: str, ed: str) -> dict:
    """Pull PBI data (Travel or Insurance) grouped by advisor+day, collapsed to YYYY-MM.

    Returns: {norm_name: {YYYY-MM: {commission, sales, _raw_name}}}
    Cached for 1 hour in memory, 24 hours on disk.
    """
    key = f"pbi_monthly_v2_{line}_{sd}_{ed}"
    return cache.cached_query(key, lambda: _fetch_pbi_monthly(line, sd, ed),
                              ttl=3600, disk_ttl=86400)


def _fetch_pbi_monthly(line: str, sd: str, ed: str) -> dict:
    if line == 'Travel':
        from pbi_client import travel_by_advisor_day as pbi_fn
    else:
        from pbi_client import insurance_by_advisor_day as pbi_fn

    # Load code to name mapping
    id_map = get_pbi_advisor_id_map(line)

    result: dict = {}
    for r in pbi_fn(sd, ed):
        name = r['name']
        code = r.get('code', '')

        # Resolve name via ID-mapping first, falling back to name
        resolved_name = name
        if code:
            code_lower = code.lower().strip()
            if code_lower in id_map:
                resolved_name = id_map[code_lower]

        if not resolved_name or is_pbi_noise(resolved_name):
            continue
        nk = norm_name(resolved_name)
        month = r['date'][:7]
        if not nk or len(month) != 7:
            continue
        if nk not in result:
            result[nk] = {}
        if month not in result[nk]:
            result[nk][month] = {'commission': 0.0, 'sales': 0.0, '_raw_name': resolved_name}
        result[nk][month]['commission'] += r['commission']
        result[nk][month]['sales'] += r['sales']
    return result


def overlay_pbi_on_month_map(month_map: dict, pbi_data: dict, norm_key: str, year: int) -> None:
    """Overwrite comm+rev in a {month_int: {mo, cnt, rev, comm}} map with PBI data.

    Mutates month_map in place.  Adds missing months that exist in PBI but not SF.
    """
    advisor_pbi = pbi_data.get(norm_key, {})
    for ym, pd in advisor_pbi.items():
        try:
            yr_str, mo_str = ym.split('-')
            if int(yr_str) != year:
                continue
            m = int(mo_str)
            if m in month_map:
                month_map[m]['comm'] = pd['commission']
                month_map[m]['rev'] = pd['sales']
            else:
                month_map[m] = {'mo': m, 'cnt': 0, 'rev': pd['sales'], 'comm': pd['commission']}
        except Exception:
            pass


def pbi_by_advisor(line: str, sd: str, ed: str) -> list[dict]:
    """Pre-aggregated advisor totals (no monthly breakdown). Used for leaderboard."""
    from pbi_client import travel_by_advisor, insurance_by_advisor
    raw_rows = travel_by_advisor(sd, ed) if line == 'Travel' else insurance_by_advisor(sd, ed)

    id_map = get_pbi_advisor_id_map(line)

    resolved_rows = []
    for r in raw_rows:
        name = r['name']
        code = r.get('code', '')

        resolved_name = name
        if code:
            code_lower = code.lower().strip()
            if code_lower in id_map:
                resolved_name = id_map[code_lower]

        if not resolved_name or is_pbi_noise(resolved_name):
            continue

        resolved_rows.append({
            "name": resolved_name,
            "branch": r["branch"],
            "commission": r["commission"],
            "sales": r["sales"],
            "txns": r["txns"]
        })
    return resolved_rows


def pbi_by_day(line: str, sd: str, ed: str) -> list[dict]:
    """Daily totals across all advisors. Used for trend/YoY charts."""
    from pbi_client import travel_by_day, insurance_by_day
    return travel_by_day(sd, ed) if line == 'Travel' else insurance_by_day(sd, ed)


def pbi_by_branch_day(line: str, sd: str, ed: str) -> list[dict]:
    """Daily totals by branch. Used for branch charts."""
    from pbi_client import travel_by_branch_day, insurance_by_branch_day
    return travel_by_branch_day(sd, ed) if line == 'Travel' else insurance_by_branch_day(sd, ed)


def pbi_period_totals(pbi_data: dict, norm_key: str, sd: str, ed: str) -> tuple[float, float]:
    """Sum PBI commission and sales for a specific advisor within sd..ed (inclusive, YYYY-MM-DD).

    Returns (commission_total, sales_total).
    """
    sd_ym = sd[:7]
    ed_ym = ed[:7]
    total_comm = total_sales = 0.0
    for ym, pd in pbi_data.get(norm_key, {}).items():
        if sd_ym <= ym <= ed_ym:
            total_comm += pd['commission']
            total_sales += pd['sales']
    return total_comm, total_sales
