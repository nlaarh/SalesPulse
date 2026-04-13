# SalesPulse Caching Reliability & Query Performance

**Date:** 2026-04-13
**Status:** Design approved — ready for implementation planning

---

## Background

Production issues observed:

- **Deploy wipes cache.** Every code change flushes the entire cache via `main.py` file-hash logic, causing 30-120s cold-cache delays for the first users after each deploy.
- **3 AM job deletes but never refills.** The "cache warmer" is misnamed — it only flushes, leaving morning users hitting cold cache on every endpoint.
- **Silent null responses.** When a fetch fails or exceeds the 45s stampede timeout, waiting users get `null` with HTTP 200 — frontend shows "data not found" instead of retrying.
- **90s+ p95 on 10 endpoints.** Leaderboard, monthly report, territory map, market pulse, top-revenue, funnel, yoy, targets achievement, agent-close-speed, cross-sell — all take 60-120s on cold cache.
- **No visibility.** No dashboard showing SF API usage, cache hit rate, warm-job success, or per-query latency.
- **No quota isolation.** SalesPulse shares AAA's 3.4M daily SF API quota with FSL, sales tools, and other integrations — a runaway bug could starve other systems.

## Goals

1. **Users never see "data not found" false errors.**
2. **Deploys preserve cache** unless query shape intentionally changed.
3. **Every user-facing query p95 < 15 seconds**, cold or warm.
4. **Overnight warm job is visible, sequential, and resilient.**
5. **Salesforce is protected** from retry storms, rate-limit cascades, and quota theft.

## Non-goals

- Rewriting the data layer or moving off SQLite (not needed at current scale).
- Redis or external cache (JSON-on-disk is sufficient for single-app deployment).
- Per-user cache isolation (shared cache is correct — data is org-wide).

---

## Architecture overview

Four-phase incremental plan. Each phase is independent — can be shipped on its own.

```
Phase 1 (Safety)     →   Phase 2 (Measurement)   →   Phase 3 (Optimization)   →   Phase 4 (Guardrails)
─────────────────         ─────────────────────         ────────────────────         ──────────────────
Cache behavior           Query profiling                SOQL optimization            SF quota protection
Observability            Slow-query dashboard           Per-endpoint <15s            Usage tracking
Failure handling         Data-driven priorities         Pre-compute where needed     Alerts + isolation
```

---

## Phase 1 — Caching safety (20 tasks)

### Design principle
Current caching assumes the happy path. We redesign around failure modes: stale shape, failed fetcher, silent null, duplicate warmers, cold starts, runaway retries, OOM.

### Components

#### 1A. `backend/cache.py` — core cache module (rewrite)

New behaviors:
- `CACHE_VERSION = 'v1'` constant — flushes happen only when explicitly bumped.
- Per-entry schema fingerprint (MD5 of JSON keys) — on read, mismatched fingerprints auto-invalidate.
- Circuit breaker — per-key failure counter. 3 failures in 60s → serve stale (if exists) for 60s, log ERROR.
- Decoupled timeouts: `USER_WAIT_TIMEOUT = 25s`, `FETCHER_TIMEOUT = 240s`.
- Waiters retry inline once if cache still empty after USER_WAIT_TIMEOUT.
- `cached_at` timestamp on every entry + HTTP response header `X-Cache-Cached-At`.
- L1 memory cap (500 MB) with LRU spillover to L2 disk.
- Atomic L2 writes (temp file + rename) — already present, verified by new test.

#### 1B. `backend/main.py` — startup lifespan

- Remove file-hash auto-flush logic (lines 46-62).
- Replace with `CACHE_VERSION` comparison. Flush only if version bumped.
- Add post-deploy warmer: background thread inspects L2, fetches any missing heavy-endpoint entries through the stampede system (so in-flight user requests benefit).
- Guard with `os.getenv('ENABLE_CACHE_V2')` feature flag — false = old behavior, true = new.

#### 1C. 3 AM nightly job (rewrite `cache_warmer`)

- Acquire file lock at `/home/.salesinsight/.warmer.lock` — only worker 0 runs.
- Sequential loop over heavy endpoints with 2s sleep between each.
- Per-query timeout 60s (if query exceeds, skip with log).
- Persist run summary (start, end, successes, failures, per-query durations) to SQLite `cache_warm_run` table.
- Runs even if a query fails mid-way — records partial success.

#### 1D. `/api/admin/cache/warm-status` (new endpoint)

Returns:
- Last N warm runs with start/end/duration/success-count/failure-count
- Per-endpoint success/failure trend over last 7 days
- Current L2 cache: total entries, total size, oldest entry, newest entry
- L1 hit rate from last hour
- "% requests served warm" metric over 24h

Plus admin UI tab under Settings → "Cache Status" (or standalone `/admin/cache`).

#### 1E. Frontend resilience (`frontend/src/lib/api.ts`)

- On HTTP 503, retry once with 1s delay.
- If response body is `null` or `{"detail":"..."}` and expected shape, trigger one retry.
- Show "Loading takes longer than usual…" message after 10s instead of plain spinner.
- Expose `cached_at` timestamp from response headers; optionally display in a debug tooltip.

#### 1F. Tests

- `test_cache_preserves_across_deploy.py` — mount fake `/home/.salesinsight/cache/`, write entries, run startup lifespan, assert entries still exist.
- `test_cache_version_bump_invalidates.py` — bump `CACHE_VERSION`, assert selective flush.
- `test_stampede_returns_fresh_on_fetcher_fail.py` — make fetcher raise, assert waiter retries, assert no null return.
- `test_schema_fingerprint_invalidates.py` — write entry with old shape, read with new expected shape, assert refetch.
- `test_concurrent_l2_writes_no_corruption.py` — 10 threads writing same key, assert final state is one of the writers' values (no partial).
- `test_worker_0_only.py` — spawn 4 processes, all call warmer, assert only one acquires lock.

### Rollback

Feature flag `ENABLE_CACHE_V2=false` restores old behavior. File `backend/cache_v1.py.bak` preserved for full restore.

### Plain-English summary

| Change | User impact |
|---|---|
| Cache survives deploys | "Data disappears after deploy" bug eliminated |
| Schema fingerprint | Query changes auto-refetch only affected items |
| Circuit breaker | SF failures don't cascade into retry storms |
| Split user-wait vs fetcher | Users see friendly message at 10s, not blank 90s |
| Waiters retry | No more "data not found" false errors |
| Worker-0 lock | 4 backend copies won't duplicate nightly work |
| Sequential warmer | Morning cache always hot, SF not hammered |
| Warm-status dashboard | See if overnight job worked |
| Auto-warm on deploy | Cold cache after restart → warm in background |
| Frontend retry | Brief network blips don't show error states |

---

## Phase 2 — Measurement & profiling (5 tasks)

### Purpose
Before optimizing queries, gather real data on which are slow and why.

### Components

#### 2A. SOQL instrumentation (`backend/sf_client.py`)
Wrap `sf_parallel` and `sf_query_all`. Log to SQLite `sf_query_log`:
- endpoint, query (first 200 chars), duration_ms, row_count, bytes, error, cached (bool), timestamp

#### 2B. `/api/admin/slow-queries` endpoint
Admin page showing:
- Top 30 slowest endpoints (p50/p95/max over 24h)
- Per-endpoint: SOQL, avg rows, cache hit rate, error rate
- Drill-in: click an endpoint to see its 3 parallel queries individually

#### 2C. SF quota tracking
- Call `GET /services/data/v59.0/limits` every 5 min.
- Record to SQLite `sf_quota_log`.
- Expose on admin dashboard.

#### 2D. Before/after table (deliverable)
One-page summary:
| Endpoint | p95 now | Bottleneck | Proposed fix | Expected p95 |
|---|---|---|---|---|

### Rollback

Instrumentation is additive — flip off the decorator if overhead matters.

---

## Phase 3 — Query optimization (per-endpoint, target <15s)

### Approach
For each slow endpoint (priority order from Phase 2 data):

1. Read current SOQL + response shape.
2. Apply one or more patterns below.
3. Measure before/after locally against real SF.
4. Show diff + numbers, get user approval.
5. Commit but don't deploy.

### Optimization patterns

| Pattern | When | Expected gain |
|---|---|---|
| Narrow date range | Query scans >1 year unnecessarily | 3-10x |
| Use indexed fields | `WHERE FormulaField__c = X` | 5-20x |
| Two-step query | `WHERE Id IN (SELECT...)` subquery | 5-10x |
| Python aggregation | GROUP BY hits SOQL limits | 2-5x |
| Pre-compute nightly to SQLite | Heavy aggregation, data rarely changes | 100-1000x (SF → local) |
| Parallel split | One 60s query | 3-10x |
| Longer TTL | Data doesn't change hourly | Infinite (no SF call) |

### Rule
**If an endpoint can't hit <15s cold after optimization, it moves to nightly pre-compute.** Users read from SQLite. Warm at 3 AM. Zero live SF cost.

### Candidate endpoints (from Phase 2 data)

Expected priority order (to be confirmed by Phase 2):
1. `/api/sales/advisors/leaderboard` (p95 ~120s)
2. `/api/sales/leads/agent-close-speed` (p95 ~123s)
3. `/api/cross-sell/insights` (p95 ~118s)
4. `/api/customers/top-revenue` (p95 ~97s)
5. `/api/sales/performance/monthly` (p95 ~79s)
6. `/api/sales/advisors/yoy` (p95 ~85s)
7. `/api/sales/performance/funnel` (p95 ~85s)
8. `/api/targets/achievement` (p95 ~81s)
9. `/api/territory/map-data` (p95 ~64s)
10. `/api/market-pulse` (p95 ~46s)

---

## Phase 4 — SF quota protection (6 tasks)

### Components

#### 4A. SF usage dashboard
- Show current daily quota (used / total / %) on admin page
- Historical chart of daily consumption
- Alert threshold: 50% used → yellow banner, 80% → red banner

#### 4B. App-level circuit breaker on quota
- If daily quota > 80% consumed, refuse non-critical endpoints (return 503 with Retry-After).
- "Critical" = login, health, dashboard homepage. Everything else blocked.

#### 4C. Dedicated SF user + API rate limit
- SF admin task (not code): create `salespulse@aaa...` SF user.
- Assign a Permission Set with read-only scoped objects.
- Set per-user API limit (e.g., 200,000 calls/day — plenty for our 10 users).
- Update `.env` on Azure to use new user.

#### 4D. Alerting
- Webhook to Issues page + email on:
  - Warm-job failure
  - SF quota > 80%
  - Circuit breaker tripped
  - p95 > 15s for any endpoint (sustained)

---

## Data shapes

### `cache_warm_run` (new SQLite table)
```sql
CREATE TABLE cache_warm_run (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP,
    trigger TEXT NOT NULL,  -- 'nightly' | 'deploy' | 'manual'
    status TEXT NOT NULL,   -- 'running' | 'success' | 'partial' | 'failed'
    endpoints_total INTEGER,
    endpoints_success INTEGER,
    endpoints_failed INTEGER,
    duration_ms INTEGER,
    log TEXT                -- JSON array of {endpoint, duration_ms, ok, error}
);
```

### `sf_query_log` (new SQLite table)
```sql
CREATE TABLE sf_query_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TIMESTAMP NOT NULL,
    endpoint TEXT NOT NULL,
    query_preview TEXT,     -- first 200 chars
    duration_ms INTEGER,
    row_count INTEGER,
    bytes INTEGER,
    error TEXT,
    from_cache BOOLEAN
);
-- Index for fast admin queries
CREATE INDEX idx_sf_query_log_endpoint_time ON sf_query_log(endpoint, created_at DESC);
```

### `sf_quota_log` (new SQLite table)
```sql
CREATE TABLE sf_quota_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at TIMESTAMP NOT NULL,
    used INTEGER,
    remaining INTEGER,
    max INTEGER
);
```

### Cache entry (updated JSON shape)
```json
{
  "data": { ... },
  "expires": 1776000000.0,
  "cached_at": 1775996400.0,
  "fingerprint": "abc123",
  "version": "v1"
}
```

---

## Parallel teams

Phase 1 is large (20 tasks) but decomposes into independent tracks that can run in parallel:

| Team | Scope | Files touched | Dependencies |
|---|---|---|---|
| **Team A — Core Cache** | 1A (cache.py rewrite) + tests | `backend/cache.py`, `backend/tests/test_cache*.py` | None — starts first |
| **Team B — Startup & Warmer** | 1B startup lifespan + 1C nightly job | `backend/main.py`, `backend/warmer.py` (new) | Team A interface stable |
| **Team C — Admin API + DB** | 1D warm-status endpoint + SQLite tables | `backend/models.py`, `backend/routers/cache_admin.py` (new) | None — runs in parallel |
| **Team D — Admin UI** | 1D frontend dashboard tab | `frontend/src/pages/settings/CacheStatusTab.tsx` (new) | Team C endpoint shape |
| **Team E — Frontend Resilience** | 1E api.ts retry + messages | `frontend/src/lib/api.ts`, loading components | None — runs in parallel |
| **Team F — Integration Tests** | 1F end-to-end tests | `backend/tests/` | Teams A, B, C complete |

Team dispatch strategy: A, C, E start simultaneously. B starts when A's cache.py interface is stable (~day 1). D starts when C's endpoint is drafted. F runs last to validate everything together.

---

## Rollout plan

### Gate 1: Phase 1 local
- All tests green locally
- Manual smoke test: flush cache, run warmer, verify all 10 endpoints populate
- User review of each team's diff

### Gate 2: Phase 1 Azure (feature flag OFF)
- Deploy with `ENABLE_CACHE_V2=false`
- Verify no regressions in normal traffic
- Verify cache persists across this deploy

### Gate 3: Phase 1 Azure (feature flag ON)
- Flip `ENABLE_CACHE_V2=true` via Azure App Settings (no redeploy)
- Monitor warm-status dashboard for 24 hours
- Monitor SF quota usage for spike
- Run 3 AM warm job manually to verify

### Gate 4: Phase 2 deploy
- Instrumentation live → gather 24-48h of real data
- Present slow-query table to user

### Gate 5: Phase 3 per-endpoint
- User approves each SOQL change before merge
- Verify row count matches before/after

### Gate 6: Phase 4 deploy
- SF admin creates dedicated user (coordinated)
- Swap credentials on Azure
- Dashboard live

---

## Success criteria

| Metric | Baseline | Target |
|---|---|---|
| Deploy flushes cache | Every deploy | Only on `CACHE_VERSION` bump |
| Morning p95 (first user) | 60-120s | <2s (warm) |
| "Data not found" errors | Happens daily | Zero in any 7-day window |
| Cold p95 (any endpoint) | Up to 123s | <15s |
| 3 AM warm-job visibility | None | Dashboard shows every run |
| SF daily quota used | 4.6% (today) | <10% even with 10+ users |
| Time to recover from bad deploy | Manual re-seed + re-warm, ~15 min | Automatic, <3 min |

---

## Risks and mitigations (covered in detail in chat log)

1. Stale query shape → Schema fingerprint auto-invalidates
2. Retry storms → Circuit breaker stops cascades
3. Warm-job silent failure → Dashboard + alerts
4. Worker duplication → File lock
5. User hangs 90s → Decoupled user-wait timeout
6. Can't roll back → Feature flag + docs
7. Cross-worker inconsistency → L1→L2 fallback verified by test
8. File corruption → Atomic writes (verified)
9. SF rate limit during warm → 2s sleep between queries
10. One bad query hangs warmer → Per-query 60s timeout
11. OOM on 1.75GB Azure tier → L1 size cap + LRU
12. No recovery runbook → Rollback procedure documented
13. Can't prove fix works → "% warm served" metric
14. SF quota starvation → Dedicated user + app-level circuit breaker

---

## Out of scope

- Moving off SQLite (not needed at current scale)
- Redis or external cache
- SOQL query cost budgeting per user
- Real-time data freshness (accepting 1-hour staleness for now)
- Multi-region deploy

---

## Appendix: current-state evidence

### Production p95 from `/api/admin/performance/summary` (last 24h, 2026-04-13)

| Endpoint | p50 | p95 | Max |
|---|---|---|---|
| `/api/sales/leads/agent-close-speed` | 126ms | 122,783ms | 52,582ms |
| `/api/sales/advisors/leaderboard` | 1,624ms | 120,471ms | 41,158ms |
| `/api/cross-sell/insights` | 40ms | 118,396ms | 43,874ms |
| `/api/customers/top-revenue` | 801ms | 97,123ms | 24,697ms |
| `/api/sales/advisors/yoy` | 28ms | 85,368ms | 17,546ms |
| `/api/sales/performance/funnel` | 126ms | 85,228ms | 17,671ms |
| `/api/targets/achievement` | 217ms | 81,499ms | 16,100ms |
| `/api/sales/performance/monthly` | 65ms | 78,935ms | 15,527ms |
| `/api/territory/map-data` | 337ms | 64,173ms | 19,366ms |
| `/api/market-pulse` | 44,603ms | 46,146ms | 44,603ms |

### Salesforce quota

- Total daily: 3,397,400 calls
- Used today: 157,420 (4.6%)
- Headroom: large — 1,500+ heavy users would be needed to hit 50%
