"""
Growth Intelligence API — serves the Path to 120M strategic data.

Reads pre-computed CSVs from Analysis_Apr/strategic_report/data/ and
the census Excel (via census_segments.json) to build a unified ZIP table
with penetration metrics, opportunity $, friction scores, and quadrant
classifications.
"""
from __future__ import annotations
import csv
import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Query

from auth import get_current_user

router = APIRouter(tags=["growth"])

SEED_DIR = Path(__file__).resolve().parent.parent / "seed_data"
DATA_DIR = SEED_DIR / "growth_data"
CENSUS_JSON = SEED_DIR / "census_segments.json"


# ─── Economic Assumptions (same as metrics.py) ───────────────────────────
PRODUCT_LTV = {
    "membership": 65 * 6,
    "auto": 1200 * 4,
    "home": 900 * 4,
    "travel": 400 * 3,
    "battery": 300,
    "medicare": 600 * 3,
}
PRODUCT_CONV = {
    "membership": 0.05,
    "auto": 0.12,
    "home": 0.08,
    "travel": 0.20,
    "battery": 0.35,
    "medicare": 0.06,
}

SEGMENT_ORDER = [
    "Established Suburban",
    "Rural / Residential",
    "Urban / Multi-Family",
    "University / Student",
    "Unknown",
]


# ─── Data Loaders ────────────────────────────────────────────────────────

def _read_csv(name: str) -> dict[str, dict]:
    path = DATA_DIR / name
    out: dict[str, dict] = {}
    if not path.exists():
        return out
    with path.open() as f:
        for row in csv.DictReader(f):
            z = str(row.get("zip", "")).zfill(5)
            if not z or z == "00000":
                continue
            for k, v in list(row.items()):
                if k == "zip":
                    continue
                if v in (None, ""):
                    row[k] = None
                else:
                    try:
                        row[k] = float(v) if "." in v else int(v)
                    except (ValueError, TypeError):
                        pass
            out[z] = row
        return out


@lru_cache(maxsize=1)
def _load_census() -> dict[str, dict]:
    if not CENSUS_JSON.exists():
        return {}
    with CENSUS_JSON.open() as f:
        data = json.load(f)
    # Dict keyed by zip code string
    if isinstance(data, dict):
        return {str(k).zfill(5): v for k, v in data.items()}
    # List of records
    return {str(r.get("zip_code", "")).zfill(5): r for r in data}


@lru_cache(maxsize=1)
def _load_battery_zips() -> set[str]:
    """Load battery-service ZIPs from pre-exported JSON."""
    path = DATA_DIR / "battery_zips.json"
    if not path.exists():
        return set()
    with path.open() as f:
        return set(json.load(f))


@lru_cache(maxsize=1)
def _load_territory_zips() -> dict[str, dict]:
    """Load territory ZIPs with city/county/region from pre-exported JSON."""
    path = DATA_DIR / "territory_zips.json"
    if not path.exists():
        return {}
    with path.open() as f:
        return json.load(f)


def _f(x, default=0.0) -> float:
    try:
        if x is None or x == "":
            return default
        return float(x)
    except (ValueError, TypeError):
        return default


def _safe_div(a, b):
    a, b = _f(a), _f(b)
    return a / b if b != 0 else None


def _median(vals):
    vals = sorted(v for v in vals if v is not None)
    if not vals:
        return 0.0
    n = len(vals)
    return vals[n // 2] if n % 2 else (vals[n // 2 - 1] + vals[n // 2]) / 2


def _percentile(vals, p):
    vals = sorted(v for v in vals if v is not None)
    if not vals:
        return 0.0
    k = max(0, min(len(vals) - 1, int(p * (len(vals) - 1))))
    return vals[k]


@lru_cache(maxsize=1)
def _build_zip_table() -> list[dict]:
    """Build the unified ZIP table with all metrics."""
    census = _load_census()
    territory = _load_territory_zips()
    bat_zips = _load_battery_zips()
    members = _read_csv("members_by_zip.csv")
    insurance = _read_csv("insurance_by_zip.csv")
    travel = _read_csv("travel_by_zip.csv")
    battery = _read_csv("battery_by_zip.csv")
    ers = _read_csv("ers_by_zip.csv")
    ltv = _read_csv("ltv_tenure_by_zip.csv")

    # Use territory ZIPs as base (562 ZIPs)
    all_zips = set(territory.keys())
    rows = []

    for z in sorted(all_zips):
        c = census.get(z, {})
        m = members.get(z, {})
        i = insurance.get(z, {})
        t = travel.get(z, {})
        b = battery.get(z, {})
        e = ers.get(z, {})
        lv = ltv.get(z, {})
        ti = territory.get(z, {})

        active_members = _f(m.get("active_members"))
        adults_18p = _f(c.get("adults_18plus", c.get("adults_18p", 0)))
        population = _f(c.get("population", 0))
        owner_units = _f(c.get("owner_occupied", c.get("owner_units", 0)))
        renter_units = _f(c.get("renter_occupied", c.get("renter_units", 0)))
        reg_vehicles = _f(c.get("registered_vehicles", 0))
        vehicles_3yr = _f(c.get("vehicles_3plus_yrs", c.get("vehicles_3yr_old", 0)))
        age_65p = _f(c.get("age_65_plus", c.get("age_65p", 0)))
        median_income = _f(c.get("median_income", 0))
        location_type = c.get("location_type", "Unknown")

        auto_cust = _f(i.get("auto_customers"))
        home_cust = _f(i.get("home_customers"))
        ins_cust = _f(i.get("total_customers"))
        travel_cust = _f(t.get("travel_customers_3yr"))
        travel_rev = _f(t.get("travel_revenue_3yr"))
        battery_cust = _f(b.get("unique_battery_customers_3yr"))
        ers_calls = _f(e.get("ers_calls_12mo"))

        # Penetration metrics
        mem_pen = _safe_div(active_members, adults_18p)
        ins_xsell = _safe_div(ins_cust, active_members)
        auto_share = _safe_div(auto_cust, reg_vehicles)
        home_pen = _safe_div(home_cust, owner_units)
        travel_eng = _safe_div(travel_cust, active_members)
        battery_cov = _safe_div(battery_cust, vehicles_3yr) if z in bat_zips else None

        rec = {
            "zip": z,
            "city": ti.get("city", ""),
            "county": ti.get("county", ""),
            "region": ti.get("region", ""),
            "coverage": ti.get("coverage", ""),
            "segment": location_type if location_type in SEGMENT_ORDER else "Unknown",
            "is_battery_zip": z in bat_zips,
            "population": population,
            "adults_18p": adults_18p,
            "owner_units": owner_units,
            "registered_vehicles": reg_vehicles,
            "vehicles_3yr": vehicles_3yr,
            "age_65p": age_65p,
            "median_income": median_income,
            "active_members": active_members,
            "auto_customers": auto_cust,
            "home_customers": home_cust,
            "ins_customers": ins_cust,
            "travel_customers": travel_cust,
            "travel_revenue": travel_rev,
            "battery_customers": battery_cust,
            "ers_calls": ers_calls,
            "mem_pen": mem_pen,
            "ins_xsell": ins_xsell,
            "auto_share": auto_share,
            "home_pen": home_pen,
            "travel_eng": travel_eng,
            "battery_cov": battery_cov,
        }
        rows.append(rec)

    # Segment fit scores (empirical median penetration per segment)
    seg_fit = _compute_segment_fit(rows)

    # Compute opportunity $ and friction for each ZIP
    top_comp_share = 0.301  # Geico at 30.1% statewide
    for r in rows:
        seg = r["segment"]
        fit = seg_fit.get(seg, {})
        sf_mem = fit.get("membership", 0.5)
        sf_auto = fit.get("auto", 0.5)
        sf_home = fit.get("home", 0.5)
        sf_travel = fit.get("travel", 0.5)

        # Friction (1-10): competitor pressure + segment mismatch
        seg_fit_avg = (sf_mem + sf_auto + sf_home) / 3
        r["friction"] = round(top_comp_share * 6 + (1 - seg_fit_avg) * 4, 1)

        # Addressable gap & opportunity $ per product
        am = r["active_members"]
        r["opp_membership"] = round(
            max(0, r["adults_18p"] - am) * sf_mem * (1 - top_comp_share * 0.3)
            * PRODUCT_CONV["membership"] * PRODUCT_LTV["membership"])
        r["opp_auto"] = round(
            max(0, r["registered_vehicles"] - r["auto_customers"]) * sf_auto * (1 - top_comp_share)
            * PRODUCT_CONV["auto"] * PRODUCT_LTV["auto"])
        r["opp_home"] = round(
            max(0, r["owner_units"] - r["home_customers"]) * sf_home * (1 - top_comp_share * 0.5)
            * PRODUCT_CONV["home"] * PRODUCT_LTV["home"])
        r["opp_travel"] = round(
            max(0, am - r["travel_customers"]) * sf_travel
            * PRODUCT_CONV["travel"] * PRODUCT_LTV["travel"])
        r["opp_total"] = r["opp_membership"] + r["opp_auto"] + r["opp_home"] + r["opp_travel"]

    # Quadrant assignment
    avg_pen = _median([r["mem_pen"] for r in rows if r["mem_pen"] is not None])
    avg_xsell = _median([r["ins_xsell"] for r in rows if r["ins_xsell"] is not None])
    p75_opp = _percentile([r["opp_total"] for r in rows], 0.75)

    for r in rows:
        seg = r["segment"]
        fit = seg_fit.get(seg, {})
        sf_mem = fit.get("membership", 0.5)
        if r["friction"] >= 7 or sf_mem < 0.3:
            r["quadrant"] = "Retreat"
        elif (r["mem_pen"] or 0) >= avg_pen and r["opp_total"] >= p75_opp:
            r["quadrant"] = "Defend"
        elif (r["mem_pen"] or 0) >= avg_pen and (r["ins_xsell"] or 0) < avg_xsell:
            r["quadrant"] = "Activate"
        elif (r["mem_pen"] or 0) < avg_pen and r["opp_total"] >= p75_opp:
            r["quadrant"] = "Grow"
        else:
            r["quadrant"] = "Maintain"

    return rows


def _compute_segment_fit(rows: list[dict]) -> dict[str, dict[str, float]]:
    """Empirical segment fit per product."""
    products = {
        "membership": "mem_pen",
        "auto": "auto_share",
        "home": "home_pen",
        "travel": "travel_eng",
    }
    out = {seg: {} for seg in SEGMENT_ORDER}
    for prod, field in products.items():
        per_seg = {}
        for seg in SEGMENT_ORDER:
            vals = [r[field] for r in rows
                    if r["segment"] == seg and r.get(field) is not None
                    and r["adults_18p"] > 0]
            per_seg[seg] = _median(vals) if vals else 0.0
        peak = max(per_seg.values()) or 1e-9
        for seg in SEGMENT_ORDER:
            out[seg][prod] = round(per_seg[seg] / peak, 3)
    return out


def _territory_totals(rows: list[dict]) -> dict:
    """Headline numbers for the executive scorecard."""
    def s(f): return sum(_f(r.get(f)) for r in rows)
    return {
        "zips": len(rows),
        "population": s("population"),
        "adults_18p": s("adults_18p"),
        "active_members": s("active_members"),
        "ins_customers": s("ins_customers"),
        "auto_customers": s("auto_customers"),
        "home_customers": s("home_customers"),
        "travel_customers": s("travel_customers"),
        "travel_revenue": s("travel_revenue"),
        "battery_customers": s("battery_customers"),
        "ers_calls": s("ers_calls"),
        "registered_vehicles": s("registered_vehicles"),
        "owner_units": s("owner_units"),
        "mem_pen": _safe_div(s("active_members"), s("adults_18p")),
        "ins_xsell": _safe_div(s("ins_customers"), s("active_members")),
        "auto_share": _safe_div(s("auto_customers"), s("registered_vehicles")),
        "home_pen": _safe_div(s("home_customers"), s("owner_units")),
        "travel_eng": _safe_div(s("travel_customers"), s("active_members")),
        "opp_total": s("opp_total"),
        "opp_membership": s("opp_membership"),
        "opp_auto": s("opp_auto"),
        "opp_home": s("opp_home"),
        "opp_travel": s("opp_travel"),
    }


# ─── Trend Data ──────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_membership_trend() -> list[dict]:
    path = DATA_DIR / "membership_trend_5yr.csv"
    if not path.exists():
        return []
    with path.open() as f:
        return [row for row in csv.DictReader(f)]


@lru_cache(maxsize=1)
def _load_insurance_retention() -> list[dict]:
    path = DATA_DIR / "ins_retention_by_year.csv"
    if not path.exists():
        return []
    with path.open() as f:
        return [row for row in csv.DictReader(f)]


@lru_cache(maxsize=1)
def _load_competitive() -> list[dict]:
    path = DATA_DIR / "ny_carrier_market_dfs.csv"
    if not path.exists():
        return []
    with path.open() as f:
        return [row for row in csv.DictReader(f)]


# ─── API Endpoints ───────────────────────────────────────────────────────

@router.get("/api/growth/scorecard")
def scorecard(_user=Depends(get_current_user)):
    """Executive scorecard: territory totals + quadrant distribution."""
    rows = _build_zip_table()
    totals = _territory_totals(rows)

    # Quadrant distribution
    quadrants = {}
    for r in rows:
        q = r.get("quadrant", "Maintain")
        quadrants[q] = quadrants.get(q, 0) + 1

    # Revenue waterfall (directional estimates)
    current_revenue = totals["travel_revenue"]  # Known travel revenue
    # Insurance revenue estimate: auto × $1200 + home × $900
    ins_revenue = totals["auto_customers"] * 1200 + totals["home_customers"] * 900
    total_current = current_revenue + ins_revenue

    waterfall = {
        "current": round(total_current),
        "cross_sell_opp": round(totals["opp_auto"] * 0.15 + totals["opp_home"] * 0.1),
        "acquisition_opp": round(totals["opp_membership"] * 0.08),
        "travel_growth": round(totals["opp_travel"] * 0.2),
        "target": 120_000_000,
    }

    return {
        "totals": totals,
        "quadrants": quadrants,
        "waterfall": waterfall,
    }


@router.get("/api/growth/zip-table")
def zip_table(
    quadrant: Optional[str] = Query(None),
    segment: Optional[str] = Query(None),
    county: Optional[str] = Query(None),
    product: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=600),
    sort: str = Query("opp_total"),
    _user=Depends(get_current_user),
):
    """Full ZIP table with filtering and sorting."""
    rows = _build_zip_table()

    if quadrant:
        rows = [r for r in rows if r.get("quadrant") == quadrant]
    if segment:
        rows = [r for r in rows if r.get("segment") == segment]
    if county:
        rows = [r for r in rows if r.get("county", "").lower() == county.lower()]

    # Sort
    desc_fields = {"opp_total", "opp_auto", "opp_home", "opp_travel",
                   "opp_membership", "active_members", "friction"}
    reverse = sort in desc_fields
    rows = sorted(rows, key=lambda r: _f(r.get(sort)), reverse=reverse)

    return {"rows": rows[:limit], "total": len(rows)}


@router.get("/api/growth/trends")
def trends(_user=Depends(get_current_user)):
    """Membership trend + insurance retention for trend charts."""
    return {
        "membership_trend": _load_membership_trend(),
        "insurance_retention": _load_insurance_retention(),
        "competitors": _load_competitive(),
    }


@router.get("/api/growth/products")
def products(_user=Depends(get_current_user)):
    """Per-product opportunity summary."""
    rows = _build_zip_table()
    products_summary = {}
    for prod in ["membership", "auto", "home", "travel"]:
        opp_field = f"opp_{prod}"
        top_zips = sorted(rows, key=lambda r: _f(r.get(opp_field)), reverse=True)[:20]
        total_opp = sum(_f(r.get(opp_field)) for r in rows)
        products_summary[prod] = {
            "total_opportunity": round(total_opp),
            "top_zips": [{
                "zip": r["zip"],
                "city": r["city"],
                "county": r["county"],
                "opportunity": round(_f(r.get(opp_field))),
                "penetration": r.get(
                    {"membership": "mem_pen", "auto": "auto_share",
                     "home": "home_pen", "travel": "travel_eng"}[prod]
                ),
                "segment": r["segment"],
            } for r in top_zips],
        }
    return products_summary
