"""Power BI REST client — shared auth + DAX query utility.

All aggregations use SUMMARIZECOLUMNS (not SUMMARIZE).
SUMMARIZE returns None for text columns via executeQueries; SUMMARIZECOLUMNS works correctly.

Public API:
    travel_by_advisor(sd, ed)      → [{name, branch, commission, sales, txns}]
    travel_by_day(sd, ed)          → [{date, commission, sales, txns}]
    travel_by_branch_day(sd, ed)   → [{branch, date, commission, sales}]
    travel_by_advisor_day(sd, ed)  → [{name, branch, date, commission, sales, txns}]
    insurance_by_advisor(sd, ed)   → [{name, branch, commission, sales, txns}]
    insurance_by_day(sd, ed)       → [{date, commission, sales, txns}]
    insurance_by_branch_day(sd, ed)→ [{branch, date, commission, sales}]
    insurance_by_advisor_day(sd, ed)→ [{name, branch, date, commission, sales, txns}]
"""
import os
import time
import requests

# ── Workspace / dataset constants ─────────────────────────────────────────────
PBI_WS       = "019c6471-5f67-4838-970b-35b186425c78"  # Business Intelligence Datasets
TRAVEL_WS    = PBI_WS   # alias kept for any external references

# Travel
TRAVEL_DS            = "5c60c1bf-0f33-4a7e-9a90-47813b10c4cf"  # Travel Scorecard (advisor perf)
TRAVEL_TRANSACTIONS_DS = "e03a823a-5b3b-40c1-8f59-f9f7cfc52f9c"  # Travel Transactions (raw bookings)

# Insurance
INSURANCE_DS           = "2e3c94a1-5900-4ded-8a6d-14e1b0cc0747"  # Insurance Transactions Invoices (advisor perf)
INSURANCE_COMPREHENSIVE_DS = "61c03e69-9ce3-49cb-b15d-f63f53127fac"  # Insurance Comprehensive v3 (full book)

# Membership
MEMBERSHIP_DS          = "d7cdf3bc-dcf4-48ed-b4bb-200563dcfd7f"  # Membership Comprehensive
#   Tables: "Membership Consolidated" = current state snapshot
#           "Membership Transactions" = transaction history

_PBI_BASE = "https://api.powerbi.com/v1.0/myorg"
_AUTH_URL  = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
_SCOPE     = "https://analysis.windows.net/powerbi/api/.default"

_cache: dict = {}


# ── Auth ──────────────────────────────────────────────────────────────────────

def _token() -> str:
    now = time.time()
    if _cache.get("expires_at", 0) > now + 60:
        return _cache["token"]
    r = requests.post(
        _AUTH_URL.format(tenant=os.environ["POWERBI_TENANT_ID"]),
        data={
            "grant_type":    "client_credentials",
            "client_id":     os.environ["POWERBI_CLIENT_ID"],
            "client_secret": os.environ["POWERBI_CLIENT_SECRET"],
            "scope":         _SCOPE,
        },
        timeout=30,
    )
    r.raise_for_status()
    j = r.json()
    _cache["token"]      = j["access_token"]
    _cache["expires_at"] = now + j.get("expires_in", 3600)
    return _cache["token"]


def dax_query(ws_id: str, ds_id: str, query: str) -> list[dict]:
    """Execute a DAX query against a PBI dataset. Returns list of row dicts."""
    r = requests.post(
        f"{_PBI_BASE}/groups/{ws_id}/datasets/{ds_id}/executeQueries",
        headers={"Authorization": f"Bearer {_token()}", "Content-Type": "application/json"},
        json={"queries": [{"query": query}], "serializerSettings": {"includeNulls": True}},
        timeout=120,
    )
    if r.status_code != 200:
        raise RuntimeError(f"PBI DAX {r.status_code}: {r.text[:300]}")
    return r.json()["results"][0]["tables"][0].get("rows", [])


def _dax_date(iso: str) -> str:
    """'2026-04-01' → 'DATE(2026,4,1)'"""
    y, m, d = iso.split("-")
    return f"DATE({y},{int(m)},{int(d)})"


def _n(v) -> float:
    return float(v or 0)


# ── Generic SUMMARIZECOLUMNS builders ─────────────────────────────────────────

def _by_advisor(ws, ds, table, name_col, branch_col, date_col, comm_col, sales_col,
                sd, ed, extra_filter="") -> list[dict]:
    """One aggregated row per advisor-name + branch combination."""
    tf = f"'{table}'"
    date_f = (
        f"{tf}[{date_col}] >= {_dax_date(sd)} && "
        f"{tf}[{date_col}] <= {_dax_date(ed)}"
    )
    if extra_filter:
        date_f += f" && {extra_filter}"
    raw = dax_query(ws, ds, f"""
EVALUATE
SUMMARIZECOLUMNS(
    {tf}[{name_col}],
    {tf}[{branch_col}],
    FILTER(ALL({tf}), {date_f}),
    "commission", SUM({tf}[{comm_col}]),
    "sales",      SUM({tf}[{sales_col}]),
    "txns",       COUNTROWS({tf})
)
ORDER BY [commission] DESC
""")
    nk = f"{table}[{name_col}]"
    bk = f"{table}[{branch_col}]"
    return [
        {
            "name":       (r.get(nk) or "").strip(),
            "branch":     (r.get(bk) or "").strip(),
            "commission": _n(r.get("[commission]")),
            "sales":      _n(r.get("[sales]")),
            "txns":       int(_n(r.get("[txns]"))),
        }
        for r in raw
        if (r.get(nk) or "").strip()
    ]


def _by_day(ws, ds, table, date_col, comm_col, sales_col,
            sd, ed, extra_filter="") -> list[dict]:
    """One aggregated row per calendar day with data."""
    tf = f"'{table}'"
    date_f = (
        f"{tf}[{date_col}] >= {_dax_date(sd)} && "
        f"{tf}[{date_col}] <= {_dax_date(ed)}"
    )
    if extra_filter:
        date_f += f" && {extra_filter}"
    raw = dax_query(ws, ds, f"""
EVALUATE
SUMMARIZECOLUMNS(
    {tf}[{date_col}],
    FILTER(ALL({tf}), {date_f}),
    "commission", SUM({tf}[{comm_col}]),
    "sales",      SUM({tf}[{sales_col}]),
    "txns",       COUNTROWS({tf})
)
ORDER BY {tf}[{date_col}]
""")
    dk = f"{table}[{date_col}]"
    return [
        {
            "date":       (r.get(dk) or "")[:10],
            "commission": _n(r.get("[commission]")),
            "sales":      _n(r.get("[sales]")),
            "txns":       int(_n(r.get("[txns]"))),
        }
        for r in raw
        if (r.get(dk) or "")[:10]
    ]


def _by_branch_day(ws, ds, table, branch_col, date_col, comm_col, sales_col,
                   sd, ed, extra_filter="") -> list[dict]:
    """One aggregated row per branch + calendar day combination."""
    tf = f"'{table}'"
    date_f = (
        f"{tf}[{date_col}] >= {_dax_date(sd)} && "
        f"{tf}[{date_col}] <= {_dax_date(ed)}"
    )
    if extra_filter:
        date_f += f" && {extra_filter}"
    raw = dax_query(ws, ds, f"""
EVALUATE
SUMMARIZECOLUMNS(
    {tf}[{branch_col}],
    {tf}[{date_col}],
    FILTER(ALL({tf}), {date_f}),
    "commission", SUM({tf}[{comm_col}]),
    "sales",      SUM({tf}[{sales_col}])
)
""")
    brk = f"{table}[{branch_col}]"
    dk  = f"{table}[{date_col}]"
    return [
        {
            "branch":     (r.get(brk) or "").strip(),
            "date":       (r.get(dk)  or "")[:10],
            "commission": _n(r.get("[commission]")),
            "sales":      _n(r.get("[sales]")),
        }
        for r in raw
        if (r.get(brk) or "").strip() and (r.get(dk) or "")[:10]
    ]


def _by_advisor_day(ws, ds, table, name_col, branch_col, date_col, comm_col, sales_col,
                    sd, ed, extra_filter="") -> list[dict]:
    """One aggregated row per advisor-name + branch + date combination.

    Designed for monthly breakdowns: caller collapses date[:7] → YYYY-MM.
    """
    tf = f"'{table}'"
    date_f = (
        f"{tf}[{date_col}] >= {_dax_date(sd)} && "
        f"{tf}[{date_col}] <= {_dax_date(ed)}"
    )
    if extra_filter:
        date_f += f" && {extra_filter}"
    raw = dax_query(ws, ds, f"""
EVALUATE
SUMMARIZECOLUMNS(
    {tf}[{name_col}],
    {tf}[{branch_col}],
    {tf}[{date_col}],
    FILTER(ALL({tf}), {date_f}),
    "commission", SUM({tf}[{comm_col}]),
    "sales",      SUM({tf}[{sales_col}]),
    "txns",       COUNTROWS({tf})
)
ORDER BY {tf}[{date_col}]
""")
    nk = f"{table}[{name_col}]"
    bk = f"{table}[{branch_col}]"
    dk = f"{table}[{date_col}]"
    return [
        {
            "name":       (r.get(nk) or "").strip(),
            "branch":     (r.get(bk) or "").strip(),
            "date":       str(r.get(dk) or "")[:10],
            "commission": _n(r.get("[commission]")),
            "sales":      _n(r.get("[sales]")),
            "txns":       int(_n(r.get("[txns]"))),
        }
        for r in raw
        if (r.get(nk) or "").strip() and str(r.get(dk) or "")[:10]
    ]


# ── Travel (BI Dataset - Travel Scorecard) ────────────────────────────────────
_T_TABLE  = "Travel Transactions f transformed"
_T_NAME   = "Primary Advisor Full Name"
_T_BRANCH = "Primary Advisor Branch Name"
_T_DATE   = "Invoice Date"
_T_COMM   = "Revenue Club Commission Amount"
_T_SALES  = "Gross Sales Amount"


def travel_by_advisor(sd: str, ed: str) -> list[dict]:
    return _by_advisor(
        PBI_WS, TRAVEL_DS, _T_TABLE,
        _T_NAME, _T_BRANCH, _T_DATE, _T_COMM, _T_SALES,
        sd, ed,
    )


def travel_by_day(sd: str, ed: str) -> list[dict]:
    return _by_day(
        PBI_WS, TRAVEL_DS, _T_TABLE,
        _T_DATE, _T_COMM, _T_SALES,
        sd, ed,
    )


def travel_by_branch_day(sd: str, ed: str) -> list[dict]:
    return _by_branch_day(
        PBI_WS, TRAVEL_DS, _T_TABLE,
        _T_BRANCH, _T_DATE, _T_COMM, _T_SALES,
        sd, ed,
    )


def travel_by_advisor_day(sd: str, ed: str) -> list[dict]:
    return _by_advisor_day(
        PBI_WS, TRAVEL_DS, _T_TABLE,
        _T_NAME, _T_BRANCH, _T_DATE, _T_COMM, _T_SALES,
        sd, ed,
    )


# ── Insurance (BI Dataset - Insurance Transactions Invoices) ──────────────────
_I_TABLE  = "insurance_transactions_f"
_I_NAME   = "inserted_by_name"
_I_BRANCH = "branch_name"
_I_DATE   = "invoice_date_generation"
_I_COMM   = "commission_amount"
_I_SALES  = "transaction_amount"
# Restrict to AAA staff advisors only (excludes independent agents, support staff, etc.)
_I_FILTER = "'insurance_transactions_f'[assoc_job_title_grps] = \"Insurance Advisors\""


def insurance_by_advisor(sd: str, ed: str) -> list[dict]:
    return _by_advisor(
        PBI_WS, INSURANCE_DS, _I_TABLE,
        _I_NAME, _I_BRANCH, _I_DATE, _I_COMM, _I_SALES,
        sd, ed, _I_FILTER,
    )


def insurance_by_day(sd: str, ed: str) -> list[dict]:
    return _by_day(
        PBI_WS, INSURANCE_DS, _I_TABLE,
        _I_DATE, _I_COMM, _I_SALES,
        sd, ed, _I_FILTER,
    )


def insurance_by_branch_day(sd: str, ed: str) -> list[dict]:
    return _by_branch_day(
        PBI_WS, INSURANCE_DS, _I_TABLE,
        _I_BRANCH, _I_DATE, _I_COMM, _I_SALES,
        sd, ed, _I_FILTER,
    )


def insurance_by_advisor_day(sd: str, ed: str) -> list[dict]:
    return _by_advisor_day(
        PBI_WS, INSURANCE_DS, _I_TABLE,
        _I_NAME, _I_BRANCH, _I_DATE, _I_COMM, _I_SALES,
        sd, ed, _I_FILTER,
    )
