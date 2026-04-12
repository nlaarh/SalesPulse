from fastapi import APIRouter, Depends
import logging
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
    _user: User = Depends(get_current_user),
):
    """Generate AI upsell recommendations for this customer."""
    profile_data = get_customer_profile(account_id, _user)
    if 'error' in profile_data:
        return profile_data

    acct    = profile_data['account']
    p360    = profile_data['product_360']
    txns    = profile_data['transactions']
    mships  = profile_data['memberships']

    active_products = [k.replace('_', ' ').title() for k, v in p360.items() if v]
    missing = [k.replace('_', ' ').title() for k, v in p360.items() if not v]
    recent_txns = '\n'.join(
        f"- {t['created_date']}: {t['record_type']} — {t['name']} — ${t['amount'] or 0:,.0f} ({t['stage']})"
        for t in txns[:10]
    )
    current_membership = mships[0]['level'] if mships else 'Unknown'
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

    cfg = get_ai_config()
    if not cfg.get('api_key'):
        return {'analysis': None, 'error': 'AI not configured'}

    age_line = f"- Age: {member_age}" if member_age else "- Age: Unknown"
    # Build age-appropriateness rules
    age_rules = []
    if member_age is not None:
        if member_age < 25:
            age_rules.append("- Young member: emphasize driver training, roadside assistance (ERS), and basic auto insurance.")
            age_rules.append("- Do NOT recommend Medicare, financial services, or home insurance — not relevant at this age.")
        elif member_age < 40:
            age_rules.append("- Young professional: auto insurance, home insurance, travel, financial services, and membership upgrades are appropriate.")
            age_rules.append("- Do NOT recommend Medicare — member is far from eligibility.")
        elif member_age < 60:
            age_rules.append("- Mid-career member: all products EXCEPT Medicare are appropriate.")
            age_rules.append("- Do NOT recommend Medicare — member is under 60 and not yet eligible.")
        else:  # 60+
            age_rules.append("- Senior member: Medicare IS age-appropriate — recommend if not already held.")
            age_rules.append("- Travel insurance, financial services, and ERS are especially relevant.")
    age_instructions = '\n'.join(age_rules) if age_rules else "- No age data available; omit age-specific products like Medicare unless the member already holds them."

    # Build explicit product ownership rules
    already_held_rules = []
    if active_products:
        already_held_rules.append(f"- Member ALREADY owns: {', '.join(active_products)}. Do NOT suggest these as new cross-sell — instead suggest upgrades/enhancements within these lines if applicable.")
    if missing:
        already_held_rules.append(f"- Member does NOT yet have: {', '.join(missing)}. These are your cross-sell targets (subject to age rules).")
    if current_membership == 'Premier':
        already_held_rules.append("- Member is already Premier level — do NOT suggest membership upgrade. Instead focus on product cross-sell.")
    elif current_membership == 'Plus':
        already_held_rules.append("- Member is on Plus — suggest Premier upgrade for enhanced benefits.")
    elif current_membership in ('Basic', 'Classic'):
        already_held_rules.append("- Member is on Basic/Classic — suggest Plus or Premier upgrade.")
    product_rules = '\n'.join(already_held_rules) if already_held_rules else ''

    prompt = f"""You are a AAA sales advisor analyzing a member profile to identify upsell and cross-sell opportunities.

## Member Profile
- Name: {acct['name']}
{age_line}
- Member Since: {member_since}
- Membership Level: {current_membership}
- Member Product Index (MPI): {mpi} (higher = more engaged, max ~5)
- Region: {acct.get('region', 'N/A')}
- Active Products: {', '.join(active_products) if active_products else 'None'}
- Products NOT yet held: {', '.join(missing) if missing else 'None'}
- Insurance Customer Since: {acct.get('insurance_since', 'N/A')}
- Total Household Premiums: ${acct.get('total_premiums') or 0:,.0f}

## Recent Transactions (last 10)
{recent_txns if recent_txns else 'No transactions found'}

## STRICT RULES — You MUST follow these

### Age-Appropriateness (MANDATORY)
{age_instructions}

### Product Ownership (MANDATORY)
{product_rules}
- NEVER recommend a product the member already has as a new cross-sell.
- Only recommend products from the "NOT yet held" list above (subject to age appropriateness).
- For products the member already owns, you may suggest upgrades or enhanced coverage — but clearly label these as "enhancements" not new products.

## Your Task
Provide concise upsell/cross-sell recommendations. Use ## headers and bullet points.
Structure as:
1. **Membership Upgrade** — only if not already on Premier
2. **Cross-Sell Opportunities** — products they DON'T have yet, filtered by age appropriateness
3. **Enhancement Opportunities** — upgrades to products they already own
4. **Specific Next Actions** — what the advisor should do based on transaction history
5. **Risk Signals** — any signs of churn or disengagement

Be specific, actionable, and brief. Max 300 words."""

    try:
        text = call_ai(
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=600,
            cfg=cfg,
        )
        return {'analysis': text}
    except Exception as e:
        log.error(f'Upsell AI error: {e}')
        return {'analysis': None, 'error': str(e)}


