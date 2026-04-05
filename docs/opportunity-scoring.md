# Opportunity Scoring — Design Document

**Author:** SalesInsight Team
**Last Updated:** 2026-03-27
**Status:** Active

---

## 1. Business Context

AAA WCNY has two sales divisions: Travel and Insurance. Sales managers need to
know **where to spend their time** to close more revenue. The Top Opportunities
page answers the question: *"Which deals should I focus on today?"*

**Target user:** VP of Sales / Sales Manager
**Decision timeframe:** Daily/weekly prioritization of which deals to work

---

## 2. The Core Principle: Actionability Over Likelihood

> A deal that's 95% likely to close on its own is **not** a top opportunity for
> a manager. A deal that's 50% likely but could tip to 90% with a phone call
> **is** a top opportunity.

The scoring system ranks deals by **how much managerial action can influence
the outcome**, not by how likely they are to close without intervention.

---

## 3. Which Deals Are Included

### Included (stages where action matters)

| Stage | SF Probability | Why Included |
|---|---|---|
| New | 10% | Early-stage — needs qualification push |
| Qualifying/Research | 25% | Actively being worked — manager can guide strategy |
| Quote | 50% | **Highest leverage** — customer is deciding, a call could close it |

### Excluded (stages where the sale is effectively done)

| Stage | SF Probability | Why Excluded |
|---|---|---|
| Booked | 90% | Trip/policy is booked — just awaiting paperwork |
| Invoice | 95% | Payment pending — sale is complete |
| Closed Won | 100% | Done |
| Closed Lost | 0% | Done |

### Query Filter

```sql
WHERE IsClosed = false
  AND StageName NOT IN ('Invoice', 'Booked')
  AND Amount != null
  AND CloseDate <= NEXT_N_MONTHS:12
```

Note: We removed the `CloseDate >= TODAY` filter. Overdue deals (past close
date but still open) are **high priority** — they need immediate attention,
not hiding.

---

## 4. Scoring Model (0-100)

Six factors, weighted by how much they reflect **urgency and actionability**.

### 4.1 Deal Value — 25% (max 25 pts)

**Why heaviest weight:** Manager's time is finite. A $50K deal in Quote stage
deserves more attention than a $500 deal in the same stage.

| Amount | Points | Reasoning |
|---|---|---|
| >= $25,000 | 25 | Large deal — VP-level attention |
| >= $10,000 | 20 | Significant — manager should know |
| >= $5,000 | 15 | Mid-range — worth a check-in |
| >= $2,000 | 8 | Routine — agent should handle |
| < $2,000 | 3 | Small — low priority for manager |

### 4.2 Activity Recency — 20% (max 20 pts)

**Why:** A deal with no recent activity is going cold. The longer it sits
untouched, the more likely it dies. Manager needs to either re-engage the
client or coach the agent.

| Days Since Last Activity | Points | Signal |
|---|---|---|
| 0-3 days | 20 | Hot — actively being worked |
| 4-7 days | 16 | Warm — still engaged |
| 8-14 days | 12 | Cooling — needs a follow-up |
| 15-30 days | 8 | Getting cold — needs intervention |
| 31-60 days | 4 | At risk — may be abandoned |
| 60+ days or no activity | 0 | Likely dead unless revived |

### 4.3 Close Date Urgency — 20% (max 20 pts)

**Why:** Deals closing soon need attention NOW. A deal closing in 90 days can
wait; a deal closing in 5 days either closes this week or it doesn't.

| Days to Close | Points | Signal |
|---|---|---|
| Overdue (< 0) | 20 | Overdue and still open — needs immediate action |
| 0-7 days | 18 | Closing this week |
| 8-14 days | 15 | Closing in 2 weeks |
| 15-30 days | 10 | Closing this month |
| 31-60 days | 5 | Next month |
| 61-90 days | 2 | Distant — monitor only |
| 90+ days | 0 | Far out — not urgent |

### 4.4 Push-Back History — 15% (max 15 pts)

**Why:** When a customer pushes the close date repeatedly, it signals
indecision or problems. The deal isn't dead, but it needs different handling
(e.g., address objections, offer incentives, escalate).

| Push Count | Points | Signal |
|---|---|---|
| 0 | 15 | Clean timeline — on track |
| 1 | 10 | One slip — normal |
| 2 | 12 | Two pushes — warrants a conversation |
| 3 | 14 | Pattern forming — manager should step in |
| 4+ | 15 | Persistent problem — high priority intervention |

**Note:** This is NOT penalizing pushbacks. Pushed deals score HIGHER because
they need more attention. 0 pushes also scores high because it means the deal
is on track and closable.

The scoring curve is U-shaped:
- 0 pushes = reliable, push to close (15 pts)
- 1 push = minor blip (10 pts)
- 2+ pushes = needs intervention, scores higher the more pushes (12-15 pts)

### 4.5 Stage Actionability — 10% (max 10 pts)

**Why:** Not all stages are equal in terms of leverage. Quote stage is where a
manager's call has the highest impact.

| Stage | Points | Reasoning |
|---|---|---|
| Quote (50%) | 10 | Highest leverage — customer is deciding |
| Qualifying/Research (25%) | 6 | Being worked — manager can guide |
| New (10%) | 3 | Too early for heavy manager involvement |

### 4.6 Forecast Category — 10% (max 10 pts)

**Why:** Salesforce forecast categories reflect the agent's own assessment
of the deal. "Best Case" means the agent thinks it's winnable but not sure
— exactly where a manager push helps.

| Category | Points | Reasoning |
|---|---|---|
| BestCase | 10 | Agent thinks it's winnable — push it over the line |
| Forecast | 7 | Agent is confident — make sure it doesn't slip |
| Pipeline | 4 | Generic pipeline — needs qualification |
| Omitted / other | 1 | Not forecasted — may be stale |

---

## 5. Score Interpretation

| Score Range | Label | Manager Action |
|---|---|---|
| 80-100 | **Hot** | Act today. Call the client or the agent. |
| 60-79 | **Warm** | Schedule follow-up this week. Check activity. |
| 40-59 | **Monitor** | Keep on radar. Agent should handle unless stuck. |
| 0-39 | **Low** | Not urgent. Review in weekly pipeline meeting. |

---

## 6. AI Write-ups (OpenAI)

After scoring, the top opportunities are optionally sent to OpenAI
(gpt-4o-mini) for 1-2 sentence executive summaries.

**Loading strategy (two-phase):**
1. Phase 1: Show scored deals immediately (no AI, ~1-2 sec)
2. Phase 2: Background-fetch AI write-ups, upgrade cards when ready (~5-10 sec)

This way the manager sees actionable data instantly while AI insights
load in the background.

**When AI is unavailable**, a template-based fallback generates a summary
from the scoring signals (e.g., "Strong conversion potential — customer
is deciding at Quote stage, deal was active 3 days ago, closing in 12 days").

---

## 7. Data Sources (All from Salesforce)

| Field | SF API Name | Used For |
|---|---|---|
| Deal value | `Amount` | Size scoring + display |
| Stage | `StageName` | Filtering + stage scoring |
| Probability | `Probability` | Display only (NOT used in scoring) |
| Close date | `CloseDate` | Urgency scoring |
| Last activity | `LastActivityDate` | Recency scoring |
| Push count | `PushCount` | Risk scoring |
| Forecast category | `ForecastCategory` | Forecast scoring |
| Owner | `Owner.Name` | Display (which agent) |
| Record type | `RecordType.Name` | Division filter (Travel/Insurance) |

**No SF score fields exist** — AAA WCNY's Salesforce org does not have
Einstein Opportunity Scoring or any custom score fields. Verified 2026-03-27
by querying FieldDefinition for Opportunity.

---

## 8. Caching Strategy

| Layer | TTL | Why |
|---|---|---|
| L1 (memory) | 30 min | Fresh enough for daily decisions |
| L2 (disk) | 1 hour | Avoid SF API hammering |
| AI write-ups | Not cached | Always fresh; only called with `ai=true` |

The SF query result (raw opportunities) is cached. Scoring is computed fresh
each request (it's CPU-cheap). AI write-ups are not cached because they can
vary and we want them fresh.

---

## 9. Implementation Files

| File | Role |
|---|---|
| `backend/routers/sales_opportunities.py` | SOQL query, scoring model, AI write-ups |
| `frontend/src/pages/TopOpportunities.tsx` | UI — scored cards with expand/collapse |
| `frontend/src/lib/api.ts` | `fetchTopOpportunities()` API call |

---

## 10. Decision Log

| Date | Decision | Reasoning |
|---|---|---|
| 2026-03-27 | Exclude Invoice & Booked from Top Opps | 1,596 Invoice deals at 95% prob were flooding the list. These are already-won deals waiting for payment — not actionable. |
| 2026-03-27 | Use `Amount` not `Earned_Commission_Amount__c` | Commission field has lag in recent months. Amount = booking value for Travel, premium for Insurance. Consistent across both divisions. |
| 2026-03-27 | Include overdue deals (CloseDate < TODAY) | Overdue-but-open deals need immediate attention. Hiding them removes the most urgent items from the list. |
| 2026-03-27 | Two-phase loading (scores first, AI second) | AI write-ups take 5-10 sec for 100 deals. Blocking the entire page on AI is bad UX. Scores alone are already actionable. |
| 2026-03-27 | Push count scores U-shaped, not linear penalty | 0 pushes = reliable (high score). 2+ pushes = needs intervention (also high score). 1 push = minor (lower score). Penalizing pushbacks would hide the deals that need the most help. |
| 2026-03-27 | Deal value weighted 25% (heaviest) | Manager's time is the scarcest resource. A $50K Quote deal should always rank above a $500 Quote deal. |
| 2026-03-27 | Probability field used for display only | SF Probability maps directly to Stage (it's not an independent signal). Using it in scoring would just double-count the stage. |
| 2026-03-27 | No SF scoring fields exist | Queried FieldDefinition on 2026-03-27. No Einstein Score, Lead Score, or custom score fields on Opportunity in AAA WCNY's org. |
