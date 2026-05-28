"""
Product Deep-Dive Report API — per-product analytics from pre-computed CSVs.

Provides overview, trends, retention, geography, and action plays for each
product line: membership, auto, home, travel, battery.
"""
from __future__ import annotations

import csv
import json
import os
import logging
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from auth import get_current_user

router = APIRouter(tags=["growth"])
log = logging.getLogger(__name__)

SEED_DIR = Path(__file__).resolve().parent.parent / "seed_data"
DATA_DIR = SEED_DIR / "growth_data"
CENSUS_JSON = SEED_DIR / "census_segments.json"

VALID_PRODUCTS = ("membership", "auto", "home", "travel", "battery")

# Economic assumptions
PRODUCT_LTV = {
    "membership": 390,
    "auto": 4800,
    "home": 3600,
    "travel": 1200,
    "battery": 300,
}
PRODUCT_CONV = {
    "membership": 0.05,
    "auto": 0.12,
    "home": 0.08,
    "travel": 0.20,
    "battery": 0.35,
}


# ─── Data Loaders ────────────────────────────────────────────────────────────

def _read_csv(name: str) -> dict[str, dict]:
    """Read a CSV keyed by zip code."""
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


def _read_csv_list(name: str) -> list[dict]:
    """Read a CSV as a list of rows (not keyed by zip)."""
    path = DATA_DIR / name
    out: list[dict] = []
    if not path.exists():
        return out
    with path.open() as f:
        for row in csv.DictReader(f):
            for k, v in list(row.items()):
                if v in (None, ""):
                    row[k] = None
                else:
                    try:
                        row[k] = float(v) if "." in v else int(v)
                    except (ValueError, TypeError):
                        pass
            out.append(row)
    return out


@lru_cache(maxsize=1)
def _load_census() -> dict[str, dict]:
    if not CENSUS_JSON.exists():
        return {}
    with CENSUS_JSON.open() as f:
        data = json.load(f)
    if isinstance(data, dict):
        return {str(k).zfill(5): v for k, v in data.items()}
    return {str(r.get("zip_code", "")).zfill(5): r for r in data}


@lru_cache(maxsize=1)
def _load_territory_zips() -> dict[str, dict]:
    path = DATA_DIR / "territory_zips.json"
    if not path.exists():
        return {}
    with path.open() as f:
        return json.load(f)


@lru_cache(maxsize=1)
def _load_members() -> dict[str, dict]:
    return _read_csv("members_by_zip.csv")


@lru_cache(maxsize=1)
def _load_insurance() -> dict[str, dict]:
    return _read_csv("insurance_by_zip.csv")


@lru_cache(maxsize=1)
def _load_travel() -> dict[str, dict]:
    return _read_csv("travel_by_zip.csv")


@lru_cache(maxsize=1)
def _load_battery() -> dict[str, dict]:
    return _read_csv("battery_by_zip.csv")


@lru_cache(maxsize=1)
def _load_membership_trend() -> list[dict]:
    return _read_csv_list("membership_trend_5yr.csv")


@lru_cache(maxsize=1)
def _load_ins_retention() -> list[dict]:
    return _read_csv_list("ins_retention_by_year.csv")


@lru_cache(maxsize=1)
def _load_carrier_market() -> list[dict]:
    return _read_csv_list("ny_carrier_market_dfs.csv")


@lru_cache(maxsize=1)
def _load_ltv() -> dict[str, dict]:
    return _read_csv("ltv_tenure_by_zip.csv")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _f(x, default=0.0) -> float:
    try:
        if x is None or x == "":
            return default
        return float(x)
    except (ValueError, TypeError):
        return default


def _safe_div(a, b) -> float | None:
    a, b = _f(a), _f(b)
    return round(a / b, 4) if b > 0 else None


def _territory_zips_set() -> set[str]:
    return set(_load_territory_zips().keys())


def _zip_info(z: str) -> dict:
    tz = _load_territory_zips()
    info = tz.get(z, {})
    return {"city": info.get("city", ""), "county": info.get("county", "")}


def _top_n(items: list[dict], key: str, n: int = 10, reverse: bool = True) -> list[dict]:
    valid = [i for i in items if i.get(key) is not None]
    return sorted(valid, key=lambda x: x[key], reverse=reverse)[:n]


# ─── Per-Product Builders ─────────────────────────────────────────────────────

def _build_membership(year_from: int, year_to: int) -> dict:
    members = _load_members()
    census = _load_census()
    tz_set = _territory_zips_set()

    total_active = 0
    total_adults = 0
    zip_rows = []

    for z in tz_set:
        m = members.get(z, {})
        c = census.get(z, {})
        active = _f(m.get("active_members"))
        adults = _f(c.get("adults_18plus"))
        total_active += active
        total_adults += adults

        pen = _safe_div(active, adults)
        zip_rows.append({
            "zip": z,
            **_zip_info(z),
            "value": int(active),
            "penetration": pen,
            "adults": int(adults),
        })

    penetration = _safe_div(total_active, total_adults)
    gap = total_adults - total_active
    opportunity = int(max(gap, 0) * PRODUCT_CONV["membership"] * PRODUCT_LTV["membership"])

    top_zips = _top_n(zip_rows, "value", 10)

    # Trends
    trend_data = _load_membership_trend()
    trends_yearly = []
    for row in trend_data:
        yr = int(row.get("year", 0))
        if year_from <= yr <= year_to:
            acq = int(_f(row.get("acquired")))
            canc = int(_f(row.get("cancelled")))
            trends_yearly.append({"year": yr, "acquired": acq, "cancelled": canc, "net": acq - canc})

    # Geography: top/bottom by penetration (min 500 adults)
    qualified = [r for r in zip_rows if r["adults"] >= 500 and r["penetration"] is not None]
    geo_top = sorted(qualified, key=lambda x: x["penetration"], reverse=True)[:15]
    geo_bottom = sorted(qualified, key=lambda x: x["penetration"])[:15]

    # Actions
    high_income_low_pen = []
    for z in tz_set:
        c = census.get(z, {})
        m = members.get(z, {})
        income = _f(c.get("median_income"))
        adults = _f(c.get("adults_18plus"))
        active = _f(m.get("active_members"))
        pen = _safe_div(active, adults)
        if income > 70000 and pen is not None and pen < 0.35 and adults >= 500:
            high_income_low_pen.append(z)

    plays = [
        {
            "title": "Target high-income low-penetration ZIPs",
            "target_count": len(high_income_low_pen),
            "opportunity_dollars": int(len(high_income_low_pen) * 1000 * PRODUCT_CONV["membership"] * PRODUCT_LTV["membership"]),
        },
        {
            "title": "Win-back expired members",
            "target_count": int(sum(_f(members.get(z, {}).get("expired_members")) for z in tz_set)),
            "opportunity_dollars": int(sum(_f(members.get(z, {}).get("expired_members")) for z in tz_set) * 0.15 * PRODUCT_LTV["membership"]),
        },
        {
            "title": "Referral program in top-performing ZIPs",
            "target_count": 15,
            "opportunity_dollars": int(15 * 500 * PRODUCT_CONV["membership"] * PRODUCT_LTV["membership"]),
        },
    ]

    return {
        "product": "membership",
        "overview": {
            "total_footprint": int(total_active),
            "penetration_pct": penetration,
            "opportunity_dollars": opportunity,
            "top_zips": top_zips,
        },
        "trends": {"yearly": trends_yearly},
        "retention": {"by_year": [], "cancel_reasons": [], "by_segment": []},
        "geography": {"top_zips": geo_top, "bottom_zips": geo_bottom},
        "actions": {"total_opportunity": opportunity, "plays": plays},
    }


def _build_auto(year_from: int, year_to: int) -> dict:
    insurance = _load_insurance()
    census = _load_census()
    tz_set = _territory_zips_set()

    total_auto = 0
    total_vehicles = 0
    zip_rows = []

    for z in tz_set:
        ins = insurance.get(z, {})
        c = census.get(z, {})
        auto = _f(ins.get("auto_customers"))
        vehicles = _f(c.get("registered_vehicles"))
        total_auto += auto
        total_vehicles += vehicles

        pen = _safe_div(auto, vehicles)
        zip_rows.append({
            "zip": z,
            **_zip_info(z),
            "value": int(auto),
            "penetration": pen,
            "vehicles": int(vehicles),
        })

    penetration = _safe_div(total_auto, total_vehicles)
    gap = total_vehicles - total_auto
    opportunity = int(max(gap, 0) * PRODUCT_CONV["auto"] * PRODUCT_LTV["auto"])

    top_zips = _top_n(zip_rows, "value", 10)

    # Trends from ins_retention
    retention_data = _load_ins_retention()
    trends_yearly = []
    retention_by_year = []
    for row in retention_data:
        yr = int(_f(row.get("year")))
        if year_from <= yr <= year_to:
            trends_yearly.append({
                "year": yr,
                "renb": int(_f(row.get("renb"))),
                "canc": int(_f(row.get("canc"))),
                "newb": int(_f(row.get("newb"))),
                "net_policies": int(_f(row.get("net_policies"))),
            })
            retention_by_year.append({
                "year": yr,
                "retention_pct": _f(row.get("retention_pct")),
                "renb": int(_f(row.get("renb"))),
                "canc": int(_f(row.get("canc"))),
                "newb": int(_f(row.get("newb"))),
                "rewrites": int(_f(row.get("rewrites"))),
                "reinstatements": int(_f(row.get("reinstatements"))),
                "net_policies": int(_f(row.get("net_policies"))),
            })

    # Geography
    qualified = [r for r in zip_rows if r["vehicles"] >= 500 and r["penetration"] is not None]
    geo_top = sorted(qualified, key=lambda x: x["penetration"], reverse=True)[:15]
    geo_bottom = sorted(qualified, key=lambda x: x["penetration"])[:15]

    # Actions — competitive gap from carrier market data
    carrier_data = _load_carrier_market()
    latest_year = max((int(_f(r.get("year"))) for r in carrier_data), default=0)
    top_carriers = sorted(
        [r for r in carrier_data if int(_f(r.get("year"))) == latest_year],
        key=lambda x: _f(x.get("ny_auto_premium_m")),
        reverse=True,
    )[:5]

    plays = [
        {
            "title": "Competitive capture from top carriers",
            "target_count": int(gap * 0.02) if gap > 0 else 0,
            "opportunity_dollars": int(max(gap, 0) * 0.02 * PRODUCT_LTV["auto"]),
        },
        {
            "title": "Bundle auto + home for existing members",
            "target_count": int(total_auto * 0.3),
            "opportunity_dollars": int(total_auto * 0.3 * 0.15 * PRODUCT_LTV["home"]),
        },
        {
            "title": "Target new-to-market drivers in growing ZIPs",
            "target_count": len([r for r in geo_bottom if r["penetration"] is not None and r["penetration"] < 0.10]),
            "opportunity_dollars": int(len(geo_bottom) * 200 * PRODUCT_CONV["auto"] * PRODUCT_LTV["auto"]),
        },
    ]

    return {
        "product": "auto",
        "overview": {
            "total_footprint": int(total_auto),
            "penetration_pct": penetration,
            "opportunity_dollars": opportunity,
            "top_zips": top_zips,
        },
        "trends": {"yearly": trends_yearly},
        "retention": {"by_year": retention_by_year, "cancel_reasons": [], "by_segment": []},
        "geography": {"top_zips": geo_top, "bottom_zips": geo_bottom},
        "actions": {"total_opportunity": opportunity, "plays": plays},
    }


def _build_home(year_from: int, year_to: int) -> dict:
    insurance = _load_insurance()
    census = _load_census()
    tz_set = _territory_zips_set()

    total_home = 0
    total_owner = 0
    zip_rows = []

    for z in tz_set:
        ins = insurance.get(z, {})
        c = census.get(z, {})
        home = _f(ins.get("home_customers"))
        owner = _f(c.get("owner_occupied"))
        total_home += home
        total_owner += owner

        pen = _safe_div(home, owner)
        zip_rows.append({
            "zip": z,
            **_zip_info(z),
            "value": int(home),
            "penetration": pen,
            "owner_units": int(owner),
        })

    penetration = _safe_div(total_home, total_owner)
    gap = total_owner - total_home
    opportunity = int(max(gap, 0) * PRODUCT_CONV["home"] * PRODUCT_LTV["home"])

    top_zips = _top_n(zip_rows, "value", 10)

    # Trends — shared with auto (ins_retention)
    retention_data = _load_ins_retention()
    trends_yearly = []
    retention_by_year = []
    for row in retention_data:
        yr = int(_f(row.get("year")))
        if year_from <= yr <= year_to:
            trends_yearly.append({
                "year": yr,
                "renb": int(_f(row.get("renb"))),
                "canc": int(_f(row.get("canc"))),
                "newb": int(_f(row.get("newb"))),
                "net_policies": int(_f(row.get("net_policies"))),
            })
            retention_by_year.append({
                "year": yr,
                "retention_pct": _f(row.get("retention_pct")),
                "renb": int(_f(row.get("renb"))),
                "canc": int(_f(row.get("canc"))),
                "newb": int(_f(row.get("newb"))),
                "rewrites": int(_f(row.get("rewrites"))),
                "reinstatements": int(_f(row.get("reinstatements"))),
                "net_policies": int(_f(row.get("net_policies"))),
            })

    # Geography
    qualified = [r for r in zip_rows if r["owner_units"] >= 300 and r["penetration"] is not None]
    geo_top = sorted(qualified, key=lambda x: x["penetration"], reverse=True)[:15]
    geo_bottom = sorted(qualified, key=lambda x: x["penetration"])[:15]

    plays = [
        {
            "title": "Cross-sell home to existing auto policyholders",
            "target_count": int(total_home * 0.4),
            "opportunity_dollars": int(total_home * 0.4 * 0.20 * PRODUCT_LTV["home"]),
        },
        {
            "title": "Target high-value owner-occupied ZIPs",
            "target_count": len([r for r in qualified if r["penetration"] is not None and r["penetration"] < 0.05]),
            "opportunity_dollars": int(len([r for r in qualified if r["penetration"] is not None and r["penetration"] < 0.05]) * 150 * PRODUCT_CONV["home"] * PRODUCT_LTV["home"]),
        },
        {
            "title": "Retention campaign for renewal season",
            "target_count": int(total_home * 0.1),
            "opportunity_dollars": int(total_home * 0.1 * PRODUCT_LTV["home"]),
        },
    ]

    return {
        "product": "home",
        "overview": {
            "total_footprint": int(total_home),
            "penetration_pct": penetration,
            "opportunity_dollars": opportunity,
            "top_zips": top_zips,
        },
        "trends": {"yearly": trends_yearly},
        "retention": {"by_year": retention_by_year, "cancel_reasons": [], "by_segment": []},
        "geography": {"top_zips": geo_top, "bottom_zips": geo_bottom},
        "actions": {"total_opportunity": opportunity, "plays": plays},
    }


def _build_travel(year_from: int, year_to: int) -> dict:
    travel = _load_travel()
    members = _load_members()
    census = _load_census()
    tz_set = _territory_zips_set()

    total_travel = 0
    total_active_members = 0
    zip_rows = []

    for z in tz_set:
        t = travel.get(z, {})
        m = members.get(z, {})
        cust = _f(t.get("travel_customers_12mo"))
        revenue = _f(t.get("travel_revenue_12mo"))
        active = _f(m.get("active_members"))
        total_travel += cust
        total_active_members += active

        pen = _safe_div(cust, active)
        zip_rows.append({
            "zip": z,
            **_zip_info(z),
            "value": int(cust),
            "revenue": int(revenue),
            "penetration": pen,
            "active_members": int(active),
        })

    penetration = _safe_div(total_travel, total_active_members)
    gap = total_active_members - total_travel
    opportunity = int(max(gap, 0) * PRODUCT_CONV["travel"] * PRODUCT_LTV["travel"])

    # Top by revenue
    top_zips = _top_n(zip_rows, "revenue", 10)

    # Geography by penetration
    qualified = [r for r in zip_rows if r["active_members"] >= 200 and r["penetration"] is not None]
    geo_top = sorted(qualified, key=lambda x: x["penetration"], reverse=True)[:15]
    geo_bottom = sorted(qualified, key=lambda x: x["penetration"])[:15]

    plays = [
        {
            "title": "Promote travel to active members with no bookings",
            "target_count": int(max(gap, 0)),
            "opportunity_dollars": int(max(gap, 0) * PRODUCT_CONV["travel"] * PRODUCT_LTV["travel"] * 0.3),
        },
        {
            "title": "Seasonal campaigns for top revenue ZIPs",
            "target_count": 15,
            "opportunity_dollars": int(15 * 200 * PRODUCT_LTV["travel"]),
        },
        {
            "title": "Loyalty upsell for repeat travelers",
            "target_count": int(total_travel * 0.25),
            "opportunity_dollars": int(total_travel * 0.25 * 0.4 * PRODUCT_LTV["travel"]),
        },
    ]

    return {
        "product": "travel",
        "overview": {
            "total_footprint": int(total_travel),
            "penetration_pct": penetration,
            "opportunity_dollars": opportunity,
            "top_zips": top_zips,
        },
        "trends": {"yearly": []},
        "retention": {"by_year": [], "cancel_reasons": [], "by_segment": []},
        "geography": {"top_zips": geo_top, "bottom_zips": geo_bottom},
        "actions": {"total_opportunity": opportunity, "plays": plays},
    }


def _build_battery(year_from: int, year_to: int) -> dict:
    battery = _load_battery()
    census = _load_census()
    tz_set = _territory_zips_set()

    total_battery = 0
    total_vehicles_3yr = 0
    zip_rows = []

    for z in tz_set:
        b = battery.get(z, {})
        c = census.get(z, {})
        cust = _f(b.get("unique_battery_customers_12mo"))
        tests = _f(b.get("battery_tests_12mo"))
        vehicles = _f(c.get("vehicles_3plus_yrs"))
        total_battery += cust
        total_vehicles_3yr += vehicles

        pen = _safe_div(cust, vehicles)
        zip_rows.append({
            "zip": z,
            **_zip_info(z),
            "value": int(cust),
            "tests": int(tests),
            "penetration": pen,
            "vehicles_3yr": int(vehicles),
        })

    penetration = _safe_div(total_battery, total_vehicles_3yr)
    gap = total_vehicles_3yr - total_battery
    opportunity = int(max(gap, 0) * PRODUCT_CONV["battery"] * PRODUCT_LTV["battery"])

    # Top by tests
    top_zips = _top_n(zip_rows, "tests", 10)

    # Geography
    qualified = [r for r in zip_rows if r["vehicles_3yr"] >= 300 and r["penetration"] is not None]
    geo_top = sorted(qualified, key=lambda x: x["penetration"], reverse=True)[:15]
    geo_bottom = sorted(qualified, key=lambda x: x["penetration"])[:15]

    plays = [
        {
            "title": "Proactive battery check reminders for aging vehicles",
            "target_count": int(max(gap, 0) * 0.1),
            "opportunity_dollars": int(max(gap, 0) * 0.1 * PRODUCT_CONV["battery"] * PRODUCT_LTV["battery"]),
        },
        {
            "title": "Partner with ERS for post-service battery upsell",
            "target_count": int(total_battery * 0.5),
            "opportunity_dollars": int(total_battery * 0.5 * 0.3 * PRODUCT_LTV["battery"]),
        },
        {
            "title": "Seasonal winter prep campaigns",
            "target_count": len(geo_bottom),
            "opportunity_dollars": int(len(geo_bottom) * 500 * PRODUCT_CONV["battery"] * PRODUCT_LTV["battery"]),
        },
    ]

    return {
        "product": "battery",
        "overview": {
            "total_footprint": int(total_battery),
            "penetration_pct": penetration,
            "opportunity_dollars": opportunity,
            "top_zips": top_zips,
        },
        "trends": {"yearly": []},
        "retention": {"by_year": [], "cancel_reasons": [], "by_segment": []},
        "geography": {"top_zips": geo_top, "bottom_zips": geo_bottom},
        "actions": {"total_opportunity": opportunity, "plays": plays},
    }


# ─── Main Endpoint ───────────────────────────────────────────────────────────

PRODUCT_BUILDERS = {
    "membership": _build_membership,
    "auto": _build_auto,
    "home": _build_home,
    "travel": _build_travel,
    "battery": _build_battery,
}


@router.get("/api/growth/product-report")
def product_report(
    product: str = Query("membership"),
    year_from: int = Query(2021),
    year_to: int = Query(2025),
    _user=Depends(get_current_user),
):
    """Return a full product deep-dive report for the given product."""
    if product not in VALID_PRODUCTS:
        product = "membership"

    builder = PRODUCT_BUILDERS[product]
    return builder(year_from, year_to)


# ─── AI Narrative Endpoint ────────────────────────────────────────────────────

_narrative_cache: dict[str, str] = {}


class NarrativeRequest(BaseModel):
    product: str = "membership"
    section: str = "executive"
    data_summary: dict = {}


def _get_ai_config() -> dict:
    """Get AI configuration (key, model)."""
    try:
        from routers.ai_config import get_ai_config
        return get_ai_config()
    except Exception:
        return {
            "api_key": os.getenv("OPENAI_API_KEY", ""),
            "model": os.getenv("AI_MODEL", "gpt-4o-mini"),
        }


NARRATIVE_SYSTEM_PROMPT = (
    "You are a senior sales analytics strategist for AAA Western & Central NY. "
    "Write concise, data-driven narratives for executive dashboards. "
    "Use specific numbers from the data provided. "
    "Keep paragraphs short (2-3 sentences). Use bullet points for action items."
)


@router.post("/api/growth/product-report/narrative")
def product_report_narrative(
    body: NarrativeRequest,
    _user=Depends(get_current_user),
):
    """Generate an AI narrative summary for a product report section."""
    product = body.product if body.product in VALID_PRODUCTS else "membership"
    section = body.section
    cache_key = f"{product}_{section}"

    # Return cached narrative if available
    if cache_key in _narrative_cache:
        return {"narrative": _narrative_cache[cache_key]}

    cfg = _get_ai_config()
    api_key = cfg.get("api_key", "")
    model = cfg.get("model", "gpt-4o-mini")

    if not api_key:
        return {"narrative": ""}

    prompt = (
        f"Product: {product}\n"
        f"Section: {section}\n"
        f"Data Summary:\n{json.dumps(body.data_summary, indent=2, default=str)}\n\n"
        f"Write a brief {section} narrative (3-5 sentences) analyzing this {product} data. "
        f"Highlight key metrics, trends, and recommended actions."
    )

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": NARRATIVE_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=500,
        )
        narrative = response.choices[0].message.content or ""
        _narrative_cache[cache_key] = narrative
        return {"narrative": narrative}
    except Exception as e:
        log.error(f"Product report narrative error: {e}")
        return {"narrative": ""}
