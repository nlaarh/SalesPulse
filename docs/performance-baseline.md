# Performance Baseline — 2026-04-13

Real cold-cache timing from local backend with Phase 1 + Phase 2 merged, cache flushed, and log cleared before each endpoint.

## Per-endpoint cold-cache response time

| Endpoint | Cold ms | Status | Target <15s |
|---|---|---|---|
| /api/sales/performance/monthly | 2,294 | ✅ | Already |
| /api/sales/advisors/leaderboard | 1,533 | ✅ | Already |
| /api/sales/advisors/yoy | 2 (cache hit) | ✅ | Already |
| /api/sales/performance/funnel | 1,022 | ✅ | Already |
| /api/sales/leads/agent-close-speed | 3,163 | ✅ | Already |
| /api/cross-sell/insights | 18,914 | 🟡 | Over by 4s |
| /api/territory/map-data | 44,581 | 🔴 | Over by 30s |
| /api/market-pulse | 44,922 | 🔴 | Over by 30s |
| /api/customers/top-revenue | 1,543 | ✅ | Already |
| /api/targets/achievement | 2,088 | ✅ | Already |

## Slowest individual SOQL queries

| p95 ms | Rows | Endpoint | Query pattern |
|---|---|---|---|
| 44,522 | 1 | territory_map | `SELECT COUNT(Id) FROM Account WHERE {member filters}` |
| 39,786 | 2,000 | territory_map | `SELECT zip, region, COUNT(Id) FROM Account GROUP BY zip, region WHERE {member filters}` |
| 24,798 | 1 | market_pulse | `SELECT COUNT(Id) FROM Account WHERE IsPersonAccount AND expiry BETWEEN X AND Y` |
| 17,792 | 44,622 | cross_sell | `SELECT AccountId FROM Opportunity WHERE Insurance AND Won` (44K rows) |
| 11,923 | 1 | territory_map | `SELECT COUNT(Id) FROM Account WHERE Insuance_Customer_ID != null` |
| 11,854 | 2,000 | territory_map | `SELECT zip, COUNT(Id) FROM Account WHERE Id IN (Opp subquery)` |

## Analysis

**Why Azure was showing 120s p95 on 10 endpoints:**
- The Azure numbers were inflated by the cache stampede bug + deploy-flush bug (Phase 1 fixed these).
- In reality, most endpoints are already fast enough on cold cache.
- Only 3 endpoints have genuinely slow SOQL: territory_map, market_pulse, cross_sell.

**Root cause of the 3 slow endpoints:**
All three scan the Account table (~1M rows) with WHERE clauses on non-indexed custom fields
(`Member_Status__c`, `ImportantActiveMemExpiryDate__c`, `Insuance_Customer_ID__c`).
Salesforce cannot use indexes on these queries → full table scan, 45s.

**Why SOQL optimization alone can't fix these:**
- No available index on the custom fields in our WHERE clauses
- Requesting SF admin to add indexes is a separate process
- `LIMIT + subquery` tricks don't help when the WHERE has to filter all rows

## Decision: Ship Phase 1 + Phase 2, defer Phase 3 to own project

**Phase 1 (deployed)** already solves the user-visible symptom via nightly warming —
users never see cold cache on these 3 endpoints.

**Phase 3 pre-compute** (territory_map, market_pulse, cross_sell → nightly SQLite snapshots)
is a separate focused effort worth 1-2 days of dedicated work. Not blocking users today.

**What we're shipping now:**
1. Phase 1 caching reliability (36 commits, merged to main)
2. Phase 2 SOQL instrumentation (4 commits, will merge next)
3. Documentation of slow-query baselines

**What's deferred:**
- Phase 3 SOQL rewrites (most endpoints already fast enough)
- Phase 3 nightly pre-compute for territory_map, market_pulse, cross_sell
- Phase 4 SF quota guardrails (4.6% usage, low urgency)

