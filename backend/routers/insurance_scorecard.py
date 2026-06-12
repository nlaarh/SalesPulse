"""Insurance Concierge Scorecard — live, date-filtered, all-internet data sources.

Reproduces the manual "Performance Metric Data Entries" table from the
Insurance Concierge Scorecards spreadsheet. Spec: memory/sales-analyst.md §16.

Data sources (all reachable from Azure — no VPN):
  activities        PBI Insurance Comprehensive v1 → insurance_activity_f (DirectQuery→Databricks)
  n_alert/n_handled PBI _TTEC Insights Standard Model v2 Incremental
  new_members/points PBI Membership Sales v2 (MEID), Business Date field
  walkins           Salesforce AssignedResource (branch agents)
  audits            PBI _TTEC Insights Quality Model v2 (Evaluations + Evaluation Scores)

Validated 2026-06-11: activities 37/44 exact vs Databricks extract (April 2026).
"""
import csv
import io
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from auth import get_current_user
from cache import cached_query
from pbi_client import dax_query, PBI_WS

router = APIRouter(prefix="/api/insurance-scorecard", tags=["insurance-scorecard"])
log = logging.getLogger("insurance_scorecard")

# ── Dataset IDs ───────────────────────────────────────────────────────────────
INS_COMPREHENSIVE_DS = "ec6cf035-8a75-4cd3-b049-4274576a45bb"  # v1 — has insurance_activity_f
TTEC_DS              = "5638b93f-2099-4708-8827-39d6d31beba0"  # Standard Model v2 Incremental
MEID_DS              = "ecbfc836-a420-45d7-8dbc-ff8560cff4b0"  # Membership Sales v2
QUALITY_DS           = "0b720ee0-a037-4a53-a2a7-a0418f1ba884"  # Quality Model v2

# Roster rule (validated vs the manual scorecard 2026-06-12):
# the scorecard covers the "Insurance Concierge" JOB FAMILY in the two Concierge
# departments — not all insurance agents. Title filter excludes Commercial
# Insurance Concierge (Cindy VanHoesen) and Quality Control Specialists.
# No status filter: departed agents (e.g. Yasmin Brown) stay for historical months.
INSURANCE_DEPTS = (
    "Insurance Concierge CC",
    "Insurance Concierge Branch",
)
CONCIERGE_TITLE_FILTER = (
    'SEARCH("Insurance Concierge", Users[Job Title], 1, 0) > 0'
    ' && NOT(SEARCH("Commercial", Users[Job Title], 1, 0) > 0)'
    ' && NOT(SEARCH("Quality Control", Users[Job Title], 1, 0) > 0)'
)
BRANCH_DEPTS = {"Insurance Concierge Branch"}

# Epic activity codes counted toward Activities (spec §16)
EPIC_ACTIVITY_CODES = (
    "CHGE", "CNPY", "CPOL", "CRAK", "CS24", "DPRI",
    "ECAN", "EMCO", "EMRM", "EREC", "EREI", "ENON",
    "KEMP", "OCOP", "MAIL", "RMAL", "SSIG",
)

# Cross-system name variants → canonical normalized key.
# Applied to EVERY source (TTEC, Epic, MEID, SF, Quality) so one person's data
# merges regardless of which spelling each system uses.
NAME_OVERRIDES = {
    "michael pappa":  "mike pappas",   # TTEC + Epic spelling
    "michael pappas": "mike pappas",   # SF spelling
}
# Canonical display names where the TTEC roster spelling isn't the one used on the scorecard
DISPLAY_OVERRIDES = {
    "mike pappas": "Mike Pappas",
}

# Evaluations with TotalScore >= threshold count as "Audit Correct" (0-1 scale)
AUDIT_CORRECT_THRESHOLD = 0.9

# Azure AD tenant — appended to PBI links so they open in the right org
_TENANT = "87c1e7cf-b6c4-434f-b18e-5444b1bce3bb"


def _norm(name: str) -> str:
    """Canonical merge key: lowercase, strip hyphens/commas, apply cross-system overrides."""
    key = (name or "").lower().replace("-", " ").replace(",", "").strip()
    return NAME_OVERRIDES.get(key, key)


def _dax_date(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"DATE({y},{int(m)},{int(d)})"


def _dax_date_next(iso: str) -> str:
    """Day AFTER iso — for exclusive upper bounds on datetime-bearing columns.

    insurance_activity_f[closed_date] and Evaluations[Conversation Date] carry
    time components; `<= DATE(end)` silently drops the end day's afternoon.
    """
    from datetime import timedelta
    nxt = date.fromisoformat(iso) + timedelta(days=1)
    return f"DATE({nxt.year},{nxt.month},{nxt.day})"


# ── Source pulls (each returns dict keyed by normalized agent name) ──────────

def _pull_activities(sd: str, ed: str) -> dict[str, int]:
    """Epic closed activities via PBI DirectQuery. End date inclusive."""
    codes = ", ".join(f'"{c}"' for c in EPIC_ACTIVITY_CODES)
    rows = dax_query(PBI_WS, INS_COMPREHENSIVE_DS, f"""
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'insurance_activity_f'[closed_by_name],
        "activity_count", COUNTROWS('insurance_activity_f')
    ),
    FILTER(ALL('insurance_activity_f'),
        'insurance_activity_f'[activity_category_code] IN {{{codes}}}
        && 'insurance_activity_f'[closed_status] IN {{"S", "U"}}
        && 'insurance_activity_f'[closed_date] >= {_dax_date(sd)}
        && 'insurance_activity_f'[closed_date] < {_dax_date_next(ed)}
    )
)""")
    result: dict[str, int] = {}
    for r in rows:
        raw = (r.get("insurance_activity_f[closed_by_name]") or "").strip()
        if not raw:
            continue  # NULL closed_by_name rows are unattributable
        key = _norm(raw)
        result[key] = result.get(key, 0) + int(r.get("[activity_count]") or 0)
    return result


def _pull_ttec(sd: str, ed: str) -> dict[str, dict]:
    """nAlert + nAnswered per agent. This pull IS the scorecard roster:
    Concierge departments + Insurance Concierge job-title family only.

    ADDCOLUMNS over the filtered roster (not SUMMARIZECOLUMNS) so agents with
    zero calls in the period still appear — the sheet lists them with blanks.
    """
    dept_filter = " || ".join(f'Users[Department] = "{d}"' for d in INSURANCE_DEPTS)
    date_filter = (f"'Global Calendar'[TheDate] >= {_dax_date(sd)},"
                   f" 'Global Calendar'[TheDate] <= {_dax_date(ed)}")
    rows = dax_query(PBI_WS, TTEC_DS, f"""
EVALUATE
SELECTCOLUMNS(
    ADDCOLUMNS(
        FILTER(Users, ({dept_filter}) && {CONCIERGE_TITLE_FILTER}),
        "alert_n",    CALCULATE([nAlert], {date_filter}),
        "answered_n", CALCULATE([nAnswered], {date_filter})
    ),
    "Users[Full Name]",    Users[Full Name],
    "Users[Department]",   Users[Department],
    "Users[Manager Name]", Users[Manager Name],
    "nAlert",              [alert_n],
    "nAnswered",           [answered_n]
)""")
    result: dict[str, dict] = {}
    for r in rows:
        name = (r.get("Users[Full Name]") or "").strip()
        if not name:
            continue
        result[_norm(name)] = {
            "name":       name,
            "department": r.get("Users[Department]") or "",
            "manager":    r.get("Users[Manager Name]") or "",
            "n_alert":    int(r.get("[nAlert]") or 0),
            "n_handled":  int(r.get("[nAnswered]") or 0),
        }
    return result


def _pull_membership(sd: str, ed: str) -> dict[str, dict]:
    """New member count + membership points (MEID, Business Date)."""
    new_flag = (
        "'Membership Transactions Points'[New Basic] = \"Y\" "
        "|| 'Membership Transactions Points'[New Plus] = \"Y\" "
        "|| 'Membership Transactions Points'[New Plus Rv] = \"Y\" "
        "|| 'Membership Transactions Points'[New Premier] = \"Y\" "
        "|| 'Membership Transactions Points'[New Premier Rv] = \"Y\""
    )
    rows = dax_query(PBI_WS, MEID_DS, f"""
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        Employee[Full Name],
        "NewMemberCount",   COUNTROWS(FILTER('Membership Transactions Points', {new_flag})),
        "MembershipPoints", SUM('Membership Transactions Points'[Membership Coverage Points])
    ),
    FILTER(Employee,
        SEARCH("MIA", Employee[Home Department], 1, 0) > 0
        || SEARCH("Insurance", Employee[Home Department], 1, 0) > 0),
    'Membership Transactions Points'[Business Date] >= {_dax_date(sd)},
    'Membership Transactions Points'[Business Date] <= {_dax_date(ed)}
)""")
    result: dict[str, dict] = {}
    for r in rows:
        name = (r.get("Employee[Full Name]") or "").strip()
        if not name:
            continue
        result[_norm(name)] = {
            "new_members": int(r.get("[NewMemberCount]") or 0),
            "mbr_points":  int(r.get("[MembershipPoints]") or 0),
        }
    return result


def _pull_walkins(sd: str, ed: str) -> dict[str, int]:
    """Completed branch walk-ins per agent from Salesforce."""
    from sf_client import sf_query_all
    rows = sf_query_all(f"""
SELECT ServiceResource.RelatedRecord.Name agent, COUNT(Id) total
FROM AssignedResource
WHERE ServiceAppointment.WorkType.Name IN ('Personal Lines - Sales','Personal Lines - Service')
  AND ServiceAppointment.Status = 'Completed'
  AND ServiceAppointment.SchedStartTime >= {sd}T00:00:00Z
  AND ServiceAppointment.SchedStartTime <= {ed}T23:59:59Z
GROUP BY ServiceResource.RelatedRecord.Name
""")
    result: dict[str, int] = {}
    for row in rows:
        name = _norm(row.get("agent") or "")
        if name:
            result[name] = result.get(name, 0) + int(row.get("total") or 0)
    return result


def _pull_audits(sd: str, ed: str) -> dict[str, dict]:
    """Audits scored + correct (TotalScore >= threshold) per agent."""
    rows = dax_query(PBI_WS, QUALITY_DS, f"""
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        Agents[Agent],
        "audits",  COUNTROWS(Evaluations),
        "correct", COUNTROWS(FILTER('Evaluation Scores',
                       'Evaluation Scores'[TotalScore] >= {AUDIT_CORRECT_THRESHOLD}))
    ),
    FILTER(ALL(Evaluations),
        Evaluations[Conversation Date] >= {_dax_date(sd)} &&
        Evaluations[Conversation Date] < {_dax_date_next(ed)}),
    FILTER(Agents,
        SEARCH("Insurance", Agents[Department], 1, 0) > 0
        || SEARCH("MIA", Agents[Department], 1, 0) > 0
        || SEARCH("Concierge", Agents[Department], 1, 0) > 0)
)""")
    result: dict[str, dict] = {}
    for r in rows:
        name = (r.get("Agents[Agent]") or "").strip()
        if not name:
            continue
        result[_norm(name)] = {
            "audits_scored":  int(r.get("[audits]") or 0),
            "audits_correct": int(r.get("[correct]") or 0),
        }
    return result


# ── Merge ─────────────────────────────────────────────────────────────────────

def _build_scorecard(sd: str, ed: str) -> dict:
    """Pull all 5 sources in parallel and merge into per-agent rows."""
    with ThreadPoolExecutor(max_workers=5) as ex:
        futures = {
            "activities": ex.submit(_pull_activities, sd, ed),
            "ttec":       ex.submit(_pull_ttec, sd, ed),
            "membership": ex.submit(_pull_membership, sd, ed),
            "walkins":    ex.submit(_pull_walkins, sd, ed),
            "audits":     ex.submit(_pull_audits, sd, ed),
        }
        data, errors = {}, {}
        for key, fut in futures.items():
            try:
                data[key] = fut.result()
            except Exception as e:
                log.error(f"Scorecard source '{key}' failed: {e}")
                data[key] = {}
                errors[key] = str(e)[:200]

    ttec       = data["ttec"]
    activities = data["activities"]
    membership = data["membership"]
    walkins    = data["walkins"]
    audits     = data["audits"]

    # Roster = the TTEC Concierge pull ONLY. Other sources contribute data for
    # roster members; their non-roster agents (sales advisors, Medicare, etc.)
    # are out of scope for this scorecard.
    agents = []
    for key, info in ttec.items():
        mem = membership.get(key, {})
        aud = audits.get(key, {})
        dept = info["department"]
        agents.append({
            "name":           DISPLAY_OVERRIDES.get(key, info["name"]),
            "department":     dept,
            "manager":        info["manager"],
            "group":          "branch" if dept in BRANCH_DEPTS else "cc",
            "activities":     activities.get(key, 0),
            "calls_answered": info["n_handled"],
            "walkins":        walkins.get(key, 0),
            "alerted":        info["n_alert"],
            "answered":       info["n_handled"],
            "audits_scored":  aud.get("audits_scored", 0),
            "audits_correct": aud.get("audits_correct", 0),
            "new_members":    mem.get("new_members", 0),
            "mbr_points":     mem.get("mbr_points", 0),
        })

    # Drop all-zero rows: clears legacy departed agents (old "Member Experience"
    # titles, all status=deleted) while keeping anyone with data in the period —
    # departed agents with history (e.g. Yasmin Brown) still show.
    agents = [a for a in agents if any(
        a[f] for f in ("activities", "calls_answered", "walkins", "alerted",
                       "audits_scored", "new_members", "mbr_points"))]
    agents.sort(key=lambda a: (-a["activities"], a["name"]))

    return {
        "start_date": sd,
        "end_date":   ed,
        "agents":     agents,
        "source_errors": errors,
        "sources": {
            "activities": {
                "label": "PBI Insurance Comprehensive — insurance_activity_f (Epic via DirectQuery)",
                "url":   f"https://app.powerbi.com/groups/{PBI_WS}/reports/f07ebf54-3d67-4b17-ade9-460db1f8bf25?ctid={_TENANT}",
            },
            "calls": {
                "label": "PBI TTEC Standard Model v2 (nAlert / nAnswered)",
                "url":   f"https://app.powerbi.com/groups/{PBI_WS}/reports/bdb5910b-388d-4a71-8e4c-743589ca6653?ctid={_TENANT}",
            },
            "membership": {
                "label": "PBI Membership Employee Incentive Detail (MEID, Business Date)",
                "url":   f"https://app.powerbi.com/groups/me/reports/be41cc35-9c8f-4d3d-abd7-335b1dec6335?ctid={_TENANT}",
            },
            "walkins": {
                "label": "Salesforce Service Appointments (Personal Lines, Completed)",
                "url":   "https://aaawcny.my.salesforce.com/lightning/o/ServiceAppointment/list",
            },
            "audits": {
                "label": f"PBI TTEC Quality Model v2 (correct = TotalScore >= {AUDIT_CORRECT_THRESHOLD})",
                "url":   f"https://app.powerbi.com/groups/{PBI_WS}/reports/077d76d5-7faf-49fb-8f97-eb025b6f454b?ctid={_TENANT}",
            },
        },
    }


def _validate_range(sd: str, ed: str):
    try:
        s, e = date.fromisoformat(sd), date.fromisoformat(ed)
    except ValueError:
        raise HTTPException(400, "Dates must be YYYY-MM-DD")
    if s > e:
        raise HTTPException(400, "start_date must be on or before end_date")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def get_scorecard(start_date: str, end_date: str, _user=Depends(get_current_user)):
    """Per-agent scorecard for the date range (inclusive)."""
    _validate_range(start_date, end_date)
    key = f"ins_scorecard_{start_date}_{end_date}"
    return cached_query(key, lambda: _build_scorecard(start_date, end_date),
                        ttl=3600, disk_ttl=86400)


@router.get("/export")
def export_scorecard(start_date: str, end_date: str, _user=Depends(get_current_user)):
    """CSV export with the exact spreadsheet column layout."""
    _validate_range(start_date, end_date)
    key = f"ins_scorecard_{start_date}_{end_date}"
    data = cached_query(key, lambda: _build_scorecard(start_date, end_date),
                        ttl=3600, disk_ttl=86400)

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Employee", "Department", "Group", "Activities", "Calls Answered",
                "Walk-Ins", "Alerted", "Answered", "Audits Scored", "Audit Correct",
                "New Members", "Mbr Points"])
    for a in data["agents"]:
        w.writerow([a["name"], a["department"], a["group"].upper(), a["activities"],
                    a["calls_answered"], a["walkins"], a["alerted"], a["answered"],
                    a["audits_scored"], a["audits_correct"],
                    a["new_members"], a["mbr_points"]])
    buf.seek(0)
    fname = f"insurance_scorecard_{start_date}_{end_date}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/validate")
def validate_scorecard(_user=Depends(get_current_user)):
    """Compare live April 2026 numbers against the verified Databricks extract.

    Reference: insurancescorecard/scorecard_data_202604.csv (frozen 2026-06).
    Returns per-agent diffs. The manual spreadsheet is NOT used as truth —
    it has verified copy errors (see sales-analyst.md §16).
    """
    import os
    ref_path = os.path.join(os.path.dirname(__file__), "..", "..",
                            "insurancescorecard", "scorecard_data_202604.csv")
    if not os.path.exists(ref_path):
        raise HTTPException(404, "Reference extract not found (local dev only)")

    reference: dict[str, dict] = {}
    with open(ref_path) as f:
        for row in csv.DictReader(f):
            reference[_norm(row["name"])] = {
                "activities":  int(row["activities"] or 0),
                "n_alert":     int(row["n_alert"] or 0),
                "n_handled":   int(row["n_handled"] or 0),
                "new_members": int(row["new_member_count"] or 0),
                "mbr_points":  int(row["membership_points"] or 0),
                "walkins":     int(row["walkins"] or 0),
            }

    live = _build_scorecard("2026-04-01", "2026-04-30")
    live_by_name = {_norm(a["name"]): a for a in live["agents"]}

    fields = [("activities", "activities"), ("alerted", "n_alert"),
              ("answered", "n_handled"), ("new_members", "new_members"),
              ("mbr_points", "mbr_points"), ("walkins", "walkins")]
    results, stats = [], {f[0]: {"exact": 0, "total": 0} for f in fields}
    for key, ref in reference.items():
        lv = live_by_name.get(key)
        row = {"name": key.title(), "in_live": lv is not None, "fields": {}}
        for live_f, ref_f in fields:
            ref_v = ref[ref_f]
            live_v = lv[live_f] if lv else None
            match = live_v == ref_v
            row["fields"][live_f] = {"reference": ref_v, "live": live_v, "match": match}
            if ref_v or (live_v or 0):
                stats[live_f]["total"] += 1
                if match:
                    stats[live_f]["exact"] += 1
        results.append(row)

    return {"period": "2026-04", "reference": "scorecard_data_202604.csv",
            "summary": stats, "agents": results}
