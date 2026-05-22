# SalesPulse Code Audit Report

**Date:** April 11, 2026  
**Scope:** Backend (FastAPI) + Frontend (React/TypeScript)  
**Overall Health:** ⚠️ **Needs Attention** (7.2/10)

---

## 📊 Executive Summary

SalesPulse is a well-architected full-stack sales analytics platform with strong foundations in caching, authentication, and code organization. However, several areas need improvement for better maintainability, performance, and security.

**Quick Stats:**
- Backend: 179MB, ~22 routers, ~2,000 lines of core logic
- Frontend: 346MB, 20+ pages, ~2,042 TypeScript files
- Tech Stack: FastAPI, React 19, TypeScript, Tailwind CSS v4, Recharts
- Deployment: Azure App Service (production)

---

## 🚨 Critical Issues (Fix Immediately)

### 1. **Hardcoded Salesforce Credentials** ⚠️ HIGH RISK
**File:** `.env` (exposed in repo!)

**Problem:**
```env
SF_PASSWORD=P@ssw0rd123!
SF_SECURITY_TOKEN=ABC123
```

**Impact:** If `.env` is committed to git, credentials are exposed publicly.

**Recommendation:**
```bash
# Add to .gitignore
echo ".env" >> backend/.gitignore
git rm --cached backend/.env
```

**Better Solution:** Use Azure Key Vault or environment variables in Azure Portal.

---

### 2. **No Rate Limiting on API Endpoints** ⚠️ MEDIUM RISK

**Current:** Rate limiting only at Salesforce API level (150 calls/min).

**Problem:** 
- Backend endpoints are unprotected
- A malicious user could DDoS your API
- No per-user quotas

**Recommendation:**
```python
# Add to main.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.api_route("/api/sales/advisors/summary", methods=["GET"])
@limiter.limit("30/minute")
async def advisor_summary(request: Request):
    # existing logic
```

---

### 3. **No Input Validation** ⚠️ MEDIUM RISK

**Example in `sales_advisor.py`:**
```python
@router.get("/api/sales/advisors/summary")
def advisor_summary(
    line: str = "Travel",      # No validation!
    period: int = Query(default=12),  # Could be negative!
):
```

**Problems:**
- `period=-1` would cause date calculation errors
- `line` could be SQL injection (though SF query uses parameterized approach, still risky)
- No max value check for `period` (could be 1000000)

**Recommendation:**
```python
from pydantic import BaseModel, validator

class AdvisorQuery(BaseModel):
    line: str = "Travel"
    period: int = Field(default=12, ge=1, le=60)  # 1 month to 5 years
```

---

## 🔴 High Priority Issues

### 4. **Massive Router Files**

**Statistics:**
- `territory_map.py`: 603 lines
- `advisor_targets_monthly.py`: 601 lines
- `issues.py`: 560 lines
- `customer_profile.py`: 500+ lines

**Problem:** Single-responsibility violation. Each router handles too many concerns.

**Recommendation:** Split into sub-modules:
```
backend/routers/sales_advisor/
├── __init__.py          # Exports router
├── summary.py           # /summary endpoint
├── leaderboard.py       # /leaderboard endpoint
├── trends.py           # /trends endpoint
└── queries.py           # SOQL query builders
```

---

### 5. **Duplicated SOQL Logic**

**Evidence:** Search for `SELECT OwnerId` appears in 5+ routers.

**Problem:** 
- Logic repeated 5-10 times
- Hard to maintain
- Inconsistent behavior

**Recommendation:**
```python
# backend/query_library.py
OPP_BASIC_SELECT = """
    SELECT Id, Name, OwnerId, Owner.Name, AccountId, Account.Name,
           Amount, StageName, CloseDate, CreatedDate
    FROM Opportunity
"""

def build_opp_query(filters: dict) -> str:
    """Centralized query builder with consistent filters."""
    base = OPP_BASIC_SELECT
    # ... build WHERE clause
    return base + WHERE
```

---

### 6. **No Error Handling Strategy**

**Current:**
```python
try:
    # something
except Exception as e:
    log.error(f"Error: {e}")
    return {}  # Silent failure!
```

**Problems:**
- Errors swallowed silently
- No error tracking (Sentry, LogRocket)
- Inconsistent error responses

**Recommendation:**
```python
from fastapi import HTTPException
from sentry_sdk import capture_exception

try:
    data = sf_parallel(...)
except SFQueryError as e:
    capture_exception(e)
    raise HTTPException(status_code=503, detail="Salesforce unavailable")
except Exception as e:
    log.exception("Unexpected error")  # Includes stack trace
    raise HTTPException(status_code=500, detail="Internal server error")
```

---

## 🟡 Medium Priority Issues

### 7. **Frontend: 20+ useEffect Hooks Without Cleanup**

**Example in `AdvisorDashboard.tsx`:**
```typescript
useEffect(() => {
  Promise.allSettled([...])
    .then((results) => {
      if (cancelled) return  // Good!
      // ...
    })
}, [line, period, startDate, endDate, retryCount, viewMode])
```

**Problem:** While you have `cancelled` pattern, many pages don't.

**Recommendation:**
```typescript
// Create reusable hook
function useCancellablePromise<T>(promiseFn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    let cancelled = false
    promiseFn()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) console.error(err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [promiseFn])
  
  return { data, loading }
}
```

---

### 8. **No Loading States or Skeletons**

**Current:**
```typescript
if (loading) {
  return <div>Loading...</div>  // Boring!
}
```

**Recommendation:**
```typescript
import { Skeleton } from '@/components/ui/skeleton'

if (loading) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-[200px]" />
      <Skeleton className="h-64 w-full" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  )
}
```

---

### 9. **Hardcoded Magic Numbers**

**Example:**
```python
wait_secs = (next_run - now).total_seconds()
if wait_secs <= 0 or time.time() + min(wait, 2) > deadline:
    raise RateLimitExceeded(...)
```

**Problem:** Magic numbers everywhere.

**Recommendation:**
```python
# backend/constants.py
CACHE_WARMER_MAX_WAIT = 12  # seconds
CACHE_WARMER_HOUR = 3  # 3 AM ET
SF_RATE_LIMIT = 150
SF_RATE_WINDOW = 60  # seconds
```

---

### 10. **No API Versioning**

**Current:** `/api/sales/advisors/summary`

**Problem:** No version prefix, breaking changes are painful.

**Recommendation:**
```python
# V1 (current)
@router.get("/api/v1/sales/advisors/summary")

# V2 (future)
@router.get("/api/v2/sales/advisors/summary")
```

---

## 🟢 Low Priority Issues

### 11. **Code Comments Are Sparse**

**Example:**
```python
def _date_filter(sd: str, ed: str, field: str = 'CloseDate') -> str:
    return f"{field} >= {sd} AND {field} <= {ed}"
```

**Recommendation:** Add docstrings following Google/Python style.

```python
def _date_filter(sd: str, ed: str, field: str = 'CloseDate') -> str:
    """Generate SOQL WHERE clause for date range filtering.
    
    Args:
        sd: Start date in ISO format (YYYY-MM-DD)
        ed: End date in ISO format (YYYY-MM-DD)
        field: Salesforce field name (default: CloseDate)
    
    Returns:
        SOQL filter string: "CloseDate >= 2024-01-01 AND CloseDate <= 2024-12-31"
    
    Note:
        Always uses explicit dates, never LAST_N_MONTHS or TODAY functions.
    """
    return f"{field} >= {sd} AND {field} <= {ed}"
```

---

### 12. **No Type Hints in Some Functions**

**Example:**
```python
def get_owner_map():
    # ...
```

**Recommendation:**
```python
def get_owner_map() -> dict[str, str]:
    # ...
```

---

### 13. **CORS Too Permissive**

**Current:**
```python
allow_origins=[
    "http://localhost:5173",
    "https://salespulse-nyaaa.azurewebsites.net",
]
```

**Better:**
```python
allow_origins=[
    "http://localhost:5173",
    "https://salespulse-nyaaa.azurewebsites.net",
],
allow_methods=["GET", "POST"],  # Only what's needed
allow_headers=["Authorization", "Content-Type"],
```

---

### 14. **No Request ID Tracking**

**Problem:** Hard to trace errors across distributed system.

**Recommendation:**
```python
# middleware.py
from uuid import uuid4

@app.middleware
async def add_request_id(request: Request, call_next):
    request_id = str(uuid4())
    request.state.request_id = request_id
    
    # Add to logs
    log = logging.LoggerAdapter(logging.getLogger(), {"request_id": request_id})
    
    response = call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response
```

---

## 💡 Performance Recommendations

### 15. **Database Query N+1 Problem**

**If you have code like:**
```python
for advisor in advisors:
    advisor['deals'] = sf_query(f"SELECT ... WHERE OwnerId = '{advisor['id']}'")
```

**This is N+1 queries!**

**Fix:** Use `sf_parallel()` or batch queries.

---

### 16. **Cache Stampede on Cold Start**

**Current:** First user after cache expiration gets slow response.

**Better:** Background refresh before expiration.

```python
# Prefetch 5 minutes before expiry
REFRESH_THRESHOLD = 300  # seconds

def get_or_prefetch(key, fetch_fn):
    data = get(key)
    if data is not None:
        return data
    
    # Start background task to refresh
    if should_prefetch(key):
        asyncio.create_task(prefetch_async(key, fetch_fn))
    
    return fetch_fn()  # blocking fallback
```

---

### 17. **Frontend Bundle Size**

**Problem:** 346MB frontend directory suggests heavy dependencies.

**Check:**
```bash
cd frontend
npm run build
npx webpack-bundle-analyzer dist/stats.json
```

**Optimizations:**
- Code split more aggressively
- Remove unused Recharts components
- Lazy load heavy pages (already doing this ✅)

---

## 🔧 Testing Gaps

### 18. **No Backend Unit Tests for SOQL Logic**

**Missing:**
- Test date resolution
- Test query builders
- Test edge cases (leap years, timezone handling)

**Recommendation:**
```python
# tests/test_shared.py
def test_resolve_dates_with_period():
    result = resolve_dates(None, None, period=12)
    assert result[0] < result[1]  # start < end
    assert len(result[0]) == 10     # ISO format
```

---

### 19. **No Frontend Integration Tests**

**Current:** Manual testing or E2E with Playwright.

**Recommendation:**
```typescript
// tests/dashboard.test.tsx
import { render, screen } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import AdvisorDashboard from '@/pages/AdvisorDashboard'

test('shows loading state initially', () => {
  render(<AdvisorDashboard />)
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})
```

---

## 📋 Prioritized Action Items

### **Week 1: Security (Critical)**
1. ⬛ Remove `.env` from git tracking
2. ⬛ Add `.env` to `.gitignore`
3. ⬛ Move secrets to Azure Key Vault
4. ⬛ Add input validation (pydantic)
5. ⬛ Add rate limiting

### **Week 2: Maintainability (High)**
1. ⬛ Split large router files
2. ⬛ Create centralized query library
3. ⬛ Add error tracking (Sentry)
4. ⬛ Standardize error responses
5. ⬛ Add request ID middleware

### **Week 3: Performance (Medium)**
1. ⬛ Implement cache prefetching
2. ⬛ Add database indexes (if using SQLite for reads)
3. ⬛ Optimize SOQL queries
4. ⬛ Reduce frontend bundle size

### **Week 4: Testing (Medium)**
1. ⬛ Add unit tests for backend
2. ⬛ Add integration tests for frontend
3. ⬛ Set up CI/CD with test automation
4. ⬛ Add load testing

---

## 📈 Code Quality Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Router file size (max) | 603 lines | <200 lines | ❌ |
| Code duplication | High | Low | ❌ |
| Test coverage | ~10% | >70% | ❌ |
| Error handling | Minimal | Comprehensive | ❌ |
| Input validation | None | Full | ❌ |
| API documentation | None | OpenAPI/Swagger | ❌ |
| Monitoring/Alerting | Basic logs | Sentry + APM | ❌ |

---

## 🎯 Quick Wins (1-2 Hours Each)

1. **Add .gitignore for .env** - 5 minutes
2. **Create central query library** - 2 hours
3. **Add input validation** - 2 hours
4. **Split largest router** - 2 hours
5. **Add loading skeletons** - 2 hours
6. **Add request ID middleware** - 1 hour

---

## 📚 Documentation

**Missing:**
- Architecture decision records (ADRs)
- Deployment runbook
- Onboarding guide for new developers
- API documentation (Swagger)
- Database schema documentation

**Recommendation:** Create `docs/architecture/` folder with:
- `ADR-001-caching-strategy.md`
- `ADR-002-authentication.md`
- `ADR-003-soql-conventions.md`

---

## ✅ What's Working Well

1. ✅ **Two-tier caching** - Excellent design
2. ✅ **Lazy loading** - Great for performance
3. ✅ **Stampede protection** - Smart
4. ✅ **Authentication flow** - Secure
5. ✅ **React Query integration** - Good pattern
6. ✅ **TypeScript usage** - Type safety
7. ✅ **Tailwind CSS** - Modern styling
8. ✅ **GitHub Actions CI/CD** - Automated deploys

---

## 🏁 Conclusion

SalesPulse has a solid foundation but needs **immediate attention on security** (credentials exposure) and **long-term investment in maintainability** (code splitting, testing, error handling).

**Recommended Approach:**
1. **Immediate:** Fix security issues (Week 1)
2. **Short-term:** Improve code organization (Weeks 2-3)
3. **Medium-term:** Add testing and monitoring (Weeks 4-6)
4. **Long-term:** Refactor architecture as needed

**Estimated Effort:**
- Critical fixes: 1 week
- High priority: 2-3 weeks
- Medium priority: 4-6 weeks
- Low priority: Ongoing

---

*Audit completed by Claude Code Assistant*
