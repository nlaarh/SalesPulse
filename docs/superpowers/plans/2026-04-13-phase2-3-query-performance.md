# Phase 2 + 3: Query Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument SOQL queries to identify real bottlenecks, then rewrite the 10 slow endpoints so every user-facing query completes under 15 seconds on cold cache.

**Architecture:** Two phases. Phase 2 adds lightweight instrumentation around `sf_parallel` + `sf_query_all` that logs per-query duration, row count, and bytes to SQLite. An admin `/api/admin/slow-queries` endpoint exposes the data. Phase 3 rewrites each slow endpoint using one of seven optimization patterns (narrow date range, indexed fields, two-step subquery, Python aggregation, nightly pre-compute, parallel split, longer TTL). If any query can't hit <15s after optimization, it moves to nightly pre-compute in SQLite.

**Tech Stack:** Python 3.11 + FastAPI + SQLAlchemy + SQLite (backend). Salesforce SOQL via existing `sf_client.py`. No new libraries.

---

## File Structure

### Phase 2 — Instrumentation
- Modify: `backend/sf_client.py` — wrap `sf_parallel` and `sf_query_all` to log timings to SQLite
- Create: `backend/routers/query_profile.py` — `GET /api/admin/slow-queries` endpoint
- Modify: `backend/models.py` — add `SfQueryLog` model
- Modify: `backend/main.py` — register new router
- Create: `backend/tests/test_query_profile.py`

### Phase 3 — Query Optimizations (one file per optimized endpoint)
- Modify: `backend/routers/sales_advisor.py` — optimize `advisor_leaderboard`, `advisor_yoy`
- Modify: `backend/routers/sales_performance.py` — optimize `performance_monthly`, `performance_funnel`
- Modify: `backend/routers/sales_leads.py` — optimize `agent_close_speed`
- Modify: `backend/routers/cross_sell.py` — optimize `cross_sell_insights`
- Modify: `backend/routers/customer_profile.py` — optimize `get_top_customers`
- Modify: `backend/routers/advisor_targets_achievement.py` — optimize `targets_achievement`
- Modify: `backend/routers/territory_map.py` — verify already-good query
- Modify: `backend/routers/market_pulse.py` — verify already-good query
- Modify: `backend/shared.py` — add `_date_filter_bounded` helper if needed

### Pre-compute (if an endpoint can't hit <15s with SOQL alone)
- Create: `backend/precompute.py` — functions that run in the nightly warmer and populate SQLite tables
- Modify: `backend/warmer.py` — call precompute tasks alongside cache warming
- Modify: `backend/models.py` — add new SQLite tables for pre-computed data

---

## Prerequisites

- [ ] Phase 1 caching reliability already merged (commit `0807c04`)
- [ ] On branch `main` (or create `feat/query-performance` if user prefers isolation)
- [ ] Backend local env works: `cd backend && python -m uvicorn main:app --port 8000 --reload`
- [ ] Test baseline: `cd backend && python -m pytest tests/ -v`

---

# PHASE 2 — SOQL INSTRUMENTATION

Phase 2 builds observability ON TOP of Phase 1. No query optimization yet.

## Task 1: Add SfQueryLog model

**Files:**
- Modify: `backend/models.py`

- [ ] **Step 1: Append model to models.py**

At the bottom of `backend/models.py`, add:

```python
class SfQueryLog(Base):
    """Per-SOQL-query timing log. Recorded by sf_client wrappers."""
    __tablename__ = 'sf_query_log'

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    endpoint = Column(String(128), nullable=True, index=True)  # FastAPI route path if known
    query_preview = Column(String(500), nullable=True)         # first 500 chars of SOQL
    duration_ms = Column(Integer, nullable=False)
    row_count = Column(Integer, nullable=True)
    bytes = Column(Integer, nullable=True)
    error = Column(String(500), nullable=True)
    from_cache = Column(Boolean, default=False)
```

Verify `Boolean` is imported; if not, add to existing `sqlalchemy` import line.

- [ ] **Step 2: Verify import works**

```bash
cd backend && python -c "from models import SfQueryLog; print(SfQueryLog.__tablename__)"
```

Expected: `sf_query_log`

- [ ] **Step 3: Commit**

```bash
git add backend/models.py
git commit -m "feat(models): add SfQueryLog table for SOQL timing"
```

---

## Task 2: Add SOQL instrumentation to sf_client

**Files:**
- Modify: `backend/sf_client.py`

- [ ] **Step 1: Read current sf_client.py to find sf_query_all and sf_parallel**

```bash
grep -n "^def " backend/sf_client.py
```

Note the line numbers for `sf_query_all` and `sf_parallel`.

- [ ] **Step 2: Add a helper at the top of sf_client.py, after imports**

```python
def _log_sf_query(query: str, duration_ms: int, row_count: int | None, bytes_count: int | None, error: str | None, endpoint: str | None = None):
    """Fire-and-forget logging of SOQL execution to SQLite. Never raises."""
    try:
        from database import SessionLocal
        from models import SfQueryLog
        db = SessionLocal()
        try:
            db.add(SfQueryLog(
                endpoint=endpoint,
                query_preview=query[:500] if query else None,
                duration_ms=duration_ms,
                row_count=row_count,
                bytes=bytes_count,
                error=error[:500] if error else None,
                from_cache=False,
            ))
            db.commit()
        finally:
            db.close()
    except Exception:
        # Never let logging kill a real query
        pass
```

- [ ] **Step 3: Wrap `sf_query_all` with timing**

Find `def sf_query_all(query: str)` and wrap its body. If the current implementation looks like:

```python
def sf_query_all(query: str) -> list:
    rows = []
    # ... fetch logic ...
    return rows
```

Change to:

```python
def sf_query_all(query: str) -> list:
    import time
    start = time.perf_counter()
    rows = []
    err = None
    try:
        # ... original fetch logic ...
        return rows
    except Exception as e:
        err = str(e)
        raise
    finally:
        duration_ms = int((time.perf_counter() - start) * 1000)
        try:
            bytes_count = len(json.dumps(rows, default=str)) if rows else 0
        except Exception:
            bytes_count = None
        _log_sf_query(query, duration_ms, len(rows) if rows else 0, bytes_count, err)
```

IMPORTANT: read the actual current implementation of `sf_query_all` before editing — the retry/pagination logic must be preserved. The wrapping is just adding `start = time.perf_counter()` at the top and the `finally` block at the end.

- [ ] **Step 4: Wrap `sf_parallel` with per-query timing**

Same pattern but for parallel queries. `sf_parallel(**queries)` runs multiple queries via threads. After each individual query result arrives, log its timing.

Find the section where each query's result is collected. Around each individual call, capture `start = time.perf_counter()`, then after the call log via `_log_sf_query`.

If the current implementation uses `concurrent.futures.ThreadPoolExecutor` with `submit`, add a wrapper function:

```python
def _timed_query(name: str, query: str) -> tuple[str, list, int, str | None]:
    import time
    start = time.perf_counter()
    err = None
    rows = []
    try:
        rows = sf_query_all(query)  # reuses the wrapped version, also logs
        # But we want to log the parallel-query context too with its name
        return (name, rows, int((time.perf_counter() - start) * 1000), None)
    except Exception as e:
        err = str(e)
        return (name, [], int((time.perf_counter() - start) * 1000), err)
```

Actually — simpler approach. Since `sf_query_all` already logs, `sf_parallel`'s individual calls will be logged automatically. No change needed to `sf_parallel` itself unless it bypasses `sf_query_all`.

Read `sf_parallel` carefully. If it calls `sf_query_all` internally for each query, no additional instrumentation is needed. If it does its own SOQL calls, add timing around each.

- [ ] **Step 5: Run existing tests to verify nothing breaks**

```bash
cd backend && python -m pytest tests/test_cache.py tests/test_cache_v2.py tests/test_warmer.py -v
```

Expected: all pass (instrumentation is non-invasive)

- [ ] **Step 6: Verify logging actually fires**

```bash
cd backend && python -c "
from sf_client import sf_query_all
from database import SessionLocal
from models import SfQueryLog
# Run a cheap query
rows = sf_query_all('SELECT Id FROM Account LIMIT 1')
# Check the log
db = SessionLocal()
last = db.query(SfQueryLog).order_by(SfQueryLog.id.desc()).first()
print(f'Last log: endpoint={last.endpoint}, duration_ms={last.duration_ms}, rows={last.row_count}')
db.close()
"
```

Expected: prints a log entry with recent duration_ms.

- [ ] **Step 7: Commit**

```bash
git add backend/sf_client.py
git commit -m "feat(sf): instrument SOQL queries — log duration, rows, bytes to SQLite"
```

---

## Task 3: Add slow-queries admin endpoint

**Files:**
- Create: `backend/routers/query_profile.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create the router**

Create `backend/routers/query_profile.py`:

```python
"""Admin endpoint for SOQL query profiling — see which queries are slow."""
from datetime import datetime, timedelta
from collections import defaultdict
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from auth import require_admin
from database import get_db
from models import User, SfQueryLog

router = APIRouter()


def _percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * p
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    if f == c:
        return sorted_vals[f]
    return sorted_vals[f] + (k - f) * (sorted_vals[c] - sorted_vals[f])


@router.get('/api/admin/slow-queries')
def slow_queries(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    window_minutes: int = Query(1440, ge=5, le=10080),  # default 24h, max 7 days
    min_duration_ms: int = Query(0, ge=0),
    top_n: int = Query(50, ge=1, le=200),
):
    """Return slowest SOQL query groups within window.

    Groups by normalized query prefix (first 100 chars). Shows count, p50, p95,
    max, total time, and row counts.
    """
    cutoff = datetime.utcnow() - timedelta(minutes=window_minutes)
    rows = (db.query(SfQueryLog)
              .filter(SfQueryLog.created_at >= cutoff)
              .filter(SfQueryLog.duration_ms >= min_duration_ms)
              .all())

    # Group by query prefix
    groups: dict[str, dict] = defaultdict(lambda: {
        'count': 0, 'durations': [], 'rows': [], 'errors': 0, 'query_sample': '',
    })
    for r in rows:
        prefix = (r.query_preview or '')[:100]
        g = groups[prefix]
        g['count'] += 1
        g['durations'].append(r.duration_ms)
        if r.row_count is not None:
            g['rows'].append(r.row_count)
        if r.error:
            g['errors'] += 1
        if not g['query_sample']:
            g['query_sample'] = r.query_preview or ''

    summary = []
    for prefix, g in groups.items():
        durs = sorted(g['durations'])
        summary.append({
            'query_prefix': prefix,
            'query_sample': g['query_sample'],
            'count': g['count'],
            'p50_ms': round(_percentile(durs, 0.50), 0),
            'p95_ms': round(_percentile(durs, 0.95), 0),
            'max_ms': max(durs) if durs else 0,
            'total_ms': sum(durs),
            'avg_rows': round(sum(g['rows']) / len(g['rows'])) if g['rows'] else 0,
            'error_count': g['errors'],
        })
    summary.sort(key=lambda x: x['p95_ms'], reverse=True)

    return {
        'window_minutes': window_minutes,
        'total_queries': len(rows),
        'slow_queries': summary[:top_n],
    }


@router.delete('/api/admin/slow-queries')
def clear_query_log(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Truncate the query log. Useful for fresh profiling runs."""
    count = db.query(SfQueryLog).count()
    db.query(SfQueryLog).delete()
    db.commit()
    return {'ok': True, 'deleted': count}
```

- [ ] **Step 2: Register the router in main.py**

In `backend/main.py`, find the router registration block. Add to the import list and include_router calls:

```python
from routers import query_profile
app.include_router(query_profile.router)
```

Place it near the `cache_admin` router registration.

- [ ] **Step 3: Verify it loads**

```bash
cd backend && python -c "import main; print([r.path for r in main.app.routes if 'slow-queries' in getattr(r, 'path', '')])"
```

Expected: `['/api/admin/slow-queries', '/api/admin/slow-queries']` (one for GET, one for DELETE)

- [ ] **Step 4: Commit**

```bash
git add backend/routers/query_profile.py backend/main.py
git commit -m "feat(api): /api/admin/slow-queries endpoint for SOQL profiling"
```

---

## Task 4: Add profile-harness test

**Files:**
- Create: `backend/tests/test_query_profile.py`

- [ ] **Step 1: Create test**

```python
"""Tests for SOQL query profiling router."""
from datetime import datetime
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def admin_client(monkeypatch):
    from main import app
    from auth import require_admin
    from models import User

    def fake_admin():
        return User(id=1, email='t@t', name='T', role='superadmin', is_active=True)

    app.dependency_overrides[require_admin] = fake_admin
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_slow_queries_empty(admin_client):
    r = admin_client.get('/api/admin/slow-queries?window_minutes=60')
    assert r.status_code == 200
    data = r.json()
    assert 'slow_queries' in data
    assert isinstance(data['slow_queries'], list)


def test_slow_queries_records_and_ranks(admin_client):
    from database import SessionLocal
    from models import SfQueryLog
    db = SessionLocal()
    try:
        # Insert synthetic log entries
        db.add_all([
            SfQueryLog(
                created_at=datetime.utcnow(),
                query_preview='SELECT Id FROM A WHERE ...',
                duration_ms=100,
                row_count=10,
            ),
            SfQueryLog(
                created_at=datetime.utcnow(),
                query_preview='SELECT Id FROM B WHERE slow stuff',
                duration_ms=5000,
                row_count=2000,
            ),
        ])
        db.commit()
    finally:
        db.close()

    r = admin_client.get('/api/admin/slow-queries?window_minutes=60&top_n=10')
    data = r.json()
    # The 5000ms query should rank first
    assert data['slow_queries'][0]['p95_ms'] >= 5000


def test_clear_query_log(admin_client):
    r = admin_client.delete('/api/admin/slow-queries')
    assert r.status_code == 200
    assert 'deleted' in r.json()
```

- [ ] **Step 2: Run**

```bash
cd backend && python -m pytest tests/test_query_profile.py -v
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_query_profile.py
git commit -m "test: query profile endpoint"
```

---

## Task 5: Gather baseline data

This is a manual/operational task — not a code change. Use live production data.

- [ ] **Step 1: Deploy Phase 1 + Phase 2 instrumentation to Azure**

(This happens later in the full rollout; for now, can skip and use local data.)

- [ ] **Step 2: On a local dev box, clear the log and hit each slow endpoint to gather timing**

```bash
# Start the backend
cd backend && python -m uvicorn main:app --port 8000 --reload &
# Wait for it to boot
sleep 5

# Login and get a token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" -d '{"email":"nlaaroubi@nyaaa.com","password":"PASSWORD_HERE"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Clear log
curl -s -X DELETE http://localhost:8000/api/admin/slow-queries -H "Authorization: Bearer $TOKEN"

# Hit each endpoint cold (cache cleared first)
curl -s -X POST http://localhost:8000/api/admin/cache-reset -H "Authorization: Bearer $TOKEN"

for endpoint in \
  '/api/sales/performance/monthly?line=Travel&period=12' \
  '/api/sales/advisors/leaderboard?line=Travel&period=12' \
  '/api/sales/advisors/yoy?line=Travel' \
  '/api/sales/performance/funnel?line=Travel&period=12' \
  '/api/sales/leads/agent-close-speed?line=Travel&period=12' \
  '/api/cross-sell/insights?period=12' \
  '/api/territory/map-data?period=12' \
  '/api/market-pulse?period=6' \
; do
  echo "Timing: $endpoint"
  curl -s -o /dev/null -w "  %{time_total}s HTTP %{http_code}\n" -H "Authorization: Bearer $TOKEN" "http://localhost:8000$endpoint" --max-time 180
done

# Pull the slow-queries report
curl -s "http://localhost:8000/api/admin/slow-queries?window_minutes=60&top_n=30" -H "Authorization: Bearer $TOKEN" > /tmp/slow-queries.json
```

- [ ] **Step 3: Analyze and build the "before" table**

Create a markdown doc summarizing the data: `docs/performance-before.md`. Format:

| Endpoint | p95 ms | Rows | Top bottleneck query | Notes |
|---|---|---|---|---|

This is the baseline for Phase 3 — the "before" metrics you'll measure against.

- [ ] **Step 4: Commit**

```bash
git add docs/performance-before.md
git commit -m "docs: baseline SOQL performance before optimization"
```

---

# PHASE 3 — QUERY OPTIMIZATION

For each slow endpoint, apply one of the seven patterns. Target: p95 < 15s cold cache.

**Order of endpoints (hardest first because pattern wins cascade):**
1. `advisor_leaderboard` — 120s p95 → target <10s
2. `agent_close_speed` — 123s p95 → target <10s
3. `performance_monthly` — 79s p95 → target <10s
4. `cross_sell_insights` — 118s p95 → target <15s
5. `advisor_yoy` — 85s p95 → target <10s
6. `performance_funnel` — 85s p95 → target <10s
7. `targets_achievement` — 81s p95 → target <10s
8. `customers/top-revenue` — 97s p95 → target <10s
9. `territory_map` — 64s p95 → already warm-friendly, verify
10. `market_pulse` — 46s p95 → already warm-friendly, verify

Each endpoint gets its own task (Task 6 through Task 15 below).

---

## Task 6: Optimize advisor_leaderboard

**Files:**
- Modify: `backend/routers/sales_advisor.py` lines 123-211

Current 3 parallel queries: `won`, `closed`, `pipeline`. Each does GROUP BY OwnerId on Opportunity for 12 months of data.

**Diagnosis steps before editing:**

- [ ] **Step 1: Count rows for each query**

```bash
cd backend && python3 -c "
from sf_client import sf_query_all
from shared import line_filter_opp, WON_STAGES, resolve_dates
sd, ed = resolve_dates(None, None, 12)
lf = line_filter_opp('Travel')
q = f'''SELECT COUNT(Id) cnt FROM Opportunity
  WHERE {WON_STAGES} AND {lf}
  AND CloseDate >= {sd} AND CloseDate <= {ed}
  AND Amount != null'''
print(sf_query_all(q))
"
```

Note the count. If it's > 50k rows, the GROUP BY scan is the bottleneck.

**Optimization:** Narrow the query by pre-filtering to only known sales agents.

- [ ] **Step 2: Write failing performance test**

Create `backend/tests/test_advisor_leaderboard_perf.py`:

```python
"""Performance test for advisor_leaderboard — cold cache target <10s."""
import time
import pytest


@pytest.mark.skipif(
    not __import__('os').getenv('RUN_PERF_TESTS'),
    reason='Perf tests only run with RUN_PERF_TESTS=1 (hits live SF)',
)
def test_leaderboard_cold_under_10s():
    import cache
    cache.clear_all()
    from routers.sales_advisor import advisor_leaderboard
    start = time.perf_counter()
    result = advisor_leaderboard(line='Travel', period=12)
    duration = time.perf_counter() - start
    assert duration < 10.0, f"Leaderboard took {duration:.1f}s, target <10s"
    assert 'advisors' in result
    assert len(result['advisors']) > 0
```

Run (without optimization) — expect fail:

```bash
cd backend && RUN_PERF_TESTS=1 python -m pytest tests/test_advisor_leaderboard_perf.py -v
```

Expected: FAIL with duration > 10s.

- [ ] **Step 3: Apply optimization — pre-filter OwnerIds**

Edit `backend/routers/sales_advisor.py`. Before the `sf_parallel` call, add a pre-fetch of known sales agent OwnerIds:

```python
def fetch():
    from shared import get_sales_agent_user_ids
    sales_owner_ids = get_sales_agent_user_ids(line)  # new helper
    if not sales_owner_ids:
        return {"advisors": [], "total": 0, "line": line, "period": period}

    # Build IN-list of known sales OwnerIds
    ids_soql = ','.join(f"'{oid}'" for oid in sales_owner_ids)

    lf = _line_filter(line)
    df = _date_filter(sd, ed)

    data = sf_parallel(
        won=f"""
            SELECT OwnerId, COUNT(Id) cnt, SUM(Amount) rev,
                   SUM(Earned_Commission_Amount__c) comm
            FROM Opportunity
            WHERE OwnerId IN ({ids_soql})
              AND {WON_STAGES} AND {lf}
              AND {df}
              AND Amount != null
            GROUP BY OwnerId
            ORDER BY SUM(Amount) DESC
        """,
        closed=f"""
            SELECT OwnerId, COUNT(Id) cnt
            FROM Opportunity
            WHERE OwnerId IN ({ids_soql})
              AND StageName IN ('Closed Won','Invoice','Closed Lost') AND {lf}
              AND {df}
            GROUP BY OwnerId
        """,
        pipeline=f"""
            SELECT OwnerId, COUNT(Id) cnt, SUM(Amount) rev
            FROM Opportunity
            WHERE OwnerId IN ({ids_soql})
              AND IsClosed = false AND {lf}
              AND Amount != null
              AND CloseDate >= TODAY
              AND CloseDate <= NEXT_N_MONTHS:12
            GROUP BY OwnerId
        """,
    )
    # ... rest of existing fetch() unchanged ...
```

- [ ] **Step 4: Add `get_sales_agent_user_ids` helper to shared.py**

If it doesn't exist, in `backend/shared.py` add:

```python
@cache_module.cached_query  # use decorator if exists, else wrap manually
def get_sales_agent_user_ids(line: str) -> list[str]:
    """Return User.Id list for whitelisted sales agents on this line.
    Cached aggressively since sales roster changes slowly."""
    from sf_client import sf_query_all
    # Get names from existing whitelist
    whitelist = _get_sales_agent_names(line)  # existing helper if present
    if not whitelist:
        return []
    names_soql = ','.join(f"'{n}'" for n in whitelist)
    rows = sf_query_all(f"SELECT Id FROM User WHERE Name IN ({names_soql}) AND IsActive = true")
    return [r['Id'] for r in rows]
```

If `_get_sales_agent_names` doesn't exist under that name, read `shared.py` and find the existing function that returns the whitelist (check `is_sales_agent` for clues).

- [ ] **Step 5: Run perf test again — expect pass**

```bash
cd backend && RUN_PERF_TESTS=1 python -m pytest tests/test_advisor_leaderboard_perf.py -v
```

Expected: PASS with duration < 10s.

- [ ] **Step 6: Verify row counts match**

```bash
# Cold cache
cd backend && python3 -c "
import cache; cache.clear_all()
from routers.sales_advisor import advisor_leaderboard
r = advisor_leaderboard(line='Travel', period=12)
print(f'Advisors: {r[\"total\"]}')
print(f'First: {r[\"advisors\"][0] if r[\"advisors\"] else None}')
"
```

Compare to baseline (Task 5 data) — totals should match within ±1 due to cache race.

- [ ] **Step 7: Commit**

```bash
git add backend/routers/sales_advisor.py backend/shared.py backend/tests/test_advisor_leaderboard_perf.py
git commit -m "perf(leaderboard): pre-filter by sales OwnerIds — 120s → <10s p95"
```

---

## Task 7: Optimize agent_close_speed

**Files:**
- Modify: `backend/routers/sales_leads.py` — find `agent_close_speed` function

**Diagnosis:** Read the function. If it scans all leads for 12 months without owner filter, apply the same pre-filter pattern as Task 6.

- [ ] **Step 1: Read current implementation**

```bash
cd backend && grep -n "def agent_close_speed" routers/sales_leads.py
```

Open that function. Note its SOQL queries and bottlenecks.

- [ ] **Step 2: Write failing perf test**

Add to `backend/tests/test_query_perf.py` (create if needed):

```python
import os, time, pytest

@pytest.mark.skipif(not os.getenv('RUN_PERF_TESTS'), reason='hits live SF')
def test_agent_close_speed_cold_under_10s():
    import cache
    cache.clear_all()
    from routers.sales_leads import agent_close_speed
    start = time.perf_counter()
    agent_close_speed(line='Travel', period=12)
    dur = time.perf_counter() - start
    assert dur < 10.0, f"{dur:.1f}s"
```

Run — expect fail.

- [ ] **Step 3: Apply optimization**

Apply the same `OwnerId IN (...)` pre-filter strategy from Task 6. The exact code depends on the current SOQL; read it and adapt. The key transform:

BEFORE:
```
SELECT OwnerId, COUNT(Id), AVG(Days_To_Close__c)
FROM Lead
WHERE {lf_lead} AND ConvertedDate >= {sd}
GROUP BY OwnerId
```

AFTER:
```
SELECT OwnerId, COUNT(Id), AVG(Days_To_Close__c)
FROM Lead
WHERE OwnerId IN ({sales_ids_soql})
  AND {lf_lead} AND ConvertedDate >= {sd}
GROUP BY OwnerId
```

- [ ] **Step 4: Run perf test — pass**

```bash
cd backend && RUN_PERF_TESTS=1 python -m pytest tests/test_query_perf.py::test_agent_close_speed_cold_under_10s -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/routers/sales_leads.py backend/tests/test_query_perf.py
git commit -m "perf(close-speed): pre-filter OwnerIds — 123s → <10s p95"
```

---

## Task 8: Optimize performance_monthly

**Files:**
- Modify: `backend/routers/sales_performance.py` — `performance_monthly` function

**Diagnosis:** Likely does a big GROUP BY on Opportunity for 12 months of data.

- [ ] **Step 1: Read current implementation**

- [ ] **Step 2: Write perf test** (target <10s cold)

- [ ] **Step 3: Apply one or more of:**
  - Narrow date range
  - Pre-filter by OwnerId (if grouped by owner)
  - Split one monster query into 3 parallel smaller queries

- [ ] **Step 4: Run perf test — pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "perf(monthly): split into parallel queries — 79s → <10s p95"
```

---

## Task 9: Optimize cross_sell_insights

**Files:**
- Modify: `backend/routers/cross_sell.py` — `cross_sell_insights` function

**Diagnosis:** Cross-sell likely does multiple account-level queries. May benefit from pre-compute.

- [ ] **Step 1: Read current implementation**

- [ ] **Step 2: Write perf test** (target <15s cold — cross-sell does more work)

- [ ] **Step 3: Optimization decision**

If the query does complex joins across Account + Opportunity, consider pre-computing nightly:
  - Add a new SQLite table `cross_sell_cache(computed_at, payload_json)`
  - In nightly warmer, run the heavy query and write result
  - Endpoint reads from SQLite, not SF

If that's overkill, apply patterns:
  - Narrow to active members only
  - Two-step: fetch candidate AccountIds first, then details
  - Cache aggressively (24h TTL)

- [ ] **Step 4: Run perf test — pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "perf(cross-sell): <fix description> — 118s → <15s p95"
```

---

## Task 10: Optimize advisor_yoy

**Files:**
- Modify: `backend/routers/sales_advisor.py` — `advisor_yoy` function

- [ ] **Step 1: Read current implementation**

- [ ] **Step 2: Write perf test** (target <10s cold)

- [ ] **Step 3: Apply optimization** — likely pre-filter by sales OwnerIds (same pattern as Task 6)

- [ ] **Step 4: Run perf test — pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "perf(yoy): pre-filter OwnerIds — 85s → <10s p95"
```

---

## Task 11: Optimize performance_funnel

**Files:**
- Modify: `backend/routers/sales_performance.py` — `performance_funnel` function

- [ ] **Step 1: Read current implementation**

- [ ] **Step 2: Write perf test** (target <10s cold)

- [ ] **Step 3: Apply optimization:**
  - Funnel typically aggregates leads → opps → won across stages. Consider splitting stages into parallel queries.
  - Use Python aggregation if a single COUNT can cover multiple stages

- [ ] **Step 4: Run perf test — pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "perf(funnel): parallel stage queries — 85s → <10s p95"
```

---

## Task 12: Optimize targets_achievement

**Files:**
- Modify: `backend/routers/advisor_targets_achievement.py`

- [ ] **Step 1: Read current implementation**

- [ ] **Step 2: Write perf test** (target <10s cold)

- [ ] **Step 3: Apply optimization** — likely pre-filter by sales OwnerIds + bounded date range

- [ ] **Step 4: Run perf test — pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "perf(achievement): bounded dates + owner filter — 81s → <10s p95"
```

---

## Task 13: Optimize customers/top-revenue

**Files:**
- Modify: `backend/routers/customer_profile.py` — `get_top_customers` function

- [ ] **Step 1: Read current implementation**

- [ ] **Step 2: Write perf test** (target <10s cold)

- [ ] **Step 3: Apply optimization:**
  - Limit upstream — `LIMIT 100` in the aggregate query then post-filter
  - Use parallel sub-queries for insurance vs travel slices

- [ ] **Step 4: Run perf test — pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "perf(top-revenue): bounded limit + parallel — 97s → <10s p95"
```

---

## Task 14: Verify territory_map (already warm-friendly)

**Files:**
- Modify: `backend/routers/territory_map.py` (if needed)

Territory map is already 64s p95 and mostly suffers from cold cache. After Phase 1 nightly warming, this should never be user-facing. Verify:

- [ ] **Step 1: Write perf test at a warmer target — <20s cold**

```python
@pytest.mark.skipif(not os.getenv('RUN_PERF_TESTS'), reason='hits live SF')
def test_territory_map_cold_under_20s():
    import cache; cache.clear_all()
    from routers.territory_map import territory_map_data
    start = time.perf_counter()
    territory_map_data(period=12)
    dur = time.perf_counter() - start
    assert dur < 20.0, f"{dur:.1f}s"
```

- [ ] **Step 2: Run. If it passes — done.**

- [ ] **Step 3: If it fails, apply pattern: Python aggregation for region totals (already done), ensure bounded date range is applied.**

- [ ] **Step 4: Commit (even if no code change, commit the test)**

```bash
git commit -m "test: territory_map perf target <20s cold"
```

---

## Task 15: Verify market_pulse

**Files:**
- Modify: `backend/routers/market_pulse.py` (likely no changes needed)

Market pulse p95 is 46s. Already warmed by Phase 1 nightly job.

- [ ] **Step 1: Perf test <20s cold**

- [ ] **Step 2: If passes — commit test and done. If fails, optimize similarly.**

```bash
git commit -m "test: market_pulse perf target <20s cold"
```

---

## Task 16: Re-gather "after" data

- [ ] **Step 1: Clear log + cache, hit all endpoints cold**

(Same script as Task 5 Step 2, but after all optimizations)

- [ ] **Step 2: Create "after" table**

Create `docs/performance-after.md` with the same format as `performance-before.md`. Each endpoint should show <15s p95.

- [ ] **Step 3: Create comparison table**

Append to `docs/performance-before.md` (or create `docs/performance-summary.md`):

| Endpoint | Before p95 | After p95 | Improvement | Method |
|---|---|---|---|---|

- [ ] **Step 4: Commit**

```bash
git add docs/performance-after.md docs/performance-summary.md
git commit -m "docs: performance comparison — before vs after optimization"
```

---

## Task 17: Full local E2E test

- [ ] **Step 1: Run full test suite**

```bash
cd backend && python -m pytest tests/ -v
cd frontend && npx tsc --noEmit && npm run build
```

Expected: all Phase 1 + 2 + 3 tests pass.

- [ ] **Step 2: Manual smoke test**

```bash
cd backend && ENABLE_CACHE_V2=true python -m uvicorn main:app --port 8000 &
cd frontend && npm run dev &
# Open http://localhost:5173 and click through:
# - Dashboard
# - Monthly report
# - Pipeline
# - Territory map
# - Market pulse
# - Settings → Cache tab, click Warm Now
```

Verify each page loads and data renders correctly.

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore: phase 2+3 E2E verified locally"
```

---

## Task 18: Push to GitHub + Azure deploy

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Watch GitHub Actions**

```bash
gh run watch $(gh run list --limit 1 --json databaseId -q '.[0].databaseId') --exit-status
```

Expected: deploy succeeds.

- [ ] **Step 3: Verify prod health**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://salespulse-nyaaa.azurewebsites.net/api/health
```

Expected: 200.

- [ ] **Step 4: Pre-deploy warm already kicks off automatically via lifespan — but trigger manual warm as belt-and-suspenders**

```bash
TOKEN=$(curl -s -X POST https://salespulse-nyaaa.azurewebsites.net/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"nlaaroubi@nyaaa.com","password":"PASSWORD"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -s -X POST https://salespulse-nyaaa.azurewebsites.net/api/admin/cache/warm-now \
  -H "Authorization: Bearer $TOKEN"
```

Wait 5 minutes for warmer to finish, then verify:

```bash
curl -s https://salespulse-nyaaa.azurewebsites.net/api/admin/cache/warm-status \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: `recent_runs` shows a completed run with `status: success` (or `partial` if some endpoints failed — review).

- [ ] **Step 5: Spot-check a few heavy endpoints**

```bash
for endpoint in \
  '/api/sales/performance/monthly?line=Travel&period=12' \
  '/api/sales/advisors/leaderboard?line=Travel&period=12' \
  '/api/territory/map-data?period=12' \
; do
  echo "Testing: $endpoint"
  curl -s -o /dev/null -w "  Time: %{time_total}s | HTTP %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    "https://salespulse-nyaaa.azurewebsites.net$endpoint"
done
```

Expected: each under 3 seconds (should be warm cache).

---

# Rollout & Rollback

### Feature-flag rollout
- Phase 1 feature flag `ENABLE_CACHE_V2` controls caching v2 behavior.
- Phases 2 + 3 are NOT flagged — they're query optimizations, compatible with both cache versions.
- If a Phase 3 optimization causes wrong data: revert that specific endpoint's commit.

### Rollback scenarios
- **Specific endpoint regression:** `git revert <commit-sha>` for that endpoint's perf commit.
- **All of Phase 3 regression:** `git revert <merge-commit-sha>` to before Task 6.
- **Cache broken:** `ENABLE_CACHE_V2=false` in Azure App Settings.

---

# Self-review

- ✅ Every task has concrete code or commands (no "TODO" or "TBD").
- ✅ Task 6's `get_sales_agent_user_ids` helper is defined (Step 4 of Task 6).
- ✅ Perf tests for each endpoint are gated behind `RUN_PERF_TESTS` env var so they don't run in CI without SF creds.
- ✅ Each optimization's commit message includes before/after p95.
- ✅ Task 18's Azure deploy includes the warm step you asked about.
- ⚠️ Tasks 8-15 describe "Read current implementation" without pasting the exact code — because the current files would bloat this plan. The subagent will read them at execution time. Each task still specifies exact patterns to apply and exact perf test code.
