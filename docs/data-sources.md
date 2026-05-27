# SalesPulse — Data Source Reference

**Last updated: 2026-05-25**

---

## PBI Dataset: `insurance_transactions_f` — Full Column Reference

**Dataset ID:** `INSURANCE_DS` = `2e3c94a1-5900-4ded-8a6d-14e1b0cc0747`  
**Workspace:** `PBI_WS` = `019c6471-5f67-4838-970b-35b186425c78`  
**Table:** `insurance_transactions_f`

### PBI Report → Column Mapping (Insurance Advisor Daily Sales Premium Report / "Incentive Team Daily")

| PBI Report Column | Actual Column | Notes |
|---|---|---|
| agent | `inserted_by_name` | Advisor full name |
| policy count | `policy_count` | **Native column** — not COUNTROWS |
| premium amt | `transaction_amount` | = `sales` in pbi_client.py |
| avg premium | derived | `transaction_amount / policy_count` |
| commission | `commission_amount` | = `commission` in pbi_client.py |
| commission % | `commission_percent` | Not currently fetched |

### Incentive-Specific Columns (not yet used in pbi_client.py)

| Column | Purpose |
|---|---|
| `incentive_count` | Primary incentive qualifier count |
| `incentive_count v2` | Alternate incentive count definition |
| `incentive_count v3` | Alternate incentive count definition |
| `Cancel Incent NewB` | New business cancellation incentive flag |
| `Cancel Incent` | General cancellation incentive flag |
| `NEWB Qualifier` | New business qualifier flag |
| `incent_date` | Date used for incentive calculation |

### Filter Columns (visible in PBI report slicers)

| PBI Report Slicer | Actual Column | Known Values |
|---|---|---|
| Premium Type | `transaction_line_type_grp` | CANCEL, NEW, REINSTATE, REWRITE |
| Product | `uniq_line` | AUTO, COMMERCIAL, HOME, OTHER, PUMP |
| Carrier | `Billing Company Groups` | Various insurance carriers |
| Job Title | `assoc_job_title_grps` | Insurance Advisors, Insurance Concierge, Other |

### Other Notable Columns

| Column | Purpose |
|---|---|
| `inserted_by_code` | Advisor teller code (= `code` in pbi_client) |
| `branch_name` | Branch name (= `branch` in pbi_client) |
| `invoice_date_generation` | Invoice date (= `date` in pbi_client) |
| `transaction_date` | Alternative transaction date |
| `business_date` / `BusinessDateOnly` | Business calendar date |
| `transaction_type` | Raw transaction type |
| `transaction_line_type` | Line-level type |
| `policy_type` | Policy type code |
| `policy_type_description` | Policy type label |
| `billing_company_name` | Carrier billing name |
| `issuing_company_name` | Carrier issuing name |
| `producer_name` / `producer_code` | Producer (external agent) info |
| `accounting_month` | Accounting period month |
| `type_of_business_code` | Business type code |
| `client_type` | Client classification |
| `row_current` | SCD flag — filter `= true` for current records only |

### Current pbi_client.py gaps for Incentive reporting

The current `insurance_by_advisor_day()` function does NOT fetch: `incentive_count`, `transaction_line_type_grp`, `uniq_line`, `Billing Company Groups`, `policy_count` (native), `commission_percent`. To replicate the Incentive Team Daily report, a new query variant would need these columns.

---

## The Three Sources of Truth

| Source | What it owns | Why |
|---|---|---|
| **PBI** (Power BI billing system) | Commission amounts · Gross bookings (sales) | SF `Earned_Commission_Amount__c` is incomplete — many won deals have $0 recorded. PBI billing data is the authoritative record of what agents actually earned. |
| **PostgreSQL** (SalesPulse DB) | Advisor targets (budget) | Targets are entered/managed inside SalesPulse, not in Salesforce or PBI. |
| **Salesforce** | Opportunity counts · Lead counts · Invoice counts · Win rates · Pipeline · Individual deal records | Salesforce is the CRM of record for all activity and pipeline data. |

### Rule: Travel and Insurance always use PBI for commission and sales/bookings.
Applies to every number labeled "commission" or "revenue/bookings/sales" in the UI when line = Travel or Insurance. Salesforce Amount and Earned_Commission_Amount__c are fetched but overwritten by PBI before any number reaches the UI.

---

## Endpoint-by-Endpoint Breakdown

### 1. Sales Performance — Monthly Table
**Endpoint:** `GET /api/sales/performance/monthly`
**File:** `routers/sales_performance.py`

| Field shown | Source | How |
|---|---|---|
| Leads count | Salesforce | `Lead.CreatedDate` grouped by OwnerId + month |
| Opps count | Salesforce | `Opportunity.CreatedDate` grouped by OwnerId + month |
| Invoiced count | Salesforce | `Opportunity.CloseDate`, `StageName IN INVOICED_STAGES` |
| **Commission** | **PBI** | `pbi_monthly_map()` overlays `commission` per advisor per YYYY-MM, replacing SF `Earned_Commission_Amount__c` |
| **Sales / Bookings** | **PBI** | Same overlay replaces SF `Amount` with PBI `sales` |

Note: advisors with PBI data but no matching SF record are included (e.g. inactive/former agents).
Advisors with SF records but no matching PBI record are zeroed out and excluded.

---

### 2. Advisor Leaderboard
**Endpoint:** `GET /api/sales/advisors/leaderboard`
**File:** `routers/sales_advisor.py`

| Field shown | Source | How |
|---|---|---|
| **Commission** | **PBI** | `pbi_by_advisor()` → `travel_by_advisor` / `insurance_by_advisor` (pre-aggregated) |
| **Bookings** | **PBI** | Same |
| Win rate | Salesforce | Won / (Won + Lost) opportunity counts |
| Pipeline value / count | Salesforce | `IsClosed = false` opportunities |
| Rank | Derived | Sorted by PBI commission descending |

---

### 3. Advisor Summary KPIs (top of leaderboard page)
**Endpoint:** `GET /api/sales/advisors/summary`
**File:** `routers/sales_advisor.py`

| Field shown | Source |
|---|---|
| **Commission / Bookings** | **PBI** (`pbi_by_day()`) |
| **YoY %** | **PBI** (current vs prior period via `pbi_by_day()`) |
| Win rate | Salesforce |
| Pipeline | Salesforce |

---

### 4. YoY Chart
**Endpoint:** `GET /api/sales/advisors/yoy`
**File:** `routers/sales_advisor.py`

| Field | Source |
|---|---|
| **Monthly revenue** | **PBI** (`pbi_by_day()`) |
| **Monthly commission** | **PBI** |
| Deal counts | PBI (txns field) |

---

### 5. Branch Monthly Chart
**Endpoint:** `GET /api/sales/advisors/branch-monthly`
**File:** `routers/sales_advisor.py`

| Field | Source |
|---|---|
| **Commission per branch per month** | **PBI** (`pbi_by_branch_day()`) |
| **Sales per branch per month** | **PBI** |

---

### 6. Agent Profile — when you click on an advisor
**Endpoint:** `GET /api/sales/agent/profile`
**File:** `routers/sales_agent_profile.py`

| Field shown | Source | How |
|---|---|---|
| **Revenue (period total)** | **PBI** | `pbi_period_totals()` for sd→ed range |
| **Commission (period total)** | **PBI** | `pbi_period_totals()` |
| **Prior year revenue / commission** | **PBI** | `pbi_period_totals()` on prior-year range |
| **YoY %** | **PBI** | Computed from PBI period totals |
| **Monthly breakdown chart** | **PBI** | `overlay_pbi_on_month_map()` replaces SF monthly rev+comm |
| Deal count (won) | Salesforce | Count of won opportunities in range |
| Win rate | Salesforce | Won / (Won + Closed Lost) |
| Pipeline value / count | Salesforce | `IsClosed = false` |
| Leads / opps created | Salesforce | Lead + Opportunity created counts |
| Individual opportunity records | Salesforce | All detail fields (Name, Amount, CloseDate, Stage, etc.) |
| Tasks | Salesforce | Open Task objects |
| ⚠️ Team average commission | **Salesforce** | `SUM(Earned_Commission_Amount__c)` across all advisors — **does not use PBI** |
| ⚠️ Division YTD / month commission | **Salesforce** | `SUM(Earned_Commission_Amount__c)` — **does not use PBI** |

**Known gap:** Team avg and division totals in the agent profile comparison section still use SF data. Individual advisor numbers are PBI. This means the comparison bars are not on the same basis. See "Open Issues" below.

---

### 7. Target Achievement Bars (Advisor Dashboard)
**Endpoint:** `GET /api/targets/achievement`
**File:** `routers/advisor_targets_achievement.py`

| Field shown | Source | How |
|---|---|---|
| **Actual commission** | **PBI** | `pbi_monthly_map()` overlay on `actuals_map` |
| **Actual bookings** | **PBI** | Same overlay |
| Target (commission) | PostgreSQL | `MonthlyAdvisorTarget.target_amount` |
| Target (bookings) | PostgreSQL | `MonthlyAdvisorTarget.target_bookings` |
| Pace % (period bar) | Derived | `elapsed_days / total_period_days × 100` |
| Pace % (yearly bar) | Derived | `sum(Jan→last_completed_month targets) / annual_target × 100` |

---

### 8. Monthly Targets Table (full year view)
**Endpoint:** `GET /api/targets/monthly/{year}`
**File:** `routers/advisor_targets_monthly.py`

| Field shown | Source | How |
|---|---|---|
| **Actual commission per month** | **PBI** | `pbi_monthly_map()` via `_get_advisor_monthly_actuals()` |
| **Actual bookings per month** | **PBI** | Same |
| **Prior year actuals** | **PBI** | Same, for `year - 1` |
| Target commission per month | PostgreSQL | `MonthlyAdvisorTarget.target_amount` |
| Target bookings per month | PostgreSQL | `MonthlyAdvisorTarget.target_bookings` |
| Achievement % | Derived | `actual / target × 100` |

---

### 9. Performance Insights (coaching panel)
**Endpoint:** `GET /api/sales/performance/insights`
**File:** `routers/sales_performance.py`

| Field shown | Source | Note |
|---|---|---|
| Win rate analysis | Salesforce | Won / (Won + Lost) counts — correct source |
| Pipeline coverage | Salesforce | Pipeline value vs closed won Amount |
| Deals at risk | Salesforce | `PushCount >= 3` |
| ⚠️ "Top Performer" text + $ amount | **Salesforce** | Uses `SUM(Amount)` — not PBI — so the dollar figure shown in the text insight does not match PBI commission shown in the leaderboard |

---

## Summary Matrix

| Number | Travel/Insurance source | Other lines source |
|---|---|---|
| Commission | **PBI** | Salesforce `Earned_Commission_Amount__c` |
| Bookings / Sales / Revenue | **PBI** | Salesforce `Amount` |
| Advisor targets (budget) | **PostgreSQL** | **PostgreSQL** |
| Lead count | Salesforce | Salesforce |
| Opportunity count | Salesforce | Salesforce |
| Invoiced count | Salesforce | Salesforce |
| Won deal count | Salesforce | Salesforce |
| Win rate % | Salesforce | Salesforce |
| Pipeline value | Salesforce | Salesforce |
| Individual deal records | Salesforce | Salesforce |
| Tasks | Salesforce | Salesforce |

---

## Known Limitations (by design — not fixable with PBI)

### Individual deal commission (per-opportunity records)
- **Where:** Customer 360 deal history (`/api/sales/agent/top-customers`), Opportunity detail (`/api/sales/opportunities/`)
- **File:** `routers/sales_agent_profile.py` → `agent_top_customers()`, `routers/sales_opportunities.py`
- **Reason:** PBI data is aggregated by advisor+day. There is no PBI record for an individual Salesforce opportunity. The only available per-deal commission is `Earned_Commission_Amount__c`, which may be $0 for many Travel deals.
- **Impact:** Individual deal records may show $0 commission. This is expected and cannot be fixed without per-deal PBI data.
- **Aggregate totals are not affected** — KPI cards, charts, and target bars all use PBI aggregates.

### Open opportunity commission estimate (goal-gap focus)
- **Where:** Goal-gap focus panel (`/api/sales/opportunities/goal-focus`)
- **File:** `routers/sales_goal_focus.py`
- **Reason:** Open opportunities have not yet closed, so no PBI record exists. Commission is estimated as `Amount × comm_rate` where `comm_rate` is derived from PBI (after the fix to `_get_comm_rate_accurate()`). This is the best possible estimate for future deals.

---

## How PBI Overlay Works (technical)

All PBI data flows through `backend/pbi_utils.py`. The central function is `pbi_monthly_map(line, sd, ed)`:

1. Calls `travel_by_advisor_day(sd, ed)` or `insurance_by_advisor_day(sd, ed)` from `pbi_client.py`
2. Groups daily rows by `norm_name(advisor_name)` → `YYYY-MM` → `{commission, sales, _raw_name}`
3. Caches: 1 hour in memory, 24 hours on disk

Overlay functions:
- `overlay_pbi_on_month_map()` — overwrites `rev` and `comm` in a `{month_int: {...}}` map in-place
- `pbi_period_totals()` — sums commission+sales for an advisor within a date range
- `pbi_by_advisor()` / `pbi_by_day()` / `pbi_by_branch_day()` — dispatch to pre-aggregated PBI functions for leaderboard/trend/branch charts

Every file that needs commission or bookings for Travel/Insurance imports from `pbi_utils` — no direct `pbi_client` calls outside of `pbi_utils.py`.
