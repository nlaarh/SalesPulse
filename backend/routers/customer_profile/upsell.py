from fastapi import APIRouter, Depends, Query
import logging
import cache
from auth import get_current_user
from models import User
from routers.ai_config import call_ai, get_ai_config
from .details import get_customer_profile

router = APIRouter()
log = logging.getLogger('salesinsight.customer')

# ── AI Upsell ────────────────────────────────────────────────────────────────

@router.post('/api/customers/{account_id}/upsell')
def get_upsell_analysis(
    account_id: str,
    refresh: bool = False,
    _user: User = Depends(get_current_user),
):
    """Generate AI upsell recommendations for this customer."""
    profile_data = get_customer_profile(account_id, refresh=refresh, _user=_user)
    if 'error' in profile_data:
        return profile_data

    acct    = profile_data['account']
    p360    = profile_data['product_360']
    txns    = profile_data['transactions']
    mships  = profile_data['memberships']

    current_membership = mships[0]['level'] if mships else 'None'
    member_since = acct.get('member_since', 'Unknown')
    mpi = acct.get('mpi') or 0

    # Calculate age from birthdate for age-appropriate recommendations
    from datetime import date
    birthdate_str = acct.get('birthdate')
    member_age = None
    if birthdate_str:
        try:
            bd = date.fromisoformat(birthdate_str[:10])
            today = date.today()
            member_age = today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day))
        except (ValueError, TypeError):
            pass

    # Calculate tenure safely
    tenure_years = 'N/A'
    if member_since and member_since != 'Unknown':
        try:
            if hasattr(member_since, 'year'):
                tenure_years = str(date.today().year - member_since.year)
            elif isinstance(member_since, str):
                tenure_years = str(date.today().year - date.fromisoformat(member_since[:10]).year)
        except Exception:
            pass

    # Build eligibility constraints dynamically
    eligible_products = []
    
    # 1. Membership status and upgrade rules
    is_member = p360.get('membership', False) or acct.get('member_status') == 'A'
    if not is_member:
        eligible_products.append("New Membership (Basic, Plus, or Premier)")
    elif current_membership in ('Basic', 'Plus', 'Classic', 'B') and current_membership != 'Premier':
        target_tiers = "Plus or Premier" if current_membership in ('Basic', 'Classic', 'B') else "Premier"
        eligible_products.append(f"Membership Upgrade (Current: {current_membership} → Target: {target_tiers})")

    # 2. Insurance cross-sell
    if not p360.get('insurance', False):
        eligible_products.append("Insurance (Auto, Home, or Umbrella)")

    # 3. Travel cross-sell
    if not p360.get('travel', False):
        eligible_products.append("Travel bookings (Concierge agency services, flights, hotels, vacation packages)")

    # 3b. Travel insurance — only if they don't already have it
    if not p360.get('travel_insurance', False):
        eligible_products.append("Travel Insurance (trip protection / travel insurance policy)")

    # 4. Medicare supplement (strictly age-dependent, only if >= 65 and missing)
    if member_age is not None and member_age >= 65 and not p360.get('medicare', False):
        eligible_products.append("Medicare Supplement/Advantage plans")

    # 5. Driver Safety Program — only for members 55+ who haven't enrolled
    if member_age is not None and member_age >= 55 and not p360.get('driver', False):
        eligible_products.append("Driver Safety Program (AAA mature/senior driver course for members 55+, may qualify for auto insurance discount)")

    # Build active products list
    active_products = []
    if is_member:
        # ERS is included with all membership tiers — always list it here so AI never treats it as a gap
        active_products.append(f"Membership (Tier: {current_membership or 'Standard'}) — Emergency Road Service (ERS) included, {ers_calls_available} calls/year ({ers_calls_made} used this year)")
    if p360.get('insurance', False):
        active_products.append("Insurance (Auto, Home, or Umbrella)")
    if p360.get('travel', False):
        active_products.append("Travel bookings")
    if p360.get('travel_insurance', False):
        active_products.append("Travel Insurance")
    if p360.get('medicare', False):
        active_products.append("Medicare Supplement/Advantage")
    if p360.get('driver', False):
        active_products.append("Driver Safety Program")

    # Group and aggregate historical transaction info
    travel_opps = profile_data.get('opportunities', {}).get('Travel', [])
    insurance_opps = profile_data.get('opportunities', {}).get('Insurance', [])
    
    won_travel_rev = sum(o.get('amount') or 0 for o in travel_opps if o.get('stage') in ('Closed Won', 'Invoice'))
    won_ins_rev = sum(o.get('amount') or 0 for o in insurance_opps if o.get('stage') == 'Closed Won')
    total_spent_rev = won_travel_rev + won_ins_rev

    # Open opportunities to prioritize closing
    open_opps = [
        t for t in txns
        if t.get('stage') not in ('Closed Won', 'Invoice', 'Closed Lost')
    ]
    open_opps_str = '\n'.join(
        f"- Opportunity: {o['name']} ({o['record_type']}) — Stage: {o['stage']} — Amount: ${o['amount'] or 0:,.0f} — Owner: {o['owner'] or 'N/A'}"
        for o in open_opps
    ) if open_opps else "No active open opportunities."

    # Recent won history for context
    won_txns = [
        t for t in txns
        if t.get('stage') in ('Closed Won', 'Invoice')
    ]
    recent_won_str = '\n'.join(
        f"- {t['created_date']}: {t['record_type']} — {t['name']} — ${t['amount'] or 0:,.0f}"
        for t in won_txns[:5]
    ) if won_txns else "No recent won transactions."

    ers_calls_made = acct.get('ers_calls_made') or 0
    ers_calls_available = acct.get('ers_calls_available') or 4
    ltv = acct.get('ltv') or 'Standard'

    # Reconstruct state signature to invalidate cache if the customer profile changes
    state_parts = [
        acct.get('member_status') or '',
        current_membership or '',
        str(mpi),
        str(acct.get('total_premiums') or 0),
        str(ltv),
        "_".join(active_products),
        str(len(txns)),
    ]
    state_sig = "_".join(state_parts).replace(" ", "_")
    ai_key = f"customer_upsell_{account_id}_{state_sig}"
    print(f"Upsell Cache Key: {ai_key}")

    if refresh:
        cache.invalidate(ai_key)

    cfg = get_ai_config()
    if not cfg.get('api_key'):
        return {'analysis': None, 'error': 'AI not configured'}

    prompt = f"""You are a senior AAA strategic growth analyst. Conduct a comprehensive customer 360 review for this member to generate highly targeted cross-sell and upsell recommendations.

## CUSTOMER PROFILE & METRICS
- Name: {acct['name']}
- Age: {f"{member_age} years old" if member_age else "Unknown"}
- Member Since: {member_since} (Tenure: {tenure_years} years)
- Current Membership Tier: {current_membership}
- Lifetime Value (LTV) Grade: {ltv} (A is highest, E is lowest)
- Member Product Index (MPI): {mpi}/5
- Total Won Travel Bookings: ${won_travel_rev:,.2f} ({len([o for o in travel_opps if o.get('stage') in ('Closed Won', 'Invoice')])} won trips)
- Total Won Insurance Policies: ${won_ins_rev:,.2f} ({len([o for o in insurance_opps if o.get('stage') == 'Closed Won'])} won policies)
- Total Historical Won Revenue: ${total_spent_rev:,.2f}
- Annual Household Insurance Premiums: ${acct.get('total_premiums') or 0:,.2f}
- Roadside Assistance (ERS): {ers_calls_made} of {ers_calls_available} annual calls used {'(included with membership — NOT a separate upsell)' if is_member else '(not a member)'}

## PRODUCT HOLDINGS (Do NOT recommend these!)
- Active Products: {', '.join(active_products) if active_products else 'None'}

## STRICT ELIGIBILITY RULES
- You MUST ONLY recommend products listed under "ELIGIBLE PRODUCTS FOR CROSS-SELL/UPSELL" below.
- Do NOT offer products the member already owns (see PRODUCT HOLDINGS above).
- ERS (Emergency Road Assistance) is AUTOMATICALLY INCLUDED with all AAA membership tiers. NEVER recommend ERS as a separate product to members — they already have it.
- Recommending Medicare Supplement/Advantage plans is STRICTLY prohibited unless the member is age 65 or older.
- Driver Safety Programs: ONLY recommend for members age 55 or older.
- Travel Insurance: ONLY recommend if the customer does NOT already have travel insurance (check product holdings).
- If they do not have a membership, the FIRST priority is a New Membership.
- If they have a membership but it is Basic, Plus, or Classic, the FIRST priority is a Membership Upgrade — recommend this before any other cross-sell.

## ELIGIBLE PRODUCTS FOR CROSS-SELL/UPSELL (Choose only from this list!)
{chr(10).join(f"- {p}" for p in eligible_products) if eligible_products else "- None (Customer is fully penetrated across all eligible products)"}

## DEALS & PIPELINE TO CLOSE
{open_opps_str}

## RECENT WON HISTORY
{recent_won_str}

## YOUR TASK
Write a highly structured, professional, and strategic briefing for the sales advisor. Use **Markdown formatting** with bold text for emphasis.
You MUST structure your response around the following 4 sections exactly:

### 1. Customer Value & Loyalty Assessment
Analyze the customer's loyalty, tenure, and total economic value (won revenue, household premiums, and LTV grade). Explain why this customer is highly important to AAA.

### 2. Next Best Product (NBP) Recommendations
Rank the top 1-2 eligible products that the customer qualifies for and does NOT currently hold. Detail the precise reasoning of why they qualify and why it benefits them. Enforce the eligibility rules (such as age for Medicare, and current tier for upgrades).

### 3. Actionable Next Steps
Provide concrete, step-by-step next actions for the advisor. If there are active open opportunities, prioritize those to get them closed. Otherwise, pitch the next best product or upgrade, referencing their recent transactions or road service usage.

### 4. Risk & Retention Signals
Evaluate potential churn risk factors such as lapsed/expired membership, low engagement, or upcoming renewal dates. Note ERS usage ({ers_calls_made}/{ers_calls_available} calls) only as an engagement signal, NOT as a product gap.

Keep the tone professional, direct, and actionable. Limit your response to 300 words."""

    def _fetch_ai():
        return call_ai(
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=600,
            cfg=cfg,
        )

    try:
        text = cache.cached_query(ai_key, _fetch_ai, ttl=86400, disk_ttl=86400)
        return {'analysis': text}
    except Exception as e:
        log.error(f'Upsell AI error: {e}')
        return {'analysis': None, 'error': str(e)}
