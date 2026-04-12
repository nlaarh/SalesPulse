"""
AI Chat Guardrails
==================
Multi-layer defense: prompt injection, topic restriction, data exfiltration detection.
"""

import re
import time
import logging
from collections import defaultdict

log = logging.getLogger("salesinsight.ai_guardrails")

# ── Layer 2a: Prompt Injection Detection ─────────────────────────────────────

_INJECTION_PATTERNS = [
    # Role switching / instruction override
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"ignore\s+(all\s+)?above",
    r"forget\s+(your|all|previous)\s+instructions",
    r"you\s+are\s+now\s+a",
    r"new\s+system\s+prompt",
    r"override\s+(system|your)\s+(prompt|instructions|rules)",
    r"act\s+as\s+(if\s+you\s+are|a)\s+",
    r"pretend\s+(you\s+are|to\s+be)",
    r"switch\s+to\s+\w+\s+mode",
    r"enter\s+\w+\s+mode",
    r"jailbreak",
    r"do\s+anything\s+now",
    r"dan\s+mode",
    # Delimiter injection
    r"<\|system\|>",
    r"<\|user\|>",
    r"<\|assistant\|>",
    r"\[INST\]",
    r"\[/INST\]",
    r"```system",
    r"###\s*(system|instruction|prompt)",
    r"---\s*(system|instruction|prompt)",
    # Encoded payloads
    r"base64[:\s]",
    r"\\u00[0-9a-f]{2}",
    r"eval\s*\(",
    r"exec\s*\(",
    # Exfiltration of system prompt
    r"(repeat|show|print|output|reveal|display)\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions|rules)",
    r"(show|reveal|display|print)\s+(me\s+)?.*system\s*prompt",
    r"what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions|rules)",
]

_INJECTION_RE = [re.compile(p, re.IGNORECASE) for p in _INJECTION_PATTERNS]


def check_prompt_injection(query: str) -> dict:
    """Check for prompt injection attempts. Returns {blocked, reason}."""
    for pattern in _INJECTION_RE:
        if pattern.search(query):
            log.warning(f"Prompt injection detected: {pattern.pattern}")
            return {
                "blocked": True,
                "reason": "I can only help with sales analytics questions. Please ask about pipeline, revenue, deals, or team performance.",
            }
    return {"blocked": False, "reason": ""}


# ── Layer 2b: Topic Restriction ──────────────────────────────────────────────

_ALLOWED_TOPICS = [
    r"pipeline", r"revenue", r"deal[s]?", r"opportunit", r"booking",
    r"advisor[s]?", r"agent[s]?", r"team", r"performer",
    r"forecast", r"quota", r"target",
    r"win\s*rate", r"close\s*rate", r"conversion",
    r"funnel", r"stage[s]?",
    r"customer[s]?", r"account[s]?", r"client",
    r"at[- ]risk", r"slipping", r"closing",
    r"insurance", r"travel",
    r"territory", r"region", r"zip",
    r"sales", r"revenue", r"commission",
    r"industry", r"sector", r"market",
    r"performance", r"metric[s]?", r"kpi",
    r"quarter", r"month", r"year", r"ytd", r"q[1-4]",
    r"grow", r"growth", r"trend", r"compare",
    r"focus", r"expand", r"potential", r"opportunity", r"opportunities",
    r"penetrat", r"member[s]?", r"population", r"income", r"demographic",
    r"city", r"cities", r"rochester", r"buffalo", r"syracuse", r"western", r"central",
    r"where\s+(should|can|do)", r"best\s+(area|place|city|region)",
    r"top\s+\d+", r"bottom\s+\d+", r"rank",
    r"average", r"total", r"sum", r"count",
    r"how\s+(many|much)", r"what\s+(is|are|was|were)",
    r"who\s+(is|are|has|had)", r"which",
    r"show\s+me", r"tell\s+me", r"summarize", r"summary",
    r"how\s+(are|is|were|was)\s+(we|things|the\s+team|business)",
    r"overall", r"executive", r"coaching", r"losing", r"winning",
    r"hello", r"hi\b", r"hey\b", r"thanks", r"thank\s+you",
]

_BLOCKED_TOPICS = [
    r"(write|generate|create)\s+(me\s+)?(a\s+)?(\w+\s+)?(code|script|program|function|class)",
    r"(write|generate|create)\s+(me\s+)?(a\s+)?(\w+\s+)?(poem|song|story|essay|article)",
    r"recipe[s]?", r"cook(ing)?",
    r"\bweather\b",
    r"translate\s+", r"translation",
    r"homework", r"assignment",
    r"(explain|teach)\s+(me\s+)?(how\s+to\s+)?(code|program|hack)",
    r"politic[s]?", r"election",
    r"joke[s]?", r"funny",
    r"(personal|life|relationship|dating)\s+(advice|help|tip)",
    r"(stock|crypto|bitcoin|invest)\s+(price|buy|sell|tip)",
    r"medical\s+(advice|diagnosis|symptom)",
    r"(sql|soql|query|database)\s+(injection|schema|structure|table)",
]

_ALLOWED_RE = [re.compile(p, re.IGNORECASE) for p in _ALLOWED_TOPICS]
_BLOCKED_RE = [re.compile(p, re.IGNORECASE) for p in _BLOCKED_TOPICS]


def check_topic(query: str) -> dict:
    """Check if query is on-topic (sales-related). Returns {blocked, reason}."""
    # First check explicit blocks
    for pattern in _BLOCKED_RE:
        if pattern.search(query):
            return {
                "blocked": True,
                "reason": "I'm a sales analytics assistant. I can only help with questions about pipeline, revenue, deals, agents, and business performance.",
            }

    # Then check if query matches any allowed topic
    for pattern in _ALLOWED_RE:
        if pattern.search(query):
            return {"blocked": False, "reason": ""}

    # Short queries (< 5 words) that don't match anything — allow (likely greetings/follow-ups)
    if len(query.split()) < 5:
        return {"blocked": False, "reason": ""}

    # Ambiguous — block if no sales keyword found
    return {
        "blocked": True,
        "reason": "I can only answer questions about sales data — pipeline, revenue, deals, agents, and performance. Could you rephrase your question?",
    }


# ── Layer 2c: Data Exfiltration Detection ────────────────────────────────────

_EXFIL_PATTERNS = [
    r"(list|show|give|get|fetch|return|display)\s+(me\s+)?(all|every|each)\s+(the\s+)?(customer|deal|opportunit|account|record|agent|advisor|user|data|row)",
    r"export\s+(all|the|every|my)",
    r"download\s+(all|the|every|my)",
    r"dump\s+(all|the|every|my|data|database)",
    r"entire\s+(database|dataset|table|list)",
    r"all\s+records",
    r"every\s+single",
    r"(complete|full)\s+(list|dataset|database|export|dump)",
    r"(csv|excel|json|xml)\s+(export|download|file|format)",
    r"(how\s+many|count)\s+(total\s+)?(record|row|entr)",
    r"(no\s+limit|unlimited|without\s+limit)",
    r"SELECT\s+\w+.*\s+FROM\s+",  # raw SOQL attempts (must have SELECT...FROM together)
]

_EXFIL_RE = [re.compile(p, re.IGNORECASE) for p in _EXFIL_PATTERNS]

# Per-user frequency tracking: {user_id: [(timestamp, was_data_query), ...]}
_user_query_history: dict[int, list[tuple[float, bool]]] = defaultdict(list)
_FREQ_WINDOW = 120  # 2 minutes
_FREQ_THRESHOLD = 15  # max data-fetching queries in window before rate-limiting


def check_data_exfiltration(query: str, user_id: int = 0) -> dict:
    """Check for bulk data download attempts. Returns {blocked, reason}."""
    # Pattern-based detection
    for pattern in _EXFIL_RE:
        if pattern.search(query):
            log.warning(f"Data exfiltration attempt by user {user_id}: {query[:100]}")
            return {
                "blocked": True,
                "reason": "I can provide summaries and insights, but I can't export bulk data or raw records. Try asking for a summary, top performers, or key metrics instead.",
            }

    # Frequency-based detection
    now = time.time()
    history = _user_query_history[user_id]
    # Clean old entries
    history[:] = [(t, d) for t, d in history if now - t < _FREQ_WINDOW]
    # Count recent data-fetching queries (anything with "list", "show", numbers-heavy intent)
    is_data_query = bool(re.search(r"(list|show|get|how many|count|top\s+\d+)", query, re.IGNORECASE))
    history.append((now, is_data_query))
    data_queries = sum(1 for _, d in history if d)

    if data_queries > _FREQ_THRESHOLD:
        log.warning(f"Frequency exfiltration by user {user_id}: {data_queries} data queries in {_FREQ_WINDOW}s")
        return {
            "blocked": True,
            "reason": "You're making a lot of data requests in a short time. Please slow down or ask for summaries instead of individual records.",
        }

    return {"blocked": False, "reason": ""}


# ── Combined Guard ───────────────────────────────────────────────────────────

def run_all_guards(query: str, user_id: int = 0) -> dict:
    """Run all input guardrails. Returns {blocked, reason, guard} or {blocked: False}."""
    # 1. Prompt injection
    result = check_prompt_injection(query)
    if result["blocked"]:
        return {**result, "guard": "prompt_injection"}

    # 2. Topic restriction
    result = check_topic(query)
    if result["blocked"]:
        return {**result, "guard": "off_topic"}

    # 3. Data exfiltration
    result = check_data_exfiltration(query, user_id)
    if result["blocked"]:
        return {**result, "guard": "data_exfiltration"}

    return {"blocked": False, "reason": "", "guard": ""}


# ── Rate Limiter ─────────────────────────────────────────────────────────────

_rate_limits: dict[int, list[float]] = defaultdict(list)
RATE_LIMIT_PER_MIN = 20
RATE_LIMIT_PER_DAY = 200


def check_rate_limit(user_id: int) -> dict:
    """Check per-user rate limits. Returns {blocked, reason} or {blocked: False}."""
    now = time.time()
    timestamps = _rate_limits[user_id]

    # Clean entries older than 24h
    timestamps[:] = [t for t in timestamps if now - t < 86400]

    # Check per-minute
    recent_min = sum(1 for t in timestamps if now - t < 60)
    if recent_min >= RATE_LIMIT_PER_MIN:
        return {"blocked": True, "reason": "Too many requests. Please wait a moment before asking another question."}

    # Check per-day
    if len(timestamps) >= RATE_LIMIT_PER_DAY:
        return {"blocked": True, "reason": "You've reached the daily query limit. Please try again tomorrow."}

    timestamps.append(now)
    return {"blocked": False, "reason": ""}
