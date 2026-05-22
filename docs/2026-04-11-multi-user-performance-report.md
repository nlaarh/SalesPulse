# Multi-User Browser Performance Report

Date: 2026-04-11

## Goal

Simulate multiple users using the application at the same time from a real browser, hit several high-traffic pages, and identify:

- whether the app stays responsive
- whether there are lock/contention symptoms
- which requests are slow or overly chatty
- which data should be cached until explicit user refresh

## Test Setup

I ran the app on isolated local perf ports to avoid interference from a stale local backend listener:

- frontend: `http://127.0.0.1:5174`
- backend: `http://127.0.0.1:8001`

Browser runner:

- [frontend/e2e/multi-user-performance.mjs](/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/frontend/e2e/multi-user-performance.mjs)

Users exercised concurrently:

- `nlaaroubi@nyaaa.com` — Super Admin
- `swas@nyaaa.com` — Officer
- `clawrence@nyaaa.com` — Officer
- `akelly@nyaaa.com` — Travel Manager
- `jnicotra@nyaaa.com` — Travel Director

Pages exercised:

- `/dashboard`
- `/pipeline`
- `/opportunities`

## Browser Results

Successful route-ready timings from the 5-user browser run:

- login page load: min `339ms`, avg `380ms`, p95 `417ms`
- login submit to dashboard-ready: min `1396ms`, avg `1446ms`, p95 `1465ms`
- dashboard-ready: min `907ms`, avg `933ms`, p95 `947ms`
- pipeline-ready: min `894ms`, avg `910ms`, p95 `920ms`
- opportunities-ready: min `911ms`, avg `920ms`, p95 `928ms`

Observed failures/noise:

- the superadmin browser login returned `401` in the concurrent browser run
- several `net::ERR_ABORTED` requests occurred while navigating away from pages
- those aborted requests were mostly for:
  - `/api/targets`
  - `/api/targets/achievement`

Interpretation:

- the app stayed broadly responsive for the successful sessions
- I did not see evidence of SQLite lock errors or request pileups causing 5xx failures
- the superadmin browser login issue is real enough to investigate because it reproduced in the multi-user browser run
- the aborted requests look like route-transition churn rather than backend crashes

## Backend Observations

### 1. Cold dashboard loads create a large request fanout

The dashboard page fans out many requests at once in [frontend/src/pages/AdvisorDashboard.tsx](/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/frontend/src/pages/AdvisorDashboard.tsx:92):

- advisor summary
- leaderboard
- performance insights
- YoY
- funnel
- slipping
- leads volume
- close speed
- targets
- target achievement

With 5 users landing together, the backend had to process the same families of queries repeatedly before all caches were warm.

### 2. Salesforce connection pooling is too small for concurrent dashboard fanout

During the concurrent dashboard loads, the backend logged:

- `Connection pool is full, discarding connection: aaawcny.my.salesforce.com. Connection pool size: 20`

That points at [backend/sf_client.py](/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend/sf_client.py:13), where the shared `requests` session uses:

- `pool_connections=10`
- `pool_maxsize=20`

For a page that triggers many concurrent Salesforce-backed endpoints across multiple users, `20` is too tight.

### 3. Opportunities page doubles backend load by fetching twice

[frontend/src/pages/TopOpportunities.tsx](/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/frontend/src/pages/TopOpportunities.tsx:53) does this sequence:

1. fetch `/api/sales/opportunities/top` with `ai=false`
2. then fetch the same endpoint again with `ai=true`

That means each user visit can trigger:

- one Salesforce query for the list
- then another request that can also trigger OpenAI work in [backend/routers/sales_opportunities.py](/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend/routers/sales_opportunities.py:14)

Under concurrent usage, this is expensive and unnecessary for the initial page render.

### 4. Auth validation is chatty during route transitions

[frontend/src/contexts/AuthContext.tsx](/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/frontend/src/contexts/AuthContext.tsx:35) validates `/api/auth/me` on mount. That is fine, but during route transitions I saw aborted `/api/auth/me` requests, which suggests some route/mount churn in the browser flow.

This is not the top performance problem, but it adds noise and unnecessary request volume.

## Caching Review

### What is already cached

Many Salesforce-heavy analytics endpoints already use the two-tier cache in [backend/cache.py](/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend/cache.py).

Examples:

- advisor analytics
- sales performance
- pipeline
- leads
- travel analytics
- top opportunities
- customer profile
- cross-sell
- market pulse
- territory boundaries / census data

### Important gaps

#### `/api/targets` is not cached

[backend/routers/advisor_targets.py](/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend/routers/advisor_targets.py:269) reads the latest target upload and target rows directly from SQLite every time.

That data is effectively static until:

- a new target upload is confirmed
- an admin edits target data

It should be cached and explicitly invalidated on write.

#### `/api/targets/achievement` is cached, but not with a refresh-driven model

[backend/routers/advisor_targets_achievement.py](/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend/routers/advisor_targets_achievement.py:141) caches YTD actuals for `900s` in memory and `21600s` on disk.

That is time-based freshness, not refresh-based stability.

If the product expectation is:

- targets data stays stable until an admin refreshes or uploads new data
- geodata/census stays stable until a user/admin refreshes it

then these endpoints should move to versioned/manual invalidation rather than hourly refresh behavior.

#### Territory/census data is cached for 24h, not until refresh

[backend/routers/territory_map.py](/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend/routers/territory_map.py) uses one-day TTLs for:

- boundaries
- census-derived data
- map-data views

That is better than no cache, but it still expires automatically. For geodata, centroids, ZIP/county census values, and other slow-changing datasets, a better model is:

- cache indefinitely
- invalidate only when the user/admin explicitly refreshes geodata

## Main Findings

### Stable

- no backend 5xx cascade under the tested 5-user browser load
- no observed SQLite lock errors
- once route-ready, dashboard/pipeline/opportunities rendered in roughly `0.9s` each for successful sessions

### Problems

- superadmin browser login returned `401` in the concurrent browser run
- dashboard cold load creates a large duplicate fanout across users
- Salesforce HTTP pool is undersized for concurrent dashboard usage
- opportunities page does duplicate list fetches and can invoke expensive AI follow-up work
- targets and target-achievement requests are repeatedly issued and then aborted during navigation
- static-ish data is not consistently cached using a manual refresh model

## Recommended Fixes

### Priority 1

- Cache `/api/targets` until target data changes.
- Invalidate that cache only on:
  - `/api/admin/targets/confirm`
  - monthly target save/reseed endpoints
- Convert geodata/census caches from TTL-based to version-based invalidation tied to geo refresh.
- Increase Salesforce `pool_maxsize` in [backend/sf_client.py](/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend/sf_client.py:13) from `20` to at least `50`, and likely increase `pool_connections` too.

### Priority 2

- Reduce dashboard request fanout.
- Add a composite dashboard endpoint for the summary screen so five users do not cause five copies of 8-10 endpoints to wake up independently.
- Alternatively, use React Query prefetch + shared cache keys more aggressively so route transitions do not immediately re-issue the same calls.

### Priority 3

- Change opportunities page loading strategy in [frontend/src/pages/TopOpportunities.tsx](/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/frontend/src/pages/TopOpportunities.tsx:53):
  - do one fast non-AI fetch for initial render
  - only generate AI writeups on demand, per selected opportunity, or behind a user action
  - avoid the current automatic second pass over the same dataset

### Priority 4

- Add client-side cancellation and dedupe for route-transition requests.
- Aborted `/api/targets` and `/api/targets/achievement` calls are a sign the UI is starting work that the user no longer needs.
- React Query can help by:
  - using stable query keys
  - setting `staleTime` for static datasets
  - avoiding immediate refetch on every mount when the data is already fresh

### Priority 5

- Investigate the superadmin browser login path specifically.
- The backend auth path itself is not obviously broken, but the browser run reproduced `401` for `nlaaroubi@nyaaa.com`.
- This should be checked with:
  - request payload capture
  - login-page state trace
  - a direct browser automation repro focused only on that account

## Recommended Cache Policy Changes

Suggested product-oriented cache policy:

- geodata, census, boundaries, ZIP centroids:
  - cache until explicit geo refresh
- targets, monthly targets, target achievement base datasets:
  - cache until target upload/save/reseed
- advisor dashboards, pipeline, leads, opportunities:
  - keep time-based caching, but use longer warm-cache windows and request collapse
- AI narratives and AI writeups:
  - cache generated outputs by input hash, but only generate lazily

## Next Implementation Steps

1. Add explicit cache invalidation keys for:
   - targets
   - monthly targets
   - target achievement
   - geodata/census
2. Raise Salesforce HTTP pool size and monitor whether the pool-full warnings disappear.
3. Replace the opportunities dual-fetch flow with one initial fetch plus on-demand AI.
4. Consider a single aggregated dashboard endpoint for the overview page.
5. Add a dedicated Playwright repro for the superadmin login failure.
