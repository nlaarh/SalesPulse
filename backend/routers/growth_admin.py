"""
Growth Data Refresh — pulls fresh data from Databricks and updates seed CSVs.

Admin-only endpoint. Re-runs the same queries as Analysis_Apr/strategic_report/databricks_loader.py
but writes to backend/seed_data/growth_data/ so the growth dashboard serves live data.

Source tables:
  - dev_bronze_catalog.legacy_datawarehouse.membership_consolidated
  - dev_silver_catalog.data_warehouse.insurance_client_accounts_f
  - dev_silver_catalog.data_warehouse.insurance_policies_f
  - dev_silver_catalog.data_warehouse.travel_store_transactions_f
  - dev_silver_catalog.data_warehouse.battery_test_transactions_f
  - dev_silver_catalog.data_warehouse.ers_calls_details
  - dev_gold_catalog.business_intelligence.crm_account
"""
from __future__ import annotations
import csv
import json
import os
import shutil
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, BackgroundTasks, UploadFile, File
from dotenv import load_dotenv

from auth import require_admin

router = APIRouter(tags=["growth-admin"])

SEED_DIR = Path(__file__).resolve().parent.parent / "seed_data"
DATA_DIR = SEED_DIR / "growth_data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
BACKUP_DIR = SEED_DIR / "growth_backups"
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

# Load .env from project root
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# Track refresh status
_refresh_status = {"running": False, "last_run": None, "last_error": None, "results": {}}


def _get_conn():
    """Create Databricks SQL connection."""
    from databricks import sql
    host = os.environ.get("DATABRICKS_HOST", "").replace("https://", "")
    token = os.environ.get("DATABRICKS_TOKEN", "")
    http_path = os.environ.get("DATABRICKS_HTTP_PATH", "")
    if not all([host, token, http_path]):
        raise RuntimeError("DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_HTTP_PATH must be set")
    return sql.connect(server_hostname=host, http_path=http_path, access_token=token)


def _run_query(query: str) -> list[dict]:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(query)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def _save_csv(rows: list[dict], name: str) -> int:
    path = DATA_DIR / name
    if not rows:
        path.write_text("")
        return 0
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    return len(rows)


def _territory_zips() -> list[str]:
    """Get territory ZIPs from pre-exported JSON."""
    path = DATA_DIR / "territory_zips.json"
    if path.exists():
        with path.open() as f:
            return list(json.load(f).keys())
    return []


def _zip_in_clause(zips: list[str]) -> str:
    return "(" + ",".join(f"'{z}'" for z in zips) + ")"


# ─── Refresh Queries ─────────────────────────────────────────────────────

def _refresh_members(zips: list[str]) -> int:
    in_clause = _zip_in_clause(zips)
    today = date.today().isoformat()
    q = f"""
    WITH latest AS (
      SELECT  membership_unique_id,
              LPAD(customer_address_postal_code, 5, '0') AS zip,
              membership_card_expiry_date,
              membership_effective_date,
              membership_status_code,
              ROW_NUMBER() OVER (
                  PARTITION BY membership_unique_id
                  ORDER BY record_create_date DESC, membership_effective_date DESC
              ) AS rn
      FROM    dev_bronze_catalog.legacy_datawarehouse.membership_consolidated
      WHERE   customer_address_state IN ('NY','New York','NEW YORK')
        AND   customer_address_region IN ('WESTERN','ROCHESTER','CENTRAL')
        AND   source LIKE 'MEMBERS%'
    )
    SELECT  zip,
            COUNT(*) AS total_members,
            SUM(CASE WHEN membership_status_code = 'A' THEN 1 ELSE 0 END) AS active_members,
            SUM(CASE WHEN membership_card_expiry_date >= DATE('{today}') THEN 1 ELSE 0 END) AS card_unexpired,
            SUM(CASE WHEN membership_card_expiry_date < DATE('{today}') THEN 1 ELSE 0 END) AS expired_members,
            ROUND(AVG(DATEDIFF(DATE('{today}'), membership_effective_date) / 365.0), 2) AS avg_tenure_yrs
    FROM    latest
    WHERE   rn = 1 AND zip IN {in_clause}
    GROUP BY 1 ORDER BY 3 DESC
    """
    return _save_csv(_run_query(q), "members_by_zip.csv")


def _refresh_insurance(zips: list[str]) -> int:
    in_clause = _zip_in_clause(zips)
    today = date.today().isoformat()
    q = f"""
    WITH active_pol AS (
        SELECT pol.fk_client_id, UPPER(TRIM(pol.cd_policy_line_type_code)) AS line
        FROM   dev_silver_catalog.data_warehouse.insurance_policies_f pol
        WHERE  pol.expiration_date >= DATE('{today}') OR pol.expiration_date IS NULL
    ),
    client_zip AS (
        SELECT acc.fk_client_id, LPAD(crm.`Billing Postal Code`, 5, '0') AS zip
        FROM   dev_silver_catalog.data_warehouse.insurance_client_accounts_f acc
        JOIN   dev_gold_catalog.business_intelligence.crm_account crm
               ON crm.`Account Member ID` = acc.primary_contact_member_number
        WHERE  acc.active_flag = 'Y'
          AND  crm.`Billing State` IN ('NY','New York','NEW YORK')
    )
    SELECT  cz.zip,
            COUNT(DISTINCT CASE WHEN ap.line = 'AUTO' THEN ap.fk_client_id END) AS auto_customers,
            COUNT(DISTINCT CASE WHEN ap.line = 'HOME' THEN ap.fk_client_id END) AS home_customers,
            COUNT(DISTINCT CASE WHEN ap.line = 'PUMB' THEN ap.fk_client_id END) AS umbrella_customers,
            COUNT(DISTINCT ap.fk_client_id) AS total_customers
    FROM    client_zip cz
    JOIN    active_pol ap ON ap.fk_client_id = cz.fk_client_id
    WHERE   cz.zip IN {in_clause}
    GROUP BY 1 ORDER BY 5 DESC
    """
    return _save_csv(_run_query(q), "insurance_by_zip.csv")


def _refresh_travel(zips: list[str]) -> int:
    in_clause = _zip_in_clause(zips)
    cutoff = (date.today() - timedelta(days=365 * 3)).isoformat()
    q = f"""
    WITH txn AS (
        SELECT  customer_identifier,
                COUNT(*) AS txn_count,
                SUM(CAST(NULLIF(sales_amount,'') AS DOUBLE)) AS revenue
        FROM    dev_silver_catalog.data_warehouse.travel_store_transactions_f
        WHERE   transaction_date >= '{cutoff}' AND customer_identifier IS NOT NULL
        GROUP BY 1
    ),
    cust_zip AS (
        SELECT  `Account Member ID` AS member_id, LPAD(`Billing Postal Code`, 5, '0') AS zip
        FROM    dev_gold_catalog.business_intelligence.crm_account
        WHERE   `Billing State` IN ('NY','New York','NEW YORK')
          AND   `Record Type Name` = 'Person Account' AND `Account Member ID` IS NOT NULL
    )
    SELECT  cz.zip,
            COUNT(DISTINCT t.customer_identifier) AS travel_customers_3yr,
            SUM(t.txn_count) AS travel_transactions_3yr,
            ROUND(SUM(t.revenue), 0) AS travel_revenue_3yr
    FROM    cust_zip cz JOIN txn t ON t.customer_identifier = cz.member_id
    WHERE   cz.zip IN {in_clause}
    GROUP BY 1 ORDER BY 2 DESC
    """
    return _save_csv(_run_query(q), "travel_by_zip.csv")


def _refresh_battery(zips: list[str]) -> int:
    in_clause = _zip_in_clause(zips)
    cutoff = (date.today() - timedelta(days=365 * 3)).isoformat()
    q = f"""
    WITH bat AS (
        SELECT customer_unique_id, LOWER(COALESCE(test_result,'')) AS result
        FROM   dev_silver_catalog.data_warehouse.battery_test_transactions_f
        WHERE  test_date >= DATE('{cutoff}') AND customer_unique_id IS NOT NULL
    ),
    cust_zip AS (
        SELECT `Account Member ID` AS member_id, LPAD(`Billing Postal Code`, 5, '0') AS zip
        FROM   dev_gold_catalog.business_intelligence.crm_account
        WHERE  `Billing State` IN ('NY','New York','NEW YORK')
          AND  `Record Type Name` = 'Person Account' AND `Account Member ID` IS NOT NULL
    )
    SELECT  cz.zip,
            COUNT(*) AS battery_tests_3yr,
            COUNT(DISTINCT b.customer_unique_id) AS unique_battery_customers_3yr
    FROM    cust_zip cz JOIN bat b ON b.customer_unique_id = cz.member_id
    WHERE   cz.zip IN {in_clause}
    GROUP BY 1 ORDER BY 2 DESC
    """
    return _save_csv(_run_query(q), "battery_by_zip.csv")


def _refresh_ers(zips: list[str]) -> int:
    in_clause = _zip_in_clause(zips)
    cutoff = (date.today() - timedelta(days=365)).isoformat()
    q = f"""
    WITH ers AS (
        SELECT MemberNumber, CallNumber
        FROM   dev_silver_catalog.data_warehouse.ers_calls_details
        WHERE  ServiceDate >= TIMESTAMP('{cutoff}') AND MemberNumber IS NOT NULL
    ),
    cust_zip AS (
        SELECT `Account Member ID` AS member_id, LPAD(`Billing Postal Code`, 5, '0') AS zip
        FROM   dev_gold_catalog.business_intelligence.crm_account
        WHERE  `Billing State` IN ('NY','New York','NEW YORK')
          AND  `Record Type Name` = 'Person Account' AND `Account Member ID` IS NOT NULL
    )
    SELECT  cz.zip,
            COUNT(*) AS ers_calls_12mo,
            COUNT(DISTINCT e.MemberNumber) AS ers_unique_members_12mo
    FROM    cust_zip cz JOIN ers e ON e.MemberNumber = cz.member_id
    WHERE   cz.zip IN {in_clause}
    GROUP BY 1 ORDER BY 2 DESC
    """
    return _save_csv(_run_query(q), "ers_by_zip.csv")


def _refresh_ltv(zips: list[str]) -> int:
    in_clause = _zip_in_clause(zips)
    q = f"""
    SELECT
      LPAD(`Billing Postal Code`, 5, '0') AS zip,
      COUNT(*) AS active_members,
      SUM(CASE WHEN UPPER(LEFT(LTV,1)) = 'A' THEN 1 ELSE 0 END) AS ltv_a,
      SUM(CASE WHEN UPPER(LEFT(LTV,1)) = 'B' THEN 1 ELSE 0 END) AS ltv_b,
      SUM(CASE WHEN UPPER(LEFT(LTV,1)) = 'C' THEN 1 ELSE 0 END) AS ltv_c,
      SUM(CASE WHEN UPPER(LEFT(LTV,1)) = 'D' THEN 1 ELSE 0 END) AS ltv_d,
      SUM(CASE WHEN UPPER(LEFT(LTV,1)) = 'E' THEN 1 ELSE 0 END) AS ltv_e,
      ROUND(AVG(try_cast(MPI AS DOUBLE)), 3) AS avg_mpi,
      ROUND(AVG(try_cast(REGEXP_EXTRACT(Tenure, '([0-9]+)', 1) AS DOUBLE)), 2) AS avg_tenure_yrs
    FROM dev_gold_catalog.business_intelligence.crm_account
    WHERE `Billing State` IN ('NY','New York','NEW YORK')
      AND `Record Type Name` = 'Person Account'
      AND `Member Status` = 'A'
      AND LPAD(`Billing Postal Code`, 5, '0') IN {in_clause}
    GROUP BY 1 ORDER BY 2 DESC
    """
    return _save_csv(_run_query(q), "ltv_tenure_by_zip.csv")


# ─── Background Refresh Task ─────────────────────────────────────────────

def _backup_current_data():
    """Backup existing CSVs to timestamped folder before overwriting."""
    existing_csvs = list(DATA_DIR.glob("*.csv"))
    if not existing_csvs:
        return None
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = BACKUP_DIR / stamp
    backup_path.mkdir(parents=True, exist_ok=True)
    for f in existing_csvs:
        shutil.copy2(f, backup_path / f.name)
    # Also copy any JSON data files
    for f in DATA_DIR.glob("*.json"):
        shutil.copy2(f, backup_path / f.name)
    # Keep only last 10 backups to avoid filling disk
    all_backups = sorted(BACKUP_DIR.iterdir(), reverse=True)
    for old in all_backups[10:]:
        if old.is_dir():
            shutil.rmtree(old)
    return stamp


def _do_refresh():
    """Run all Databricks queries and update CSVs. Called as background task."""
    global _refresh_status
    _refresh_status["running"] = True
    _refresh_status["results"] = {}
    _refresh_status["last_error"] = None

    # Backup existing data before overwriting
    backup_stamp = _backup_current_data()
    if backup_stamp:
        _refresh_status["results"]["_backup"] = {"folder": backup_stamp, "status": "ok"}

    zips = _territory_zips()
    if not zips:
        _refresh_status["running"] = False
        _refresh_status["last_error"] = "No territory ZIPs found in territory_zips.json"
        return

    datasets = [
        ("members", _refresh_members),
        ("insurance", _refresh_insurance),
        ("travel", _refresh_travel),
        ("battery", _refresh_battery),
        ("ers", _refresh_ers),
        ("ltv", _refresh_ltv),
    ]

    for name, fn in datasets:
        try:
            start = time.time()
            count = fn(zips)
            elapsed = round(time.time() - start, 1)
            _refresh_status["results"][name] = {"rows": count, "seconds": elapsed, "status": "ok"}
        except Exception as e:
            _refresh_status["results"][name] = {"rows": 0, "seconds": 0, "status": "error", "error": str(e)[:200]}

    _refresh_status["running"] = False
    _refresh_status["last_run"] = date.today().isoformat()

    # Clear the LRU cache on the growth router so next request uses fresh data
    from routers.growth import _build_zip_table
    _build_zip_table.cache_clear()


# ─── API Endpoints ───────────────────────────────────────────────────────

@router.get("/api/growth/data-status")
def data_status(_user=Depends(require_admin)):
    """Check current data freshness and refresh status."""
    files = {}
    for f in DATA_DIR.glob("*.csv"):
        stat = f.stat()
        files[f.stem] = {
            "file": f.name,
            "size_bytes": stat.st_size,
            "last_modified": time.strftime("%Y-%m-%d %H:%M", time.localtime(stat.st_mtime)),
        }

    has_databricks = all([
        os.environ.get("DATABRICKS_HOST"),
        os.environ.get("DATABRICKS_TOKEN"),
        os.environ.get("DATABRICKS_HTTP_PATH"),
    ])

    return {
        "files": files,
        "refresh_status": _refresh_status,
        "databricks_configured": has_databricks,
    }


@router.post("/api/growth/refresh")
def trigger_refresh(background_tasks: BackgroundTasks, _user=Depends(require_admin)):
    """Trigger a background data refresh from Databricks."""
    if _refresh_status["running"]:
        return {"status": "already_running", "message": "Refresh is already in progress"}

    has_databricks = all([
        os.environ.get("DATABRICKS_HOST"),
        os.environ.get("DATABRICKS_TOKEN"),
        os.environ.get("DATABRICKS_HTTP_PATH"),
    ])
    if not has_databricks:
        return {"status": "error", "message": "Databricks credentials not configured (DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_HTTP_PATH)"}

    background_tasks.add_task(_do_refresh)
    return {"status": "started", "message": "Data refresh started. Check /api/growth/data-status for progress."}


@router.post("/api/growth/upload-census")
async def upload_census(file: UploadFile = File(...), _user=Depends(require_admin)):
    """
    Upload a new Census_Data_CustomerSeg_Vehicles.xlsx to refresh demographic data.
    
    This data comes from US Census Bureau (population, age, housing, income)
    and NY DMV (registered vehicles). Updated annually.
    Parses the Excel and writes to census_segments.json.
    """
    import openpyxl
    from io import BytesIO

    content = await file.read()
    wb = openpyxl.load_workbook(BytesIO(content), data_only=True, read_only=True)

    # Find the data sheet
    sheet_name = None
    for name in wb.sheetnames:
        if "census" in name.lower() or "custseg" in name.lower():
            sheet_name = name
            break
    if not sheet_name:
        sheet_name = wb.sheetnames[0]

    ws = wb[sheet_name]
    keys = [
        "zip_code", "city", "county", "coverage", "region",
        "registered_vehicles", "vehicles_3plus_yrs",
        "owner_occupied", "untapped_homes", "renter_occupied",
        "population", "adults_18plus", "median_income", "median_home_value",
        "age_16_18", "age_18_24", "age_25_34", "age_35_44", "age_45_54",
        "age_55_64", "age_65_plus", "housing_type", "location_type",
    ]

    data = {}
    for row in ws.iter_rows(values_only=True):
        if row[0] is None or str(row[0]).strip() in ("ZIP Code", ""):
            continue
        rec = {}
        for i, k in enumerate(keys):
            val = row[i] if i < len(row) else None
            rec[k] = val
        z = str(rec["zip_code"]).zfill(5)
        rec["zip_code"] = z
        data[z] = rec

    wb.close()

    if not data:
        return {"status": "error", "message": "No data found in uploaded file"}

    # Write to census_segments.json
    out_path = SEED_DIR / "census_segments.json"
    with out_path.open("w") as f:
        json.dump(data, f)

    # Also update territory_zips.json if we got new territory info
    territory = {}
    for z, rec in data.items():
        territory[z] = {
            "city": rec.get("city"),
            "county": rec.get("county"),
            "coverage": rec.get("coverage"),
            "region": rec.get("region"),
        }
    terr_path = DATA_DIR / "territory_zips.json"
    with terr_path.open("w") as f:
        json.dump(territory, f)

    # Clear caches
    from routers.growth import _build_zip_table, _load_census
    _build_zip_table.cache_clear()
    _load_census.cache_clear()

    return {
        "status": "ok",
        "message": f"Census data updated: {len(data)} ZIPs parsed from '{sheet_name}'",
        "zips": len(data),
    }


# ─── Per-Source Refresh ──────────────────────────────────────────────────

REFRESH_SOURCES = {
    "members": {"fn": "_refresh_members", "label": "Membership (Databricks)", "source": "databricks"},
    "insurance": {"fn": "_refresh_insurance", "label": "Insurance Policies (Databricks)", "source": "databricks"},
    "travel": {"fn": "_refresh_travel", "label": "Travel Transactions (Databricks)", "source": "databricks"},
    "battery": {"fn": "_refresh_battery", "label": "Battery & ERS (Databricks)", "source": "databricks"},
    "ers": {"fn": "_refresh_ers", "label": "ERS Calls (Databricks)", "source": "databricks"},
    "ltv": {"fn": "_refresh_ltv", "label": "LTV & Tenure (Databricks)", "source": "databricks"},
    "census": {"fn": None, "label": "Census & DMV (Upload)", "source": "upload"},
}


@router.get("/api/growth/refresh-sources")
def list_refresh_sources(_user=Depends(require_admin)):
    """List all available data sources with their last refresh times."""
    sources = []
    for key, info in REFRESH_SOURCES.items():
        # Check file modification time
        if key == "census":
            path = SEED_DIR / "census_segments.json"
        else:
            csv_map = {
                "members": "members_by_zip.csv",
                "insurance": "insurance_by_zip.csv",
                "travel": "travel_by_zip.csv",
                "battery": "battery_by_zip.csv",
                "ers": "ers_by_zip.csv",
                "ltv": "ltv_tenure_by_zip.csv",
            }
            path = DATA_DIR / csv_map.get(key, "")

        last_modified = None
        row_count = 0
        if path.exists():
            last_modified = time.strftime("%Y-%m-%d %H:%M", time.localtime(path.stat().st_mtime))
            if path.suffix == ".csv":
                with path.open() as f:
                    row_count = sum(1 for _ in f) - 1  # minus header
            elif path.suffix == ".json":
                with path.open() as f:
                    row_count = len(json.load(f))

        sources.append({
            "key": key,
            "label": info["label"],
            "source_type": info["source"],
            "last_modified": last_modified,
            "row_count": max(0, row_count),
            "refreshable": info["source"] == "databricks",
        })

    return {"sources": sources}


@router.post("/api/growth/refresh/{source_key}")
def refresh_single_source(source_key: str, background_tasks: BackgroundTasks, _user=Depends(require_admin)):
    """Refresh a single data source by key."""
    if source_key not in REFRESH_SOURCES:
        return {"status": "error", "message": f"Unknown source: {source_key}. Valid: {list(REFRESH_SOURCES.keys())}"}

    info = REFRESH_SOURCES[source_key]
    if info["source"] != "databricks":
        return {"status": "error", "message": f"Source '{source_key}' requires file upload, not API refresh."}

    if _refresh_status["running"]:
        return {"status": "already_running", "message": "A refresh is already in progress"}

    has_databricks = all([
        os.environ.get("DATABRICKS_HOST"),
        os.environ.get("DATABRICKS_TOKEN"),
        os.environ.get("DATABRICKS_HTTP_PATH"),
    ])
    if not has_databricks:
        return {"status": "error", "message": "Databricks credentials not configured"}

    fn_map = {
        "members": _refresh_members,
        "insurance": _refresh_insurance,
        "travel": _refresh_travel,
        "battery": _refresh_battery,
        "ers": _refresh_ers,
        "ltv": _refresh_ltv,
    }

    def _do_single():
        global _refresh_status
        _refresh_status["running"] = True
        _refresh_status["results"] = {}
        # Backup before single source refresh too
        _backup_current_data()
        zips = _territory_zips()
        if not zips:
            _refresh_status["running"] = False
            _refresh_status["last_error"] = "No territory ZIPs"
            return
        try:
            start_t = time.time()
            count = fn_map[source_key](zips)
            elapsed = round(time.time() - start_t, 1)
            _refresh_status["results"][source_key] = {"rows": count, "seconds": elapsed, "status": "ok"}
        except Exception as e:
            _refresh_status["results"][source_key] = {"rows": 0, "status": "error", "error": str(e)[:200]}
        _refresh_status["running"] = False
        _refresh_status["last_run"] = date.today().isoformat()
        from routers.growth import _build_zip_table
        _build_zip_table.cache_clear()

    background_tasks.add_task(_do_single)
    return {"status": "started", "message": f"Refreshing '{info['label']}'. Check /api/growth/data-status for progress."}


@router.get("/api/growth/backups")
def list_backups(_user=Depends(require_admin)):
    """List available data backups."""
    backups = []
    if BACKUP_DIR.exists():
        for d in sorted(BACKUP_DIR.iterdir(), reverse=True):
            if d.is_dir():
                files = [f.name for f in d.iterdir()]
                backups.append({
                    "timestamp": d.name,
                    "files": files,
                    "file_count": len(files),
                })
    return {"backups": backups}
