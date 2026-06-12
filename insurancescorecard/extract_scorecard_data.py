"""Insurance Concierge Scorecard Data Extractor.

Pulls three datasets and outputs a combined per-agent CSV:
  - TTEC (Power BI): nAlert, nHandled (call handling)
  - Membership MEID (Power BI): New Member Count, Membership Points
  - Epic (Databricks bronze): closed activities for 17 target activity codes

Usage:
    python extract_scorecard_data.py [--start YYYY-MM-DD] [--end YYYY-MM-DD]

Defaults to current month if no dates provided.
Output: scorecard_data_YYYYMM.csv in this folder.

Epic methodology (validated Jan-May 2026):
  closed_by_code + closed_date in range + closed_status IN ('S','U')
  Exact matches on most agents; Hannah Vought is a known exception —
  see ANALYSIS_NOTES.md for details.
"""
import os
import sys
import csv
import argparse
from datetime import date

from dotenv import load_dotenv

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, BACKEND)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"), override=True)

from pbi_client import dax_query, PBI_WS  # noqa: E402

# ── Dataset IDs ────────────────────────────────────────────────────────────────
TTEC_DS  = "5638b93f-2099-4708-8827-39d6d31beba0"  # _TTEC Insights Standard Model v2 Incremental
MEID_DS  = "ecbfc836-a420-45d7-8dbc-ff8560cff4b0"  # BI Dataset - Membership Sales v2

# Insurance departments to include in TTEC pull
INSURANCE_DEPTS = {
    "Insurance Concierge CC",
    "Insurance Concierge Branch",
    "Insurance Sales CC",
    "MIA - Medicare Ins",
    "MIA - Ins Telephone Sales",
}

# Epic activity codes that count toward the scorecard Activities metric
EPIC_ACTIVITY_CODES = (
    "CHGE", "CNPY", "CPOL", "CRAK", "CS24", "DPRI",
    "ECAN", "EMCO", "EMRM", "EREC", "EREI", "ENON",
    "KEMP", "OCOP", "MAIL", "RMAL", "SSIG",
)

# Epic full_name → display name overrides (securityuser name differs from roster)
EPIC_NAME_OVERRIDES = {
    "michael pappa": "Mike Pappas",
}


def _date_parts(d: str) -> tuple[int, int, int]:
    return int(d[:4]), int(d[5:7]), int(d[8:10])


def pull_ttec(start_date: str, end_date: str) -> dict[str, dict]:
    """nAlert and nHandled by agent from TTEC, filtered to insurance depts + date range."""
    dept_filter = " || ".join(
        f'Users[Department] = "{d}"' for d in INSURANCE_DEPTS
    )
    sy, sm, sd = _date_parts(start_date)
    ey, em, ed = _date_parts(end_date)
    query = f"""
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        Users[Full Name],
        Users[Department],
        Users[Manager Name],
        "nAlert",    [nAlert],
        "nAnswered", [nAnswered]
    ),
    FILTER(Users, {dept_filter}),
    'Global Calendar'[TheDate] >= DATE({sy},{sm},{sd}),
    'Global Calendar'[TheDate] <= DATE({ey},{em},{ed})
)
ORDER BY [nAlert] DESC
"""
    rows = dax_query(PBI_WS, TTEC_DS, query)
    result = {}
    for r in rows:
        name = r.get("Users[Full Name]") or ""
        result[name] = {
            "name":       name,
            "department": r.get("Users[Department]") or "",
            "manager":    r.get("Users[Manager Name]") or "",
            "n_alert":    int(r.get("[nAlert]") or 0),
            "n_handled":  int(r.get("[nAnswered]") or 0),
        }
    return result


def pull_membership(start_date: str, end_date: str) -> dict[str, dict]:
    """New Member Count and Membership Points by agent, filtered to MIA/Insurance depts."""
    dept_filter = (
        'SEARCH("MIA", Employee[Home Department], 1, 0) > 0 '
        '|| SEARCH("Insurance", Employee[Home Department], 1, 0) > 0'
    )
    # New members = any row where at least one New* flag is "Y"
    new_flag = (
        "'Membership Transactions Points'[New Basic] = \"Y\" "
        "|| 'Membership Transactions Points'[New Plus] = \"Y\" "
        "|| 'Membership Transactions Points'[New Plus Rv] = \"Y\" "
        "|| 'Membership Transactions Points'[New Premier] = \"Y\" "
        "|| 'Membership Transactions Points'[New Premier Rv] = \"Y\""
    )
    query = f"""
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        Employee[Full Name],
        Employee[Home Department],
        Employee[Supervisor],
        "NewMemberCount",  COUNTROWS(FILTER('Membership Transactions Points', {new_flag})),
        "MembershipPoints", SUM('Membership Transactions Points'[Membership Coverage Points])
    ),
    FILTER(Employee, {dept_filter}),
    'Membership Transactions Points'[Business Date] >= DATE({start_date[:4]},{start_date[5:7]},{start_date[8:10]}),
    'Membership Transactions Points'[Business Date] <= DATE({end_date[:4]},{end_date[5:7]},{end_date[8:10]})
)
ORDER BY [NewMemberCount] DESC
"""
    rows = dax_query(PBI_WS, MEID_DS, query)
    result = {}
    for r in rows:
        name = r.get("Employee[Full Name]") or ""
        result[name] = {
            "name":              name,
            "home_department":   r.get("Employee[Home Department]") or "",
            "supervisor":        r.get("Employee[Supervisor]") or "",
            "new_member_count":  int(r.get("[NewMemberCount]") or 0),
            "membership_points": int(r.get("[MembershipPoints]") or 0),
        }
    return result


def pull_epic_activities(start_date: str, end_date: str) -> dict[str, int]:
    """Closed Epic activities for the 17 target codes, keyed by agent full_name.

    Uses closed_by_code + closed_date approach — validated to match scorecard
    for most agents (Jan-May 2026 verification, 44/78 cell-exact match).
    Returns dict: normalized-full-name → activity count.
    """
    from routers.growth_queries import _run_query  # reuse existing Databricks helpers

    codes_sql = ", ".join(f"'{c}'" for c in EPIC_ACTIVITY_CODES)
    query = f"""
    SELECT s.full_name, COUNT(*) AS activity_count
    FROM dev_bronze_catalog.epic.activity a
    JOIN dev_bronze_catalog.epic.activitycode ac
         ON ac.uniq_activity_code = a.uniq_activity_code
    JOIN dev_bronze_catalog.epic.securityuser s
         ON s.user_code = a.closed_by_code
    WHERE ac.activity_code IN ({codes_sql})
      AND a.closed_status IN ('S', 'U')
      AND a.closed_date >= '{start_date}'
      AND a.closed_date <  '{end_date}'
    GROUP BY s.full_name
    ORDER BY 2 DESC
    """
    rows = _run_query(query)
    result: dict[str, int] = {}
    for row in rows:
        raw_name: str = (row.get("full_name") or "").strip()
        norm = _normalize(raw_name)
        display = EPIC_NAME_OVERRIDES.get(norm, raw_name)
        # accumulate in case two codes map to the same normalized name
        result[_normalize(display)] = result.get(_normalize(display), 0) + row["activity_count"]
    return result  # key = normalized display name, value = count


def pull_sf_walkins(start_date: str, end_date: str) -> dict[str, int]:
    """Completed branch walk-ins per agent from Salesforce AssignedResource.

    Work types: 'Personal Lines - Sales' and 'Personal Lines - Service'.
    Validated against scorecard Jan-Apr 2026 — exact or ±1 for most agents.
    Juliana Calamis Feb is a known spreadsheet anomaly (21 SF vs 69 sheet).
    Returns dict: normalized-agent-name → total count.
    """
    from sf_client import sf_query_all

    soql = f"""
SELECT ServiceResource.RelatedRecord.Name agent,
       COUNT(Id) total
FROM AssignedResource
WHERE ServiceAppointment.WorkType.Name IN ('Personal Lines - Sales','Personal Lines - Service')
  AND ServiceAppointment.Status = 'Completed'
  AND ServiceAppointment.SchedStartTime >= {start_date}T00:00:00Z
  AND ServiceAppointment.SchedStartTime <= {end_date}T23:59:59Z
GROUP BY ServiceResource.RelatedRecord.Name
ORDER BY ServiceResource.RelatedRecord.Name
"""
    rows = sf_query_all(soql)
    result: dict[str, int] = {}
    for row in rows:
        raw_name: str = (row.get("agent") or "").strip()
        if not raw_name:
            continue
        norm = _normalize(raw_name)
        result[norm] = result.get(norm, 0) + int(row.get("total") or 0)
    return result


def _normalize(name: str) -> str:
    """Lowercase + strip hyphens so 'Duenas-Galvis' matches 'Duenas Galvis'."""
    return name.lower().replace("-", " ").strip()


def merge_and_write(ttec: dict, membership: dict, epic: dict, walkins: dict, output_path: str) -> None:
    # Dedup by normalized name (case-insensitive + hyphen-agnostic).
    # Prefer the TTEC name variant; fall back to Membership, then Epic.
    norm_to_ttec: dict[str, str] = {}
    for name in ttec:
        norm_to_ttec[_normalize(name)] = name

    norm_to_mem: dict[str, str] = {}
    for name in membership:
        norm_to_mem[_normalize(name)] = name

    # epic and walkins keys are already normalized
    all_norms = sorted(set(norm_to_ttec) | set(norm_to_mem) | set(epic) | set(walkins))
    fieldnames = [
        "name", "department", "manager",
        "n_alert", "n_handled",
        "new_member_count", "membership_points",
        "activities", "walkins",
    ]
    rows = []
    for norm in all_norms:
        canonical = norm_to_ttec.get(norm) or norm_to_mem.get(norm) or norm
        t = ttec.get(norm_to_ttec[norm], {}) if norm in norm_to_ttec else {}
        m = membership.get(norm_to_mem[norm], {}) if norm in norm_to_mem else {}
        rows.append({
            "name":              canonical,
            "department":        t.get("department") or m.get("home_department") or "",
            "manager":           t.get("manager") or m.get("supervisor") or "",
            "n_alert":           t.get("n_alert", 0),
            "n_handled":         t.get("n_handled", 0),
            "new_member_count":  m.get("new_member_count", 0),
            "membership_points": m.get("membership_points", 0),
            "activities":        epic.get(norm, 0),
            "walkins":           walkins.get(norm, 0),
        })

    rows.sort(key=lambda r: (-r["new_member_count"], -r["n_alert"]))

    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nWrote {len(rows)} agents → {output_path}")
    print(f"\n{'Agent':<28} {'Dept':<22} {'nAlert':>7} {'nHandled':>9} {'NewMem':>7} {'Pts':>5} {'Acts':>6} {'Walkins':>8}")
    print("-" * 102)
    for r in rows:
        print(
            f"{r['name']:<28} {r['department']:<22} "
            f"{r['n_alert']:>7,} {r['n_handled']:>9,} "
            f"{r['new_member_count']:>7,} {r['membership_points']:>5,} {r['activities']:>6,} {r['walkins']:>8,}"
        )


def main():
    parser = argparse.ArgumentParser(description="Extract insurance scorecard data from Power BI")
    today = date.today()
    default_start = today.replace(day=1).isoformat()
    default_end   = today.isoformat()
    parser.add_argument("--start", default=default_start, help=f"Start date YYYY-MM-DD (default: {default_start})")
    parser.add_argument("--end",   default=default_end,   help=f"End date YYYY-MM-DD (default: {default_end})")
    args = parser.parse_args()

    print(f"Extracting scorecard data: {args.start} → {args.end}")
    print()

    print("Pulling TTEC call data (nAlert, nHandled)...")
    ttec = pull_ttec(args.start, args.end)
    print(f"  {len(ttec)} insurance agents found in TTEC")

    print("Pulling Membership Sales data (New Member Count, Points)...")
    membership = pull_membership(args.start, args.end)
    print(f"  {len(membership)} agents found in Membership MEID")

    print("Pulling Epic closed activities (17 activity codes from Databricks)...")
    # Epic query uses closed_date; pass end_date exclusive (day after args.end)
    from datetime import timedelta
    end_exclusive = (date.fromisoformat(args.end) + timedelta(days=1)).isoformat()
    epic = pull_epic_activities(args.start, end_exclusive)
    print(f"  {len(epic)} agents found in Epic")

    print("Pulling SF branch walk-ins (Personal Lines - Sales/Service)...")
    walkins = pull_sf_walkins(args.start, args.end)
    print(f"  {len(walkins)} agents found in SF walk-ins")

    month_tag = args.start[:7].replace("-", "")
    output = os.path.join(os.path.dirname(__file__), f"scorecard_data_{month_tag}.csv")
    merge_and_write(ttec, membership, epic, walkins, output)


if __name__ == "__main__":
    main()
