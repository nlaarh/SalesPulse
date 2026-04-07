import axios from 'axios'

const TOKEN_KEY = 'si-auth-token'

const api = axios.create({ baseURL: '', timeout: 60000 })

// Attach auth token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Retry on 502/503/504 + redirect on 401
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const status = err?.response?.status

    // Unauthorized → clear token and redirect to login
    if (status === 401 && !err.config.url?.includes('/api/auth/')) {
      localStorage.removeItem(TOKEN_KEY)
      window.location.href = '/login'
      return Promise.reject(err)
    }

    if ([502, 503, 504].includes(status) && !err.config._retry) {
      err.config._retry = true
      await new Promise((r) => setTimeout(r, 2000))
      return api(err.config)
    }
    return Promise.reject(err)
  }
)

// ── Helper: build params with optional date range ───────────────────────────

function withDates(params: Record<string, unknown>, startDate?: string | null, endDate?: string | null) {
  if (startDate && endDate) {
    return { ...params, start_date: startDate, end_date: endDate }
  }
  return params
}

// ── Advisor Performance ─────────────────────────────────────────────────────

export async function fetchAdvisorSummary(
  line = 'Travel', period = 12, startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/advisors/summary', {
    params: withDates({ line, period }, startDate, endDate),
  })
  return data
}

export async function fetchAdvisorLeaderboard(
  line = 'Travel', period = 12, startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/advisors/leaderboard', {
    params: withDates({ line, period }, startDate, endDate),
  })
  return data
}

export async function fetchAdvisorTrend(
  line = 'Travel', period = 12, startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/advisors/trend', {
    params: withDates({ line, period }, startDate, endDate),
  })
  return data
}

export async function fetchAdvisorYoY(line = 'Travel') {
  const { data } = await api.get('/api/sales/advisors/yoy', { params: { line } })
  return data
}

// ── Performance (NEW — spreadsheet-matching) ────────────────────────────────

export async function fetchPerformanceMonthly(
  line = 'Travel', period = 12, startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/performance/monthly', {
    params: withDates({ line, period }, startDate, endDate),
  })
  return data
}

export async function fetchPerformanceFunnel(
  line = 'Travel', period = 12, startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/performance/funnel', {
    params: withDates({ line, period }, startDate, endDate),
  })
  return data
}

export async function fetchPerformanceInsights(
  line = 'Travel', period = 12, startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/performance/insights', {
    params: withDates({ line, period }, startDate, endDate),
  })
  return data
}

// ── Pipeline & Forecasting ──────────────────────────────────────────────────

export async function fetchPipelineStages(line = 'Travel') {
  const { data } = await api.get('/api/sales/pipeline/stages', { params: { line } })
  return data
}

export async function fetchPipelineForecast(
  line = 'Travel', period = 12, startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/pipeline/forecast', {
    params: withDates({ line, period }, startDate, endDate),
  })
  return data
}

export async function fetchPipelineVelocity(line = 'Travel') {
  const { data } = await api.get('/api/sales/pipeline/velocity', { params: { line } })
  return data
}

export async function fetchPipelineSlipping(line = 'Travel') {
  const { data } = await api.get('/api/sales/pipeline/slipping', { params: { line } })
  return data
}

// ── Travel & Destinations ───────────────────────────────────────────────────

export async function fetchTravelDestinations(
  period = 12, startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/travel/destinations', {
    params: withDates({ period }, startDate, endDate),
  })
  return data
}

export async function fetchTravelSeasonal(
  period = 24, startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/travel/seasonal', {
    params: withDates({ period }, startDate, endDate),
  })
  return data
}

export async function fetchTravelPartySize(
  period = 12, startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/travel/party-size', {
    params: withDates({ period }, startDate, endDate),
  })
  return data
}

export async function fetchDestinationTrend(
  dest = 'Caribbean', period = 24, startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/travel/destination-trend', {
    params: withDates({ dest, period }, startDate, endDate),
  })
  return data
}

// ── Top Opportunities ────────────────────────────────────────────────────────

export async function fetchTopOpportunities(
  line = 'Travel', limit = 100, ai = true,
  startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/opportunities/top', {
    params: withDates({ line, limit, ai }, startDate, endDate),
    timeout: 120000, // AI write-ups can take time
  })
  return data
}

export async function fetchOpportunityDetail(oppId: string) {
  const { data } = await api.get(`/api/sales/opportunities/${oppId}`, { timeout: 30000 })
  return data
}

// ── Agent Profile (Drill-down) ──────────────────────────────────────────────

export async function fetchAgentProfile(
  name: string, line = 'Travel', period = 12,
  startDate?: string | null, endDate?: string | null, ai = true,
) {
  const { data } = await api.get('/api/sales/agent/profile', {
    params: withDates({ name, line, period, ai }, startDate, endDate),
    timeout: 120000,
  })
  return data
}

// ── Lead Funnel ─────────────────────────────────────────────────────────────

export async function fetchLeadsVolume(
  line = 'Travel', period = 12, startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/leads/volume', {
    params: withDates({ line, period }, startDate, endDate),
  })
  return data
}

export async function fetchLeadsConversion(
  line = 'Travel', period = 12, startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/leads/conversion', {
    params: withDates({ line, period }, startDate, endDate),
  })
  return data
}

export async function fetchLeadsTimeToConvert(
  line = 'Travel', period = 12, startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/leads/time-to-convert', {
    params: withDates({ line, period }, startDate, endDate),
  })
  return data
}

export async function fetchLeadsSourceEffectiveness(
  line = 'Travel', period = 12, startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/leads/source-effectiveness', {
    params: withDates({ line, period }, startDate, endDate),
  })
  return data
}

export async function fetchAgentCloseSpeed(
  line = 'Travel', period = 12, startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/leads/agent-close-speed', {
    params: withDates({ line, period }, startDate, endDate),
  })
  return data
}

// ── AI Narratives ──────────────────────────────────────────────────────────

export async function fetchNarrative(
  page: string, line = 'Travel', period = 12,
  startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/sales/narrative', {
    params: withDates({ page, line, period }, startDate, endDate),
    timeout: 30000,
  })
  return data as { narrative: string | null; cached: boolean; ai_generated: boolean }
}

// ── Activity Logs ─────────────────────────────────────────────────────────

export interface ActivityLogEntry {
  id: number
  user_id: number | null
  user_email: string | null
  action: string
  category: string
  detail: string | null
  metadata_json: string | null
  ip_address: string | null
  created_at: string
}

export interface ActivityLogsResponse {
  items: ActivityLogEntry[]
  total: number
  page: number
  per_page: number
  pages: number
}

export async function fetchActivityLogs(params: {
  page?: number; per_page?: number
  user_email?: string; category?: string; action?: string
  start_date?: string; end_date?: string
}) {
  const { data } = await api.get('/api/activity-logs', { params })
  return data as ActivityLogsResponse
}

export async function fetchActivityLogFilters() {
  const { data } = await api.get('/api/activity-logs/filters')
  return data as { emails: string[]; categories: string[]; actions: string[] }
}

// ── Advisor Targets ────────────────────────────────────────────────────────

export async function uploadTargetsFile(file: File) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post('/api/admin/targets/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  })
  return data as {
    filename: string
    mapping: Record<string, string>
    has_months: boolean
    advisors: { raw_name: string; sf_name: string; branch: string | null; title: string | null; monthly_target: number | null; monthly_targets: Record<string, number> | null }[]
    count: number
  }
}

export async function confirmTargets(filename: string, line: string, advisors: unknown[]) {
  const { data } = await api.post('/api/admin/targets/confirm', { filename, line, advisors })
  return data as { upload_id: number; count: number; status: string }
}

export async function fetchTargets() {
  const { data } = await api.get('/api/targets')
  return data as {
    targets: { id: number; sf_name: string; branch: string | null; title: string | null; monthly_target: number | null }[]
    upload: { id: number; filename: string; uploaded_by_email: string; advisor_count: number; created_at: string } | null
  }
}

export async function fetchTargetsWithActuals(
  line = 'Travel', startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/targets/with-actuals', {
    params: withDates({ line }, startDate, endDate),
  })
  return data as {
    advisors: {
      name: string; branch: string | null; title: string | null
      monthly_target: number | null; total_target: number; total_actual: number
      achievement_pct: number | null
      months: { month: string; target: number | null; actual: number; achievement_pct: number | null }[]
    }[]
    branches: { branch: string; target_sum: number; actual_sum: number; achievement_pct: number | null; advisor_count: number }[]
    months: string[]
    upload: { id: number; filename: string; uploaded_by_email: string; created_at: string } | null
  }
}

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
  prior_year_actual: number    // earnings (commission for Travel, premium for Insurance)
  prior_year_revenue: number   // booking revenue (Amount)
  prior_year_months: number[]  // 12 values, seasonal shape (Jan-Dec)
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
  methodology?: {
    commission_rate: number
    prior_year: number
    prior_year_bookings: number
    prior_year_commission: number
    note: string
  }
}

export interface AchievementResponse {
  comm_rate?: number
  current_month: {
    month: number
    year: number
    day_of_month: number
    days_in_month: number
    pace_pct: number
    company: { target: number; actual: number; bookings_actual?: number; commission_actual?: number; achievement_pct: number | null }
  } | null
  yearly: {
    year: number
    month_of_year: number
    pace_pct: number
    company: { target: number; actual: number; bookings_actual?: number; commission_actual?: number; achievement_pct: number | null }
  } | null
  advisors: {
    name: string
    monthly: { target: number; actual: number; bookings_actual?: number; commission_actual?: number; achievement_pct: number | null }
    yearly: { target: number; actual: number; bookings_actual?: number; commission_actual?: number; achievement_pct: number | null; pace_pct: number }
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

export async function emailAgentReport(
  agentName: string,
  to: string,
  line = 'Travel',
  period = 12,
  startDate?: string,
  endDate?: string,
) {
  const { data } = await api.post('/api/advisor/email', {
    to,
    agent_name: agentName,
    line,
    period,
    start_date: startDate ?? null,
    end_date: endDate ?? null,
  })
  return data as { status: string; to: string }
}

/* ── Issues / Bug Reporting ─────────────────────────────────────────────── */

export interface GithubIssue {
  number: number
  title: string
  body: string
  state: string
  labels: string[]
  created_at: string
  html_url: string
  reporter?: string
  reporter_email?: string
  severity?: string
  status?: string
  page?: string
  triage_verdict?: string
  comments: number
}

export interface IssueComment {
  id: number
  body: string
  created_at: string
  user: string
}

export async function submitIssue(payload: {
  description: string
  severity: 'low' | 'medium' | 'high'
  page: string
  reporter: string
  email: string
}) {
  const { data } = await api.post('/api/issues', payload)
  return data as { issue_number: number; url: string; status: string }
}

export async function fetchIssues(state: 'open' | 'closed' | 'all' = 'open') {
  const { data } = await api.get('/api/issues', { params: { state } })
  return (Array.isArray(data) ? data : data.issues ?? []) as GithubIssue[]
}

export async function fetchIssue(number: number) {
  const { data } = await api.get(`/api/issues/${number}`)
  return data as { issue: GithubIssue; comments: IssueComment[] }
}

export async function addIssueComment(number: number, comment: string, name: string) {
  const { data } = await api.post(`/api/issues/${number}/comments`, { comment, name })
  return data as { status: string }
}

export type IssueStatus = 'backlog' | 'acknowledged' | 'investigating' | 'in-progress' | 'released' | 'closed' | 'cancelled'
export type IssueSeverity = 'low' | 'medium' | 'high'

export async function updateIssue(
  number: number,
  pin: string,
  opts: { status?: IssueStatus; severity?: IssueSeverity; title?: string; body?: string }
) {
  const { data } = await api.patch(`/api/issues/${number}`, { pin, ...opts })
  return data as { ok: boolean; state: string; status?: string; severity?: string; labels: string[] }
}

export async function flushCache() {
  const { data } = await api.post('/api/admin/cache-reset')
  return data as { ok: boolean; flushed_l1: number; flushed_l2: number; owner_map_size: number }
}

/* ── Customer Profile email ──────────────────────────────────────────────── */
export async function emailCustomerProfile(accountId: string, to: string) {
  const { data } = await api.post(`/api/customers/${accountId}/email`, { to })
  return data as { status: string; to: string }
}

/* ── Opportunity email ───────────────────────────────────────────────────── */
export async function emailOpportunity(oppId: string, to: string) {
  const { data } = await api.post(`/api/opportunities/${oppId}/email`, { to })
  return data as { status: string; to: string }
}

/* ── Advisor dashboard email ─────────────────────────────────────────────── */
export async function emailAdvisorDashboard(
  to: string, line: string, period: number,
  startDate?: string, endDate?: string
) {
  const { data } = await api.post('/api/advisor/dashboard/email', {
    to, line, period, start_date: startDate, end_date: endDate,
  })
  return data as { status: string; to: string }
}
