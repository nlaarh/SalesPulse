# SalesInsight — Copilot Instructions

SalesInsight is a sales analytics dashboard for AAA WCNY (Travel & Insurance divisions), pulling data exclusively from Salesforce via SOQL.

## Commands

**Backend**
```bash
cd backend && uvicorn main:app --reload --port 8000
```

**Frontend (dev)**
```bash
cd frontend && npm run dev        # starts Vite dev server on :5173
cd frontend && npm run build      # tsc + vite build → dist/
cd frontend && npm run lint       # eslint
```

**Deploy**: Push to `main` → GitHub Actions builds frontend, copies `frontend/dist/` to `backend/static/`, zips and deploys to Azure App Service `salespulse-nyaaa`.

## Architecture

```
frontend/ (React 19 + Vite)       backend/ (FastAPI + Python 3)
    ↓ axios /api/*                     ↓ SOQL (read-only)
frontend/src/lib/api.ts  ──────►  backend/routers/sales_*.py
                                       ↓
                                   backend/sf_client.py  ──► Salesforce REST API
                                       ↓
                                   backend/cache.py  (L1 memory 1hr + L2 disk 24hr)
                                   ~/.salesinsight/cache/
                                   ~/.salesinsight/salesinsight.db  (SQLite: users, targets, logs)
```

**In production**, FastAPI serves the React SPA from `backend/static/` (the Vite build output). There is no separate frontend server.

**Data flow**: All sales data comes from Salesforce SOQL. SQLite is only for auth (users), advisor targets, and activity logs.

**Agent lists are dynamic** — pulled from Salesforce `User` object at startup via `shared.py`. Travel agents: Profile IN (Travel User, Support User) + title rules. Insurance agents: Profile = Insurance User + exclusion keywords. No hardcoded name lists.

## Key Conventions

### Backend router pattern
Every router follows this structure:
```python
from shared import VALID_LINES, resolve_dates as _resolve_dates, line_filter_opp as _line_filter
import cache

@router.get("/api/sales/something")
def my_endpoint(line: str = "Travel", period: int = 12,
                start_date: Optional[str] = Query(None),
                end_date: Optional[str] = Query(None)):
    if line not in VALID_LINES:
        line = 'Travel'
    sd, ed = _resolve_dates(start_date, end_date, period)
    key = f"my_prefix_{line}_{sd}_{ed}"          # cache key MUST include date range

    def fetch():
        lf = _line_filter(line)
        records = sf_query_all(f"SELECT ... WHERE {lf} ...")
        return {"data": records}

    return cache.cached_query(key, fetch, ttl=3600, disk_ttl=86400)
```

Use `sf_parallel(**queries)` when firing multiple independent SOQL queries — it runs them in a thread pool (max 5 workers).

### SOQL rules
- `CloseDate` and `ConvertedDate` are **Date** fields — no `T00:00:00Z` suffix
- `CreatedDate` is **DateTime** — requires `T00:00:00Z` suffix
- Won stages: `StageName IN ('Closed Won','Invoice')`  — both count as revenue
- Invoice stage exists **only in Travel**; In Process exists **only in Insurance**
- Always add `Amount != null` when using `SUM(Amount)`
- For revenue/won queries always add `CloseDate <= {end_date}`
- Prefer explicit date params over `LAST_N_MONTHS` (use `resolve_dates()`)
- `RecordType.Name` is the division filter: `'Travel'` or `'Insurance'`

### Frontend API calls
All API functions in `frontend/src/lib/api.ts` use the `withDates()` helper:
```ts
const { data } = await api.get('/api/sales/something', {
  params: withDates({ line, period }, startDate, endDate),
})
```
The `api` instance automatically attaches the JWT Bearer token and retries on 502/503/504. On 401 it clears the token and redirects to `/login`.

### Auth & roles
- JWT (24hr), verified via `get_current_user` FastAPI dependency
- Roles: `superadmin`, `admin`, `officer`, `travel_manager`, `travel_director`, `insurance_manager`
- Admin-only endpoints use `require_admin` dependency
- DB seeds default users automatically on first boot (empty users table only)

### Frontend structure
- Pages are lazy-loaded per route (code-split): `frontend/src/pages/`
- All API calls go through `frontend/src/lib/api.ts` — never use `fetch` directly
- Provider hierarchy: `QueryClientProvider > ThemeProvider > AuthProvider > SalesProvider`
- React Query staleTime = 5 min, gcTime = 10 min (frontend cache layer on top of backend cache)

### Opportunity scoring
Deals in `New`, `Qualifying/Research`, and `Quote` stages only. Scored 0-100 across 6 factors: deal value (25%), activity recency (20%), close date urgency (20%), push-back history (15%), stage actionability (10%), forecast category (10%). See `docs/opportunity-scoring.md` for full model. AI write-ups (gpt-4o-mini) are two-phase: scores load first, AI summaries load in background.

## Business Knowledge Reference

`memory/sales-analyst.md` is the authoritative reference for AAA's Salesforce schema, stage definitions, revenue field semantics, and known data quirks. **Read it before writing any SOQL query, metric, or business logic.**

Update it whenever you discover new field behavior, data quality issues, or business rule clarifications.
