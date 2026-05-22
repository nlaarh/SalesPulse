# SalesInsight — Project Rules

## SalesAnalyst Knowledge Base (MANDATORY)

Before implementing any feature, query, metric, or business logic:

1. **Read `memory/sales-analyst.md`** — This is the authoritative reference for AAA's business model, Salesforce schema, stage definitions, revenue fields, SOQL rules, and scoring logic.
2. **Use it to think through requirements** — Cross-reference the request against what you know about the data. Ask: Does this stage exist for this division? Does this field mean what we think? Will this query hit a known gotcha?
3. **Update it when you learn something new** — If a Salesforce query reveals a new pattern, data quality issue, field behavior, or business rule, add it to `sales-analyst.md` immediately. This file grows with the project.

### When to consult SalesAnalyst:
- Writing or modifying any SOQL query
- Building or changing a metric/KPI calculation
- Adding a new endpoint or dashboard section
- Debugging data mismatches
- Answering "why does this number look wrong?"

### When to update SalesAnalyst:
- You discover a new field, stage, or record type behavior
- A SOQL query returns unexpected results that reveal a data pattern
- You find a data quality issue (nulls, mismatches, lag patterns)
- Business logic is clarified by the user
- A fix reveals a rule that should be documented (e.g., "Invoice stage = Travel only")

## Deployment
- **Production**: https://salespulse-nyaaa.azurewebsites.net/
- **CI/CD**: GitHub Actions — push to `main` triggers deploy
- **Repo**: https://github.com/nlaarh/SalesPulse
- **Azure**: App Service `salespulse-nyaaa` in RG `rg-nlaaroubi-sbx-eus2-001` (East US 2)
- **DB seeding**: On fresh deploy (empty users table), `init_db()` seeds all default users automatically. Existing DB is never touched.

## Tech Stack
- **Backend**: FastAPI + Python 3 (port 8000)
- **Frontend**: React 19 + Vite 6 + TypeScript + Tailwind CSS v4 + Recharts 2
- **Data**: Salesforce REST API (SOQL)
- **Cache**: L1 in-memory (1hr) + L2 disk at `~/.salesinsight/cache/` (24hr)

## Code Conventions
- Backend: snake_case, routers in `backend/routers/`, shared utils in `backend/`
- Frontend: camelCase, pages in `frontend/src/pages/`, API in `frontend/src/lib/api.ts`
- All endpoints accept `start_date`/`end_date` optional query params for date range filtering
- Use `_resolve_dates(start_date, end_date, period)` helper pattern in every router
- Use `withDates(params, startDate, endDate)` helper in frontend API calls
- Cache keys must include date range: `f"{prefix}_{line}_{sd}_{ed}"`
- Use `sf_parallel()` for multiple independent SOQL queries
- Use `cached_query(key, fetch_fn, ttl, disk_ttl)` for all SF data

## SOQL Rules (from SalesAnalyst)
- Always use explicit dates, never `LAST_N_MONTHS`
- Always add `CloseDate <= {end_date}` on revenue/won queries
- Always add `Amount != null` when summing
- `CreatedDate` is DateTime (needs `T00:00:00Z`), `ConvertedDate` and `CloseDate` are Date (no T suffix)
- Won stages: `StageName IN ('Closed Won','Invoice')`
- Invoice stage = Travel only, In Process = Insurance only
