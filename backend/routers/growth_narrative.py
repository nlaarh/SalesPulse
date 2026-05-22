"""AI-powered analyst narratives for the Strategic Growth Plan page.

POST /api/growth/narrative
Body: { "section": "<id>", "context": { ...facts... } }
Returns: { "narrative": "<markdown>", "cached": <bool> }

The section id maps to a system prompt focused on that PDF section.
Context is a free-form facts dict (live numbers from the page) that the
prompt grounds the briefing on.
"""

import os
import json
import logging
import threading
import hashlib
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

import cache

router = APIRouter()
log = logging.getLogger('growth.narrative')

# ── OpenAI client (lazy + thread-safe) ────────────────────────────────────────

_client = None
_client_lock = threading.Lock()


def _get_client():
    global _client
    if _client is not None:
        return _client
    with _client_lock:
        if _client is not None:
            return _client
        try:
            from routers.ai_config import get_ai_config
            cfg = get_ai_config()
            api_key = cfg.get('api_key') or os.getenv('OPENAI_API_KEY')
        except Exception:
            cfg = {}
            api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            return None
        try:
            from openai import OpenAI
            kwargs: dict = {'api_key': api_key}
            if cfg.get('base_url'):
                kwargs['base_url'] = cfg['base_url']
            _client = OpenAI(**kwargs)
        except Exception as e:
            log.warning(f"OpenAI init failed: {e}")
    return _client


# ── Section prompts ──────────────────────────────────────────────────────────

BASE_SYSTEM = """You are a senior strategic analyst writing a briefing in the Path to $120.5M
Growth Plan report for AAA Western & Central New York's officers and directors.
Voice: VP-level, board-grade, decision-focused. Specific numbers in every sentence.
Open with the external macro force or market reality, then connect it to the AAA data
and the addressable response. Cite percentages, dollar amounts, and county names
when provided in the context. Use **bold** for key metrics and conclusions.
Use bullet lists (- item) sparingly. Use ## headers when the briefing covers two
distinct ideas. 3–5 short paragraphs maximum. No fluff, no generic advice."""

SECTION_PROMPTS: dict[str, str] = {
    'executive-summary': """
Focus on external market forces shaping AAA WCNY today: macroeconomic backdrop
(inflation, wages, household budget pressure) on the headwind side, and the
specific tailwinds (cruise demand, 50+ travel intent, insurance shopping surge,
carrier retreats). Close with the strategic posture for the year.""",

    'member-footprint': """
Focus on geographic footprint: which counties are strongest, where membership
is thinnest, and how shared-club allocation complicates interpretation in
border counties. Recommend a county-level activation move.""",

    'penetration-glance': """
Focus on the three conversion funnels: adult population reach, member-to-insurance,
member-to-travel. The story is the gray arc — the unconverted opportunity. Call
out the largest absolute gap in members.""",

    'market-health': """
Focus on the six penetration lenses overlap: identify the 2-3 counties that are
dark on members but light on insurance (the activation gap). Recommend which
counties get the next BD/agent push.""",

    'revenue-composition': """
Focus on the mix shift from 2025 to 2028: insurance from ~10% to 15%+ of revenue
is the activation lever. Membership grows modestly; travel holds; insurance
nearly doubles. Frame the implication for capital allocation.""",

    'opportunity-map': """
Focus on the three plays (deepen / expand / acquire under-45) and quantify each
in members, vehicles, or households reachable. Make clear that growth is
activation of existing relationships, not new markets.""",

    'priority-matrix': """
Focus on the GROW / DEFEND / MAINTAIN tier classification. Name the largest GROW
counties (big base, below-median penetration) and explain why they get priority.
Then call out DEFEND counties where retention is the move.""",

    'membership': """
Focus on the membership business: 5-year acquisition vs cancellation trend,
the addressable vs non-addressable attrition split, Year-1 Gen Z activation,
bundle retention, and the income geography cancellation pattern.""",

    'insurance': """
Focus on the auto + home insurance opportunity: 2.1% member cross-sell, competitive
landscape, carrier mix risk, age cohort acquisition, retention by income, and
the carrier-retreat rewriting window.""",

    'travel': """
Focus on the travel business: agency commission, segment mix (cruise, senior, family),
member vs non-member buyer split, post-trip insurance cross-sell opportunity, and
the macro cruise/50+ travel tailwind.""",

    'medicare-driver': """
Focus on emerging opportunity products: Medicare opportunity (65+ population density),
Driver Programs (16-18 license rate). Frame these as future-leg revenue, not 2026.""",

    'strategy-appendix': """
Focus on the cross-product strategy: channel × segment matrix, four growth plays,
20 actionable next steps. Close with the execution roadmap milestones to $120.5M.""",
}


# ── Request / response models ────────────────────────────────────────────────

class NarrativeRequest(BaseModel):
    section: str
    context: dict = {}


@router.post('/api/growth/narrative')
def growth_narrative(body: NarrativeRequest):
    """Generate (or return cached) AI analyst briefing for a Growth Plan section."""

    section_key = body.section.strip().lower()
    if section_key not in SECTION_PROMPTS:
        return {
            'narrative': f"_No prompt configured for section '{body.section}'._",
            'cached': False,
        }

    # Stable cache key: section + hashed context (numbers change → new narrative)
    ctx_str = json.dumps(body.context, sort_keys=True, default=str)
    ctx_hash = hashlib.sha1(ctx_str.encode()).hexdigest()[:12]
    cache_key = f'growth_narrative_v1_{section_key}_{ctx_hash}'

    def fetch():
        client = _get_client()
        if client is None:
            return {
                'narrative': "_AI narrative unavailable — OPENAI_API_KEY not configured._",
                'cached': False,
            }

        system = BASE_SYSTEM + "\n\n" + SECTION_PROMPTS[section_key]
        user_msg = (
            "Generate a board-grade briefing for this section. "
            "Ground every claim in the facts below. "
            "Do NOT invent numbers that are not provided.\n\n"
            f"FACTS (JSON):\n{ctx_str}"
        )

        try:
            from routers.ai_config import get_ai_config
            model = get_ai_config().get('model') or os.getenv('AI_MODEL', 'gpt-4.1-mini')
        except Exception:
            model = os.getenv('AI_MODEL', 'gpt-4.1-mini')

        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {'role': 'system', 'content': system},
                    {'role': 'user', 'content': user_msg},
                ],
                temperature=0.4,
                max_tokens=900,
            )
            text = (resp.choices[0].message.content or '').strip()
            return {'narrative': text, 'cached': False}
        except Exception as e:
            log.warning(f"Growth narrative generation failed: {e}")
            return {
                'narrative': f"_AI narrative failed: {type(e).__name__}_",
                'cached': False,
            }

    # 6-hour TTL — re-generates a few times a day even with same inputs
    result = cache.cached_query(cache_key, fetch, ttl=6 * 3600, disk_ttl=24 * 3600)
    return {**result, 'cached': True} if 'narrative' in result and result.get('narrative', '').startswith('_') is False else result
