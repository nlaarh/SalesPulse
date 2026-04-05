/* ── Shared types for Manager Briefing ────────────────────────────────────── */

export interface TaskItem {
  id: string; subject: string; status: string; priority: string
  due_date: string | null; related_to: string; what_id: string
  opp_amount: number | null; overdue: boolean
  days_overdue: number | null; created: string
}

export interface TaskStats {
  total_open: number; overdue: number; completed_period: number
  total_period: number; completion_rate: number
}

export interface Opp {
  id: string; name: string; amount: number; stage: string
  probability: number; close_date: string; last_activity: string
  push_count: number; score: number; reasons: string[]
}

export interface AgentProfile {
  name: string; line: string; email?: string
  current_year: number; prior_year: number
  summary: {
    revenue: number; deals: number; win_rate: number; avg_deal: number
    pipeline_value: number; pipeline_count: number
    leads: number; opps_created: number; coverage: number
  }
  prior: { revenue: number; deals: number; win_rate: number; avg_deal: number }
  yoy: { revenue_pct: number; deals_pct: number; win_rate_delta: number; avg_deal_delta: number }
  months: { month: number; label: string; revenue: number; prior_revenue: number; deals: number }[]
  top_opportunities: Opp[]
  team: { avg_revenue: number; win_rate: number; avg_deal: number; total_agents: number }
  strengths: string[]; improvements: string[]
  pushed_count: number; pushed_value: number; stale_count: number
  writeup: string; ai_powered: boolean
  tasks: { open_tasks: TaskItem[]; stats: TaskStats }
}

export interface FocusArea {
  priority: 'high' | 'medium' | 'low'
  title: string
  detail: string
  action: string
}

export interface AchievementData {
  monthly: { target: number; actual: number; achievement_pct: number | null }
  yearly: { target: number; actual: number; achievement_pct: number | null; pace_pct: number }
  monthlyPacePct: number
  monthLabel: string
  yearLabel: string
  dayLabel: string
  monthOfYear: number
}
