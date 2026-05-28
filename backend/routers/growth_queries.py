"""
Databricks SQL query functions for the Strategic Growth dashboard.

All functions write a CSV to seed_data/growth_data/ and return row count.
Called by growth_admin._do_refresh() and individually from admin endpoints.
"""
from __future__ import annotations
import csv
import json
import os
from datetime import date, timedelta
from pathlib import Path

SEED_DIR = Path(__file__).resolve().parent.parent / "seed_data"
DATA_DIR = SEED_DIR / "growth_data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


# ─── Connection helpers ──────────────────────────────────────────────────────

def _get_conn():
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
    path = DATA_DIR / "territory_zips.json"
    if path.exists():
        with path.open() as f:
            return list(json.load(f).keys())
    return []


def _zip_in_clause(zips: list[str]) -> str:
    return "(" + ",".join(f"'{z}'" for z in zips) + ")"


# ─── ZIP-level refresh queries ───────────────────────────────────────────────

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
    cutoff = (date.today() - timedelta(days=365)).isoformat()
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
            COUNT(DISTINCT t.customer_identifier) AS travel_customers_12mo,
            SUM(t.txn_count) AS travel_transactions_12mo,
            ROUND(SUM(t.revenue), 0) AS travel_revenue_12mo
    FROM    cust_zip cz JOIN txn t ON t.customer_identifier = cz.member_id
    WHERE   cz.zip IN {in_clause}
    GROUP BY 1 ORDER BY 2 DESC
    """
    return _save_csv(_run_query(q), "travel_by_zip.csv")


def _refresh_battery(zips: list[str]) -> int:
    in_clause = _zip_in_clause(zips)
    cutoff = (date.today() - timedelta(days=365)).isoformat()
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
            COUNT(*) AS battery_tests_12mo,
            COUNT(DISTINCT b.customer_unique_id) AS unique_battery_customers_12mo
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


# ─── Membership trend (5-year acquired/cancelled) ────────────────────────────

def _refresh_membership_trend() -> int:
    """
    5-year membership acquisition and cancellation trend.

    Acquired = members whose first recorded effective_date is in year Y.
    Cancelled = members whose latest record is inactive, expiry in year Y.
    Writes: membership_trend_5yr.csv  columns: year, acquired, cancelled, net_growth
    """
    y = date.today().year
    start = y - 5
    end = y - 1  # exclude current partial year
    q = f"""
    WITH first_join AS (
        SELECT membership_unique_id,
               YEAR(MIN(membership_effective_date)) AS join_year
        FROM dev_bronze_catalog.legacy_datawarehouse.membership_consolidated
        WHERE customer_address_state IN ('NY','New York','NEW YORK')
          AND customer_address_region IN ('WESTERN','ROCHESTER','CENTRAL')
          AND source LIKE 'MEMBERS%'
          AND membership_effective_date IS NOT NULL
        GROUP BY 1
    ),
    acq_by_year AS (
        SELECT join_year AS year, COUNT(*) AS acquired
        FROM first_join
        WHERE join_year BETWEEN {start} AND {end}
        GROUP BY 1
    ),
    latest_status AS (
        SELECT membership_unique_id,
               membership_status_code,
               YEAR(membership_card_expiry_date) AS expiry_year
        FROM dev_bronze_catalog.legacy_datawarehouse.membership_consolidated
        WHERE customer_address_state IN ('NY','New York','NEW YORK')
          AND customer_address_region IN ('WESTERN','ROCHESTER','CENTRAL')
          AND source LIKE 'MEMBERS%'
          AND membership_card_expiry_date IS NOT NULL
        QUALIFY ROW_NUMBER() OVER (
            PARTITION BY membership_unique_id ORDER BY record_create_date DESC
        ) = 1
    ),
    canc_by_year AS (
        SELECT expiry_year AS year, COUNT(*) AS cancelled
        FROM latest_status
        WHERE membership_status_code != 'A'
          AND expiry_year BETWEEN {start} AND {end}
        GROUP BY 1
    )
    SELECT
        a.year,
        a.acquired,
        COALESCE(c.cancelled, 0) AS cancelled,
        a.acquired - COALESCE(c.cancelled, 0) AS net_growth
    FROM acq_by_year a
    LEFT JOIN canc_by_year c ON c.year = a.year
    ORDER BY 1
    """
    return _save_csv(_run_query(q), "membership_trend_5yr.csv")


# ─── All ZIP-level datasets list (used by _do_refresh) ─────────────────────

ALL_DATASETS = [
    ("members", _refresh_members),
    ("insurance", _refresh_insurance),
    ("travel", _refresh_travel),
    ("battery", _refresh_battery),
    ("ers", _refresh_ers),
    ("ltv", _refresh_ltv),
    ("membership_trend", _refresh_membership_trend),
]

# CSV output filename for each dataset key (for admin UI)
DATASET_CSV_MAP = {
    "members": "members_by_zip.csv",
    "insurance": "insurance_by_zip.csv",
    "travel": "travel_by_zip.csv",
    "battery": "battery_by_zip.csv",
    "ers": "ers_by_zip.csv",
    "ltv": "ltv_tenure_by_zip.csv",
    "membership_trend": "membership_trend_5yr.csv",
}
