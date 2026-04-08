"""Shared constants and thresholds for SalesInsight backend.

Centralises magic numbers so they can be tuned in one place.
Grouped by domain.
"""

# ── Cache TTL (seconds) ─────────────────────────────────────────────────────
CACHE_TTL_SHORT = 900        # 15 minutes
CACHE_TTL_MEDIUM = 1800      # 30 minutes
CACHE_TTL_HOUR = 3600        # 1 hour
CACHE_TTL_12H = 43200        # 12 hours
CACHE_TTL_DAY = 86400        # 24 hours

# ── Opportunity Scoring (sales_opportunities) ─────────────────────────────

# Deal-value bands → points (max 25)
OPP_SCORE_AMOUNT_HIGH = 25_000       # >= this → 25 pts
OPP_SCORE_AMOUNT_SIGNIFICANT = 10_000  # >= this → 20 pts
OPP_SCORE_AMOUNT_MEDIUM = 5_000      # >= this → 15 pts
OPP_SCORE_AMOUNT_LOW = 2_000         # >= this → 8 pts
# Below LOW → 3 pts

OPP_SCORE_AMOUNT_PTS_HIGH = 25
OPP_SCORE_AMOUNT_PTS_SIGNIFICANT = 20
OPP_SCORE_AMOUNT_PTS_MEDIUM = 15
OPP_SCORE_AMOUNT_PTS_LOW = 8
OPP_SCORE_AMOUNT_PTS_MINIMAL = 3

# Activity-recency bands → points (max 20)
OPP_SCORE_ACTIVITY_HOT_DAYS = 3       # <= this → 20 pts
OPP_SCORE_ACTIVITY_WARM_DAYS = 7      # <= this → 16 pts
OPP_SCORE_ACTIVITY_COOLING_DAYS = 14  # <= this → 12 pts
OPP_SCORE_ACTIVITY_COLD_DAYS = 30     # <= this → 8 pts
OPP_SCORE_ACTIVITY_ATRISK_DAYS = 60   # <= this → 4 pts
# Beyond 60 → 0 pts (stale)

OPP_SCORE_ACTIVITY_PTS_HOT = 20
OPP_SCORE_ACTIVITY_PTS_WARM = 16
OPP_SCORE_ACTIVITY_PTS_COOLING = 12
OPP_SCORE_ACTIVITY_PTS_COLD = 8
OPP_SCORE_ACTIVITY_PTS_ATRISK = 4

# Close-date urgency bands → points (max 20)
OPP_SCORE_CLOSE_THISWEEK_DAYS = 7     # <= this → 18 pts
OPP_SCORE_CLOSE_TWOWEEKS_DAYS = 14    # <= this → 15 pts
OPP_SCORE_CLOSE_THISMONTH_DAYS = 30   # <= this → 10 pts
OPP_SCORE_CLOSE_TWOMONTHS_DAYS = 60   # <= this → 5 pts
# Overdue (< 0) → 20 pts (immediate action)

# ── Agent Profile Thresholds (sales_agent_profile) ────────────────────────

# Pipeline coverage thresholds
COVERAGE_LOW = 1.5       # Below this = "below 2x target" warning
COVERAGE_HEALTHY = 2.0   # At or above = "healthy"

# Task completion thresholds
TASK_COMPLETION_STRONG = 85   # >= this% = "strong"
TASK_COMPLETION_POOR = 60     # < this% = "concerning"
TASK_MIN_SAMPLE = 5           # Minimum tasks in period to evaluate rate

# Win rate comparison delta (pts)
WIN_RATE_DELTA = 5  # +/- this vs team = notable difference

# YoY performance thresholds (%)
YOY_STRONG_GROWTH = 15    # > this = "strong performer" in template brief
YOY_REVENUE_UP = 10       # > this = "Revenue up X% YoY" strength
YOY_REVENUE_DOWN = -10    # < this = "Revenue down X% YoY" improvement
YOY_DEALS_DRIVER = 5      # > this deals YoY = "driven by higher volume"
YOY_TRAILING = -10         # < this vs team avg = "trailing"

# Template brief thresholds
AVG_DEAL_ABOVE_FACTOR = 1.15  # > team avg * this = strength
AVG_DEAL_BELOW_FACTOR = 0.85  # < team avg * this = improvement
REVENUE_BELOW_TEAM_FACTOR = 0.75  # < team avg * this = improvement

# ── Performance Insights (sales_performance) ──────────────────────────────

# Win rate coaching threshold (%)
WIN_RATE_COACHING_THRESHOLD = 35  # Below this → "coaching needed"

# Minimum closed deals before evaluating win rate
MIN_CLOSED_DEALS_FOR_EVAL = 10

# Pipeline coverage assessment
PIPELINE_COVERAGE_HEALTHY = 2  # >= this = healthy
# < 1 = critical; < 2 = warning
