# Target Achievement Tracker — Design Spec

**Date:** 2026-04-04
**Status:** Approved

## Overview

Add monthly target management and achievement tracking to SalesPulse. Managers can set per-advisor, per-month sales targets via an editable 12-month grid. Progress toward monthly and yearly goals is displayed as horizontal progress bars with pace markers on the Dashboard (company-level) and Agent page (advisor-level).

## Decisions

| Decision | Choice |
|----------|--------|
| Monthly target model | Pre-fill 12 months from current target, fully editable per month |
| Progress visualization | Horizontal progress bars with time-elapsed pace markers |
| Dashboard placement | Company-level bars on global Dashboard (top, highly visible) |
| Agent page placement | Individual advisor bars on Agent Detail page (prominent) |
| Grid editing location | Settings → Targets tab (enhanced) |
| Bulk-fill interaction | Both row "Apply to all months" + column "Fill down" |
| Data model approach | New `MonthlyAdvisorTarget` table (1 row per advisor per month) |

## 1. Data Model

### New Table: `MonthlyAdvisorTarget`

| Column | Type | Description |
|--------|------|-------------|
| id | Integer, PK | Auto-increment |
| advisor_target_id | Integer, FK → AdvisorTarget.id | Links to advisor identity |
| year | Integer | e.g. 2026 |
| month | Integer | 1–12 |
| target_amount | Float | Dollar target for that month |
| updated_by_email | String, nullable | Who last edited this cell |
| updated_at | DateTime | Last modification timestamp |

**Unique constraint:** `(advisor_target_id, year, month)` — one target per advisor per month.

**Existing `AdvisorTarget` table:** Unchanged. Continues to store advisor identity (sf_name, branch, title) and the legacy `monthly_target` field (used as seed value).

### Migration

For each existing `AdvisorTarget` with a non-null `monthly_target`:
- Create 12 `MonthlyAdvisorTarget` rows for year 2026 (months 1–12)
- Each row's `target_amount` = the existing `monthly_target` value
- `updated_by_email` = "system-migration"

## 2. API Endpoints

### GET `/api/targets/monthly/{year}`

Returns all advisors' 12-month targets and actuals for a given year.

**Query params:** `line` (optional, Travel/Insurance/All)

**Response:**
```json
{
  "year": 2026,
  "advisors": [
    {
      "advisor_target_id": 1,
      "name": "Jane Smith",
      "branch": "Houston",
      "title": "Senior Advisor",
      "months": [
        { "month": 1, "target": 50000, "actual": 48200, "achievement_pct": 96.4 },
        { "month": 2, "target": 50000, "actual": 52100, "achievement_pct": 104.2 },
        ...
      ],
      "total_target": 600000,
      "total_actual": 252400,
      "achievement_pct": 42.1
    }
  ],
  "company": {
    "months": [
      { "month": 1, "target": 500000, "actual": 482000, "achievement_pct": 96.4 },
      ...
    ],
    "total_target": 6000000,
    "total_actual": 2524000,
    "achievement_pct": 42.1
  }
}
```

### GET `/api/targets/achievement`

Lightweight endpoint for dashboard progress bars. Returns company-level and per-advisor current-month + YTD progress.

**Query params:** `line` (optional), `advisor_name` (optional, for agent page)

**Response:**
```json
{
  "current_month": {
    "month": 4,
    "year": 2026,
    "day_of_month": 4,
    "days_in_month": 30,
    "pace_pct": 13.3,
    "company": { "target": 500000, "actual": 342000, "achievement_pct": 68.4 },
    "advisors": [
      { "name": "Jane Smith", "target": 50000, "actual": 34200, "achievement_pct": 68.4 }
    ]
  },
  "yearly": {
    "year": 2026,
    "month_of_year": 4,
    "pace_pct": 27.3,
    "company": { "target": 6000000, "actual": 2524000, "achievement_pct": 42.1 },
    "advisors": [
      { "name": "Jane Smith", "target": 600000, "actual": 252400, "achievement_pct": 42.1 }
    ]
  }
}
```

### PUT `/api/admin/targets/monthly`

Batch upsert monthly targets. Admin-only.

**Request body:**
```json
{
  "year": 2026,
  "updates": [
    {
      "advisor_target_id": 1,
      "months": { "1": 50000, "2": 50000, "3": 75000, ... }
    }
  ]
}
```

**Behavior:** Upserts each `(advisor_target_id, year, month)` combination. Sets `updated_by_email` from auth context, `updated_at` to now.

**Note:** The "Apply to all months" (row fill) and "Fill down" (column fill) operations are handled entirely in frontend local state. No separate `/fill` endpoint needed — changes are collected client-side and saved via the PUT endpoint above.

## 3. Frontend Components

### 3a. `TargetProgressBar` Component

**File:** `frontend/src/components/TargetProgressBar.tsx`

Shared, reusable component used on Dashboard and Agent pages.

**Props:**
- `label` — "April Target" or "2026 Yearly Target"
- `actual` — dollar amount achieved
- `target` — dollar target
- `pacePct` — time-elapsed percentage (day 4/30 = 13.3%, month 4/12 = 25%)
- `paceLabel` — "Day 4/30" or "Month 4/12"
- `color` — "indigo" (monthly) or "green" (yearly)

**Rendering:**
- Horizontal bar: filled width = `achievement_pct`
- Vertical pace marker line at `pacePct` position
- Color logic:
  - Achievement > pace + 5% → green "Ahead of pace ✓"
  - Achievement within ±5% of pace → yellow "On pace"
  - Achievement < pace - 5% → red "Behind pace ⚠"
- Top row: label + "$actual / $target"
- Bottom row: pace status (left) + "$ to go" (right)

### 3b. `TargetGrid` Component

**File:** `frontend/src/components/TargetGrid.tsx`

Editable 12-month target grid for Settings → Targets tab.

**Features:**
- Sticky left column (advisor name)
- 12 month columns (Jan–Dec) with editable input cells
- Auto-calculated TOTAL column (read-only)
- Row-level "Apply to all months" button (icon button at row end)
- Column-level "Fill down" button (in month header)
- Year selector dropdown
- Save button with dirty-state tracking (disabled when no changes)
- Visual indicator for edited cells (highlighted border)
- Currency formatting on blur, raw number on focus

**Data flow:**
1. On mount / year change: `GET /api/targets/monthly/{year}`
2. User edits cells → local state updates, dirty flag set
3. "Apply All" click → fills row in local state, marks dirty
4. "Fill Down" click → fills column in local state, marks dirty
5. Save click → `PUT /api/admin/targets/monthly` with all dirty rows, then refetch

### 3c. Dashboard Integration

**File:** `frontend/src/pages/AdvisorDashboard.tsx`

Add a "Target Achievement" card at the top of the dashboard, above existing KPI cards.

**Content:**
- Two `TargetProgressBar` instances: monthly (indigo) + yearly (green)
- Card uses `card-premium` styling
- Data from `GET /api/targets/achievement?line={line}`
- Respects the global `line` filter (Travel/Insurance/All)
- Shows "No targets set" placeholder if no data

### 3d. Agent Page Integration

**File:** `frontend/src/pages/AgentDetail.tsx` (or equivalent agent detail page)

Add `TargetProgressBar` for the specific advisor, positioned near the top.

**Content:**
- Two progress bars: monthly + yearly for that advisor
- Data from `GET /api/targets/achievement?advisor_name={name}&line={line}`
- Shows "No target set" if advisor has no targets

### 3e. Settings → Targets Tab Enhancement

**File:** `frontend/src/pages/settings/TargetsTab.tsx`

Integrate the `TargetGrid` component alongside the existing upload flow.

**Layout:**
- Top: Year selector + Upload button (existing flow preserved)
- Below: `TargetGrid` component (editable 12-month grid)
- Below grid: Save button
- Existing current-targets table replaced by the grid

## 4. Pace Calculation Logic

```
monthly_pace_pct = (current_day_of_month / days_in_month) * 100
yearly_pace_pct = ((current_month - 1) / 12) * 100  # completed months only

# For yearly: use sum of completed months' targets as the pace baseline
# e.g., in April (month 4), pace = (Jan+Feb+Mar targets) / yearly total
# This accounts for variable monthly targets
```

**Variable-target-aware pace:** Since monthly targets can differ, yearly pace isn't simply `month/12`. Instead: `pace = sum(targets for completed months) / sum(all 12 targets)`. This means if Q1 targets are low and Q3 targets are high, being 25% through the year doesn't mean you should be at 25% of yearly target.

## 5. File Impact Summary

| File | Action |
|------|--------|
| `backend/models.py` | Add `MonthlyAdvisorTarget` model |
| `backend/routers/advisor_targets.py` | Add 3 new endpoints |
| `frontend/src/components/TargetProgressBar.tsx` | New file |
| `frontend/src/components/TargetGrid.tsx` | New file |
| `frontend/src/lib/api.ts` | Add 3 new API functions |
| `frontend/src/pages/AdvisorDashboard.tsx` | Add achievement card |
| `frontend/src/pages/AgentDetail.tsx` | Add achievement bars |
| `frontend/src/pages/settings/TargetsTab.tsx` | Integrate grid, keep upload |
