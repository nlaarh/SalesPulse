"""
reports_engine.py — PBI data queries + report generation orchestration.
Generates Travel Board Analysis HTML for any requested date range.
Saves reports to ~/.salesinsight/reports/ and maintains index.json.
"""
import os, sys, json, threading, logging
from datetime import date, datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'), override=False)

log = logging.getLogger("reports_engine")

REPORTS_DIR = Path.home() / ".salesinsight" / "reports"
INDEX_FILE  = REPORTS_DIR / "index.json"

PRODUCT_MAP = {
    "CRUISE":             "Cruise",
    "TOUR INTERNATIONAL": "International Tour",
    "INSURANCE":          "Travel Insurance",
    "TOUR DOMESTIC":      "Domestic Tour",
    "GROUP TOUR":         "Group Tour",
    "GROUP CRUISE":       "Group Cruise",
    "SERVICE FEE":        "Service Fee",
    "HOTEL":              "Hotel",
    "CAR":                "Car Rental",
}

CTYPE_MAP = {
    "Member":         "AAA Members",
    "Non-Member":     "Non-Members",
    "Group/Affinity": "Group/Affinity",
    "Aux":            "Aux. Members",
}

INTL_REGIONS = {
    "Europe", "Western Canada", "Alaska", "Great Britain", "Caribbean (E)",
    "Scandinavia", "Caribbean (S)", "Ireland", "Caribbean (W)", "Greece",
    "Mexico", "South America", "Caribbean (West)", "Eastern Canada",
    "Central America", "Hawaii",
}
DOM_REGIONS = {
    "United States", "South East USA", "North East USA", "Western USA",
    "Central USA", "Mid Atlantic", "New England", "Southeast USA",
}

MONTH_ORDER = {"JAN":1,"FEB":2,"MAR":3,"APR":4,"MAY":5,"JUN":6,
               "JUL":7,"AUG":8,"SEP":9,"OCT":10,"NOV":11,"DEC":12}
MONTH_LABEL = {"JAN":"Jan","FEB":"Feb","MAR":"Mar","APR":"Apr","MAY":"May","JUN":"Jun",
               "JUL":"Jul","AUG":"Aug","SEP":"Sep","OCT":"Oct","NOV":"Nov","DEC":"Dec"}


def _pbi():
    from pbi_client import dax_query, PBI_WS, TRAVEL_TRANSACTIONS_DS
    return dax_query, PBI_WS, TRAVEL_TRANSACTIONS_DS


def _df(sd: date, ed: date) -> str:
    """DAX FILTER expression for the date range."""
    return (f"'travel_transactions_f'[invoice_date] >= DATE({sd.year},{sd.month},{sd.day}) &&"
            f" 'travel_transactions_f'[invoice_date] <= DATE({ed.year},{ed.month},{ed.day})")


def query_totals(sd: date, ed: date) -> dict:
    dax, ws, ds = _pbi()
    q = f"""
EVALUATE
CALCULATETABLE(
    ROW(
        "commission", SUM('travel_transactions_f'[revenue_club_commission_amount]),
        "gross",      SUM('travel_transactions_f'[gross_sales_amount]),
        "customers",  DISTINCTCOUNT('travel_transactions_f'[primary_customer_id]),
        "trips",      DISTINCTCOUNT('travel_transactions_f'[trip_no])
    ),
    FILTER(ALL('travel_transactions_f'), {_df(sd, ed)})
)"""
    rows = dax(ws, ds, q)
    r = rows[0] if rows else {}
    return {
        "commission": r.get("[commission]", 0) or 0,
        "gross":      r.get("[gross]", 0) or 0,
        "customers":  int(r.get("[customers]", 0) or 0),
        "trips":      int(r.get("[trips]", 0) or 0),
    }


def query_customer_types(sd: date, ed: date) -> list:
    dax, ws, ds = _pbi()
    q = f"""
EVALUATE
CALCULATETABLE(
    ADDCOLUMNS(
        SUMMARIZE('travel_transactions_f', 'travel_transactions_f'[primary_customer_type]),
        "commission", CALCULATE(SUM('travel_transactions_f'[revenue_club_commission_amount])),
        "customers",  CALCULATE(DISTINCTCOUNT('travel_transactions_f'[primary_customer_id]))
    ),
    FILTER(ALL('travel_transactions_f'), {_df(sd, ed)})
)
ORDER BY [commission] DESC"""
    rows = dax(ws, ds, q)
    result = []
    for r in rows:
        raw  = r.get("travel_transactions_f[primary_customer_type]") or "Unknown"
        name = CTYPE_MAP.get(raw, raw)
        comm = r.get("[commission]", 0) or 0
        cust = int(r.get("[customers]", 0) or 0)
        if comm > 0 or cust > 0:
            result.append({"type": name, "commission": comm, "customers": cust})
    # Ensure Members is first
    result.sort(key=lambda x: x["commission"], reverse=True)
    return result


def query_products(sd: date, ed: date) -> list:
    dax, ws, ds = _pbi()
    q = f"""
EVALUATE
CALCULATETABLE(
    ADDCOLUMNS(
        SUMMARIZE('travel_transactions_f', 'travel_transactions_f'[product_description]),
        "commission", CALCULATE(SUM('travel_transactions_f'[revenue_club_commission_amount])),
        "gross",      CALCULATE(SUM('travel_transactions_f'[gross_sales_amount]))
    ),
    FILTER(ALL('travel_transactions_f'), {_df(sd, ed)})
)
ORDER BY [commission] DESC"""
    rows = dax(ws, ds, q)

    MARGINS = {"Cruise":13,"International Tour":13,"Travel Insurance":28,"Domestic Tour":10,
               "Group Tour":20,"Group Cruise":17,"Service Fee":97,"Hotel":8,"Car Rental":5}

    buckets = {}
    overrides_comm = 0; overrides_gross = 0
    for r in rows:
        raw  = (r.get("travel_transactions_f[product_description]") or "OTHER").upper()
        comm = r.get("[commission]", 0) or 0
        grs  = r.get("[gross]", 0) or 0
        name = PRODUCT_MAP.get(raw)
        if name:
            if name not in buckets:
                buckets[name] = {"name": name, "commission": 0, "gross": 0, "margin": MARGINS.get(name, 0)}
            buckets[name]["commission"] += comm
            buckets[name]["gross"]      += grs
        else:
            overrides_comm += comm; overrides_gross += grs

    if overrides_comm > 0:
        buckets["Overrides/Other"] = {"name": "Overrides/Other", "commission": overrides_comm,
                                      "gross": overrides_gross, "margin": 0}
    return sorted(buckets.values(), key=lambda x: x["commission"], reverse=True)


def query_destinations(sd: date, ed: date) -> list:
    dax, ws, ds = _pbi()
    q = f"""
EVALUATE
CALCULATETABLE(
    ADDCOLUMNS(
        SUMMARIZE('travel_transactions_f', 'travel_transactions_f'[destination_region]),
        "commission", CALCULATE(SUM('travel_transactions_f'[revenue_club_commission_amount])),
        "gross",      CALCULATE(SUM('travel_transactions_f'[gross_sales_amount])),
        "trips",      CALCULATE(DISTINCTCOUNT('travel_transactions_f'[trip_no]))
    ),
    FILTER(ALL('travel_transactions_f'), {_df(sd, ed)})
)
ORDER BY [commission] DESC"""
    rows = dax(ws, ds, q)
    result = []
    for r in rows:
        dest = r.get("travel_transactions_f[destination_region]")
        comm = r.get("[commission]", 0) or 0
        grs  = r.get("[gross]", 0) or 0
        trps = int(r.get("[trips]", 0) or 0)
        if comm == 0 and trps == 0: continue
        if dest is None:
            dest = "Group/Uncat."
            intl = None
        elif dest in INTL_REGIONS:
            intl = True
        elif dest in DOM_REGIONS:
            intl = False
        else:
            intl = None
        result.append({"dest": dest, "commission": comm, "gross": grs, "trips": trps, "intl": intl})
    return result


def query_monthly(sd: date, ed: date) -> list:
    """Returns sorted list of (label, commission, customers)."""
    dax, ws, ds = _pbi()
    q = f"""
EVALUATE
CALCULATETABLE(
    ADDCOLUMNS(
        SUMMARIZE('travel_transactions_f', 'travel_transactions_f'[fiscal_period_monthyear]),
        "commission", CALCULATE(SUM('travel_transactions_f'[revenue_club_commission_amount])),
        "customers",  CALCULATE(DISTINCTCOUNT('travel_transactions_f'[primary_customer_id]))
    ),
    FILTER(ALL('travel_transactions_f'), {_df(sd, ed)})
)"""
    rows = dax(ws, ds, q)

    raw = {}
    for r in rows:
        key  = r.get("travel_transactions_f[fiscal_period_monthyear]")
        comm = r.get("[commission]", 0) or 0
        cust = int(r.get("[customers]", 0) or 0)
        if key and comm > 0:
            raw[key] = (comm, cust)

    def sort_key(k):
        s = k.upper()
        return (int(s[3:]) + 2000, MONTH_ORDER.get(s[:3], 0))

    sorted_keys = sorted(raw.keys(), key=sort_key)
    result = []
    for k in sorted_keys:
        m = k[:3].upper(); y = k[3:]
        label = f"{MONTH_LABEL.get(m, m)} '{y}"
        comm, cust = raw[k]
        result.append((label, comm, cust))
    return result


def _run_all_queries(sd: date, ed: date) -> dict:
    """Run all 5 PBI queries in parallel threads."""
    results = {}
    tasks = {
        "totals":         lambda: query_totals(sd, ed),
        "customer_types": lambda: query_customer_types(sd, ed),
        "products":       lambda: query_products(sd, ed),
        "destinations":   lambda: query_destinations(sd, ed),
        "monthly":        lambda: query_monthly(sd, ed),
    }
    with ThreadPoolExecutor(max_workers=5) as ex:
        futures = {ex.submit(fn): name for name, fn in tasks.items()}
        for fut in as_completed(futures):
            name = futures[fut]
            try:
                results[name] = fut.result()
                log.info(f"Query '{name}' done")
            except Exception as e:
                log.error(f"Query '{name}' failed: {e}")
                results[name] = None
    return results


def _load_index() -> list:
    if INDEX_FILE.exists():
        try:
            return json.loads(INDEX_FILE.read_text())
        except Exception:
            return []
    return []


def _save_index(index: list):
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_FILE.write_text(json.dumps(index, indent=2, default=str))


def find_report(report_id: str) -> dict | None:
    for entry in _load_index():
        if entry.get("id") == report_id:
            path = REPORTS_DIR / entry["filename"]
            if path.exists():
                return entry
    return None


def list_reports() -> list:
    index = _load_index()
    # Attach file-exists check
    result = []
    for entry in index:
        path = REPORTS_DIR / entry.get("filename", "")
        if path.exists():
            result.append({**entry, "file_size_kb": round(path.stat().st_size / 1024)})
    result.sort(key=lambda x: x.get("generated_at", ""), reverse=True)
    return result


def _period_label(sd: date, ed: date) -> str:
    sm = sd.strftime("%b %Y"); em = ed.strftime("%b %-d, %Y")
    return f"{sm} – {em}"


def generate_report(sd: date, ed: date) -> str:
    """
    Generate the Travel Board HTML for the given date range.
    Returns the report_id on success.
    Raises on failure.
    """
    from reports_html import build_html

    report_id = f"travel_board_{sd.isoformat()}_{ed.isoformat()}"
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = REPORTS_DIR / f"{report_id}.html"

    log.info(f"Starting generation for {report_id}")
    data = _run_all_queries(sd, ed)

    # Validate core queries
    if not data.get("totals"):
        raise ValueError("PBI totals query returned no data")

    gen_at = datetime.now().strftime("%B %-d, %Y")
    payload = {
        "totals":          data["totals"],
        "customer_types":  data["customer_types"] or [],
        "products":        data["products"] or [],
        "destinations":    data["destinations"] or [],
        "monthly":         data["monthly"] or [],
        "period_label":    _period_label(sd, ed),
        "start_date_str":  sd.isoformat(),
        "end_date_str":    ed.isoformat(),
        "generated_at":    gen_at,
    }

    html = build_html(payload)
    out_path.write_text(html, encoding="utf-8")
    log.info(f"Written {out_path} ({out_path.stat().st_size // 1024}KB)")

    # Update index
    index = [e for e in _load_index() if e.get("id") != report_id]
    index.insert(0, {
        "id":           report_id,
        "type":         "travel_board",
        "start_date":   sd.isoformat(),
        "end_date":     ed.isoformat(),
        "label":        _period_label(sd, ed),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "filename":     f"{report_id}.html",
    })
    _save_index(index)
    return report_id


# ── pre-seed the existing 2-year report into the index ──────────────────────

def seed_existing_report():
    """Register the pre-generated 2-year HTML if it isn't in the index yet."""
    src = (Path(__file__).resolve().parent.parent
           / "Analysis_Apr" / "output" / "pdf"
           / "AAA_WCNY_Travel_Board_Analysis_2Years.html")
    if not src.exists():
        return
    report_id = "travel_board_2024-05-01_2026-06-11"
    if find_report(report_id):
        return
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    import shutil
    dest = REPORTS_DIR / f"{report_id}.html"
    shutil.copy2(src, dest)
    index = _load_index()
    index.insert(0, {
        "id":           report_id,
        "type":         "travel_board",
        "start_date":   "2024-05-01",
        "end_date":     "2026-06-11",
        "label":        "May 2024 – Jun 11, 2026",
        "generated_at": "2026-06-11T09:54:00",
        "filename":     f"{report_id}.html",
    })
    _save_index(index)
    log.info(f"Seeded existing 2-year report into index")


seed_existing_report()
