# Target Achievement Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-month target management with editable 12-month grid, and progress bars with pace markers on Dashboard and Agent pages.

**Architecture:** New `MonthlyAdvisorTarget` SQLAlchemy model (1 row per advisor per month). Three new API endpoints: GET monthly targets+actuals for a year, GET achievement summary for dashboards, PUT batch upsert. Frontend: shared `TargetProgressBar` component on Dashboard/Agent pages, `TargetGrid` editable component in Settings.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React + TypeScript + Tailwind CSS (frontend), SQLite DB.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/models.py` | Modify | Add `MonthlyAdvisorTarget` model |
| `backend/routers/advisor_targets.py` | Modify | Add 3 new endpoints + migration helper |
| `frontend/src/lib/api.ts` | Modify | Add 3 new API functions + types |
| `frontend/src/components/TargetProgressBar.tsx` | Create | Shared progress bar with pace marker |
| `frontend/src/components/TargetGrid.tsx` | Create | Editable 12-month grid for Settings |
| `frontend/src/pages/AdvisorDashboard.tsx` | Modify | Add achievement card at top |
| `frontend/src/pages/AgentDashboard.tsx` | Modify | Add individual progress bars |
| `frontend/src/pages/settings/TargetsTab.tsx` | Modify | Replace table with TargetGrid |

---

### Task 1: Add MonthlyAdvisorTarget Model

**Files:**
- Modify: `backend/models.py:59-81` (after AdvisorTarget class)

- [ ] **Step 1: Add the MonthlyAdvisorTarget model to models.py**

Add after the `AdvisorTarget` class (after line 81):

```python
class MonthlyAdvisorTarget(Base):
    __tablename__ = 'monthly_advisor_targets'
    __table_args__ = (
        Index('ix_monthly_target_advisor_year', 'advisor_target_id', 'year'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    advisor_target_id = Column(Integer, nullable=False, index=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)  # 1-12
    target_amount = Column(Float, nullable=False)
    updated_by_email = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'advisor_target_id': self.advisor_target_id,
            'year': self.year,
            'month': self.month,
            'target_amount': self.target_amount,
            'updated_by_email': self.updated_by_email,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
```

- [ ] **Step 2: Verify the model import works**

Run:
```bash
cd backend && python -c "from models import MonthlyAdvisorTarget; print('OK:', MonthlyAdvisorTarget.__tablename__)"
```
Expected: `OK: monthly_advisor_targets`

- [ ] **Step 3: Create the table in the database**

The table is auto-created by `Base.metadata.create_all(bind=engine)` in `database.py:init_db()`. Restart the backend to trigger it:

```bash
cd backend && python -c "from database import init_db; init_db(); print('Tables created')"
```
Expected: `Tables created` (no errors)

- [ ] **Step 4: Commit**

```bash
git add backend/models.py
git commit -m "feat: add MonthlyAdvisorTarget model for per-month targets"
```

---

### Task 2: Add Backend Endpoints — Migration + Monthly GET + Achievement GET + PUT

**Files:**
- Modify: `backend/routers/advisor_targets.py`

This task adds a migration helper and three new endpoints to the existing advisor_targets router. The file is currently 407 lines — these additions bring it to ~570 lines (under 600 limit).

- [ ] **Step 1: Add the MonthlyAdvisorTarget import and new Pydantic schemas**

At the top of `advisor_targets.py`, update the models import (line 15) and add new schemas after the existing `ConfirmRequest` class (after line 146):

Update line 15:
```python
from models import TargetUpload, AdvisorTarget, User, MonthlyAdvisorTarget
```

Add after `ConfirmRequest` (line 146):

```python
class MonthlyTargetUpdate(BaseModel):
    advisor_target_id: int
    months: dict[str, float]  # {"1": 50000, "2": 50000, ...}

class MonthlyTargetSaveRequest(BaseModel):
    year: int
    updates: list[MonthlyTargetUpdate]
```

- [ ] **Step 2: Add the migration / seed helper**

Add this helper function after the `_heuristic_map` function (after line 129):

```python
def _ensure_monthly_targets(db: Session, year: int):
    """Seed MonthlyAdvisorTarget rows from AdvisorTarget.monthly_target if none exist for the year."""
    upload = db.query(TargetUpload).order_by(TargetUpload.id.desc()).first()
    if not upload:
        return
    existing = db.query(MonthlyAdvisorTarget).filter(
        MonthlyAdvisorTarget.year == year
    ).first()
    if existing:
        return  # already seeded
    targets = db.query(AdvisorTarget).filter(AdvisorTarget.upload_id == upload.id).all()
    for t in targets:
        if t.monthly_target is None:
            continue
        for m in range(1, 13):
            db.add(MonthlyAdvisorTarget(
                advisor_target_id=t.id,
                year=year,
                month=m,
                target_amount=t.monthly_target,
                updated_by_email='system-migration',
            ))
    db.commit()
    log.info(f"Seeded {year} monthly targets from latest upload for {len(targets)} advisors")
```

- [ ] **Step 3: Add GET /api/targets/monthly/{year} endpoint**

Add after the existing `targets_with_actuals` endpoint (after line 407):

```python
@router.get("/api/targets/monthly/{year}")
def get_monthly_targets(
    year: int,
    line: str = "Travel",
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all advisors' 12-month targets for a given year, with actuals."""
    from shared import resolve_dates, WON_STAGES, line_filter_opp
    from sf_client import sf_query_all
    import cache

    _ensure_monthly_targets(db, year)

    upload = db.query(TargetUpload).order_by(TargetUpload.id.desc()).first()
    if not upload:
        return {'year': year, 'advisors': [], 'company': None}

    advisor_targets = (
        db.query(AdvisorTarget)
        .filter(AdvisorTarget.upload_id == upload.id)
        .all()
    )
    monthly_rows = (
        db.query(MonthlyAdvisorTarget)
        .filter(MonthlyAdvisorTarget.year == year)
        .all()
    )

    # Build lookup: advisor_target_id -> {month: amount}
    monthly_map: dict[int, dict[int, float]] = {}
    for mr in monthly_rows:
        monthly_map.setdefault(mr.advisor_target_id, {})[mr.month] = mr.target_amount

    # Fetch actuals for the year
    sd = f"{year}-01-01"
    ed = f"{year}-12-31"
    lf = line_filter_opp(line)
    cache_key = f"monthly_targets_actuals_{line}_{year}"

    def fetch():
        return sf_query_all(f"""
            SELECT Owner.Name, CALENDAR_MONTH(CloseDate) mo,
                   SUM(Earned_Commission_Amount__c) comm
            FROM Opportunity
            WHERE {WON_STAGES} AND {lf}
              AND CloseDate >= {sd} AND CloseDate <= {ed}
              AND Amount != null
            GROUP BY Owner.Name, CALENDAR_MONTH(CloseDate)
        """)

    records = cache.cached_query(cache_key, fetch, ttl=1800, disk_ttl=43200)

    # actuals: name_lower -> {month_int: commission}
    actuals_map: dict[str, dict[int, float]] = {}
    for r in records:
        name = (r.get('Name') or '').strip().lower()
        if name:
            actuals_map.setdefault(name, {})[r.get('mo', 0)] = r.get('comm', 0) or 0

    # Company-level aggregation
    company_months = [{
        'month': m, 'target': 0.0, 'actual': 0.0, 'achievement_pct': None
    } for m in range(1, 13)]

    advisors = []
    for at in advisor_targets:
        targets_by_month = monthly_map.get(at.id, {})
        actuals_by_month = actuals_map.get(at.sf_name.strip().lower(), {})

        months = []
        total_target = 0.0
        total_actual = 0.0
        for m in range(1, 13):
            t = targets_by_month.get(m, 0)
            a = actuals_by_month.get(m, 0)
            total_target += t
            total_actual += a
            pct = round(a / t * 100, 1) if t > 0 else None
            months.append({'month': m, 'target': t, 'actual': a, 'achievement_pct': pct})
            company_months[m - 1]['target'] += t
            company_months[m - 1]['actual'] += a

        overall_pct = round(total_actual / total_target * 100, 1) if total_target > 0 else None
        advisors.append({
            'advisor_target_id': at.id,
            'name': at.sf_name,
            'branch': at.branch,
            'title': at.title,
            'months': months,
            'total_target': total_target,
            'total_actual': total_actual,
            'achievement_pct': overall_pct,
        })

    # Finalize company months
    for cm in company_months:
        cm['achievement_pct'] = round(cm['actual'] / cm['target'] * 100, 1) if cm['target'] > 0 else None

    co_total_target = sum(cm['target'] for cm in company_months)
    co_total_actual = sum(cm['actual'] for cm in company_months)

    advisors.sort(key=lambda a: a['total_actual'], reverse=True)

    return {
        'year': year,
        'advisors': advisors,
        'company': {
            'months': company_months,
            'total_target': co_total_target,
            'total_actual': co_total_actual,
            'achievement_pct': round(co_total_actual / co_total_target * 100, 1) if co_total_target > 0 else None,
        },
    }
```

- [ ] **Step 4: Add GET /api/targets/achievement endpoint**

Add immediately after the previous endpoint:

```python
@router.get("/api/targets/achievement")
def get_target_achievement(
    line: str = "Travel",
    advisor_name: Optional[str] = Query(None),
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lightweight achievement data for dashboard progress bars."""
    from shared import WON_STAGES, line_filter_opp
    from sf_client import sf_query_all
    import cache
    import calendar

    today = date.today()
    year = today.year
    month = today.month
    day = today.day
    days_in_month = calendar.monthrange(year, month)[1]

    _ensure_monthly_targets(db, year)

    upload = db.query(TargetUpload).order_by(TargetUpload.id.desc()).first()
    if not upload:
        return {'current_month': None, 'yearly': None}

    advisor_targets = (
        db.query(AdvisorTarget)
        .filter(AdvisorTarget.upload_id == upload.id)
        .all()
    )
    monthly_rows = (
        db.query(MonthlyAdvisorTarget)
        .filter(MonthlyAdvisorTarget.year == year)
        .all()
    )
    monthly_map: dict[int, dict[int, float]] = {}
    for mr in monthly_rows:
        monthly_map.setdefault(mr.advisor_target_id, {})[mr.month] = mr.target_amount

    # Fetch YTD actuals
    lf = line_filter_opp(line)
    sd = f"{year}-01-01"
    ed = today.isoformat()
    cache_key = f"achievement_actuals_{line}_{year}_{month}_{day}"

    def fetch():
        return sf_query_all(f"""
            SELECT Owner.Name, CALENDAR_MONTH(CloseDate) mo,
                   SUM(Earned_Commission_Amount__c) comm
            FROM Opportunity
            WHERE {WON_STAGES} AND {lf}
              AND CloseDate >= {sd} AND CloseDate <= {ed}
              AND Amount != null
            GROUP BY Owner.Name, CALENDAR_MONTH(CloseDate)
        """)

    records = cache.cached_query(cache_key, fetch, ttl=900, disk_ttl=21600)

    actuals_map: dict[str, dict[int, float]] = {}
    for r in records:
        name = (r.get('Name') or '').strip().lower()
        if name:
            actuals_map.setdefault(name, {})[r.get('mo', 0)] = r.get('comm', 0) or 0

    # Build per-advisor achievement
    advisor_results = []
    co_month_target = 0.0
    co_month_actual = 0.0
    co_year_target = 0.0
    co_year_actual = 0.0

    for at in advisor_targets:
        targets_by_month = monthly_map.get(at.id, {})
        actuals_by_month = actuals_map.get(at.sf_name.strip().lower(), {})

        m_target = targets_by_month.get(month, 0)
        m_actual = actuals_by_month.get(month, 0)

        y_target = sum(targets_by_month.get(m, 0) for m in range(1, 13))
        y_actual = sum(actuals_by_month.get(m, 0) for m in range(1, month + 1))

        # Variable-target-aware yearly pace
        completed_target = sum(targets_by_month.get(m, 0) for m in range(1, month))
        y_pace_pct = round(completed_target / y_target * 100, 1) if y_target > 0 else 0

        co_month_target += m_target
        co_month_actual += m_actual
        co_year_target += y_target
        co_year_actual += y_actual

        advisor_results.append({
            'name': at.sf_name,
            'monthly': {
                'target': m_target, 'actual': m_actual,
                'achievement_pct': round(m_actual / m_target * 100, 1) if m_target > 0 else None,
            },
            'yearly': {
                'target': y_target, 'actual': y_actual,
                'achievement_pct': round(y_actual / y_target * 100, 1) if y_target > 0 else None,
                'pace_pct': y_pace_pct,
            },
        })

    # Filter to specific advisor if requested
    if advisor_name:
        advisor_results = [
            a for a in advisor_results
            if a['name'].lower() == advisor_name.lower()
        ]

    # Company-level yearly pace
    co_completed_target = 0.0
    for at in advisor_targets:
        targets_by_month = monthly_map.get(at.id, {})
        co_completed_target += sum(targets_by_month.get(m, 0) for m in range(1, month))

    monthly_pace_pct = round(day / days_in_month * 100, 1)
    yearly_pace_pct = round(co_completed_target / co_year_target * 100, 1) if co_year_target > 0 else 0

    return {
        'current_month': {
            'month': month,
            'year': year,
            'day_of_month': day,
            'days_in_month': days_in_month,
            'pace_pct': monthly_pace_pct,
            'company': {
                'target': co_month_target,
                'actual': co_month_actual,
                'achievement_pct': round(co_month_actual / co_month_target * 100, 1) if co_month_target > 0 else None,
            },
        },
        'yearly': {
            'year': year,
            'month_of_year': month,
            'pace_pct': yearly_pace_pct,
            'company': {
                'target': co_year_target,
                'actual': co_year_actual,
                'achievement_pct': round(co_year_actual / co_year_target * 100, 1) if co_year_target > 0 else None,
            },
        },
        'advisors': advisor_results,
    }
```

- [ ] **Step 5: Add PUT /api/admin/targets/monthly endpoint**

Add immediately after the previous endpoint:

```python
@router.put("/api/admin/targets/monthly")
def save_monthly_targets(
    body: MonthlyTargetSaveRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Batch upsert monthly targets for one or more advisors."""
    count = 0
    for update in body.updates:
        for month_str, amount in update.months.items():
            month_int = int(month_str)
            if month_int < 1 or month_int > 12:
                continue
            existing = db.query(MonthlyAdvisorTarget).filter(
                MonthlyAdvisorTarget.advisor_target_id == update.advisor_target_id,
                MonthlyAdvisorTarget.year == body.year,
                MonthlyAdvisorTarget.month == month_int,
            ).first()
            if existing:
                existing.target_amount = amount
                existing.updated_by_email = admin.email
                existing.updated_at = datetime.utcnow()
            else:
                db.add(MonthlyAdvisorTarget(
                    advisor_target_id=update.advisor_target_id,
                    year=body.year,
                    month=month_int,
                    target_amount=amount,
                    updated_by_email=admin.email,
                ))
            count += 1
    db.commit()

    log_activity(
        db, action='monthly_targets_saved', category='targets',
        user=admin,
        detail=f"Saved {count} monthly target entries for {body.year}",
        metadata={'year': body.year, 'advisor_count': len(body.updates), 'cell_count': count},
    )
    return {'status': 'saved', 'count': count}
```

- [ ] **Step 6: Add the datetime import needed for the PUT endpoint**

The file already imports `from datetime import date` (line 7). Update to include `datetime`:

```python
from datetime import date, datetime
```

- [ ] **Step 7: Verify the backend starts without errors**

```bash
cd backend && python -c "from routers.advisor_targets import router; print('Router OK, routes:', len(router.routes))"
```
Expected: `Router OK, routes:` followed by a number (should be 7 — 4 existing + 3 new)

- [ ] **Step 8: Commit**

```bash
git add backend/routers/advisor_targets.py
git commit -m "feat: add monthly targets endpoints (GET monthly, GET achievement, PUT save)"
```

---

### Task 3: Add Frontend API Functions

**Files:**
- Modify: `frontend/src/lib/api.ts:296-343` (Advisor Targets section)

- [ ] **Step 1: Add TypeScript types and API functions**

Add after the existing `fetchTargetsWithActuals` function (after line 343):

```typescript
// ── Monthly Targets (12-month grid + achievement) ─────────────────────────

export interface MonthlyTargetMonth {
  month: number
  target: number
  actual: number
  achievement_pct: number | null
}

export interface MonthlyTargetAdvisor {
  advisor_target_id: number
  name: string
  branch: string | null
  title: string | null
  months: MonthlyTargetMonth[]
  total_target: number
  total_actual: number
  achievement_pct: number | null
}

export interface MonthlyTargetsResponse {
  year: number
  advisors: MonthlyTargetAdvisor[]
  company: {
    months: MonthlyTargetMonth[]
    total_target: number
    total_actual: number
    achievement_pct: number | null
  } | null
}

export interface AchievementResponse {
  current_month: {
    month: number
    year: number
    day_of_month: number
    days_in_month: number
    pace_pct: number
    company: { target: number; actual: number; achievement_pct: number | null }
  } | null
  yearly: {
    year: number
    month_of_year: number
    pace_pct: number
    company: { target: number; actual: number; achievement_pct: number | null }
  } | null
  advisors: {
    name: string
    monthly: { target: number; actual: number; achievement_pct: number | null }
    yearly: { target: number; actual: number; achievement_pct: number | null; pace_pct: number }
  }[]
}

export async function fetchMonthlyTargets(year: number, line = 'Travel') {
  const { data } = await api.get(`/api/targets/monthly/${year}`, { params: { line } })
  return data as MonthlyTargetsResponse
}

export async function fetchTargetAchievement(line = 'Travel', advisorName?: string) {
  const params: Record<string, string> = { line }
  if (advisorName) params.advisor_name = advisorName
  const { data } = await api.get('/api/targets/achievement', { params })
  return data as AchievementResponse
}

export async function saveMonthlyTargets(year: number, updates: { advisor_target_id: number; months: Record<string, number> }[]) {
  const { data } = await api.put('/api/admin/targets/monthly', { year, updates })
  return data as { status: string; count: number }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add monthly targets + achievement API functions"
```

---

### Task 4: Create TargetProgressBar Component

**Files:**
- Create: `frontend/src/components/TargetProgressBar.tsx`

- [ ] **Step 1: Create the TargetProgressBar component**

```tsx
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface TargetProgressBarProps {
  label: string
  actual: number
  target: number
  pacePct: number
  paceLabel: string
  color: 'indigo' | 'green'
}

function paceStatus(achievementPct: number, pacePct: number) {
  const diff = achievementPct - pacePct
  if (diff > 5) return { text: 'Ahead of pace ✓', cls: 'text-emerald-500' }
  if (diff >= -5) return { text: 'On pace', cls: 'text-amber-500' }
  return { text: 'Behind pace ⚠', cls: 'text-rose-500' }
}

export default function TargetProgressBar({ label, actual, target, pacePct, paceLabel, color }: TargetProgressBarProps) {
  if (target <= 0) return null

  const achievementPct = Math.min((actual / target) * 100, 100)
  const pace = paceStatus(achievementPct, pacePct)
  const remaining = Math.max(target - actual, 0)

  const barBg = color === 'indigo' ? 'bg-indigo-500/10' : 'bg-emerald-500/10'
  const barFill = color === 'indigo'
    ? 'bg-gradient-to-r from-indigo-500/50 to-indigo-500/90'
    : 'bg-gradient-to-r from-emerald-500/50 to-emerald-500/90'

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px]">
        <span className="font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
          {label}
        </span>
        <span className="tabular-nums">
          <span className={cn('font-bold', color === 'indigo' ? 'text-indigo-400' : 'text-emerald-400')}>
            {formatCurrency(actual, true)}
          </span>
          <span className="text-muted-foreground/50"> / {formatCurrency(target, true)}</span>
        </span>
      </div>
      <div className={cn('relative h-7 overflow-hidden rounded-full', barBg)}>
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full flex items-center justify-end pr-2.5 transition-all duration-700', barFill)}
          style={{ width: `${Math.max(achievementPct, 3)}%` }}
        >
          {achievementPct >= 12 && (
            <span className="text-[12px] font-bold text-white drop-shadow-sm tabular-nums">
              {achievementPct.toFixed(1)}%
            </span>
          )}
        </div>
        {/* Pace marker */}
        <div
          className="absolute inset-y-0 w-0.5 bg-white/50 z-10"
          style={{ left: `${pacePct}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px]">
        <span className={cn('font-medium', pace.cls)} style={{ marginLeft: `${Math.max(pacePct - 5, 0)}%` }}>
          ▲ {paceLabel} — {pace.text}
        </span>
        <span className="text-muted-foreground/40 tabular-nums">
          {formatCurrency(remaining, true)} to go
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/TargetProgressBar.tsx
git commit -m "feat: add TargetProgressBar component with pace markers"
```

---

### Task 5: Add Achievement Card to AdvisorDashboard

**Files:**
- Modify: `frontend/src/pages/AdvisorDashboard.tsx`

- [ ] **Step 1: Add import for fetchTargetAchievement and TargetProgressBar**

At the top of AdvisorDashboard.tsx, update the api import (line 11-18) to include `fetchTargetAchievement`:

```typescript
import {
  fetchAdvisorSummary, fetchAdvisorLeaderboard,
  fetchPerformanceInsights, fetchAdvisorYoY,
  fetchPerformanceFunnel,
  fetchPipelineSlipping, fetchLeadsVolume,
  fetchAgentCloseSpeed,
  fetchTargets, fetchTargetAchievement,
} from '@/lib/api'
import type { AchievementResponse } from '@/lib/api'
```

Add after the existing imports (around line 28):

```typescript
import TargetProgressBar from '@/components/TargetProgressBar'
```

- [ ] **Step 2: Add achievement state**

After the `targetMap` state (line 56), add:

```typescript
const [achievement, setAchievement] = useState<AchievementResponse | null>(null)
```

- [ ] **Step 3: Add achievement fetch in the useEffect**

Inside the existing useEffect (around line 93-103 where targets are loaded), add alongside the existing fetchTargets call:

```typescript
    // Load achievement data for progress bars
    fetchTargetAchievement(line)
      .then((data) => {
        if (cancelled) return
        setAchievement(data)
      })
      .catch(() => {})
```

- [ ] **Step 4: Add the achievement card in the JSX**

Inside the return, after the PAGE HEADER + TABS section and before the existing KPI cards, insert the achievement card. Find the line with the tab bar's closing `</div>` (the one right before the tab content is rendered) and add the progress bars card right after the page header div.

Add after the page header `</div>` (around line 120, inside `<div className="space-y-3">`):

```tsx
      {/* ── Target Achievement ────────────────────────────────────────── */}
      {achievement?.current_month && achievement?.yearly && (
        <div className="animate-enter card-premium px-5 py-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
            Target Achievement
          </div>
          <div className="grid grid-cols-2 gap-6">
            <TargetProgressBar
              label={`${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][achievement.current_month.month - 1]} Target`}
              actual={achievement.current_month.company.actual}
              target={achievement.current_month.company.target}
              pacePct={achievement.current_month.pace_pct}
              paceLabel={`Day ${achievement.current_month.day_of_month}/${achievement.current_month.days_in_month}`}
              color="indigo"
            />
            <TargetProgressBar
              label={`${achievement.yearly.year} Yearly Target`}
              actual={achievement.yearly.company.actual}
              target={achievement.yearly.company.target}
              pacePct={achievement.yearly.pace_pct}
              paceLabel={`Month ${achievement.yearly.month_of_year}/12`}
              color="green"
            />
          </div>
        </div>
      )}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AdvisorDashboard.tsx
git commit -m "feat: add company-level target achievement bars to dashboard"
```

---

### Task 6: Add Achievement Bars to AgentDashboard

**Files:**
- Modify: `frontend/src/pages/AgentDashboard.tsx`

- [ ] **Step 1: Add imports**

Update the api import (line 5) to include `fetchTargetAchievement`:

```typescript
import { fetchAgentProfile, fetchTargetsWithActuals, fetchTargetAchievement } from '@/lib/api'
```

Add after the existing imports:

```typescript
import TargetProgressBar from '@/components/TargetProgressBar'
```

- [ ] **Step 2: Add achievement state**

After the `targetData` state (line 119-124), add:

```typescript
  const [achievement, setAchievement] = useState<{
    monthly: { target: number; actual: number; achievement_pct: number | null }
    yearly: { target: number; actual: number; achievement_pct: number | null; pace_pct: number }
    monthlyPacePct: number
    monthLabel: string
    yearLabel: string
    dayLabel: string
    monthOfYear: number
  } | null>(null)
```

- [ ] **Step 3: Add achievement fetch in useEffect**

Inside the existing useEffect (after the fetchTargetsWithActuals call, around line 148-163), add:

```typescript
    // Load achievement for progress bars
    fetchTargetAchievement(line, decoded)
      .then((data) => {
        if (cancelled || !data.current_month || !data.yearly) return
        const adv = data.advisors[0]
        if (!adv) return
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        setAchievement({
          monthly: adv.monthly,
          yearly: adv.yearly,
          monthlyPacePct: data.current_month.pace_pct,
          monthLabel: `${monthNames[data.current_month.month - 1]} Target`,
          yearLabel: `${data.yearly.year} Yearly Target`,
          dayLabel: `Day ${data.current_month.day_of_month}/${data.current_month.days_in_month}`,
          monthOfYear: data.yearly.month_of_year,
        })
      })
      .catch(() => {})
```

- [ ] **Step 4: Add progress bars in JSX**

After the KPI Cards Row section (after the closing `</div>` of the grid-cols row, around line 280), add:

```tsx
      {/* ── Target Achievement ────────────────────────────────────────── */}
      {achievement && achievement.monthly.target > 0 && (
        <div className="animate-enter stagger-2 card-premium px-5 py-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
            Target Achievement — {profile.name}
          </div>
          <div className="grid grid-cols-2 gap-6">
            <TargetProgressBar
              label={achievement.monthLabel}
              actual={achievement.monthly.actual}
              target={achievement.monthly.target}
              pacePct={achievement.monthlyPacePct}
              paceLabel={achievement.dayLabel}
              color="indigo"
            />
            <TargetProgressBar
              label={achievement.yearLabel}
              actual={achievement.yearly.actual}
              target={achievement.yearly.target}
              pacePct={achievement.yearly.pace_pct}
              paceLabel={`Month ${achievement.monthOfYear}/12`}
              color="green"
            />
          </div>
        </div>
      )}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AgentDashboard.tsx
git commit -m "feat: add advisor-level target achievement bars to agent page"
```

---

### Task 7: Create TargetGrid Component

**Files:**
- Create: `frontend/src/components/TargetGrid.tsx`

- [ ] **Step 1: Create the TargetGrid component**

```tsx
import { useState, useEffect, useCallback } from 'react'
import { fetchMonthlyTargets, saveMonthlyTargets } from '@/lib/api'
import type { MonthlyTargetAdvisor } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Loader2, Save, CopyCheck, ArrowDownToLine } from 'lucide-react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface GridRow {
  advisor_target_id: number
  name: string
  branch: string | null
  targets: Record<number, number>  // month (1-12) -> amount
}

interface Props {
  line: string
}

export default function TargetGrid({ line }: Props) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [rows, setRows] = useState<GridRow[]>([])
  const [original, setOriginal] = useState<GridRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchMonthlyTargets(year, line)
      const gridRows: GridRow[] = data.advisors.map((a: MonthlyTargetAdvisor) => {
        const targets: Record<number, number> = {}
        for (const m of a.months) targets[m.month] = m.target
        return { advisor_target_id: a.advisor_target_id, name: a.name, branch: a.branch, targets }
      })
      setRows(gridRows)
      setOriginal(JSON.parse(JSON.stringify(gridRows)))
    } catch {
      setError('Failed to load targets')
    } finally {
      setLoading(false)
    }
  }, [year, line])

  useEffect(() => { loadData() }, [loadData])

  const isDirty = JSON.stringify(rows) !== JSON.stringify(original)

  function updateCell(rowIdx: number, month: number, value: string) {
    const num = parseFloat(value.replace(/[^0-9.]/g, '')) || 0
    setRows(prev => {
      const next = [...prev]
      next[rowIdx] = { ...next[rowIdx], targets: { ...next[rowIdx].targets, [month]: num } }
      return next
    })
    setSaved(false)
  }

  function applyToAllMonths(rowIdx: number) {
    const firstVal = rows[rowIdx].targets[1] || 0
    setRows(prev => {
      const next = [...prev]
      const targets: Record<number, number> = {}
      for (let m = 1; m <= 12; m++) targets[m] = firstVal
      next[rowIdx] = { ...next[rowIdx], targets }
      return next
    })
    setSaved(false)
  }

  function fillDown(month: number) {
    if (rows.length === 0) return
    const firstVal = rows[0].targets[month] || 0
    setRows(prev => prev.map(r => ({
      ...r,
      targets: { ...r.targets, [month]: firstVal },
    })))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const updates = rows
        .filter((r, i) => JSON.stringify(r.targets) !== JSON.stringify(original[i]?.targets))
        .map(r => ({
          advisor_target_id: r.advisor_target_id,
          months: Object.fromEntries(
            Object.entries(r.targets).map(([k, v]) => [k, v])
          ),
        }))
      if (updates.length > 0) {
        await saveMonthlyTargets(year, updates)
      }
      setSaved(true)
      setOriginal(JSON.parse(JSON.stringify(rows)))
    } catch {
      setError('Failed to save targets')
    } finally {
      setSaving(false)
    }
  }

  function rowTotal(row: GridRow) {
    return Object.values(row.targets).reduce((s, v) => s + v, 0)
  }

  const fmt = (v: number) => v > 0 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0'
  const fmtCurrency = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-[12px] font-medium"
          >
            {[year - 1, year, year + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <span className="text-[12px] text-muted-foreground">
            {rows.length} advisors
          </span>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-[11px] font-medium text-emerald-500">Saved ✓</span>
          )}
          {error && (
            <span className="text-[11px] font-medium text-destructive">{error}</span>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12px] font-semibold transition-all',
              isDirty
                ? 'bg-primary text-primary-foreground hover:opacity-90'
                : 'bg-secondary text-muted-foreground cursor-not-allowed opacity-50',
            )}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Grid */}
      {rows.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-muted-foreground/50">
          No targets found for {year}. Upload targets first.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b-2 border-border bg-secondary/60">
                <th className="sticky left-0 z-10 bg-secondary/60 px-3 py-2 text-left font-semibold text-muted-foreground min-w-[150px]">
                  Advisor
                </th>
                {MONTHS.map((m, i) => (
                  <th key={m} className="px-1 py-2 text-center font-semibold text-muted-foreground min-w-[80px]">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{m}</span>
                      <button
                        onClick={() => fillDown(i + 1)}
                        title={`Fill all advisors with first row's ${m} value`}
                        className="text-[9px] text-primary/50 hover:text-primary transition-colors"
                      >
                        <ArrowDownToLine className="h-3 w-3" />
                      </button>
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-bold text-primary min-w-[90px]">
                  TOTAL
                </th>
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                const isChanged = JSON.stringify(row.targets) !== JSON.stringify(original[ri]?.targets)
                return (
                  <tr key={row.advisor_target_id} className={cn(
                    'border-t border-border/50 transition-colors',
                    isChanged ? 'bg-primary/5' : 'hover:bg-secondary/30',
                  )}>
                    <td className="sticky left-0 z-10 bg-background px-3 py-1.5 font-medium min-w-[150px]">
                      <div>{row.name}</div>
                      {row.branch && (
                        <div className="text-[10px] text-muted-foreground/50">{row.branch}</div>
                      )}
                    </td>
                    {MONTHS.map((_, mi) => {
                      const m = mi + 1
                      const val = row.targets[m] || 0
                      const origVal = original[ri]?.targets[m] || 0
                      const cellChanged = val !== origVal
                      return (
                        <td key={m} className="px-1 py-1">
                          <input
                            type="text"
                            value={fmt(val)}
                            onChange={e => updateCell(ri, m, e.target.value)}
                            onFocus={e => e.target.select()}
                            className={cn(
                              'w-full rounded-md border px-2 py-1.5 text-right text-[12px] tabular-nums',
                              'bg-secondary/30 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/40',
                              cellChanged
                                ? 'border-primary/40 bg-primary/10'
                                : 'border-border/50',
                            )}
                          />
                        </td>
                      )
                    })}
                    <td className="px-3 py-1.5 text-right font-bold tabular-nums text-primary/80">
                      {fmtCurrency(rowTotal(row))}
                    </td>
                    <td className="px-1 py-1.5">
                      <button
                        onClick={() => applyToAllMonths(ri)}
                        title="Apply Jan value to all months"
                        className="rounded p-1 text-muted-foreground/40 hover:bg-secondary hover:text-primary transition-colors"
                      >
                        <CopyCheck className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: No errors related to TargetGrid.tsx

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TargetGrid.tsx
git commit -m "feat: add editable TargetGrid component with fill controls"
```

---

### Task 8: Integrate TargetGrid into Settings TargetsTab

**Files:**
- Modify: `frontend/src/pages/settings/TargetsTab.tsx`

- [ ] **Step 1: Add TargetGrid import**

After the existing imports (line 8), add:

```typescript
import TargetGrid from '@/components/TargetGrid'
```

- [ ] **Step 2: Replace the "Current Targets" table with TargetGrid**

Replace the entire "Current Targets" section (lines 249-298, the `{targets.length > 0 && !preview && (` block) with:

```tsx
      {/* 12-Month Target Grid */}
      {!preview && (
        <div className="card-premium p-6">
          <div className="mb-4">
            <h3 className="text-[14px] font-semibold">Monthly Targets</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Edit individual cells or use fill controls. Changes are saved when you click Save.
            </p>
          </div>
          <TargetGrid line="Travel" />
        </div>
      )}
```

Also remove the old empty state block (lines 300-307, the `{targets.length === 0 && !preview && (` block) since the TargetGrid handles its own empty state.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/settings/TargetsTab.tsx
git commit -m "feat: integrate editable TargetGrid into Settings targets tab"
```

---

### Task 9: Build and Test

- [ ] **Step 1: Build the frontend to verify no compilation errors**

```bash
cd frontend && npm run build 2>&1 | tail -10
```
Expected: Build succeeds with no errors

- [ ] **Step 2: Start the backend and verify new endpoints**

```bash
cd backend && python -c "
from database import init_db
init_db()
print('DB OK')
from routers.advisor_targets import router
for r in router.routes:
    print(f'  {r.methods} {r.path}')
"
```
Expected: All 7 routes listed including the 3 new ones

- [ ] **Step 3: Start both servers and test in browser**

Start backend:
```bash
cd backend && python main.py &
```

Start frontend:
```bash
cd frontend && npm run dev &
```

Manual verification checklist:
1. Open Dashboard → verify Target Achievement card appears with two progress bars (monthly + yearly)
2. Click into an agent → verify individual progress bars appear
3. Go to Settings → Targets tab → verify 12-month editable grid loads
4. Edit a cell → verify it highlights and Save button activates
5. Click "Apply to all months" button → verify all months fill with Jan value
6. Click Save → verify success message
7. Refresh → verify saved values persist

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: target achievement tracker — progress bars + editable grid"
```
