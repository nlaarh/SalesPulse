# SalesPulse Codebase Index

## Purpose

This document is a working index of the `SalesPulse` repository as it exists on April 11, 2026. It is intended to answer three questions quickly:

1. Where does the app start?
2. Which files own each feature area?
3. How does data move between the frontend, backend, SQLite, and Salesforce?

## Repository Shape

The repo is a two-app system:

- `backend/`: FastAPI service, SQLite-backed app state, Salesforce integration, caching, auth, and admin endpoints.
- `frontend/`: Vite + React + TypeScript SPA for dashboards, drill-downs, admin tools, and external-data views.

Other notable top-level paths:

- `docs/`: feature notes, plans, and specs.
- `memory/`: local project memory notes.
- `backend/seed_data/`: static census seed files.
- `frontend/e2e/`: Playwright navigation/login/dashboard smoke coverage.

## Runtime Entry Points

### Backend

- `backend/main.py`
  - Loads `.env`.
  - Configures FastAPI lifespan hooks.
  - Creates DB backups on startup.
  - Hashes backend source and flushes disk cache on deploy changes.
  - Starts a 3 AM ET cache-clearing background task.
  - Calls `init_db()`.
  - Registers routers.
  - Serves the built SPA from `backend/static/` when present.

### Frontend

- `frontend/src/main.tsx`
  - Mounts `BrowserRouter` and `App`.
- `frontend/src/App.tsx`
  - Creates the React Query client.
  - Wraps the app in `ThemeProvider`, `AuthProvider`, and `SalesProvider`.
  - Declares all public and protected routes.

## Stack Summary

### Backend stack

- FastAPI
- SQLAlchemy
- SQLite
- Requests / HTTPAdapter connection pooling
- JWT + bcrypt auth
- OpenAI SDK
- OpenPyXL
- Pytest

### Frontend stack

- React 19
- React Router 7
- TanStack Query
- Axios
- Vite 8
- TypeScript 5.9
- Tailwind 4
- Recharts
- Leaflet / React Leaflet
- Playwright

## Backend Index

### Core infrastructure

- `backend/database.py`
  - Creates the SQLite engine and session factory.
  - Enables SQLite WAL/performance pragmas.
  - Seeds users.
  - Runs the monthly-target migration.
  - Starts background geographic seeding.
  - Important operational note: the live DB path is `~/.salesinsight/salesinsight.db`, not the checked-in `backend/salesinsight.db`.

- `backend/models.py`
  - App-owned persistence models:
    - `User`
    - `ActivityLog`
    - `TargetUpload`
    - `AdvisorTarget`
    - `MonthlyAdvisorTarget`
    - `GeoCounty`
    - `GeoMeta`
    - `GeoZip`

- `backend/auth.py`
  - JWT creation/validation.
  - FastAPI auth dependencies.
  - Admin-role guard.

- `backend/cache.py`
  - L1 in-memory cache.
  - L2 disk cache at `~/.salesinsight/cache`.
  - Per-key stampede protection.

- `backend/sf_client.py`
  - Salesforce OAuth password-grant authentication.
  - Connection-pooled HTTP session.
  - Query validation to block DML.
  - SOQL and SOSL helpers.
  - Parallel query fanout with failure propagation.

- `backend/shared.py`
  - Date resolution helpers.
  - Salesforce record-type filters.
  - Shared constants and helper functions.
  - Dynamic travel/insurance sales-agent discovery from Salesforce users.
  - Cached owner map.

### Backend feature routers

#### Sales analytics

- `backend/routers/sales_advisor.py`
  - Advisor summary, leaderboard, YoY, trend.
- `backend/routers/sales_performance.py`
  - Monthly performance, funnel, insights.
- `backend/routers/sales_pipeline.py`
  - Stages, forecast, velocity, slipping.
- `backend/routers/sales_travel.py`
  - Destinations, seasonality, party size, destination trend.
- `backend/routers/sales_leads.py`
  - Lead volume, conversion, time-to-convert, source effectiveness, close speed.
- `backend/routers/sales_opportunities.py`
  - Top opportunities, opportunity detail, outbound email action.
- `backend/routers/sales_agent_profile.py`
  - Agent drill-down profile endpoint.
- `backend/routers/sales_narrative.py`
  - AI narrative generation by page.

#### Customer / insight / external intelligence

- `backend/routers/customer_profile.py`
  - Top-revenue customers, search, customer detail, upsell suggestions, customer email.
- `backend/routers/cross_sell.py`
  - Cross-sell opportunity insights.
- `backend/routers/market_pulse.py`
  - Market advisories / intelligence and impacted-customer views.
- `backend/routers/territory_map.py`
  - Territory map, county boundaries, census rollups.

#### Targets / admin / support workflows

- `backend/routers/advisor_targets.py`
  - Upload and confirm advisor targets, target lookup with actuals.
- `backend/routers/advisor_targets_monthly.py`
  - Monthly target estimates, retrieval, save, reseed.
- `backend/routers/advisor_targets_achievement.py`
  - Current achievement and pacing metrics.
- `backend/routers/email_report.py`
  - Email advisor and dashboard reports.
- `backend/routers/ai_config.py`
  - Admin AI configuration read/update/test endpoints.
- `backend/routers/activity_logs.py`
  - Activity log listing and filter metadata.
- `backend/routers/users.py`
  - Login, current user, user CRUD, admin maintenance, cache reset, geo refresh, DB backup/info.
- `backend/routers/issues.py`
  - Internal issue intake and GitHub-linked issue/comment/triage webhook flow.

### Backend helper modules

- `backend/activity_logger.py`
  - Audit/event logging.
- `backend/constants.py`
  - Shared backend constants.
- `backend/seed_geodata.py`
  - County/ZIP geodata loading and refresh.
- `backend/gunicorn_conf.py`
  - Gunicorn runtime config.
- `backend/startup.sh`
  - Server startup wrapper.

### Backend API surface

High-level route groups discovered from router decorators:

- `/api/auth/*`
- `/api/users*`
- `/api/admin/*`
- `/api/activity-logs*`
- `/api/sales/advisors/*`
- `/api/sales/performance/*`
- `/api/sales/pipeline/*`
- `/api/sales/travel/*`
- `/api/sales/leads/*`
- `/api/sales/opportunities/*`
- `/api/sales/agent/profile`
- `/api/sales/narrative`
- `/api/customers/*`
- `/api/cross-sell/insights`
- `/api/market-pulse*`
- `/api/territory/*`
- `/api/targets*`
- `/api/issues*`

## Frontend Index

### App shell and global context

- `frontend/src/App.tsx`
  - Route map and provider composition.
- `frontend/src/components/Layout.tsx`
  - Sidebar navigation.
  - Global line/date filtering.
  - Role-aware line locking.
  - Theme toggle, command palette, issue entry point.
- `frontend/src/contexts/AuthContext.tsx`
  - Token persistence.
  - `/api/auth/me` validation on mount.
  - Login/logout logic.
- `frontend/src/contexts/SalesContext.tsx`
  - Global business line, time-period, and date-range state.
- `frontend/src/contexts/ThemeContext.tsx`
  - Theme state.

### Frontend data layer

- `frontend/src/lib/api.ts`
  - Central API wrapper.
  - Axios interceptors:
    - inject bearer token
    - redirect to `/login` on 401
    - retry on 502/503/504
  - Large catalog of fetch/mutate functions mirroring backend routes.

Other shared frontend utilities:

- `frontend/src/lib/types.ts`
- `frontend/src/lib/formatters.ts`
- `frontend/src/lib/chart-theme.ts`
- `frontend/src/lib/exportExcel.ts`
- `frontend/src/lib/printWindow.ts`
- `frontend/src/lib/statusColors.ts`
- `frontend/src/lib/issueConfig.ts`
- `frontend/src/lib/utils.ts`

### Route-to-page map

Public:

- `/` -> `frontend/src/pages/LandingPage.tsx`
- `/login` -> `frontend/src/pages/Login.tsx`

Protected:

- `/dashboard` -> `AdvisorDashboard.tsx`
- `/monthly` -> `MonthlyReport.tsx`
- `/opportunities` -> `TopOpportunities.tsx`
- `/agent/:name` -> `AgentDashboard.tsx`
- `/pipeline` -> `Pipeline.tsx`
- `/opportunity/:id` -> `OpportunityDetail.tsx`
- `/travel` -> `TravelAnalytics.tsx`
- `/revenue` -> `TopRevenueContributors.tsx`
- `/leads` -> `LeadFunnel.tsx`
- `/help` -> `Help.tsx`
- `/settings` -> `Settings.tsx`
- `/issues` -> `Issues.tsx`
- `/customer/:id` -> `CustomerProfile.tsx`
- `/customers` -> `TopCustomers.tsx`
- `/insights` -> `CrossSellInsights.tsx`
- `/market-pulse` -> `MarketPulse.tsx`
- `/territory` -> `TerritoryMap.tsx`
- `/census` -> `CensusData.tsx`

### Major page clusters

#### Dashboard pages

- `frontend/src/pages/AdvisorDashboard.tsx`
  - Main executive dashboard container.
  - Fans out to multiple endpoints in parallel.
  - Owns tabs:
    - `advisor/OverviewTab.tsx`
    - `advisor/RankingsTab.tsx`
    - `advisor/SummaryTab.tsx`

- `frontend/src/pages/AgentDashboard.tsx`
  - Individual advisor drill-down.
  - Uses:
    - `agent/SummaryTab.tsx`
    - `agent/PerformanceTab.tsx`
    - `agent/OpportunitiesTab.tsx`
    - `agent/CrossSellTab.tsx`

- `frontend/src/pages/Pipeline.tsx`
  - Uses:
    - `pipeline/SummaryTab.tsx`
    - `pipeline/FunnelTab.tsx`
    - `pipeline/DetailsTab.tsx`

- `frontend/src/pages/MonthlyReport.tsx`
  - Uses:
    - `monthly/SummaryTab.tsx`
    - `monthly/ChartsTab.tsx`
    - `monthly/DetailsTab.tsx`

#### Other major feature pages

- `TopRevenueContributors.tsx`
- `TopOpportunities.tsx`
- `TravelAnalytics.tsx`
- `LeadFunnel.tsx`
- `CrossSellInsights.tsx`
- `CustomerProfile.tsx`
- `TopCustomers.tsx`
- `MarketPulse.tsx`
- `TerritoryMap.tsx`
- `CensusData.tsx`
- `Issues.tsx`
- `Settings.tsx`
- `Help.tsx`

### Important reusable components

- `CommandPalette.tsx`
- `EmailPopover.tsx`
- `ReportIssue.tsx`
- `ActivityLogsTable.tsx`
- `TargetGrid.tsx`
- `TargetProgressBar.tsx`
- `ManagerBriefing.tsx`
- `RichNarrative.tsx`
- `FunnelChart.tsx`
- `Product360Visual.tsx`
- `IssueCard.tsx`
- `ProtectedRoute.tsx`
- `ErrorBoundary.tsx`

### Help system

Help content is modular rather than monolithic:

- `pages/help/OverviewSection.tsx`
- `pages/help/LifecycleSection.tsx`
- `pages/help/MetricsSection.tsx`
- `pages/help/ModulesSection.tsx`
- `pages/help/PipelineSection.tsx`
- `pages/help/GlossarySection.tsx`
- `pages/help/HelpData.tsx`
- `pages/help/HelpHowItWorks.tsx`
- `pages/help/HelpGuides.tsx`
- `pages/help/HelpContent.tsx`

## Data Flow

The dominant runtime data path is:

1. React page loads and reads current line/date/auth context.
2. Frontend calls typed wrappers in `frontend/src/lib/api.ts`.
3. FastAPI router validates auth and params.
4. Router either:
   - queries Salesforce through `sf_client.py`, often via shared helper functions and cache keys, or
   - reads/writes app-owned SQLite tables through SQLAlchemy.
5. Router returns JSON to the SPA.
6. Some pages also trigger email or AI side effects.

There are two broad data classes:

- App-owned state:
  - users
  - activity logs
  - advisor targets
  - monthly targets
  - cached geodata metadata

- External business data:
  - Salesforce opportunities, leads, users, accounts, and derived analytics
  - market intelligence inputs
  - AI-generated narratives and recommendations

## Operational Notes

- The backend automatically backs up the SQLite DB on startup and keeps the last 5 backups.
- Cache invalidation is partially deploy-hash based and partially time-based.
- The frontend assumes the backend is mounted on the same origin in production.
- Roles materially change navigation/filter behavior, especially in `Layout.tsx`.
- The backend serves the SPA directly if a frontend build has been copied into `backend/static/`.

## Test Index

### Backend tests

- `backend/tests/test_api.py`
  - Health, auth, protected routes, a subset of analytics routes, admin access checks.
- `backend/tests/test_cache.py`
  - L1/L2 cache behavior and stampede protection.
- `backend/tests/test_sf_client.py`
  - SOQL validation, rate limiting, parallel query behavior.
- `backend/tests/test_shared.py`
  - Date/filter helper correctness.

### Frontend tests

- `frontend/e2e/login.spec.ts`
- `frontend/e2e/dashboard.spec.ts`
- `frontend/e2e/navigation.spec.ts`

Coverage appears stronger around backend helpers than around frontend component logic.

## Gaps / Observations

- `frontend/README.md` is still the default Vite template and does not document this app.
- Several backend routers are large and multi-responsibility, especially target/admin and issue-related flows.
- The repo contains `backend/salesinsight.db`, but the runtime DB is created under the user home directory; the checked-in DB should not be assumed authoritative.
- The route inventory suggests the app is organized primarily by business dashboard surface, not by shared domain services.
- `frontend/src/lib/api.ts` is the frontend contract map; if an endpoint changes, this file is the first place to inspect.

## Suggested Reading Order

If you need to ramp up quickly, read in this order:

1. `backend/main.py`
2. `backend/database.py`
3. `backend/models.py`
4. `backend/shared.py`
5. `backend/sf_client.py`
6. `frontend/src/App.tsx`
7. `frontend/src/components/Layout.tsx`
8. `frontend/src/lib/api.ts`
9. The page/router pair for the feature you want to modify

## Quick Ownership Map

- Auth and user management: `backend/auth.py`, `backend/routers/users.py`, `frontend/src/contexts/AuthContext.tsx`, `frontend/src/pages/Settings.tsx`
- Global filters and shell: `frontend/src/contexts/SalesContext.tsx`, `frontend/src/components/Layout.tsx`
- Salesforce access and caching: `backend/sf_client.py`, `backend/cache.py`, `backend/shared.py`
- Targets and achievement: `backend/models.py`, `backend/routers/advisor_targets*.py`, `frontend/src/pages/settings/TargetsTab.tsx`, `frontend/src/components/Target*`
- AI narrative/config: `backend/routers/sales_narrative.py`, `backend/routers/ai_config.py`, `frontend/src/pages/settings/AIConfigTab.tsx`, `frontend/src/components/RichNarrative.tsx`
- Territory / census: `backend/seed_geodata.py`, `backend/routers/territory_map.py`, `frontend/src/pages/TerritoryMap.tsx`, `frontend/src/pages/CensusData.tsx`
- Issue workflow: `backend/routers/issues.py`, `frontend/src/pages/Issues.tsx`, `frontend/src/components/IssueCard.tsx`, `frontend/src/components/ReportIssue.tsx`
