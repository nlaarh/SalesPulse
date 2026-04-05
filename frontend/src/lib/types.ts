/**
 * Shared TypeScript interfaces used across multiple pages.
 *
 * Only types that appear in 2+ files belong here.
 * Page-specific types stay in their own page file.
 */

/* ── Insight (AdvisorDashboard) ──────────────────────────────────────────── */

export interface Insight {
  type: 'success' | 'warning' | 'danger' | 'info'
  title: string
  text: string
}

/* ── SlippingDeal (AdvisorDashboard) ─────────────────────────────────────── */

export interface SlippingDeal {
  id: string
  name: string
  stage: string
  amount: number
  close_date: string
  days_overdue: number
  days_since_activity: number
  owner: string
  record_type: string
  days_in_stage: number
}

/* ── Opp — opportunity row in AgentDashboard ─────────────────────────────── */

export interface Opp {
  id: string
  name: string
  amount: number
  stage: string
  probability: number
  close_date: string
  last_activity: string
  push_count: number
  score: number
  reasons: string[]
}

/* ── AgentDashboard MonthData (month-level revenue/commission) ───────────── */

export interface AgentMonthData {
  month: number
  label: string
  revenue: number
  prior_revenue: number
  commission: number
  prior_commission: number
  deals: number
  leads: number
  opps: number
}
