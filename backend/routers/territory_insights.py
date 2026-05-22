"""Territory Zip AI Insights — GPT-powered executive recommendations per zip."""

import os
import json
import logging
from typing import Optional

from fastapi import APIRouter, Query

from shared import resolve_dates as _resolve_dates
from constants import CACHE_TTL_HOUR, CACHE_TTL_DAY
import cache

router = APIRouter()
log = logging.getLogger(__name__)


def _get_ai_config():
    """Get AI configuration (key, model)."""
    try:
        from routers.ai_config import get_ai_config
        return get_ai_config()
    except Exception:
        return {
            'api_key': os.getenv('OPENAI_API_KEY', ''),
            'model': os.getenv('AI_MODEL', 'gpt-4o-mini'),
        }


@router.get("/api/territory/zip-insights/{zip_code}")
def zip_insights(
    zip_code: str,
    period: int = 12,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Generate AI executive insights for a zip code.

    Combines census demographics, customer penetration, and revenue data
    to produce actionable recommendations for growth.
    """
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"zip_insights_{zip_code}_{sd}_{ed}_v2"

    def fetch():
        # Gather all data for the prompt
        census = _get_census(zip_code)
        customers = _get_customer_metrics(zip_code, sd, ed)

        if not census and not customers:
            return {"zip_code": zip_code, "insights": None, "error": "No data available"}

        # Build the AI prompt
        prompt = _build_prompt(zip_code, census, customers)

        # Call OpenAI
        cfg = _get_ai_config()
        api_key = cfg.get('api_key', '')
        model = cfg.get('model', 'gpt-4o-mini')

        if not api_key:
            return {"zip_code": zip_code, "insights": None, "error": "AI not configured"}

        try:
            from openai import OpenAI
            client = OpenAI(api_key=api_key)
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
                max_tokens=1500,
            )
            content = response.choices[0].message.content
            return {"zip_code": zip_code, "insights": content, "error": None}
        except Exception as e:
            log.error(f"AI insights error for {zip_code}: {e}")
            return {"zip_code": zip_code, "insights": None, "error": str(e)}

    return cache.cached_query(key, fetch, ttl=CACHE_TTL_DAY, disk_ttl=CACHE_TTL_DAY * 7)


def _get_census(zip_code: str) -> dict:
    """Load census segment data for the zip."""
    from routers.territory_census import _load_segments
    data = _load_segments()
    return data.get(zip_code, {})


def _get_customer_metrics(zip_code: str, sd: str, ed: str) -> dict:
    """Get Salesforce customer metrics for the zip."""
    from sf_client import sf_query_all

    try:
        # Insurance customers
        ins = sf_query_all(f"""
            SELECT COUNT(Id) cnt
            FROM Account
            WHERE BillingPostalCode LIKE '{zip_code}%'
              AND IsPersonAccount = true
              AND Member_Status__c = 'A'
              AND Insuance_Customer_ID__c != null
        """)
        ins_count = ins[0].get('cnt', 0) if ins else 0

        # Travel revenue + count
        travel = sf_query_all(f"""
            SELECT COUNT(Id) cnt, SUM(Amount) rev
            FROM Opportunity
            WHERE Account.BillingPostalCode LIKE '{zip_code}%'
              AND StageName IN ('Closed Won','Invoice')
              AND CloseDate >= {sd} AND CloseDate <= {ed}
              AND RecordType.Name = 'Travel'
              AND Amount != null
        """)
        travel_count = travel[0].get('cnt', 0) if travel else 0
        travel_rev = travel[0].get('rev', 0) if travel else 0

        # Insurance revenue
        ins_rev_data = sf_query_all(f"""
            SELECT SUM(Amount) rev
            FROM Opportunity
            WHERE Account.BillingPostalCode LIKE '{zip_code}%'
              AND StageName IN ('Closed Won','Invoice')
              AND CloseDate >= {sd} AND CloseDate <= {ed}
              AND RecordType.Name = 'Insurance'
              AND Amount != null
        """)
        ins_rev = ins_rev_data[0].get('rev', 0) if ins_rev_data else 0

        # Total members
        members = sf_query_all(f"""
            SELECT COUNT(Id) cnt
            FROM Account
            WHERE BillingPostalCode LIKE '{zip_code}%'
              AND IsPersonAccount = true
              AND Member_Status__c = 'A'
        """)
        member_count = members[0].get('cnt', 0) if members else 0

        return {
            'members': member_count,
            'ins_customers': ins_count,
            'ins_penetration': round(ins_count / member_count * 100, 1) if member_count > 0 else 0,
            'ins_revenue': ins_rev or 0,
            'travel_customers': travel_count,
            'travel_revenue': travel_rev or 0,
            'travel_penetration': round(travel_count / member_count * 100, 1) if member_count > 0 else 0,
        }
    except Exception as e:
        log.error(f"Error fetching metrics for {zip_code}: {e}")
        return {}


SYSTEM_PROMPT = """You are an expert sales strategy analyst for AAA Western & Central New York (AAA WCNY).
You provide executive-level insights and actionable recommendations to grow insurance and travel sales.
Your tone is confident, data-driven, and strategic. Use specific numbers from the data provided.
Format your response in clear sections with headers using markdown. Be concise but insightful."""


def _build_prompt(zip_code: str, census: dict, customers: dict) -> str:
    """Build the analysis prompt with all available data."""
    parts = [f"## Zip Code {zip_code} — Executive Growth Analysis\n"]

    if census:
        parts.append("### Demographics & Segment Profile")
        parts.append(f"- Population: {census.get('population', 0):,}")
        parts.append(f"- Adults 18+: {census.get('adults_18plus', 0):,}")
        parts.append(f"- Median Income: ${census.get('median_income', 0):,}")
        parts.append(f"- Median Home Value: ${census.get('median_home_value', 0):,}")
        parts.append(f"- Housing Type: {census.get('housing_type', 'Unknown')}")
        parts.append(f"- Location Type: {census.get('location_type', 'Unknown')}")
        parts.append(f"- Owner-Occupied Homes: {census.get('owner_occupied', 0):,}")
        parts.append(f"- Renter-Occupied: {census.get('renter_occupied', 0):,}")
        parts.append(f"- Untapped Homes (no AAA insurance): {census.get('untapped_homes', 0):,}")
        parts.append(f"- Registered Vehicles: {census.get('registered_vehicles', 0):,}")
        parts.append(f"- Vehicles 3+ Years Old: {census.get('vehicles_3plus_yrs', 0):,}")
        # Age distribution
        age_data = []
        for key, label in [('age_16_18', '16-18'), ('age_18_24', '18-24'),
                           ('age_25_34', '25-34'), ('age_35_44', '35-44'),
                           ('age_45_54', '45-54'), ('age_55_64', '55-64'),
                           ('age_65_plus', '65+')]:
            if census.get(key):
                age_data.append(f"  {label}: {census[key]:,}")
        if age_data:
            parts.append("- Age Distribution:")
            parts.extend(age_data)

    if customers:
        parts.append("\n### Current Business Performance")
        parts.append(f"- AAA Members: {customers.get('members', 0):,}")
        parts.append(f"- Insurance Customers: {customers.get('ins_customers', 0):,} "
                     f"({customers.get('ins_penetration', 0)}% penetration)")
        parts.append(f"- Insurance Revenue (period): ${customers.get('ins_revenue', 0):,.0f}")
        parts.append(f"- Travel Customers: {customers.get('travel_customers', 0):,} "
                     f"({customers.get('travel_penetration', 0)}% penetration)")
        parts.append(f"- Travel Revenue (period): ${customers.get('travel_revenue', 0):,.0f}")

        if customers.get('members') and customers.get('ins_customers'):
            gap = customers['members'] - customers['ins_customers']
            parts.append(f"- Insurance Gap (members without insurance): {gap:,}")

    parts.append("\n### Analysis Request")
    parts.append("""Provide a strategic executive brief covering:
1. **Market Opportunity Assessment** — Size the opportunity. How many untapped households/members could convert? What's the revenue potential?
2. **Product Penetration Analysis** — Where are the gaps? Which products (auto, home, life, travel) have the most growth potential given this demographic?
3. **Customer Segment Insights** — Based on age distribution, income, housing, what products and messaging would resonate?
4. **Top 3 Actions** — Specific, actionable next steps the sales team should take THIS quarter to grow business in this zip.
5. **Risk Factors** — Any demographic headwinds or competitive concerns to watch.

Be specific with numbers. Reference the data. Make it actionable for a VP of Sales.""")

    return "\n".join(parts)
